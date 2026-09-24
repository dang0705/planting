import type {
  UserCapabilitySnapshotDto,
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto
} from '../../contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import {
  reconcileHttpIdempotencyCommitResult,
  type HttpIdempotencyCommitUnknownReadOnlyRepository
} from '../../foundation/idempotency/commit-unknown-reconciliation.js'
import type {
  HttpIdempotencyCompletionInput,
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import { canTransitionUserPlantLifecycle } from '../domain/transition-user-plant-lifecycle.js'
import { isUserPlantCapacityReached } from '../domain/user-plant-capacity.js'
import {
  UserPlantPersistenceError,
  type MysqlUserPlantRepository
} from '../repository/mysql-user-plant-repository.js'
import {
  type LockedUserPlantLifecycle,
  type MysqlUserPlantLifecycleRepository,
  type UserPlantMutableLifecycleStatus
} from '../repository/mysql-user-plant-lifecycle-repository.js'

const successHTTPStatusCode = Number('200')
const invalidIdentityHTTPStatusCode = Number('401')
const notFoundHTTPStatusCode = Number('404')
const conflictHTTPStatusCode = Number('409')
const capabilityDeniedHTTPStatusCode = Number('403')
const serviceUnavailableHTTPStatusCode = Number('503')

/** 用户植物归档/恢复应用层可见的生命周期 Repository。 */
export type UserPlantLifecycleRepository<TTransaction extends TransactionExecutionContext> = Pick<
  MysqlUserPlantLifecycleRepository<TTransaction>,
  'lockOwnedLifecycle' | 'compareAndSwapLifecycle'
>

/** 归档/恢复应用服务的受信内部输入；expectedVersion 来自之后冻结的 HTTP DTO。 */
export type UserPlantLifecycleApplicationInput = {
  /** identity 域已经解析并验证的统一登录主体。 */
  readonly principal: UserPrincipalDto
  /** 用户选择操作的高熵植物公开引用，不是数据库主键或授权凭证。 */
  readonly userPlantRef: UserPlantRef
  /** HTTP DTO 校验后传入的乐观锁版本；不可从数据库当前值替代。 */
  readonly expectedVersion: number
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配层已规范化并哈希的共享幂等唯一作用域。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 恢复用户植物的内部输入；恢复必须使用与主体一致的请求级能力快照重新核验上限。 */
export type RestoreUserPlantApplicationInput = UserPlantLifecycleApplicationInput & {
  /** subscription 域签发且归属同一统一用户的只读能力快照。 */
  readonly capabilitySnapshot: UserCapabilitySnapshotDto
}

/** 用户植物生命周期应用用例使用的明确 Foundation 与领域端口。 */
export type UserPlantLifecycleApplicationDependencies<
  TTransaction extends TransactionExecutionContext
> = {
  /** Foundation 提供的事务生命周期驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** Foundation 共享 HTTP 幂等 Repository；不得在 user-plant 域重建幂等存储。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** user-plant 域仅负责锁定和 CAS 的生命周期 Repository。 */
  readonly lifecycleRepository: UserPlantLifecycleRepository<TTransaction>
  /** 复用聚合根 Repository 执行公开投影读回，并为恢复提供与创建共用的用户锁/active 计数。 */
  readonly userPlantRepository: Pick<
    MysqlUserPlantRepository<TTransaction>,
    'getOwnedUserPlant' | 'lockUserAndCountActive'
  >
  /** 提交结果未知后从新连接只读查询 Foundation 幂等记录。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/** 生命周期命令未能完成同事务约束时的内部编排错误。 */
export class UserPlantLifecycleApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '用户植物生命周期应用错误'
  }
}

/** 构造只含稳定业务含义的公开错误快照；不得放入 SQL 或内部状态。 */
function publicErrorResponse(
  status: number,
  type: string,
  message: string
): HttpIdempotencyPublicResponseSnapshot {
  return { status: status, body: { error: { type: type, message: message } } }
}

/** 把可安全公开的确定性归属/身份失败转换成稳定 HTTP 错误。 */
function mapDeterministicPersistenceRejection(
  error: unknown
): HttpIdempotencyPublicResponseSnapshot | null {
  if (!(error instanceof UserPlantPersistenceError)) {
    return null
  }
  if (error.type === 'USER_PLANT_NOT_FOUND') {
    return publicErrorResponse(
      notFoundHTTPStatusCode,
      'USER_PLANT_NOT_FOUND',
      '用户植物不存在或不可访问'
    )
  }
  if (error.type === 'PRINCIPAL_INVALID') {
    return publicErrorResponse(invalidIdentityHTTPStatusCode, 'PRINCIPAL_INVALID', '登录状态已失效')
  }
  return null
}

/** 使用共享 Foundation Repository 在原事务中固定首次公开结果。 */
async function completeFirstResponse<TTransaction extends TransactionExecutionContext>(
  transaction: TTransaction,
  input: UserPlantLifecycleApplicationInput,
  response: HttpIdempotencyPublicResponseSnapshot,
  repository: MysqlHttpIdempotencyRepository<TTransaction>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const idempotency = input.idempotency
  const completion: HttpIdempotencyCompletionInput = {
    principalType: idempotency.principalType,
    principalScopeHash: idempotency.principalScopeHash,
    httpMethod: idempotency.httpMethod,
    normalizedPath: idempotency.normalizedPath,
    operationId: idempotency.operationId,
    idempotencyKeyHash: idempotency.idempotencyKeyHash,
    requestHash: idempotency.requestHash,
    response: response,
    completedAtMs: input.occurredAtMs
  }
  const result = await repository.completionFirstResult(transaction, completion)
  if (result.kind !== 'completed') {
    throw new UserPlantLifecycleApplicationError('生命周期结果与幂等完成记录未在同一事务确定')
  }
  return result.response
}

/** 在共享幂等完成记录中保存并返回可稳定重放的生命周期冲突。 */
async function completeVersionConflict<TTransaction extends TransactionExecutionContext>(
  transaction: TTransaction,
  input: UserPlantLifecycleApplicationInput,
  message: string,
  repository: MysqlHttpIdempotencyRepository<TTransaction>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  return completeFirstResponse(
    transaction,
    input,
    publicErrorResponse(conflictHTTPStatusCode, 'USER_PLANT_VERSION_CONFLICT', message),
    repository
  )
}

/**
 * 在归属、版本与 archived 状态确认后，按用户快照裁决重新激活的 active 名额。
 *
 * @param input 当前认证主体、目标植物、可信发生时间与已验证能力快照。
 * @param currentActiveCount 同一事务内、持有统一用户行锁时读取的 active 植物数量。
 * @returns 应写入幂等完成记录的稳定拒绝响应；允许恢复时返回 `null`。
 * @remarks 归档植物不计入 Repository 的 active 数量；快照不匹配、失效或数据损坏均失败关闭。
 */
function evaluateRestoreCapacity(
  input: RestoreUserPlantApplicationInput,
  currentActiveCount: number
): HttpIdempotencyPublicResponseSnapshot | null {
  const snapshot = input.capabilitySnapshot
  if (
    snapshot.subjectType !== 'user' ||
    snapshot.user_id !== input.principal.user_id ||
    !snapshot.allowedCapabilities.includes('USER_PLANT_CREATE')
  ) {
    return publicErrorResponse(
      capabilityDeniedHTTPStatusCode,
      'CAPABILITY_DENIED',
      '当前能力不允许恢复用户植物'
    )
  }

  const generatedAtMs = Date.parse(snapshot.generatedAt)
  const validUntilMs = Date.parse(snapshot.validUntil)
  if (
    !Number.isFinite(generatedAtMs) ||
    !Number.isFinite(validUntilMs) ||
    validUntilMs <= generatedAtMs ||
    input.occurredAtMs < generatedAtMs
  ) {
    throw new UserPlantLifecycleApplicationError('恢复请求的能力快照时间无效')
  }
  if (input.occurredAtMs >= validUntilMs) {
    return publicErrorResponse(
      conflictHTTPStatusCode,
      'CAPABILITY_SNAPSHOT_EXPIRED',
      '能力快照已失效，请重新请求'
    )
  }
  if (
    !Number.isSafeInteger(snapshot.activeUserPlantLimit) ||
    snapshot.activeUserPlantLimit < Number('0') ||
    !Number.isSafeInteger(currentActiveCount) ||
    currentActiveCount < Number('0')
  ) {
    throw new UserPlantLifecycleApplicationError('恢复请求的用户植物上限读数无效')
  }
  if (isUserPlantCapacityReached(currentActiveCount, snapshot.activeUserPlantLimit)) {
    return publicErrorResponse(
      capabilityDeniedHTTPStatusCode,
      'CAPABILITY_DENIED',
      '当前可恢复的用户植物数量已达上限'
    )
  }
  return null
}

/** 校验事务内公开读回确实反映 CAS 目标状态和恰好一次的版本递增。 */
function assertTransitionProjection(
  projection: UserPlantDto,
  targetLifecycle: UserPlantMutableLifecycleStatus,
  current: LockedUserPlantLifecycle
): void {
  if (
    projection.lifecycle !== targetLifecycle ||
    projection.version !== current.version + Number('1')
  ) {
    throw new UserPlantLifecycleApplicationError('生命周期更新后读回与原子写入不一致')
  }
}

/**
 * 只允许业务合同明确的归档与恢复动作使用该通用原子编排。
 *
 * @param dependencies 同一事务中的共享幂等、用户植物生命周期及用户锁定端口。
 * @param command 冻结路由对应的目标生命周期、操作标识和规范化路径。
 * @param preparation 可选的动作专属准备与裁决；恢复用它先锁统一用户并读取 active 数量。
 * @returns 首次结果以幂等记录和业务写入共同提交的应用服务。
 * @remarks 首次执行顺序固定为幂等预留→可选用户锁→owner-scoped 植物锁→版本/状态校验→策略裁决→CAS→投影读回→幂等完成；归档不执行恢复容量准备。
 */
function createLifecycleTransitionService<
  TTransaction extends TransactionExecutionContext,
  TInput extends UserPlantLifecycleApplicationInput = UserPlantLifecycleApplicationInput,
  TPreparedContext = undefined
>(
  dependencies: UserPlantLifecycleApplicationDependencies<TTransaction>,
  command: {
    /** 此动作唯一允许转换到的目标生命周期。 */
    readonly targetLifecycle: UserPlantMutableLifecycleStatus
    /** route-registry 中与目标命令相匹配的稳定动作标识。 */
    readonly operationId: 'archiveUserPlant' | 'restoreUserPlant'
    /** route-registry 中不含真实引用值的规范化路由模板。 */
    readonly normalizedPath: string
  },
  preparation?: {
    /** 在目标植物行锁之前锁定统一用户并读取同一事务中的 active 数量。 */
    readonly prepare: (transaction: TTransaction, input: TInput) => Promise<TPreparedContext>
    /** 在归属、版本和状态确认后决定是否拒绝本次生命周期变更。 */
    readonly rejectAfterLifecycleRead: (
      input: TInput,
      current: LockedUserPlantLifecycle,
      preparedContext: TPreparedContext
    ) => HttpIdempotencyPublicResponseSnapshot | null
  }
): (input: TInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async input => {
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const idempotencyDecision = await dependencies.idempotencyRepository.tryReserve(
          transaction,
          input.idempotency
        )
        if (idempotencyDecision.kind === 'replay') {
          return idempotencyDecision.response
        }
        if (idempotencyDecision.kind === 'conflict') {
          return publicErrorResponse(
            idempotencyDecision.httpStatus,
            idempotencyDecision.errorType,
            '幂等键已用于其他请求'
          )
        }
        if (idempotencyDecision.kind === 'wait_for_winner') {
          return publicErrorResponse(
            serviceUnavailableHTTPStatusCode,
            'SERVICE_UNAVAILABLE',
            '请求仍在处理中，请稍后重试'
          )
        }

        let lifecycleChanged = false
        try {
          if (
            input.idempotency.httpMethod !== 'POST' ||
            input.idempotency.normalizedPath !== command.normalizedPath ||
            input.idempotency.operationId !== command.operationId ||
            input.idempotency.principalType !== 'user'
          ) {
            throw new UserPlantLifecycleApplicationError('生命周期命令与幂等路由范围不匹配')
          }

          const preparedContext =
            preparation === undefined ? undefined : await preparation.prepare(transaction, input)

          const current = await dependencies.lifecycleRepository.lockOwnedLifecycle(
            transaction,
            input.principal.user_id,
            input.userPlantRef
          )
          if (input.expectedVersion !== current.version) {
            return await completeVersionConflict(
              transaction,
              input,
              '用户植物版本已变化，请重新读取',
              dependencies.idempotencyRepository
            )
          }

          if (!canTransitionUserPlantLifecycle(current.lifecycle, command.targetLifecycle)) {
            return await completeVersionConflict(
              transaction,
              input,
              '用户植物状态已变化，请重新读取',
              dependencies.idempotencyRepository
            )
          }

          const preparationRejection =
            preparation === undefined
              ? null
              : preparation.rejectAfterLifecycleRead(
                  input,
                  current,
                  preparedContext as TPreparedContext
                )
          if (preparationRejection !== null) {
            return await completeFirstResponse(
              transaction,
              input,
              preparationRejection,
              dependencies.idempotencyRepository
            )
          }

          const updated = await dependencies.lifecycleRepository.compareAndSwapLifecycle(
            transaction,
            {
              userRef: input.principal.user_id,
              userPlantRef: input.userPlantRef,
              expectedLifecycle: current.lifecycle,
              expectedVersion: input.expectedVersion,
              targetLifecycle: command.targetLifecycle,
              occurredAtMs: input.occurredAtMs
            }
          )
          if (!updated) {
            return await completeVersionConflict(
              transaction,
              input,
              '用户植物版本已变化，请重新读取',
              dependencies.idempotencyRepository
            )
          }
          lifecycleChanged = true

          const projection = await dependencies.userPlantRepository.getOwnedUserPlant(
            transaction,
            input.principal.user_id,
            input.userPlantRef
          )
          assertTransitionProjection(projection, command.targetLifecycle, current)
          return await completeFirstResponse(
            transaction,
            input,
            { status: successHTTPStatusCode, body: { data: projection } },
            dependencies.idempotencyRepository
          )
        } catch (error: unknown) {
          if (!lifecycleChanged) {
            const rejection = mapDeterministicPersistenceRejection(error)
            if (rejection !== null) {
              return await completeFirstResponse(
                transaction,
                input,
                rejection,
                dependencies.idempotencyRepository
              )
            }
          }
          throw error
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) {
        throw error
      }
      const idempotency = input.idempotency
      const reconcileResult = await reconcileHttpIdempotencyCommitResult(
        dependencies.commitUnknownReadOnlyRepository,
        {
          scope: {
            principalType: idempotency.principalType,
            principalScopeHash: idempotency.principalScopeHash,
            httpMethod: idempotency.httpMethod,
            normalizedPath: idempotency.normalizedPath,
            operationId: idempotency.operationId,
            idempotencyKeyHash: idempotency.idempotencyKeyHash
          },
          requestHash: idempotency.requestHash
        }
      )
      if (reconcileResult.kind === 'replay') {
        return reconcileResult.response
      }
      return publicErrorResponse(
        serviceUnavailableHTTPStatusCode,
        'SERVICE_UNAVAILABLE',
        '提交结果暂时无法确认，请使用相同幂等键重试'
      )
    }
  }
}

