import type {
  UserCapabilitySnapshotDto,
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
import {
  createUnidentifiedUserPlant,
  UserPlantCreateError
} from '../domain/create-unidentified-user-plant.js'
import {
  UserPlantPersistenceError,
  type MysqlUserPlantRepository
} from '../repository/mysql-user-plant-repository.js'

const successHTTPStatusCode = Number('200')
const invalidIdentityHTTPStatusCode = Number('401')
const capabilityDeniedHTTPStatusCode = Number('403')
const conflictHTTPStatusCode = Number('409')
const serviceUnavailableHTTPStatusCode = Number('503')

/** 创建用户植物应用用例的完整受信输入。 */
export type CreateUserPlantApplicationInput = {
  /** identity 域已经解析并校验的登录用户主体。 */
  readonly principal: UserPrincipalDto
  /** subscription 域生成的请求级不可变能力快照。 */
  readonly capabilitySnapshot: UserCapabilitySnapshotDto
  /** 服务端生成的高熵用户植物公开引用。 */
  readonly newUserPlantRef: UserPlantRef
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配器已规范化并哈希的幂等唯一作用域与请求摘要。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 创建用户植物应用服务所需的显式端口。 */
export type CreateUserPlantApplicationDependencies<TTransaction extends TransactionExecutionContext> = {
  /** Foundation 提供的事务生命周期驱动。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** Foundation 提供的共享 HTTP 幂等 Repository。 */
  readonly idempotencyRepository: MysqlHttpIdempotencyRepository<TTransaction>
  /** user-plant 域拥有的聚合根 Repository。 */
  readonly userPlantRepository: MysqlUserPlantRepository<TTransaction>
  /** 提交结果未知后使用新连接、无锁读取已提交幂等记录的只读 Repository。 */
  readonly commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository
}

/** 应用编排违反同事务不变量时抛出的内部错误。 */
export class CreateUserPlantApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '创建用户植物应用错误'
  }
}

/** 生成稳定公开错误快照；消息必须已经脱敏并可直接展示。 */
function publicErrorResponse(
  status: number,
  type: string,
  message: string
): HttpIdempotencyPublicResponseSnapshot {
  return { status, body: { error: { type, message } } }
}

/** 把领域或 Repository 的确定拒绝映射为可重放公开结果；内部故障返回 null。 */
function mapDeterministicRejection(error: unknown): HttpIdempotencyPublicResponseSnapshot | null {
  if (error instanceof UserPlantCreateError) {
    switch (error.type) {
      case 'PRINCIPAL_INVALID':
        return publicErrorResponse(invalidIdentityHTTPStatusCode, error.type, '登录状态已失效')
      case 'CAPABILITY_DENIED':
        return publicErrorResponse(capabilityDeniedHTTPStatusCode, error.type, error.message)
      case 'CAPABILITY_SNAPSHOT_EXPIRED':
        return publicErrorResponse(conflictHTTPStatusCode, error.type, '能力快照已失效，请重新请求')
      case 'INTERNAL_INPUT_INVALID':
        return null
    }
  }
  if (error instanceof UserPlantPersistenceError && error.type === 'PRINCIPAL_INVALID') {
    return publicErrorResponse(invalidIdentityHTTPStatusCode, error.type, '登录状态已失效')
  }
  return null
}

/** 由占位输入构造同一唯一作用域的完成输入。 */
function buildIdempotencyCompletionInput(
  input: CreateUserPlantApplicationInput,
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

/** 只有 Repository 确认 completed 才允许提交当前业务事务。 */
async function completeDeterministicResult<TTransaction extends TransactionExecutionContext>(
  transaction: TTransaction,
  input: CreateUserPlantApplicationInput,
  response: HttpIdempotencyPublicResponseSnapshot,
  repository: MysqlHttpIdempotencyRepository<TTransaction>
): Promise<HttpIdempotencyPublicResponseSnapshot> {
  const result = await repository.completionFirstResult(transaction, buildIdempotencyCompletionInput(input, response))
  if (result.kind !== 'completed') {
    throw new CreateUserPlantApplicationError('领域结果与幂等完成记录未在同一事务确定')
  }
  return result.response
}

/**
 * 创建登录用户明确加入花园的应用服务。
 *
 * 首次请求的幂等占位、用户行锁、数量检查、领域决策、聚合写入、公开读回和幂等完成记录
 * 必须共享同一事务。确定业务拒绝也写为 completed 后提交；内部故障回滚全部写入。
 */
export function createUserPlantApplicationService<TTransaction extends TransactionExecutionContext>(
  dependencies: CreateUserPlantApplicationDependencies<TTransaction>
): (input: CreateUserPlantApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return async (input) => {
    try {
      return await runDatabaseTransaction(dependencies.driver, async (transaction) => {
        const idempotencyDecision = await dependencies.idempotencyRepository.tryReserve(transaction, input.idempotency)
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

        try {
          const locked = await dependencies.userPlantRepository.lockUserAndCountActive(
            transaction,
            input.principal.user_id
          )
          createUnidentifiedUserPlant({
            principal: input.principal,
            capabilitySnapshot: input.capabilitySnapshot,
            currentActiveCount: locked.activeCount,
            newUserPlantRef: input.newUserPlantRef,
            occurredAtMs: input.occurredAtMs
          })
          await dependencies.userPlantRepository.insertUnidentifiedUserPlant(transaction, {
            userInternalId: locked.userInternalId,
            userPlantRef: input.newUserPlantRef,
            occurredAtMs: input.occurredAtMs
          })
          const createProjection = await dependencies.userPlantRepository.readCreateInitialProjection(
            transaction,
            input.principal.user_id,
            input.newUserPlantRef
          )
          return await completeDeterministicResult(
            transaction,
            input,
            { status: successHTTPStatusCode, body: { data: createProjection } },
            dependencies.idempotencyRepository
          )
        } catch (error: unknown) {
          const deterministicRejection = mapDeterministicRejection(error)
          if (deterministicRejection === null) {
            throw error
          }
          return await completeDeterministicResult(transaction, input, deterministicRejection, dependencies.idempotencyRepository)
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) {
        throw error
      }
      const idempotency = input.idempotency
      const reconcileResult = await reconcileHttpIdempotencyCommitResult(dependencies.commitUnknownReadOnlyRepository, {
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
