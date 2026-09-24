import { describe, expect, test } from 'vitest'

import type {
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import type {
  DatabaseTransactionDriver,
  TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { UserPlantPersistenceError } from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import {
  createGetUserPlantApplicationService,
  type GetUserPlantRepository
} from '../../src/user-plant/application/get-user-plant.js'

const currentUser = 'usr_userplant_get_001' as UserRef
const anotherUser = 'usr_userplant_get_002' as UserRef
const currentPlant = 'upl_userplant_get_001' as UserPlantRef
const one = Number('1')
const successStatus = Number('200')
const notFoundStatus = Number('404')

/** 测试事务引用，用于确认应用查询只把认证主体交给 Repository。 */
type TestTransaction = TransactionExecutionContext & {
  /** 可观察的事务标记，非数据库连接。 */
  readonly testRef: string
}

/** 创建经过身份域解析的登录主体，不含任何平台主体标识。 */
function createPrincipal(userRef: UserRef = currentUser): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: one,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 只包含合同公开字段的未确认身份用户植物投影。 */
function createPlant(): UserPlantDto {
  return {
    user_plant_id: currentPlant,
    lifecycle: 'active',
    identityStatus: 'unidentified',
    version: one,
    createdAt: '2026-09-20T03:00:00.000Z',
    updatedAt: '2026-09-20T03:00:00.000Z'
  }
}

/** 构造事务驱动和最小 Repository 端口，记录实际应用调用顺序。 */
function createDependencies(readResult: UserPlantDto | Error): {
  readonly events: string[]
  readonly repository: GetUserPlantRepository<TestTransaction>
  readonly driver: DatabaseTransactionDriver<TestTransaction>
} {
  const events: string[] = []
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_get_user_plant' }
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    async beginTransaction() {
      events.push('begin')
      return transaction
    },
    async commitTransaction(receivedTransaction) {
      events.push(`commit:${receivedTransaction.testRef}`)
    },
    async rollbackTransaction(receivedTransaction) {
      events.push(`rollback:${receivedTransaction.testRef}`)
    },
    async recordRollbackFailure() {
      events.push('rollback-failure')
    }
  }
  const repository: GetUserPlantRepository<TestTransaction> = {
    async getOwnedUserPlant(receivedTransaction, userRef, userPlantRef) {
      events.push(`read:${receivedTransaction.testRef}:${userRef}:${userPlantRef}`)
      if (readResult instanceof Error) {
        throw readResult
      }
      return readResult
    }
  }
  return { events, repository, driver }
}

/**
 * Expected 来源：`contracts/user-plant.md` 与 `contracts/http-api.md`。
 * 测试层次：L3 / `unit_fake`；实际运行应用编排与事务运行器，替换 SQL Repository 和数据库驱动。
 * 风险覆盖：认证后的 user_id 必须与公开植物引用共同交给归属查询；不存在/越权统一脱敏。
 * 明确未覆盖：参数化 SQL、MySQL 所有权过滤、MySQL 8.4 持久化读回、HTTP 路由与 CloudBase。
 */
describe('读取单株用户植物应用服务', () => {
  test('成功时只返回 UserPlantDto，并以解析后的统一 user_id 做归属读取', async () => {
    const dependencies = createDependencies(createPlant())
    const service = createGetUserPlantApplicationService(dependencies)

    await expect(
      service({ principal: createPrincipal(), userPlantRef: currentPlant })
    ).resolves.toEqual({
      status: successStatus,
      body: { data: createPlant() }
    })
    expect(dependencies.events).toEqual([
      'begin',
      `read:tx_get_user_plant:${currentUser}:${currentPlant}`,
      'commit:tx_get_user_plant'
    ])
    expect(
      JSON.stringify(
        (
          await service({
            principal: createPrincipal(),
            userPlantRef: currentPlant
          })
        ).body
      )
    ).not.toContain('user_id')
  })

  test('不存在、越权、deleting 和 deleted 都返回同一个 404 错误合同', async () => {
    const dependencies = createDependencies(
      new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '用户植物不可见')
    )
    const service = createGetUserPlantApplicationService(dependencies)

    await expect(
      service({ principal: createPrincipal(anotherUser), userPlantRef: currentPlant })
    ).resolves.toEqual({
      status: notFoundStatus,
      body: {
        error: {
          type: 'USER_PLANT_NOT_FOUND',
          message: '用户植物不存在或不可访问'
        }
      }
    })
    expect(dependencies.events).toEqual([
      'begin',
      `read:tx_get_user_plant:${anotherUser}:${currentPlant}`,
      'commit:tx_get_user_plant'
    ])
  })

  test('内部数据错误不得误映射成对象不存在，并且失败时回滚只读事务', async () => {
    const persistenceError = new UserPlantPersistenceError(
      'INTERNAL_DATA_INVALID',
      '用户植物数据损坏'
    )
    const dependencies = createDependencies(persistenceError)
    const service = createGetUserPlantApplicationService(dependencies)

    await expect(
      service({ principal: createPrincipal(), userPlantRef: currentPlant })
    ).rejects.toBe(persistenceError)
    expect(dependencies.events).toEqual([
      'begin',
      `read:tx_get_user_plant:${currentUser}:${currentPlant}`,
      'rollback:tx_get_user_plant'
    ])
  })
})
