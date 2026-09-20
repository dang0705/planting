import { describe, expect, test } from 'vitest'

import type { UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  UserPlantPersistenceError,
  createMysqlUserPlantRepository,
  type UserPlantSqlExecutor,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'

const zero = Number('0')
const one = Number('1')
const currentUser = 'usr_userplant_repo_001' as UserRef
const currentPlant = 'upl_userplant_repo_001' as UserPlantRef

/** 测试事务只携带可观察引用，不暴露真实数据库连接。 */
type TestTransaction = TransactionExecutionContext & {
  /** 用于断言所有 SQL 都复用调用方传入的同一事务。 */
  readonly testRef: string
}

/** 创建可观察 SQL 顺序与参数、但不复制 Repository 决策的受控执行器。 */
function createTestExecutor(input: {
  /** 每次参数化查询依次返回的数据库行。 */
  readonly queryResult?: readonly (readonly UserPlantSqlRow[])[]
  /** 每次参数化写入依次返回的影响行数。 */
  readonly writeResult?: readonly number[]
}) {
  const sqlRecord: Array<{
    /** 本次调用是查询还是写入。 */
    readonly kind: 'query' | 'write'
    /** 事务可观察引用。 */
    readonly transactionRef: string
    /** Repository 生成的参数化 SQL。 */
    readonly sql: string
    /** 与占位符顺序一致的参数。 */
    readonly parameters: readonly unknown[]
  }> = []
  const queryResult = [...(input.queryResult ?? [])]
  const writeResult = [...(input.writeResult ?? [])]
  const executor: UserPlantSqlExecutor<TestTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      sqlRecord.push({ kind: 'query', transactionRef: transaction.testRef, sql, parameters })
      return queryResult.shift() ?? []
    },
    async executeWrite(transaction, sql, parameters) {
      sqlRecord.push({ kind: 'write', transactionRef: transaction.testRef, sql, parameters })
      return { affectedRows: writeResult.shift() ?? zero }
    }
  }
  return { executor, sqlRecord }
}

/**
 * Expected 来源：`user-plant/v1`、`001_identity.sql`、`003_user_plant.sql`。
 * 测试层次：L3 / `unit_fake`；真实执行 Repository 的 SQL 顺序、参数和行映射，数据库驱动被替换。
 * 明确未覆盖：MySQL 行锁、外键、并发、提交结果未知、CloudBase 网络与 HTTP。
 */
describe('用户植物 MySQL Repository', () => {
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_user_plant_create' }

  test('先锁定统一用户行再统计 active 植物，形成并发数量上限的串行化入口', async () => {
    const { executor, sqlRecord } = createTestExecutor({
      queryResult: [
        [{ kind: 'user', user_internal_id: '41', user_status: 'active' }],
        [{ kind: 'count', active_count: '2' }]
      ]
    })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(repository.lockUserAndCountActive(transaction, currentUser)).resolves.toEqual({
      userInternalId: '41',
      activeCount: 2
    })

    expect(sqlRecord.map((record) => record.kind)).toEqual(['query', 'query'])
    expect(sqlRecord[zero]?.sql).toContain('FROM `users`')
    expect(sqlRecord[zero]?.sql).toContain('FOR UPDATE')
    expect(sqlRecord[zero]?.parameters).toEqual([currentUser])
    expect(sqlRecord[one]?.sql).toContain('FROM `user_plants`')
    expect(sqlRecord[one]?.sql).toContain("`lifecycle_status` = 'active'")
    expect(sqlRecord[one]?.parameters).toEqual(['41'])
    expect(sqlRecord.every((record) => record.transactionRef === transaction.testRef)).toBe(true)
  })

  test('用户已暂停时在持有用户行锁后拒绝，不继续读取植物数量', async () => {
    const { executor, sqlRecord } = createTestExecutor({
      queryResult: [[{ kind: 'user', user_internal_id: '41', user_status: 'suspended' }]]
    })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(repository.lockUserAndCountActive(transaction, currentUser)).rejects.toMatchObject({
      type: 'PRINCIPAL_INVALID'
    })
    expect(sqlRecord).toHaveLength(one)
  })

  test('插入时只写内部归属、公开引用和固定初态', async () => {
    const { executor, sqlRecord } = createTestExecutor({ writeResult: [one] })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(
      repository.insertUnidentifiedUserPlant(transaction, {
        userInternalId: '41',
        userPlantRef: currentPlant,
        occurredAtMs: Number('1000')
      })
    ).resolves.toBeUndefined()

    expect(sqlRecord[zero]?.sql).toContain('INSERT INTO `user_plants`')
    expect(sqlRecord[zero]?.sql).toContain("'active'")
    expect(sqlRecord[zero]?.sql).toContain("'unidentified'")
    expect(sqlRecord[zero]?.parameters).toEqual([currentPlant, '41', Number('1000'), Number('1000')])
    expect(sqlRecord[zero]?.sql).not.toMatch(/openid|platform_subject|session_ref/iu)
  })

  test('插入没有恰好影响一行时失败关闭', async () => {
    const { executor } = createTestExecutor({ writeResult: [zero] })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(
      repository.insertUnidentifiedUserPlant(transaction, {
        userInternalId: '41',
        userPlantRef: currentPlant,
        occurredAtMs: Number('1000')
      })
    ).rejects.toBeInstanceOf(UserPlantPersistenceError)
  })

  test('按统一用户和植物公开引用读回脱敏创建投影', async () => {
    const { executor, sqlRecord } = createTestExecutor({
      queryResult: [
        [
          {
            kind: 'plant',
            public_user_plant_id: currentPlant,
            lifecycle_status: 'active',
            current_identity_status: 'unidentified',
            version: '1',
            created_at_ms: '1000',
            updated_at_ms: '1000'
          }
        ]
      ]
    })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(repository.readCreateInitialProjection(transaction, currentUser, currentPlant)).resolves.toEqual({
      user_plant_id: currentPlant,
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: 1,
      createdAt: '1970-01-01T00:00:01.000Z',
      updatedAt: '1970-01-01T00:00:01.000Z'
    })
    expect(sqlRecord[zero]?.sql).toContain('JOIN `users`')
    expect(sqlRecord[zero]?.parameters).toEqual([currentUser, currentPlant])
  })

  test('读回损坏版本或时间时失败关闭，不返回部分投影', async () => {
    const { executor } = createTestExecutor({
      queryResult: [
        [
          {
            kind: 'plant',
            public_user_plant_id: currentPlant,
            lifecycle_status: 'active',
            current_identity_status: 'unidentified',
            version: '0',
            created_at_ms: '1000',
            updated_at_ms: '999'
          }
        ]
      ]
    })
    const repository = createMysqlUserPlantRepository(executor)

    await expect(repository.readCreateInitialProjection(transaction, currentUser, currentPlant)).rejects.toMatchObject({
      type: 'INTERNAL_DATA_INVALID'
    })
  })
})
