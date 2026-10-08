import type { GuestPrincipalDto, TemporaryCaseResponseDto, UserPrincipalDto } from '../../contracts/types.js'
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
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type {
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { decideAuthenticatedTemporaryCase, decideGuestTemporaryCase } from '../domain/temporary-case-rules.js'
import type { TemporaryCaseRepository } from '../repository/mysql-temporary-case-repository.js'

const successHTTPStatusCode = Number('200')
const invalidIdentityHTTPStatusCode = Number('401')
const conflictHTTPStatusCode = Number('409')
const serviceUnavailableHTTPStatusCode = Number('503')

/** 游客案例公开引用前缀（与 guest_plant_cases 既有引用格式一致）。 */
const guestCaseRefPrefix = 'gpc_'
/** 登录临时案例公开引用前缀（与 authenticated_ephemeral_plant_cases 既有引用格式一致）。 */
const authenticatedCaseRefPrefix = 'epc_'

/** 请求级锁定的两项限额；值来自已发布 userplant_limits 策略快照。 */
export interface TemporaryCaseLimits {
  /** 单个游客会话 active 未过期案例上限。 */
  readonly guestMaxCasesPerSession: number
  /** 临时案例有效小时数。 */
  readonly authenticatedEphemeralCaseTtlHours: number
}

/** 创建临时案例应用用例的完整受信输入。 */
export interface CreateTemporaryCaseApplicationInput {
  /** identity 域已验证的游客或登录主体；归属只来自它。 */
  readonly principal: GuestPrincipalDto | UserPrincipalDto
  /** 请求级策略快照提供的限额，不得来自客户端或源码默认值。 */
  readonly limits: TemporaryCaseLimits
  /** 服务端生成的高熵案例引用；游客必须 gpc_、登录必须 epc_。 */
  readonly newCaseRef: string
  /** 服务端可信时钟的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配器已规范化并哈希的幂等作用域与请求摘要。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 创建临时案例应用用例的显式端口。 */
export interface CreateTemporaryCaseApplicationDependencies<TTransaction extends TransactionExecutionContext> {
  /** Foundation 提供的事务生命周期驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** Foundation 共享 HTTP 幂等 Repository。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** user-plant 域的临时案例 Repository。 */
  readonly temporaryCaseRepository: TemporaryCaseRepository<TTransaction>
  /** 提交结果未知后用新连接只读对账的 Repository。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/** 编排违反同事务不变量时抛出的内部错误。 */
export class CreateTemporaryCaseApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '创建临时案例应用错误'
  }
}

/** 生成可重放的稳定公开错误快照。 */
function publicError(status: number, type: string, message: string): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}

