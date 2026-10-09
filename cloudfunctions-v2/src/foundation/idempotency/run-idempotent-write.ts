import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../database/transaction-runner.js'
import { reconcileHttpIdempotencyCommitResult, type HttpIdempotencyCommitUnknownReadOnlyRepository } from './commit-unknown-reconciliation.js'
import type { HttpIdempotencyPublicResponseSnapshot } from './http-idempotency.js'
import type { HttpIdempotencyReservationInput, MysqlHttpIdempotencyRepository } from './mysql-http-idempotency-repository.js'

/** 幂等写用例共享端口。 */
export interface IdempotentWriteDependencies<TTransaction extends TransactionExecutionContext> {
  /** Foundation 事务驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 共享 HTTP 幂等 Repository（唯一幂等事实）。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** 提交结果未知后的新连接只读对账。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/**
 * 业务步骤要求整笔回滚且不记录幂等结果时抛出（如事务内发现档案版本已变，T6）。
 * 公开为 503，客户端可用同一幂等键重试。
 */
export class IdempotentWriteRetryLaterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '幂等写需要稍后重试'
  }
}

/** 编排违反同事务不变量时的内部错误。 */
export class IdempotentWriteInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '幂等写不变量错误'
  }
}

const serviceUnavailableStatus = 503

/** 稳定公开错误快照。 */
export function publicErrorSnapshot(status: number, type: string, message: string): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}

/**
 * 同一事务：幂等占位 → 业务步骤（返回确定的公开结果）→ 幂等完成；提交结果未知时新连接对账。
 * 业务步骤返回的错误快照同样作为首次结果记录（同键重放得到同一结果）；需要回滚时抛出 IdempotentWriteRetryLaterError。
 */
export async function runIdempotentWrite<TTransaction extends TransactionExecutionContext>(
  dependencies: IdempotentWriteDependencies<TTransaction>,
  idempotency: HttpIdempotencyReservationInput,
  completedAtMs: number,
  work: (transaction: TTransaction) => Promise<HttpIdempotencyPublicResponseSnapshot>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const scope = {
    principalType: idempotency.principalType, principalScopeHash: idempotency.principalScopeHash,
    httpMethod: idempotency.httpMethod, normalizedPath: idempotency.normalizedPath, operationId: idempotency.operationId,
    idempotencyKeyHash: idempotency.idempotencyKeyHash
  }
  try {
    return await runDatabaseTransaction(dependencies.driver, async transaction => {
      const reservation = await dependencies.idempotencyRepository.tryReserve(transaction, idempotency)
      if (reservation.kind === 'replay') { return reservation.response }
      if (reservation.kind === 'conflict') { return publicErrorSnapshot(reservation.httpStatus, reservation.errorType, '幂等键已用于其他请求') }
      if (reservation.kind === 'wait_for_winner') { return publicErrorSnapshot(serviceUnavailableStatus, 'SERVICE_UNAVAILABLE', '请求仍在处理中，请稍后重试') }
      const response = await work(transaction)
      const completion = await dependencies.idempotencyRepository.completionFirstResult(transaction, {
        ...scope, requestHash: idempotency.requestHash, response, completedAtMs
      })
      if (completion.kind !== 'completed') { throw new IdempotentWriteInvariantError('业务写入与幂等完成记录未在同一事务确定') }
      return completion.response
    })
  } catch (error: unknown) {
    if (error instanceof IdempotentWriteRetryLaterError) {
      return publicErrorSnapshot(serviceUnavailableStatus, 'SERVICE_UNAVAILABLE', '数据刚刚发生变化，请使用相同幂等键重试')
    }
    if (!(error instanceof DatabaseCommitResultUnknownError)) { throw error }
    const reconciled = await reconcileHttpIdempotencyCommitResult(dependencies.commitUnknownReadOnlyRepository, { scope, requestHash: idempotency.requestHash })
    if (reconciled.kind === 'replay') { return reconciled.response }
    return publicErrorSnapshot(serviceUnavailableStatus, 'SERVICE_UNAVAILABLE', '提交结果暂时无法确认，请使用相同幂等键重试')
  }
}
