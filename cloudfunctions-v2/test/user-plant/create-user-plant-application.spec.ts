import { describe, expect, test } from 'vitest'

import type {
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import { USER_PLANT_INITIAL_VERSION } from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import type { HttpIdempotencyStoredRecord } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  HttpIdempotencyCompletionInput,
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  createUserPlantApplicationService,
  type CreateUserPlantApplicationInput
} from '../../src/user-plant/application/create-user-plant.js'
import type { MysqlUserPlantRepository } from '../../src/user-plant/repository/mysql-user-plant-repository.js'

const currentUser = 'usr_userplant_app_001' as UserRef
const currentPlant = 'upl_userplant_app_001' as UserPlantRef
const currentTime = Date.parse('2026-09-20T04:00:00.000Z')
const one = Number('1')
/** 数组最后一项的标准负索引，避免测试散落魔法数字。 */
const LAST_ITEM_INDEX = Number('-1')

/** 测试事务携带可观察引用，用于证明所有依赖共享同一事务对象。 */
type TestTransaction = TransactionExecutionContext & {
  /** 测试可观察事务引用。 */
  readonly testRef: string
}

/** 创建有效登录主体。 */
function createPrincipal(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: currentUser,
    sessionVersion: one,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 创建允许一株 active 用户植物的有效能力快照。 */
function createCapabilitySnapshot(): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_userplant_app_001',
    subjectType: 'user',
    user_id: currentUser,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: one,
    generatedAt: '2026-09-20T03:59:00.000Z',
    validUntil: '2026-09-20T04:05:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1'
  }
}

/** 创建固定幂等唯一作用域与请求摘要。 */
function createIdempotencyInput(): HttpIdempotencyReservationInput {
  return {
    principalType: 'user',
    principalScopeHash: 'a'.repeat(Number('64')),
    httpMethod: 'POST',
    normalizedPath: '/api/v2/user-plants',
    operationId: 'createUserPlant',
    idempotencyKeyHash: 'b'.repeat(Number('64')),
    requestHash: 'c'.repeat(Number('64')),
    expiresAtMs: currentTime + Number('604800000'),
    createdAtMs: currentTime
  }
}

/** 创建应用服务一次调用所需的完整输入。 */
function createInput(): CreateUserPlantApplicationInput {
  return {
    principal: createPrincipal(),
    capabilitySnapshot: createCapabilitySnapshot(),
    newUserPlantRef: currentPlant,
    occurredAtMs: currentTime,
    idempotency: createIdempotencyInput()
  }
}

/** 创建按调用顺序可观察、但不复制应用编排逻辑的依赖集合。 */
function createDependencies(overrides: {
  /** 幂等占位的预设决策。 */
  readonly reserveDecision?: Awaited<ReturnType<MysqlHttpIdempotencyRepository<TestTransaction>['tryReserve']>>
  /** 持有用户锁后读到的 active 数量。 */
  readonly activeCount?: number
  /** 用户植物插入时抛出的基础设施错误。 */
  readonly insertError?: Error
  /** 驱动在 COMMIT 后无法确认结果时抛出的显式错误。 */
  readonly commitError?: DatabaseCommitResultUnknownError
  /** 新连接只读对账返回的已提交记录；null 表示仍无法证明提交结果。 */
  readonly reconciliationRecord?: HttpIdempotencyStoredRecord | null
} = {}) {
  const event: string[] = []
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_create_user_plant' }
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    async beginTransaction() {
      event.push('开始')
      return transaction
    },
    async commitTransaction(receivedTransaction) {
      event.push(`提交:${receivedTransaction.testRef}`)
      if (overrides.commitError) {
        throw overrides.commitError
      }
    },
    async rollbackTransaction(receivedTransaction) {
      event.push(`回滚:${receivedTransaction.testRef}`)
    },
    async recordRollbackFailure() {
      event.push('记录回滚失败')
    }
  }
  const idempotencyRepository: MysqlHttpIdempotencyRepository<TestTransaction> = {
    async read() {
      throw new Error('本应用用例不直接调用读取')
    },
    async tryReserve(receivedTransaction) {
      event.push(`幂等占位:${receivedTransaction.testRef}`)
      return overrides.reserveDecision ?? { kind: 'reserved' }
    },
    async completionFirstResult(receivedTransaction, input: HttpIdempotencyCompletionInput) {
      event.push(`幂等完成:${receivedTransaction.testRef}:${input.response.status}`)
      return { kind: 'completed', response: input.response }
    }
  }
  const userPlantRepository: MysqlUserPlantRepository<TestTransaction> = {
    async lockUserAndCountActive(receivedTransaction) {
      event.push(`用户锁与计数:${receivedTransaction.testRef}`)
      return { userInternalId: '41', activeCount: overrides.activeCount ?? Number('0') }
    },
    async insertUnidentifiedUserPlant(receivedTransaction) {
      event.push(`插入植物:${receivedTransaction.testRef}`)
      if (overrides.insertError) {
        throw overrides.insertError
      }
    },
    async readCreateInitialProjection(receivedTransaction) {
      event.push(`公开读回:${receivedTransaction.testRef}`)
      return {
        user_plant_id: currentPlant,
        lifecycle: 'active',
        identityStatus: 'unidentified',
        version: USER_PLANT_INITIAL_VERSION,
        createdAt: '2026-09-20T04:00:00.000Z',
        updatedAt: '2026-09-20T04:00:00.000Z'
      }
    }
  }
  const commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository = {
    async read() {
      event.push('新连接只读对账')
      return overrides.reconciliationRecord ?? null
    }
  }
  return { event, driver, idempotencyRepository, userPlantRepository, commitUnknownReadOnlyRepository }
}

