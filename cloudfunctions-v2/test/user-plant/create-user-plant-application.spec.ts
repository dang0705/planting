import { describe, expect, test } from 'vitest'

import type {
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import { USER_PLANT_INITIAL_VERSION } from '../../src/contracts/types.js'
import {
  数据库提交结果未知错误,
  type 数据库事务驱动,
  type 事务执行上下文
} from '../../src/foundation/database/transaction-runner.js'
import type { HTTP幂等提交未知只读Repository } from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import type { HTTP幂等已存记录 } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  HTTP幂等完成输入,
  HTTP幂等占位输入,
  MySQLHTTP幂等Repository
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  创建用户植物应用服务,
  type 创建用户植物应用输入
} from '../../src/user-plant/application/create-user-plant.js'
import type { MySQL用户植物Repository } from '../../src/user-plant/repository/mysql-user-plant-repository.js'

const 当前用户 = 'usr_userplant_app_001' as UserRef
const 当前植物 = 'upl_userplant_app_001' as UserPlantRef
const 当前时间 = Date.parse('2026-09-20T04:00:00.000Z')
const 一 = Number('1')
/** 数组最后一项的标准负索引，避免测试散落魔法数字。 */
const LAST_ITEM_INDEX = Number('-1')

/** 测试事务携带可观察引用，用于证明所有依赖共享同一事务对象。 */
type 测试事务 = 事务执行上下文 & {
  /** 测试可观察事务引用。 */
  readonly testRef: string
}

/** 创建有效登录主体。 */
function 创建主体(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: 当前用户,
    sessionVersion: 一,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 创建允许一株 active 用户植物的有效能力快照。 */
function 创建能力快照(): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_userplant_app_001',
    subjectType: 'user',
    user_id: 当前用户,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: 一,
    generatedAt: '2026-09-20T03:59:00.000Z',
    validUntil: '2026-09-20T04:05:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1'
  }
}

/** 创建固定幂等唯一作用域与请求摘要。 */
function 创建幂等输入(): HTTP幂等占位输入 {
  return {
    principalType: 'user',
    principalScopeHash: 'a'.repeat(Number('64')),
    httpMethod: 'POST',
    normalizedPath: '/api/v2/user-plants',
    operationId: 'createUserPlant',
    idempotencyKeyHash: 'b'.repeat(Number('64')),
    requestHash: 'c'.repeat(Number('64')),
    expiresAtMs: 当前时间 + Number('604800000'),
    createdAtMs: 当前时间
  }
}

/** 创建应用服务一次调用所需的完整输入。 */
function 创建输入(): 创建用户植物应用输入 {
  return {
    principal: 创建主体(),
    capabilitySnapshot: 创建能力快照(),
    newUserPlantRef: 当前植物,
    occurredAtMs: 当前时间,
    idempotency: 创建幂等输入()
  }
}

/** 创建按调用顺序可观察、但不复制应用编排逻辑的依赖集合。 */
function 创建依赖(覆盖: {
  /** 幂等占位的预设决策。 */
  readonly reserveDecision?: Awaited<ReturnType<MySQLHTTP幂等Repository<测试事务>['尝试占位']>>
  /** 持有用户锁后读到的 active 数量。 */
  readonly activeCount?: number
  /** 用户植物插入时抛出的基础设施错误。 */
  readonly insertError?: Error
  /** 驱动在 COMMIT 后无法确认结果时抛出的显式错误。 */
  readonly commitError?: 数据库提交结果未知错误
  /** 新连接只读对账返回的已提交记录；null 表示仍无法证明提交结果。 */
  readonly reconciliationRecord?: HTTP幂等已存记录 | null
} = {}) {
  const 事件: string[] = []
  const 事务: 测试事务 = { transactionContext: true, testRef: 'tx_create_user_plant' }
  const 驱动: 数据库事务驱动<测试事务> = {
    async 开始事务() {
      事件.push('开始')
      return 事务
    },
    async 提交事务(收到事务) {
      事件.push(`提交:${收到事务.testRef}`)
      if (覆盖.commitError) {
        throw 覆盖.commitError
      }
    },
    async 回滚事务(收到事务) {
      事件.push(`回滚:${收到事务.testRef}`)
    },
    async 记录回滚失败() {
      事件.push('记录回滚失败')
    }
  }
  const 幂等Repository: MySQLHTTP幂等Repository<测试事务> = {
    async 读取() {
      throw new Error('本应用用例不直接调用读取')
    },
    async 尝试占位(收到事务) {
      事件.push(`幂等占位:${收到事务.testRef}`)
      return 覆盖.reserveDecision ?? { kind: 'reserved' }
    },
    async 完成首次结果(收到事务, 输入: HTTP幂等完成输入) {
      事件.push(`幂等完成:${收到事务.testRef}:${输入.response.status}`)
      return { kind: 'completed', response: 输入.response }
    }
  }
  const 用户植物Repository: MySQL用户植物Repository<测试事务> = {
    async 锁定用户并统计Active数量(收到事务) {
      事件.push(`用户锁与计数:${收到事务.testRef}`)
      return { userInternalId: '41', activeCount: 覆盖.activeCount ?? Number('0') }
    },
    async 插入暂未识别用户植物(收到事务) {
      事件.push(`插入植物:${收到事务.testRef}`)
      if (覆盖.insertError) {
        throw 覆盖.insertError
      }
    },
    async 读取创建初始投影(收到事务) {
      事件.push(`公开读回:${收到事务.testRef}`)
      return {
        user_plant_id: 当前植物,
        lifecycle: 'active',
        identityStatus: 'unidentified',
        version: USER_PLANT_INITIAL_VERSION,
        createdAt: '2026-09-20T04:00:00.000Z',
        updatedAt: '2026-09-20T04:00:00.000Z'
      }
    }
  }
  const 提交未知只读Repository: HTTP幂等提交未知只读Repository = {
    async 读取() {
      事件.push('新连接只读对账')
      return 覆盖.reconciliationRecord ?? null
    }
  }
  return { 事件, 驱动, 幂等Repository, 用户植物Repository, 提交未知只读Repository }
}

