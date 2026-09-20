import type { UserPrincipalDto } from '../../contracts/types.js'
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
  HttpIdempotencyCompletionInput,
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { PlatformAuthenticationEntry } from '../domain/resolve-user-principal.js'
import type { VerifiedPlatformIdentityEvidence } from '../provider/platform-credential-evidence.js'
import {
  PlatformIdentityBindingPersistenceError,
  type MysqlPlatformIdentityBindingRepository
} from '../repository/mysql-platform-identity-binding-repository.js'

const successHttpStatusCode = Number('200')
const invalidIdentityHttpStatusCode = Number('401')
const conflictHttpStatusCode = Number('409')
const serviceUnavailableHttpStatusCode = Number('503')

/** 创建或恢复平台绑定应用服务的完整受信输入。 */
export type BindPlatformIdentityApplicationInput = {
  /** identity 已解析的当前登录用户；绑定永远归属该统一用户。 */
  readonly principal: UserPrincipalDto
  /** Provider 验真后按当前与退役密钥生成的安全证据。 */
  readonly verifiedIdentity: VerifiedPlatformIdentityEvidence
  /** 可选平台主体服务端密文；不得进入幂等响应、日志或公开 DTO。 */
  readonly platformSubjectCiphertext: string | null
  /** 服务端可信业务时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配器规范化并哈希后的共享幂等输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 解绑平台入口应用服务的完整受信输入。 */
export type RevokePlatformIdentityApplicationInput = {
  /** identity 已解析的当前登录用户；只能解绑该用户自己的入口。 */
  readonly principal: UserPrincipalDto
  /** 路由白名单解析的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 当前会话所在应用范围；禁止跨应用解绑。 */
  readonly appScope: string
  /** 服务端可信业务时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配器规范化并哈希后的共享幂等输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 绑定应用服务共享的事务、幂等和 identity Repository 端口。 */
export type PlatformIdentityBindingApplicationDependencies<
  TTransaction extends TransactionExecutionContext
> = {
  /** Foundation 提供的事务生命周期驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** Foundation 提供的共享 HTTP 幂等 Repository。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** identity 域平台绑定唯一写入端口。 */
  readonly bindingRepository: MysqlPlatformIdentityBindingRepository<TTransaction>
  /** COMMIT 结果未知后使用新连接读取首次完成结果的只读端口。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/** 应用编排输入或同事务不变量损坏时抛出的内部错误。 */
export class PlatformIdentityBindingApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlatformIdentityBindingApplicationError'
  }
}

/** 生成不含内部主键、摘要或 Provider 原文的公开错误快照。 */
function publicErrorResponse(
  status: number,
  type: string,
  message: string
): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}

/** 把确定身份拒绝映射成可重放公开结果；基础设施与数据损坏继续抛出。 */
function mapDeterministicRejection(error: unknown): HttpIdempotencyPublicResponseSnapshot | null {
  if (!(error instanceof PlatformIdentityBindingPersistenceError)) {
    return null
  }
  switch (error.type) {
    case 'PRINCIPAL_INVALID':
      return publicErrorResponse(
        invalidIdentityHttpStatusCode,
        'PRINCIPAL_INVALID',
        '登录状态已失效'
      )
    case 'IDENTITY_BINDING_CONFLICT':
      return publicErrorResponse(
        conflictHttpStatusCode,
        'IDENTITY_BINDING_CONFLICT',
        '该登录入口暂时无法绑定'
      )
    case 'IDENTITY_LAST_BINDING_REQUIRED':
      return publicErrorResponse(
        conflictHttpStatusCode,
        'IDENTITY_LAST_BINDING_REQUIRED',
        '至少保留一个可用登录入口'
      )
    case 'INTERNAL_IDENTITY_DATA_INVALID':
    case 'WRITE_CONFLICT':
      return null
  }
}

/** 由请求输入与确定公开结果构造同一唯一作用域的完成记录。 */
function buildCompletionInput(
  input: BindPlatformIdentityApplicationInput | RevokePlatformIdentityApplicationInput,
  response: HttpIdempotencyPublicResponseSnapshot
): HttpIdempotencyCompletionInput {
  const idempotency = input.idempotency
  return {
    principalType: idempotency.principalType,
    principalScopeHash: idempotency.principalScopeHash,
    httpMethod: idempotency.httpMethod,
    normalizedPath: idempotency.normalizedPath,
    operationId: idempotency.operationId,
    idempotencyKeyHash: idempotency.idempotencyKeyHash,
    requestHash: idempotency.requestHash,
    response,
    completedAtMs: input.occurredAtMs
  }
}

/** 只有共享 Repository 确认 completed 后才允许提交身份写事务。 */
async function completeDeterministicResult<TTransaction extends TransactionExecutionContext>(
  transaction: TTransaction,
  input: BindPlatformIdentityApplicationInput | RevokePlatformIdentityApplicationInput,
  response: HttpIdempotencyPublicResponseSnapshot,
  repository: MysqlHttpIdempotencyRepository<TTransaction>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const result = await repository.completionFirstResult(
    transaction,
    buildCompletionInput(input, response)
  )
  if (result.kind !== 'completed') {
    throw new PlatformIdentityBindingApplicationError('身份绑定结果与幂等完成记录未在同一事务确定')
  }
  return result.response
}

