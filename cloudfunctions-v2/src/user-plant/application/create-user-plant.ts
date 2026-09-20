import type {
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserPrincipalDto
} from '../../contracts/types.js'
import {
  数据库提交结果未知错误,
  执行数据库事务,
  type 数据库事务驱动,
  type 事务执行上下文
} from '../../foundation/database/transaction-runner.js'
import {
  对账HTTP幂等提交结果,
  type HTTP幂等提交未知只读Repository
} from '../../foundation/idempotency/commit-unknown-reconciliation.js'
import type {
  HTTP幂等完成输入,
  HTTP幂等占位输入,
  MySQLHTTP幂等Repository
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { HTTP幂等公开响应快照 } from '../../foundation/idempotency/http-idempotency.js'
import {
  创建暂未识别用户植物,
  用户植物创建错误
} from '../domain/create-unidentified-user-plant.js'
import {
  用户植物持久化错误,
  type MySQL用户植物Repository
} from '../repository/mysql-user-plant-repository.js'

const 成功HTTP状态码 = Number('200')
const 身份无效HTTP状态码 = Number('401')
const 能力拒绝HTTP状态码 = Number('403')
const 冲突HTTP状态码 = Number('409')
const 服务不可用HTTP状态码 = Number('503')

/** 创建用户植物应用用例的完整受信输入。 */
export type 创建用户植物应用输入 = {
  /** identity 域已经解析并校验的登录用户主体。 */
  readonly principal: UserPrincipalDto
  /** subscription 域生成的请求级不可变能力快照。 */
  readonly capabilitySnapshot: UserCapabilitySnapshotDto
  /** 服务端生成的高熵用户植物公开引用。 */
  readonly newUserPlantRef: UserPlantRef
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** HTTP 适配器已规范化并哈希的幂等唯一作用域与请求摘要。 */
  readonly idempotency: HTTP幂等占位输入
}

/** 创建用户植物应用服务所需的显式端口。 */
export type 创建用户植物应用依赖<T事务 extends 事务执行上下文> = {
  /** Foundation 提供的事务生命周期驱动。 */
  readonly 驱动: 数据库事务驱动<T事务>
  /** Foundation 提供的共享 HTTP 幂等 Repository。 */
  readonly 幂等Repository: MySQLHTTP幂等Repository<T事务>
  /** user-plant 域拥有的聚合根 Repository。 */
  readonly 用户植物Repository: MySQL用户植物Repository<T事务>
  /** 提交结果未知后使用新连接、无锁读取已提交幂等记录的只读 Repository。 */
  readonly 提交未知只读Repository: HTTP幂等提交未知只读Repository
}

/** 应用编排违反同事务不变量时抛出的内部错误。 */
export class 创建用户植物应用错误 extends Error {
  constructor(message: string) {
    super(message)
    this.name = '创建用户植物应用错误'
  }
}

/** 生成稳定公开错误快照；消息必须已经脱敏并可直接展示。 */
function 公开错误响应(
  status: number,
  type: string,
  message: string
): HTTP幂等公开响应快照 {
  return { status, body: { error: { type, message } } }
}

/** 把领域或 Repository 的确定拒绝映射为可重放公开结果；内部故障返回 null。 */
function 映射确定拒绝(error: unknown): HTTP幂等公开响应快照 | null {
  if (error instanceof 用户植物创建错误) {
    switch (error.type) {
      case 'PRINCIPAL_INVALID':
        return 公开错误响应(身份无效HTTP状态码, error.type, '登录状态已失效')
      case 'CAPABILITY_DENIED':
        return 公开错误响应(能力拒绝HTTP状态码, error.type, error.message)
      case 'CAPABILITY_SNAPSHOT_EXPIRED':
        return 公开错误响应(冲突HTTP状态码, error.type, '能力快照已失效，请重新请求')
      case 'INTERNAL_INPUT_INVALID':
        return null
    }
  }
  if (error instanceof 用户植物持久化错误 && error.type === 'PRINCIPAL_INVALID') {
    return 公开错误响应(身份无效HTTP状态码, error.type, '登录状态已失效')
  }
  return null
}

/** 由占位输入构造同一唯一作用域的完成输入。 */
function 生成幂等完成输入(
  输入: 创建用户植物应用输入,
  response: HTTP幂等公开响应快照
): HTTP幂等完成输入 {
  const 幂等 = 输入.idempotency
  return {
    principalType: 幂等.principalType,
    principalScopeHash: 幂等.principalScopeHash,
    httpMethod: 幂等.httpMethod,
    normalizedPath: 幂等.normalizedPath,
    operationId: 幂等.operationId,
    idempotencyKeyHash: 幂等.idempotencyKeyHash,
    requestHash: 幂等.requestHash,
    response,
    completedAtMs: 输入.occurredAtMs
  }
}

/** 只有 Repository 确认 completed 才允许提交当前业务事务。 */
async function 完成确定结果<T事务 extends 事务执行上下文>(
  事务: T事务,
  输入: 创建用户植物应用输入,
  response: HTTP幂等公开响应快照,
  repository: MySQLHTTP幂等Repository<T事务>
): Promise<HTTP幂等公开响应快照> {
  const result = await repository.完成首次结果(事务, 生成幂等完成输入(输入, response))
  if (result.kind !== 'completed') {
    throw new 创建用户植物应用错误('领域结果与幂等完成记录未在同一事务确定')
  }
  return result.response
}

/**
 * 创建登录用户明确加入花园的应用服务。
 *
 * 首次请求的幂等占位、用户行锁、数量检查、领域决策、聚合写入、公开读回和幂等完成记录
 * 必须共享同一事务。确定业务拒绝也写为 completed 后提交；内部故障回滚全部写入。
 */
export function 创建用户植物应用服务<T事务 extends 事务执行上下文>(
  依赖: 创建用户植物应用依赖<T事务>
): (输入: 创建用户植物应用输入) => Promise<HTTP幂等公开响应快照> {
  return async (输入) => {
    try {
      return await 执行数据库事务(依赖.驱动, async (事务) => {
        const 幂等决策 = await 依赖.幂等Repository.尝试占位(事务, 输入.idempotency)
        if (幂等决策.kind === 'replay') {
          return 幂等决策.response
        }
        if (幂等决策.kind === 'conflict') {
          return 公开错误响应(
            幂等决策.httpStatus,
            幂等决策.errorType,
            '幂等键已用于其他请求'
          )
        }
        if (幂等决策.kind === 'wait_for_winner') {
          return 公开错误响应(
            服务不可用HTTP状态码,
            'SERVICE_UNAVAILABLE',
            '请求仍在处理中，请稍后重试'
          )
        }

        try {
          const 已锁定 = await 依赖.用户植物Repository.锁定用户并统计Active数量(
            事务,
            输入.principal.user_id
          )
          创建暂未识别用户植物({
            principal: 输入.principal,
            capabilitySnapshot: 输入.capabilitySnapshot,
            currentActiveCount: 已锁定.activeCount,
            newUserPlantRef: 输入.newUserPlantRef,
            occurredAtMs: 输入.occurredAtMs
          })
          await 依赖.用户植物Repository.插入暂未识别用户植物(事务, {
            userInternalId: 已锁定.userInternalId,
            userPlantRef: 输入.newUserPlantRef,
            occurredAtMs: 输入.occurredAtMs
          })
          const 创建投影 = await 依赖.用户植物Repository.读取创建初始投影(
            事务,
            输入.principal.user_id,
            输入.newUserPlantRef
          )
          return await 完成确定结果(
            事务,
            输入,
            { status: 成功HTTP状态码, body: { data: 创建投影 } },
            依赖.幂等Repository
          )
        } catch (error: unknown) {
          const 确定拒绝 = 映射确定拒绝(error)
          if (确定拒绝 === null) {
            throw error
          }
          return await 完成确定结果(事务, 输入, 确定拒绝, 依赖.幂等Repository)
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof 数据库提交结果未知错误)) {
        throw error
      }
      const 幂等 = 输入.idempotency
      const 对账结果 = await 对账HTTP幂等提交结果(依赖.提交未知只读Repository, {
        scope: {
          principalType: 幂等.principalType,
          principalScopeHash: 幂等.principalScopeHash,
          httpMethod: 幂等.httpMethod,
          normalizedPath: 幂等.normalizedPath,
          operationId: 幂等.operationId,
          idempotencyKeyHash: 幂等.idempotencyKeyHash
        },
        requestHash: 幂等.requestHash
      })
      if (对账结果.kind === 'replay') {
        return 对账结果.response
      }
      return 公开错误响应(
        服务不可用HTTP状态码,
        'SERVICE_UNAVAILABLE',
        '提交结果暂时无法确认，请使用相同幂等键重试'
      )
    }
  }
}