/**
 * Expected 来源：`user-plant/v1` 创建合同与 `http-api/v1` 幂等合同。
 * 测试层次：L3 / `unit_fake`；真实执行应用编排、领域函数和事务运行器，替换 SQL/驱动边界。
 * 明确未覆盖：真实 MySQL 行锁、并发、真实连接池销毁与网络故障、CloudBase 与 HTTP。
 */
describe('创建用户植物应用服务', () => {
  test('首次请求在同一事务依次完成占位、用户锁、领域决策、写入、读回和幂等完成', async () => {
    const dependencies = createDependencies()
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual({
      status: Number('200'),
      body: {
        data: {
          user_plant_id: currentPlant,
          lifecycle: 'active',
          identityStatus: 'unidentified',
          version: one,
          createdAt: '2026-09-20T04:00:00.000Z',
          updatedAt: '2026-09-20T04:00:00.000Z'
        }
      }
    })
    expect(dependencies.event).toEqual([
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
    const firstResponse = { status: Number('200'), body: { data: { user_plant_id: currentPlant } } }
    const dependencies = createDependencies({ reserveDecision: { kind: 'replay', response: firstResponse } })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual(firstResponse)
    expect(dependencies.event).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('同键异参返回稳定 409，且不锁用户或写用户植物', async () => {
    const dependencies = createDependencies({
      reserveDecision: {
        kind: 'conflict',
        errorType: 'IDEMPOTENCY_CONFLICT',
        httpStatus: Number('409')
      }
    })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual({
      status: Number('409'),
      body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '幂等键已用于其他请求' } }
    })
    expect(dependencies.event).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('同参请求仍处理中时返回临时 503，且不重复领域写入', async () => {
    const dependencies = createDependencies({ reserveDecision: { kind: 'wait_for_winner' } })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual({
      status: Number('503'),
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '请求仍在处理中，请稍后重试' } }
    })
    expect(dependencies.event).toEqual(['开始', '幂等占位:tx_create_user_plant', '提交:tx_create_user_plant'])
  })

  test('active 数量达到上限时把确定 403 写为 completed 并提交，后续可稳定重放', async () => {
    const dependencies = createDependencies({ activeCount: one })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual({
      status: Number('403'),
      body: { error: { type: 'CAPABILITY_DENIED', message: '当前可创建的用户植物数量已达上限' } }
    })
    expect(dependencies.event).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '幂等完成:tx_create_user_plant:403',
      '提交:tx_create_user_plant'
    ])
  })

  test('Repository 写入失败时回滚占位和业务写，不生成伪完成结果', async () => {
    const writeError = new Error('insert failed')
    const dependencies = createDependencies({ insertError: writeError })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).rejects.toBe(writeError)
    expect(dependencies.event).toEqual([
      '开始',
      '幂等占位:tx_create_user_plant',
      '用户锁与计数:tx_create_user_plant',
      '插入植物:tx_create_user_plant',
      '回滚:tx_create_user_plant'
    ])
  })

  test('提交结果未知时只用新连接读回相同 completed 结果，且绝不重跑创建命令', async () => {
    const firstResponse = {
      status: Number('200'),
      body: { data: { user_plant_id: currentPlant, lifecycle: 'active' } }
    }
    const dependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('socket closed after COMMIT'),
      reconciliationRecord: {
        requestHash: createIdempotencyInput().requestHash,
        state: 'completed',
        response: firstResponse
      }
    })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual(firstResponse)
    expect(dependencies.event).toEqual([
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
    const dependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('socket closed after COMMIT'),
      reconciliationRecord: null
    })
    const service = createUserPlantApplicationService(dependencies)

    await expect(service(createInput())).resolves.toEqual({
      status: Number('503'),
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '提交结果暂时无法确认，请使用相同幂等键重试' } }
    })
    expect(dependencies.event.filter(item => item.startsWith('插入植物'))).toHaveLength(one)
    expect(dependencies.event).not.toContain('回滚:tx_create_user_plant')
    expect(dependencies.event.at(LAST_ITEM_INDEX)).toBe('新连接只读对账')
  })
})