/**
 * Expected 来源：`user-plant/v1` 创建合同与 `http-api/v1` 幂等合同。
 * 测试层次：L3 / `unit_fake`；真实执行应用编排、领域函数和事务运行器，替换 SQL/驱动边界。
 * 明确未覆盖：真实 MySQL 行锁、并发、真实连接池销毁与网络故障、CloudBase 与 HTTP。
 */
describe('创建用户植物应用服务', () => {
  test('首次请求在同一事务依次完成占位、用户锁、领域决策、写入、读回和幂等完成', async () => {
    const 依赖 = 创建依赖()
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual({
      status: Number('200'),
      body: {
        data: {
          user_plant_id: 当前植物,
          lifecycle: 'active',
          identityStatus: 'unidentified',
          version: 一,
          createdAt: '2026-09-20T04:00:00.000Z',
          updatedAt: '2026-09-20T04:00:00.000Z'
        }
      }
    })
    expect(依赖.事件).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '插入植物:tx_create_user_plant',
      '公开读回:tx_create_user_plant',
      '幂等完成:tx_create_user_plant:200',
      '提交:tx_create_user_plant'
    ])
  })

  test('同键同参已完成时只重放，不执行用户植物领域和 Repository', async () => {
    const 首次响应 = { status: Number('200'), body: { data: { user_plant_id: 当前植物 } } }
    const 依赖 = 创建依赖({ reserveDecision: { kind: 'replay', response: 首次响应 } })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual(首次响应)
    expect(依赖.事件).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('同键异参返回稳定 409，且不锁用户或写用户植物', async () => {
    const 依赖 = 创建依赖({
      reserveDecision: {
        kind: 'conflict',
        errorType: 'IDEMPOTENCY_CONFLICT',
        httpStatus: Number('409')
      }
    })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual({
      status: Number('409'),
      body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '幂等键已用于其他请求' } }
    })
    expect(依赖.事件).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('同参请求仍处理中时返回临时 503，且不重复领域写入', async () => {
    const 依赖 = 创建依赖({ reserveDecision: { kind: 'wait_for_winner' } })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual({
      status: Number('503'),
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '请求仍在处理中，请稍后重试' } }
    })
    expect(依赖.事件).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('active 数量达到上限时把确定 403 写为 completed 并提交，后续可稳定重放', async () => {
    const 依赖 = 创建依赖({ activeCount: 一 })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual({
      status: Number('403'),
      body: { error: { type: 'CAPABILITY_DENIED', message: '当前可创建的用户植物数量已达上限' } }
    })
    expect(依赖.事件).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '幂等完成:tx_create_user_plant:403',
      '提交:tx_create_user_plant'
    ])
  })

  test('Repository 写入失败时回滚占位和业务写，不生成伪完成结果', async () => {
    const 写入错误 = new Error('insert failed')
    const 依赖 = 创建依赖({ insertError: 写入错误 })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).rejects.toBe(写入错误)
    expect(依赖.事件).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '插入植物:tx_create_user_plant',
      '回滚:tx_create_user_plant'
    ])
  })

  test('提交结果未知时只用新连接读回相同 completed 结果，且绝不重跑创建命令', async () => {
    const 首次响应 = {
      status: Number('200'),
      body: { data: { user_plant_id: 当前植物, lifecycle: 'active' } }
    }
    const 依赖 = 创建依赖({
      commitError: new 数据库提交结果未知错误('socket closed after COMMIT'),
      reconciliationRecord: {
        requestHash: 创建幂等输入().requestHash,
        state: 'completed',
        response: 首次响应
      }
    })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual(首次响应)
    expect(依赖.事件).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '插入植物:tx_create_user_plant',
      '公开读回:tx_create_user_plant',
      '幂等完成:tx_create_user_plant:200',
      '提交:tx_create_user_plant',
      '新连接只读对账'
    ])
  })

  test('提交结果未知且新连接不能证明 completed 时返回稳定 503，不重跑或回滚旧连接', async () => {
    const 依赖 = 创建依赖({
      commitError: new 数据库提交结果未知错误('socket closed after COMMIT'),
      reconciliationRecord: null
    })
    const 服务 = 创建用户植物应用服务(依赖)

    await expect(服务(创建输入())).resolves.toEqual({
      status: Number('503'),
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '提交结果暂时无法确认，请使用相同幂等键重试' } }
    })
    expect(依赖.事件.filter(item => item.startsWith('插入植物'))).toHaveLength(一)
    expect(依赖.事件).not.toContain('回滚:tx_create_user_plant')
    expect(依赖.事件.at(LAST_ITEM_INDEX)).toBe('新连接只读对账')
  })
})
