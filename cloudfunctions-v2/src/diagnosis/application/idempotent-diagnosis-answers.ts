import { createHash } from 'node:crypto'
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
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  DiagnosisAnswerSubmissionResult,
  SubmitDiagnosisAnswersInput
} from './submit-diagnosis-answers.js'

/** 受控入口计算并冻结的共享幂等输入，不含原始幂等请求头。 */
export interface IdempotentDiagnosisAnswerInput extends SubmitDiagnosisAnswersInput {
  /** 保留期等时间值必须来自已发布运行策略，本模块不提供默认值。 */
  readonly idempotency: HttpIdempotencyReservationInput
}
/** 对公开引用与提交正文规范化计算摘要；时钟不属于重复请求内容。 */
export function calculateDiagnosisAnswerRequestHash(input: SubmitDiagnosisAnswersInput): string {
  return calculateCanonicalJsonSha256({
    userRef: input.userRef,
    userPlantRef: input.userPlantRef,
    diagnosisRef: input.diagnosisRef,
    submitted: input.submitted
  } as CanonicalJsonValue)
}
/** 固定脱敏错误，不包含数据库、连接或内部摘要信息。 */
function unavailable(): HttpIdempotencyPublicResponseSnapshot {
  return {
    status: 503,
    body: { error: { type: 'SERVICE_UNAVAILABLE', message: '请求结果暂时无法确认，请稍后重试' } }
  }
}
/**
 * 答案与共享幂等完成记录在同一事务落下；未知提交只读对账，不自动重跑。
 * 响应投影必须由受控HTTP合同适配器提供；没有可绕过DTO验收的默认成功响应。
 */
export function createIdempotentDiagnosisAnswerService<
  T extends TransactionExecutionContext
>(dependencies: {
  /** 唯一的Foundation事务驱动。 */
  readonly driver: DatabaseTransactionDriver<T>
  /** 既有共享幂等表Repository，不重建领域账本。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<T>
  /** 提交结果未知时使用新连接的只读端口。 */
  readonly commitUnknownRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
  /** 必须在给定事务内执行已有答案用例，禁止开启嵌套事务。 */
  readonly submitInTransaction: (
    tx: T,
    input: SubmitDiagnosisAnswersInput
  ) => Promise<DiagnosisAnswerSubmissionResult>
  /** 对应公开合同校验和脱敏后的首次响应，重放不能再次调用它。 */
  readonly projectPublicResponse: (
    result: DiagnosisAnswerSubmissionResult
  ) => HttpIdempotencyPublicResponseSnapshot
}) {
  return async (
    input: IdempotentDiagnosisAnswerInput
  ): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const stable = {
      ...input,
      submitted: JSON.parse(
        serializeCanonicalJson(input.submitted as CanonicalJsonValue)
      ) as unknown,
      idempotency: Object.freeze({ ...input.idempotency })
    }
    const scope = stable.idempotency
    if (
      scope.principalType !== 'user' ||
      scope.principalScopeHash !== createHash('sha256').update(stable.userRef).digest('hex') ||
      scope.httpMethod !== 'POST' ||
      scope.normalizedPath !== '/api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers' ||
      scope.operationId !== 'answerDiagnosisQuestion' ||
      scope.requestHash !== calculateDiagnosisAnswerRequestHash(stable)
    ) {
      throw new TypeError('答案幂等作用域不匹配')
    }
    if (
      !Number.isSafeInteger(stable.occurredAtMs) ||
      stable.occurredAtMs < 0 ||
      stable.occurredAtMs > 8_640_000_000_000_000
    ) {
      throw new TypeError('答案时间非法')
    }
    try {
      return await runDatabaseTransaction(dependencies.driver, async tx => {
        const reservation = await dependencies.idempotencyRepository.tryReserve(tx, scope)
        if (reservation.kind === 'replay') {
          return reservation.response
        }
        if (reservation.kind === 'conflict') {
          return {
            status: 409,
            body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '幂等键已用于其他请求' } }
          }
        }
        if (reservation.kind === 'wait_for_winner') {
          return unavailable()
        }
        const result = await dependencies.submitInTransaction(tx, stable)
        const response = dependencies.projectPublicResponse(result)
        const completed = await dependencies.idempotencyRepository.completionFirstResult(tx, {
          ...scope,
          response,
          completedAtMs: stable.occurredAtMs
        })
        if (completed.kind !== 'completed') {
          throw new Error('答案与幂等完成结果不一致')
        }
        return completed.response
      })
    } catch (error) {
      if (error instanceof DatabaseCommitResultUnknownError) {
        const reconciliation = await reconcileHttpIdempotencyCommitResult(
          dependencies.commitUnknownRepository,
          { scope, requestHash: scope.requestHash }
        )
        if (reconciliation.kind === 'replay') {
          return reconciliation.response
        }
      }
      return unavailable()
    }
  }
}