/** 主体失效的固定公开结果。 */
const principalInvalid = () => publicError(invalidIdentityHTTPStatusCode, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')

/** 成功公开结果；只含合同三字段。 */
function success(data: TemporaryCaseResponseDto): HttpIdempotencyPublicResponseSnapshot {
  return { status: successHTTPStatusCode, body: { data } }
}

/** 在当前事务内创建案例或给出确定拒绝；内部故障直接抛出以回滚。 */
async function decideAndPersist<TTransaction extends TransactionExecutionContext>(
  transaction: TTransaction,
  input: CreateTemporaryCaseApplicationInput,
  repository: TemporaryCaseRepository<TTransaction>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const { principal, limits, newCaseRef, occurredAtMs } = input
  if (principal.principalType === 'guest') {
    if (!newCaseRef.startsWith(guestCaseRefPrefix)) { throw new CreateTemporaryCaseApplicationError('游客案例引用前缀不合法') }
    const locked = await repository.lockGuestSessionAndCountActiveCases(transaction, { guestSessionRef: principal.guestSessionRef, nowMs: occurredAtMs })
    if (locked === null) { return principalInvalid() }
    const decision = decideGuestTemporaryCase({
      guestSessionStatus: locked.status,
      guestSessionExpiresAtMs: locked.expiresAtMs,
      activeCaseCount: locked.activeCaseCount,
      maxCasesPerSession: limits.guestMaxCasesPerSession,
      nowMs: occurredAtMs
    })
    if (decision.kind === 'principal_invalid') { return principalInvalid() }
    if (decision.kind === 'limit_reached') {
      return publicError(conflictHTTPStatusCode, 'TEMPORARY_CASE_LIMIT_REACHED', '临时案例数量已达上限，请先处理已有案例')
    }
    await repository.insertGuestCase(transaction, { guestSessionInternalId: locked.guestSessionInternalId, caseRef: newCaseRef, expiresAtMs: decision.expiresAtMs, occurredAtMs })
    const stored = await repository.readGuestCase(transaction, { guestSessionInternalId: locked.guestSessionInternalId, caseRef: newCaseRef })
    if (stored.expiresAtMs !== decision.expiresAtMs) { throw new CreateTemporaryCaseApplicationError('游客案例读回与写入不一致') }
    return success({ caseRef: stored.caseRef, ownerKind: 'guest', expiresAt: new Date(stored.expiresAtMs).toISOString() })
  }
  if (!newCaseRef.startsWith(authenticatedCaseRefPrefix)) { throw new CreateTemporaryCaseApplicationError('登录临时案例引用前缀不合法') }
  const lockedUser = await repository.lockActiveUser(transaction, { userRef: principal.user_id })
  if (lockedUser === null) { return principalInvalid() }
  const decision = decideAuthenticatedTemporaryCase({ caseTtlHours: limits.authenticatedEphemeralCaseTtlHours, nowMs: occurredAtMs })
  await repository.insertAuthenticatedCase(transaction, { userInternalId: lockedUser.userInternalId, caseRef: newCaseRef, expiresAtMs: decision.expiresAtMs, occurredAtMs })
  const stored = await repository.readAuthenticatedCase(transaction, { userInternalId: lockedUser.userInternalId, caseRef: newCaseRef })
  if (stored.expiresAtMs !== decision.expiresAtMs) { throw new CreateTemporaryCaseApplicationError('登录临时案例读回与写入不一致') }
  return success({ caseRef: stored.caseRef, ownerKind: 'authenticated', expiresAt: new Date(stored.expiresAtMs).toISOString() })
}

/**
 * 创建临时植物案例应用服务（temporary-case/v1）。
 *
 * 幂等占位、游客会话行锁与计数（或登录用户行锁）、插入、读回与幂等完成共享同一事务；
 * 确定拒绝（401/409）也写为 completed 后提交以便重放；内部故障回滚全部写入。
 */
export function createTemporaryCaseApplicationService<TTransaction extends TransactionExecutionContext>(
  dependencies: CreateTemporaryCaseApplicationDependencies<TTransaction>
): (input: CreateTemporaryCaseApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async input => {
    const idempotency = input.idempotency
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const reservation = await dependencies.idempotencyRepository.tryReserve(transaction, idempotency)
        if (reservation.kind === 'replay') { return reservation.response }
        if (reservation.kind === 'conflict') { return publicError(reservation.httpStatus, reservation.errorType, '幂等键已用于其他请求') }
        if (reservation.kind === 'wait_for_winner') {
          return publicError(serviceUnavailableHTTPStatusCode, 'SERVICE_UNAVAILABLE', '请求仍在处理中，请稍后重试')
        }
        const response = await decideAndPersist(transaction, input, dependencies.temporaryCaseRepository)
        const completion = await dependencies.idempotencyRepository.completionFirstResult(transaction, {
          principalType: idempotency.principalType,
          principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod,
          normalizedPath: idempotency.normalizedPath,
          operationId: idempotency.operationId,
          idempotencyKeyHash: idempotency.idempotencyKeyHash,
          requestHash: idempotency.requestHash,
          response,
          completedAtMs: input.occurredAtMs
        })
        if (completion.kind !== 'completed') { throw new CreateTemporaryCaseApplicationError('领域结果与幂等完成记录未在同一事务确定') }
        return completion.response
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) { throw error }
      const reconciled = await reconcileHttpIdempotencyCommitResult(dependencies.commitUnknownReadOnlyRepository, {
        scope: {
          principalType: idempotency.principalType,
          principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod,
          normalizedPath: idempotency.normalizedPath,
          operationId: idempotency.operationId,
          idempotencyKeyHash: idempotency.idempotencyKeyHash
        },
        requestHash: idempotency.requestHash
      })
      if (reconciled.kind === 'replay') { return reconciled.response }
      return publicError(serviceUnavailableHTTPStatusCode, 'SERVICE_UNAVAILABLE', '提交结果暂时无法确认，请使用相同幂等键重试')
    }
  }
}
