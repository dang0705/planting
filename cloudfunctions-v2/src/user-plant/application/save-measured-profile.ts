import { DatabaseCommitResultUnknownError, runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { reconcileHttpIdempotencyCommitResult, type HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../foundation/idempotency/commit-unknown-reconciliation.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput, MysqlHttpIdempotencyRepository } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { lockMeasuredProfileSaveInput, type MeasuredProfileSaveInput, type MeasuredProfileSaveResult } from '../repository/mysql-measured-profile-repository.js'

/** 受信内部命令；HTTP身份、策略及请求摘要必须由外层各自核验，不能接收客户端直接调用。 */
export interface MeasuredProfileApplicationInput {
  /** 已验证归属、策略与时间的昵称及测量事实保存命令。 */ readonly command: MeasuredProfileSaveInput
  /** 已规范化并按统一用户隔离的幂等请求，保留期限来自锁定策略。 */ readonly idempotency: HttpIdempotencyReservationInput
}
/** 本用例只编排既有事务和幂等，不新建连接或隐式策略。 */
export interface MeasuredProfileApplicationDependencies<T extends TransactionExecutionContext> {
  /** 当前业务事务的唯一生命周期驱动。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 与档案保存共享事务的占位和完成收据。 */ readonly idempotencyRepository: MysqlHttpIdempotencyRepository<T>
  /** 已验收的归属/旧版本/局部JSON保存入口。 */ readonly profileRepository: {
    /** 在传入事务保存事实并读回新聚合版本，不自行提交。 */ save(tx: T, command: MeasuredProfileSaveInput): Promise<MeasuredProfileSaveResult>
  }
  /** 提交未知时新连接无锁读取已提交收据，不提供写操作。 */ readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}
/** 稳定内部协议响应，禁止传入SQL错误或受限元数据。 */
function error(status: number, type: string, message: string): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}
/** 昵称与实测盆器事实的应用切片；内部响应不能替代完整档案HTTP合同。 */
export function createMeasuredProfileApplicationService<T extends TransactionExecutionContext>(dependencies: MeasuredProfileApplicationDependencies<T>) {
  return async (input: MeasuredProfileApplicationInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const command = lockMeasuredProfileSaveInput(input.command)
    const idempotency = Object.freeze({ ...input.idempotency })
    try {
      return await runDatabaseTransaction(dependencies.driver, async tx => {
        const decision = await dependencies.idempotencyRepository.tryReserve(tx, idempotency)
        if (decision.kind === 'replay') { return decision.response }
        if (decision.kind === 'conflict') { return error(decision.httpStatus, decision.errorType, '幂等键已用于其他请求') }
        if (decision.kind === 'wait_for_winner') { return error(503, 'SERVICE_UNAVAILABLE', '请求仍在处理中，请稍后重试') }
        const result = await dependencies.profileRepository.save(tx, command)
        let response: HttpIdempotencyPublicResponseSnapshot
        switch (result.status) {
          case 'saved': response = { status: 200, body: { data: { userPlantRef: result.userPlantRef, version: result.version, nickname: result.nickname, measuredPot: result.measuredPot } } }; break
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