/** 处理首次占位之外的共享幂等决策，reserved 返回空以继续领域命令。 */
function mapIdempotencyDecision(
  decision: Awaited<
    ReturnType<MysqlHttpIdempotencyRepository<TransactionExecutionContext>['tryReserve']>
  >
): HttpIdempotencyPublicResponseSnapshot | null {
  if (decision.kind === 'reserved') {
    return null
  }
  if (decision.kind === 'replay') {
    return decision.response
  }
  if (decision.kind === 'conflict') {
    return publicErrorResponse(decision.httpStatus, decision.errorType, '幂等键已用于其他请求')
  }
  return publicErrorResponse(
    serviceUnavailableHttpStatusCode,
    'SERVICE_UNAVAILABLE',
    '请求仍在处理中，请稍后重试'
  )
}

/** COMMIT 结果未知时只读取首次幂等结果，绝不自动重跑身份命令。 */
async function reconcileUnknownCommit(
  input: BindPlatformIdentityApplicationInput | RevokePlatformIdentityApplicationInput,
  repository: HttpIdempotencyCommitUnknownReadOnlyRepository
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const idempotency = input.idempotency
  const result = await reconcileHttpIdempotencyCommitResult(repository, {
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
  if (result.kind === 'replay') {
    return result.response
  }
  return publicErrorResponse(
    serviceUnavailableHttpStatusCode,
    'SERVICE_UNAVAILABLE',
    '提交结果暂时无法确认，请使用相同幂等键重试'
  )
}

/** 创建“幂等占位 → 当前 HMAC 绑定/恢复 → 公开完成结果”的单事务服务。 */
export function createBindPlatformIdentityService<TTransaction extends TransactionExecutionContext>(
  dependencies: PlatformIdentityBindingApplicationDependencies<TTransaction>
): (input: BindPlatformIdentityApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async input => {
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const decision = await dependencies.idempotencyRepository.tryReserve(
          transaction,
          input.idempotency
        )
        const idempotencyResponse = mapIdempotencyDecision(decision)
        if (idempotencyResponse !== null) {
          return idempotencyResponse
        }
        try {
          const currentHashCandidate = input.verifiedIdentity.hashCandidates[Number('0')]
          if (currentHashCandidate === undefined) {
            throw new PlatformIdentityBindingApplicationError('缺少当前平台主体 HMAC 候选')
          }
          const result = await dependencies.bindingRepository.bindOrRestore(transaction, {
            userRef: input.principal.user_id,
            platform: input.verifiedIdentity.platform,
            appScope: input.verifiedIdentity.appScope,
            platformSubjectHash: currentHashCandidate.platformSubjectHash,
            subjectHashKeyVersion: currentHashCandidate.subjectHashKeyVersion,
            platformSubjectCiphertext: input.platformSubjectCiphertext,
            occurredAtMs: input.occurredAtMs
          })
          return await completeDeterministicResult(
            transaction,
            input,
            {
              status: successHttpStatusCode,
              body: {
                data: {
                  platform: result.platform,
                  appScope: result.appScope,
                  bindingStatus: 'active'
                }
              }
            },
            dependencies.idempotencyRepository
          )
        } catch (error: unknown) {
          const rejection = mapDeterministicRejection(error)
          if (rejection === null) {
            throw error
          }
          return await completeDeterministicResult(
            transaction,
            input,
            rejection,
            dependencies.idempotencyRepository
          )
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) {
        throw error
      }
      return await reconcileUnknownCommit(input, dependencies.commitUnknownReadOnlyRepository)
    }
  }
}

/** 创建“幂等占位 → 安全解绑与会话撤销 → 公开完成结果”的单事务服务。 */
export function createRevokePlatformIdentityService<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: PlatformIdentityBindingApplicationDependencies<TTransaction>
): (
  input: RevokePlatformIdentityApplicationInput
) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async input => {
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const decision = await dependencies.idempotencyRepository.tryReserve(
          transaction,
          input.idempotency
        )
        const idempotencyResponse = mapIdempotencyDecision(decision)
        if (idempotencyResponse !== null) {
          return idempotencyResponse
        }
        try {
          const result = await dependencies.bindingRepository.revoke(transaction, {
            userRef: input.principal.user_id,
            platform: input.platform,
            appScope: input.appScope,
            occurredAtMs: input.occurredAtMs
          })
          return await completeDeterministicResult(
            transaction,
            input,
            {
              status: successHttpStatusCode,
              body: {
                data: {
                  platform: result.platform,
                  appScope: result.appScope,
                  bindingStatus: 'revoked',
                  sessionVersion: result.nextSessionVersion
                }
              }
            },
            dependencies.idempotencyRepository
          )
        } catch (error: unknown) {
          const rejection = mapDeterministicRejection(error)
          if (rejection === null) {
            throw error
          }
          return await completeDeterministicResult(
            transaction,
            input,
            rejection,
            dependencies.idempotencyRepository
          )
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) {
        throw error
      }
      return await reconcileUnknownCommit(input, dependencies.commitUnknownReadOnlyRepository)
    }
  }
}
