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
import type { HttpIdempotencyReservationInput, MysqlHttpIdempotencyRepository } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { lockTemporaryCareResult, type TemporaryCareOwner } from '../domain/temporary-care-result-record.js'
import type { WateringAdviceRepository } from '../repository/mysql-watering-advice-repository.js'
import type { BuiltWateringAdvice } from './build-watering-advice.js'

/** 当次环境合同版本（与既有临时养护结果记录一致）。 */
const environmentContractVersion = 'care-environment-foundation/v2'
const successHTTPStatusCode = Number('200')
const notFoundHTTPStatusCode = Number('404')
const serviceUnavailableHTTPStatusCode = Number('503')

/** 创建浇水建议应用用例的受信输入；所有外部读取已在事务前完成。 */
export interface CreateWateringAdviceApplicationInput {
  /** 已验真的临时案例归属（游客会话或登录用户）。 */
  readonly owner: TemporaryCareOwner
  /** 事务外组装好的公开结果与留存正文。 */
  readonly built: BuiltWateringAdvice
  /** 无 active 浇水会话时使用的服务端高熵会话引用。 */
  readonly newSessionRef: string
  /** 服务端高熵结果引用（cres_ 前缀）。 */
  readonly newResultRef: string
  /** 服务端可信时钟的计算时刻，UTC 毫秒；等于结果 generatedAt。 */
  readonly occurredAtMs: number
  /** HTTP 适配器已规范化并哈希的幂等作用域与请求摘要。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 应用用例显式端口。 */
export interface CreateWateringAdviceApplicationDependencies<TTransaction extends TransactionExecutionContext> {
  /** Foundation 事务驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 共享 HTTP 幂等 Repository。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** care 域浇水建议事务仓储。 */
  readonly repository: WateringAdviceRepository<TTransaction>
  /** 提交结果未知后的新连接只读对账。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/** 编排违反同事务不变量时的内部错误。 */
export class CreateWateringAdviceApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '创建浇水建议应用错误'
  }
}

/** 稳定公开错误快照。 */
function publicError(status: number, type: string, message: string): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}

/**
 * 浇水建议应用服务（watering-advice/v1，裁决 3/4/9）。
 * 同一事务：幂等占位 → 锁本人案例 → 查找或创建 active 浇水会话 → 追加结果 → 读回 → 幂等完成。
 * 会话与结果期限等于案例期限；无策略的暂不可用结果同样追加并可读回。不写浇水事实、计划或提醒。
 */
export function createWateringAdviceApplicationService<TTransaction extends TransactionExecutionContext>(
  dependencies: CreateWateringAdviceApplicationDependencies<TTransaction>
): (input: CreateWateringAdviceApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async input => {
    const idempotency = input.idempotency
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const reservation = await dependencies.idempotencyRepository.tryReserve(transaction, idempotency)
        if (reservation.kind === 'replay') { return reservation.response }
        if (reservation.kind === 'conflict') { return publicError(reservation.httpStatus, reservation.errorType, '幂等键已用于其他请求') }
        if (reservation.kind === 'wait_for_winner') { return publicError(serviceUnavailableHTTPStatusCode, 'SERVICE_UNAVAILABLE', '请求仍在处理中，请稍后重试') }

        let response: HttpIdempotencyPublicResponseSnapshot
        const locked = await dependencies.repository.lockOwnedCase(transaction, input.owner, input.occurredAtMs)
        if (locked === null) {
          response = publicError(notFoundHTTPStatusCode, 'NOT_FOUND', '临时案例不存在或已失效')
        } else {
          const sessionRef = await dependencies.repository.findOrCreateWateringSession(transaction, {
            owner: input.owner, caseInternalId: locked.caseInternalId, candidateSessionRef: input.newSessionRef,
            expiresAtMs: locked.expiresAtMs, nowMs: input.occurredAtMs
          })
          const record = {
            owner: input.owner, sessionRef, resultRef: input.newResultRef, environmentContractVersion,
            inputManifest: input.built.inputManifest, algorithmReleaseManifest: input.built.algorithmReleaseManifest,
            derivations: input.built.derivations, result: input.built.result as unknown as CanonicalJsonObject,
            generatedAtMs: input.occurredAtMs, expiresAtMs: locked.expiresAtMs
          }
          const expectedHash = lockTemporaryCareResult(record).hashes.result
          if (await dependencies.repository.appendResult(transaction, record) !== 'created') {
            throw new CreateWateringAdviceApplicationError('临时养护结果未能追加')
          }
          if (await dependencies.repository.readResultHash(transaction, input.newResultRef) !== expectedHash) {
            throw new CreateWateringAdviceApplicationError('临时养护结果读回与写入不一致')
          }
          response = { status: successHTTPStatusCode, body: { data: { resultRef: input.newResultRef, result: input.built.result } } }
        }
        const completion = await dependencies.idempotencyRepository.completionFirstResult(transaction, {
          principalType: idempotency.principalType, principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod, normalizedPath: idempotency.normalizedPath, operationId: idempotency.operationId,
          idempotencyKeyHash: idempotency.idempotencyKeyHash, requestHash: idempotency.requestHash,
          response, completedAtMs: input.occurredAtMs
        })
        if (completion.kind !== 'completed') { throw new CreateWateringAdviceApplicationError('结果与幂等完成记录未在同一事务确定') }
        return completion.response
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) { throw error }
      const reconciled = await reconcileHttpIdempotencyCommitResult(dependencies.commitUnknownReadOnlyRepository, {
        scope: {
          principalType: idempotency.principalType, principalScopeHash: idempotency.principalScopeHash,
          httpMethod: idempotency.httpMethod, normalizedPath: idempotency.normalizedPath, operationId: idempotency.operationId,
          idempotencyKeyHash: idempotency.idempotencyKeyHash
        },
        requestHash: idempotency.requestHash
      })
      if (reconciled.kind === 'replay') { return reconciled.response }
      return publicError(serviceUnavailableHTTPStatusCode, 'SERVICE_UNAVAILABLE', '提交结果暂时无法确认，请使用相同幂等键重试')
    }
  }
}