/**
 * 构造 route-registry `archiveUserPlant` 对应的内部归档用例。
 *
 * @param dependencies 事务、共享幂等、归属锁定、CAS 与公开投影读回依赖。
 * @returns 接收认证层主体、公开用户植物引用和合同化版本号的归档命令。
 * @remarks 本函数不接收公开 HTTP DTO，也不自行认证主体；只能由完成身份认证和请求校验的上层编排调用。
 */
export function createArchiveUserPlantApplicationService<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: UserPlantLifecycleApplicationDependencies<TTransaction>
): (input: UserPlantLifecycleApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return createLifecycleTransitionService(dependencies, {
    targetLifecycle: 'archived',
    operationId: 'archiveUserPlant',
    normalizedPath: '/api/v2/user-plants/{userPlantRef}/archive'
  })
}

/**
 * 构造 route-registry `restoreUserPlant` 对应的内部恢复用例。
 *
 * @param dependencies 事务、共享幂等、归属锁定、CAS 与公开投影读回依赖。
 * @returns 接收认证层主体、请求级能力快照、公开用户植物引用和合同化版本号的内部恢复命令。
 * @remarks 在目标植物行锁之前先锁同一用户并读取 active 数量，与创建共用串行化边界；当前仍不接入公开 HTTP，恢复错误 DTO 尚待冻结。
 */
export function createRestoreUserPlantApplicationService<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: UserPlantLifecycleApplicationDependencies<TTransaction>
): (input: RestoreUserPlantApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return createLifecycleTransitionService<TTransaction, RestoreUserPlantApplicationInput, number>(
    dependencies,
    {
      targetLifecycle: 'active',
      operationId: 'restoreUserPlant',
      normalizedPath: '/api/v2/user-plants/{userPlantRef}/restore'
    },
    {
      async prepare(transaction, input) {
        const locked = await dependencies.userPlantRepository.lockUserAndCountActive(
          transaction,
          input.principal.user_id
        )
        return locked.activeCount
      },
      rejectAfterLifecycleRead(input, _current, activeCount) {
        return evaluateRestoreCapacity(input, activeCount)
      }
    }
  )
}
