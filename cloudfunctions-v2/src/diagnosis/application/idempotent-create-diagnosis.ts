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
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  FixedQuestionSessionCreation,
  CreateFixedQuestionSessionInput
} from './create-fixed-question-session.js'
import type {
  CreatePestQuestionSessionInput,
  PestQuestionSessionCreation
} from './create-pest-question-session.js'

/** 受控入口计算并冻结的共享幂等输入，不含原始幂等请求头。 */
export interface IdempotentDiagnosisCreationInput extends CreateFixedQuestionSessionInput {
  /** 保留期等时间值必须来自已发布运行策略，本模块不提供默认值。 */
  readonly idempotency: HttpIdempotencyReservationInput
}
/** 虫害创建明确绑定私有资产，不允许退化为固定症状请求摘要。 */
export interface PestDiagnosisCreationCommand extends CreatePestQuestionSessionInput {
  /** 虫害选题流程；具体候选病因由已准入服务端分析决定。 */
  readonly mode: 'pest'
}
/** 既有共享账本作用域，保留期由入口锁定的已发布策略提供。 */
export interface IdempotentPestDiagnosisCreationInput extends PestDiagnosisCreationCommand {
  /** 不传递原始幂等请求头。 */
  readonly idempotency: HttpIdempotencyReservationInput
}
/** 虫害摘要覆盖资产引用；当前发布时间与服务端时钟不能改变重放内容。 */
export function calculatePestDiagnosisCreationRequestHash(
  input: PestDiagnosisCreationCommand
): string {
  return calculateCanonicalJsonSha256({
    userRef: input.userRef,
    userPlantRef: input.userPlantRef,
    mode: input.mode,
    assetRef: input.assetRef
  })
}
/** 对公开引用与提交正文规范化计算摘要；时钟不属于重复请求内容。 */
export function calculateDiagnosisCreationRequestHash(
  input: CreateFixedQuestionSessionInput
): string {
  return calculateCanonicalJsonSha256({
    userRef: input.userRef,
    userPlantRef: input.userPlantRef,
    mode: input.mode
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
 * 会话创建与共享幂等完成记录在同一事务落下；未知提交只读对账，不自动重跑。
 * 响应投影必须由受控HTTP合同适配器提供；没有可绕过DTO验收的默认成功响应。
 */
interface DiagnosisCreationDependencies<
  T extends TransactionExecutionContext,
  I extends CreateFixedQuestionSessionInput | PestDiagnosisCreationCommand,
  R extends FixedQuestionSessionCreation | PestQuestionSessionCreation
> {
  /** 唯一的Foundation事务驱动。 */
  readonly driver: DatabaseTransactionDriver<T>
  /** 既有共享幂等表Repository，不重建领域账本。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<T>
  /** 提交结果未知时使用新连接的只读端口。 */
  readonly commitUnknownRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
  /** 必须在给定事务内执行已有会话创建用例，禁止开启嵌套事务。 */
  readonly createInTransaction: (tx: T, input: I) => Promise<R>
  /** 对应公开合同校验和脱敏后的首次响应，重放不能再次调用它。 */
  readonly projectPublicResponse: (result: R) => HttpIdempotencyPublicResponseSnapshot
}
/** 仅诊断创建的两种明确用例共用，非跨域通用模型或新事务设施。 */
function createDiagnosisCreationTransaction<
  T extends TransactionExecutionContext,
  I extends CreateFixedQuestionSessionInput | PestDiagnosisCreationCommand,
  R extends FixedQuestionSessionCreation | PestQuestionSessionCreation
>(
  dependencies: DiagnosisCreationDependencies<T, I, R>,
  command: {
    readonly valid: (input: I) => boolean
    readonly hash: (input: I) => string
  }
) {
  return async (
    input: I & { readonly idempotency: HttpIdempotencyReservationInput }
  ): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const stable = {
      ...input,
      idempotency: Object.freeze({ ...input.idempotency })
    }
    const scope = stable.idempotency
    if (
      !command.valid(stable) ||
      scope.principalType !== 'user' ||
      scope.principalScopeHash !== createHash('sha256').update(stable.userRef).digest('hex') ||
      scope.httpMethod !== 'POST' ||
      scope.normalizedPath !== '/api/v2/diagnosis/sessions' ||
      scope.operationId !== 'createDiagnosisSession' ||
      scope.requestHash !== command.hash(stable)
    ) {
      throw new TypeError('会话创建幂等作用域不匹配')
    }
    if (
      !Number.isSafeInteger(stable.startedAtMs) ||
      stable.startedAtMs < 0 ||
      stable.startedAtMs > 8_640_000_000_000_000
    ) {
      throw new TypeError('会话创建时间非法')
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
        const result = await dependencies.createInTransaction(tx, stable)
        const response = dependencies.projectPublicResponse(result)
        const completed = await dependencies.idempotencyRepository.completionFirstResult(tx, {
          ...scope,
          response,
          completedAtMs: stable.startedAtMs
        })
        if (completed.kind !== 'completed') {
          throw new Error('会话创建与幂等完成结果不一致')
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
/** 固定症状保留原入口及摘要，不能通过该入口隐式调用虫害流程。 */
export function createIdempotentDiagnosisCreationService<T extends TransactionExecutionContext>(
  dependencies: DiagnosisCreationDependencies<
    T,
    CreateFixedQuestionSessionInput,
    FixedQuestionSessionCreation
  >
) {
  return createDiagnosisCreationTransaction(dependencies, {
    valid: input => ['yellow_leaf', 'wilting_droop'].includes(input.mode),
    hash: calculateDiagnosisCreationRequestHash
  })
}
/** 虫害复用同一事务及幂等账本；首次响应必须显式使用受控投影。 */
export function createIdempotentPestDiagnosisCreationService<T extends TransactionExecutionContext>(
  dependencies: DiagnosisCreationDependencies<
    T,
    PestDiagnosisCreationCommand,
    PestQuestionSessionCreation
  >
) {
  return createDiagnosisCreationTransaction(dependencies, {
    valid: input =>
      input.mode === 'pest' &&
      typeof input.assetRef === 'string' &&
      input.assetRef.trim().length > 0,
    hash: calculatePestDiagnosisCreationRequestHash
  })
}
