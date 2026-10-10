import { DatabaseCommitResultUnknownError, runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { reconcileHttpIdempotencyCommitResult, type HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../foundation/idempotency/commit-unknown-reconciliation.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput, MysqlHttpIdempotencyRepository } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { lockMeasuredProfileSaveInput, type MeasuredProfileSaveInput, type MeasuredProfileSaveResult } from '../repository/mysql-measured-profile-repository.js'
import Ajv from 'ajv'
import { userPlantSchema } from '../../contracts/user-plant-schema.js'
import type { UserPlantDto, UserPlantRef, UserRef } from '../../contracts/types.js'
import type { MysqlUserPlantRepository } from '../repository/mysql-user-plant-repository.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { randomBytes } from 'node:crypto'
import { evaluateUserPlantProfileCompleteness, type UserPlantProfileCompletenessPolicy } from '../domain/evaluate-profile-completeness.js'
import { hasCompleteMeasuredPot } from '../domain/environment-profile.js'
import { buildFirstProfileRewardEvent } from '../domain/first-profile-reward-event.js'
import type { CareContextGroupPatch, CareContextGroups, CompletenessEvidence, EnvironmentOwnerInput, MarkProfileCompletedInput, SaveCareContextInput } from '../repository/mysql-user-plant-environment-repository.js'
import type { MysqlUserPlantOutboxRepository } from '../repository/mysql-user-plant-outbox-repository.js'

/** 受信内部命令；HTTP身份、策略及请求摘要必须由外层各自核验，不能接收客户端直接调用。 */
export interface MeasuredProfileApplicationInput {
  /** 已验证归属、策略与时间的昵称及测量事实保存命令。 */ readonly command: MeasuredProfileSaveInput
  /** 已规范化并按统一用户隔离的幂等请求，保留期限来自锁定策略。 */ readonly idempotency: HttpIdempotencyReservationInput
  /** 位置/光照/通风修改（省略保留、null 清除）；无修改时为空对象。 */ readonly environment: CareContextGroupPatch
  /** 请求开始时锁定的已发布完整度策略（user-plant-profile/v1）；用于首次完整判定与奖励资格。 */ readonly profilePolicy: UserPlantProfileCompletenessPolicy
}
/** 本用例只编排既有事务和幂等，不新建连接或隐式策略。 */
export interface MeasuredProfileApplicationDependencies<T extends TransactionExecutionContext> {
  /** 保存后同事务归属读取完整公开聚合，不能再开启新事务。 */ readonly userPlantRepository: Pick<MysqlUserPlantRepository<T>, 'getOwnedUserPlant'>
  /** 当前业务事务的唯一生命周期驱动。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 与档案保存共享事务的占位和完成收据。 */ readonly idempotencyRepository: MysqlHttpIdempotencyRepository<T>
  /** 已验收的归属/旧版本/局部JSON保存入口。 */ readonly profileRepository: {
    /** 在传入事务保存事实并读回新聚合版本，不自行提交。 */ save(tx: T, command: MeasuredProfileSaveInput): Promise<MeasuredProfileSaveResult>
  }
  /** 提交未知时新连接无锁读取已提交收据，不提供写操作。 */ readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
  /** 环境档案与完整度证据端口（同事务）。 */ readonly environmentRepository: {
    /** 写入位置/光照/通风并返回最终状态。 */ saveCareContext(tx: T, input: SaveCareContextInput): Promise<CareContextGroups>
    /** 读取完整度判定证据。 */ readCompletenessEvidence(tx: T, input: EnvironmentOwnerInput): Promise<CompletenessEvidence>
    /** 首次完整时写入完成时间。 */ markProfileCompleted(tx: T, input: MarkProfileCompletedInput): Promise<void>
  }
  /** user-plant 唯一 outbox 写入端口（同事务）。 */ readonly outboxRepository: Pick<MysqlUserPlantOutboxRepository<T>, 'insertPending'>
  /** 可选事件引用生成器；缺省 evt_ + 18 字节随机数 base64url。 */ readonly createEventRef?: () => string
}
/** 稳定内部协议响应，禁止传入SQL错误或受限元数据。 */
function error(status: number, type: string, message: string): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}
/** 完整公开响应的严格Schema，不因Repository静态类型而跳过运行时检查。 */
const validatePlant = new Ajv({ strict: true, allErrors: true }).compile<UserPlantDto>(userPlantSchema)
/** 昵称与实测盆器事实的应用切片；成功收据使用同事务完整公开读回。 */
export function createMeasuredProfileApplicationService<T extends TransactionExecutionContext>(dependencies: MeasuredProfileApplicationDependencies<T>) {
  return async (input: MeasuredProfileApplicationInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const command = lockMeasuredProfileSaveInput(input.command)
    const idempotency = Object.freeze({ ...input.idempotency })
    const environment = Object.freeze({ ...input.environment })
    try {
      return await runDatabaseTransaction(dependencies.driver, async tx => {
        const decision = await dependencies.idempotencyRepository.tryReserve(tx, idempotency)
        if (decision.kind === 'replay') { return decision.response }
        if (decision.kind === 'conflict') { return error(decision.httpStatus, decision.errorType, '幂等键已用于其他请求') }
        if (decision.kind === 'wait_for_winner') { return error(503, 'SERVICE_UNAVAILABLE', '请求仍在处理中，请稍后重试') }
        const result = await dependencies.profileRepository.save(tx, command)
        let response: HttpIdempotencyPublicResponseSnapshot
        switch (result.status) {
          case 'saved': {
            const owner = { userRef: command.userRef, userPlantRef: command.userPlantRef }
            const context = await dependencies.environmentRepository.saveCareContext(tx, { ...owner, patch: environment, occurredAtMs: command.occurredAtMs })
            // 首次完整判定（合同 §3）：只看保存后的已存事实；完成时间一旦写入不覆盖，奖励每个用户终身一次。
            const evidence = await dependencies.environmentRepository.readCompletenessEvidence(tx, owner)
            const decision = evaluateUserPlantProfileCompleteness({
              identityStatus: evidence.identityStatus, hasPot: hasCompleteMeasuredPot(result.measuredPot), hasLocation: context.location !== undefined,
              hasLightingEnvironment: context.lighting !== undefined, hasVentilationEnvironment: context.ventilation !== undefined,
              profileCompletedAtMs: evidence.profileCompletedAtMs, userPreviouslyCompletedProfile: evidence.userPreviouslyCompletedProfile,
              occurredAtMs: command.occurredAtMs, policy: input.profilePolicy
            })
            if (decision.kind === 'completed_now') {
              await dependencies.environmentRepository.markProfileCompleted(tx, { ...owner, completedAtMs: decision.completedAtMs, profileVersion: decision.profileVersion })
              if (decision.rewardEligible) {
                const eventId = (dependencies.createEventRef ?? (() => `evt_${randomBytes(18).toString('base64url')}`))()
                await dependencies.outboxRepository.insertPending(tx, buildFirstProfileRewardEvent({ eventId, ...owner, completedAtMs: decision.completedAtMs, profileVersion: decision.profileVersion }),
                  result.version, command.occurredAtMs)
              }
            }
            const readback = await dependencies.userPlantRepository.getOwnedUserPlant(tx, command.userRef as UserRef, command.userPlantRef as UserPlantRef)
            const plant: unknown = JSON.parse(serializeCanonicalJson(readback as unknown as CanonicalJsonValue))
            const expectedProfile = { nickname: result.nickname, ...(result.measuredPot === undefined ? {} : { measuredPot: result.measuredPot }),
              ...(result.substrate === undefined ? {} : { substrate: result.substrate }), ...context }
            if (!validatePlant(plant) || plant.user_plant_id !== command.userPlantRef || plant.version !== result.version || plant.profile === undefined
              || serializeCanonicalJson(plant.profile as unknown as CanonicalJsonValue) !== serializeCanonicalJson(expectedProfile as unknown as CanonicalJsonValue)) {
              throw new Error('档案保存后的完整公开读回不匹配')
            }
            response = { status: 200, body: { data: plant } }; break
          }
          case 'not_found': response = error(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在'); break
          case 'version_conflict': response = error(409, 'USER_PLANT_VERSION_CONFLICT', '植物档案已更新，请重新读取'); break
          case 'unavailable': throw new Error('档案持久化不可用，必须整体回滚')
        }
        const completed = await dependencies.idempotencyRepository.completionFirstResult(tx, {
          principalType: idempotency.principalType, principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod, normalizedPath: idempotency.normalizedPath, operationId: idempotency.operationId,
          idempotencyKeyHash: idempotency.idempotencyKeyHash, requestHash: idempotency.requestHash,
          response, completedAtMs: command.occurredAtMs
        })
        if (completed.kind !== 'completed') { throw new Error('档案和完成收据未在同一事务确定') }
        return completed.response
      })
    } catch (cause: unknown) {
      if (!(cause instanceof DatabaseCommitResultUnknownError)) { throw cause }
      const reconciled = await reconcileHttpIdempotencyCommitResult(dependencies.commitUnknownReadOnlyRepository, {
        scope: { principalType: idempotency.principalType, principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod, normalizedPath: idempotency.normalizedPath,
          operationId: idempotency.operationId, idempotencyKeyHash: idempotency.idempotencyKeyHash },
        requestHash: idempotency.requestHash
      })
      if (reconciled.kind === 'replay') { return reconciled.response }
      return error(503, 'SERVICE_UNAVAILABLE', '提交结果暂时无法确认，请使用相同幂等键重试')
    }
  }
}
