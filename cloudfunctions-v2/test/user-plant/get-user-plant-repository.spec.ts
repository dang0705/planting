import { describe, expect, test } from 'vitest'

import type { UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  UserPlantPersistenceError,
  createMysqlUserPlantRepository,
  type MysqlUserPlantRepository,
  type UserPlantReadProjectionSqlRow,
  type UserPlantSqlExecutor,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'

const currentUser = 'usr_userplant_read_001' as UserRef
const currentPlant = 'upl_userplant_read_001' as UserPlantRef
const confirmedIdentity = 'pid_01J8Z3H4R57V4G2QPG6C5W8K9M'
const zero = Number('0')
const one = Number('1')

/** 仅供测试断言的 Repository 事务标记。 */
type TestTransaction = TransactionExecutionContext & {
  /** 确认查询沿用调用方事务，不生成额外连接上下文。 */
  readonly transactionRef: string
}

/** 建立合法未确认植物行，并允许单项构造损坏的持久化数据。 */
function unconfirmedRow(
  overrides: Partial<UserPlantReadProjectionSqlRow> = {}
): UserPlantReadProjectionSqlRow {
  return {
    kind: 'read-plant',
    public_user_plant_id: currentPlant,
    lifecycle_status: 'active',
    current_identity_status: 'unidentified',
    version: '2',
    created_at_ms: '1000',
    updated_at_ms: '2000',
    confirmed_identity_ref: null,
    ...overrides
  }
}

/** 记录 Repository 实际发出的 SQL、参数和事务引用。 */
function createExecutor(queryRows: readonly (readonly UserPlantSqlRow[])[]) {
  const remainingRows = [...queryRows]
  const calls: Array<{
    /** 所有权查询必须复用传入的数据库事务。 */
    readonly transactionRef: string
    /** 实际交给 SQL 驱动的查询语句。 */
    readonly sql: string
    /** SQL 占位符对应的值。 */
    readonly parameters: readonly unknown[]
  }> = []
  const executor: UserPlantSqlExecutor<TestTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      calls.push({ transactionRef: transaction.transactionRef, sql, parameters })
      return remainingRows.shift() ?? []
    },
    async executeWrite() {
      throw new Error('用户植物读取 Repository 不应写数据库')
    }
  }
  return { executor, calls }
}

/** 返回已实现的单株归属读取方法，保持测试调用全程有静态类型。 */
function resolveReadMethod(
  repository: MysqlUserPlantRepository<TestTransaction>
): MysqlUserPlantRepository<TestTransaction>['getOwnedUserPlant'] {
  return repository.getOwnedUserPlant
}

/**
 * Expected 来源：`contracts/user-plant.md`、`contracts/http-api.md` 与已冻结的用户植物 DDL。
 * 测试层次：L3 / `unit_fake`；真实运行 Repository 的 SQL 生成和行映射，替换 MySQL 驱动。
 * 风险覆盖：统一用户 + 植物公开引用归属、deleting/deleted 遮蔽、身份联合 DTO 与内部字段脱敏。
 * 明确未覆盖：MySQL 执行器、索引/隔离级别、持久化读回、真实 HTTP 与 CloudBase。
 */
describe('读取单株用户植物 MySQL Repository', () => {
  const transaction: TestTransaction = {
    transactionContext: true,
    transactionRef: 'tx_get_user_plant'
  }

  test('只有同一 user_id 且生命周期可公开读取的植物能返回脱敏 DTO', async () => {
    const { executor, calls } = createExecutor([[unconfirmedRow()]])
    const repository = createMysqlUserPlantRepository(executor)
    const getOwnedUserPlant = resolveReadMethod(repository)

    await expect(getOwnedUserPlant(transaction, currentUser, currentPlant)).resolves.toEqual({
      user_plant_id: currentPlant,
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: 2,
      createdAt: '1970-01-01T00:00:01.000Z',
      updatedAt: '1970-01-01T00:00:02.000Z'
    })
    expect(calls).toHaveLength(one)
    expect(calls[zero]?.transactionRef).toBe(transaction.transactionRef)
    expect(calls[zero]?.parameters).toEqual([currentUser, currentPlant])
    expect(calls[zero]?.sql).toContain('`u`.`public_user_id` = ?')
    expect(calls[zero]?.sql).toContain('`p`.`public_user_plant_id` = ?')
    expect(calls[zero]?.sql).toContain("`p`.`lifecycle_status` IN ('active', 'archived')")
    expect(JSON.stringify(calls[zero])).not.toContain('openid')
  })

  test('已确认身份只通过公开 pid 引用返回', async () => {
    const confirmed = {
      kind: 'read-plant',
      public_user_plant_id: currentPlant,
      lifecycle_status: 'archived',
      current_identity_status: 'confirmed',
      version: '3',
      created_at_ms: '1000',
      updated_at_ms: '3000',
      confirmed_identity_ref: confirmedIdentity
    } satisfies UserPlantReadProjectionSqlRow
    const { executor } = createExecutor([[confirmed]])
    const repository = createMysqlUserPlantRepository(executor)

    await expect(
      resolveReadMethod(repository)(transaction, currentUser, currentPlant)
    ).resolves.toEqual({
      user_plant_id: currentPlant,
      lifecycle: 'archived',
      identityStatus: 'confirmed',
      confirmedIdentityRef: confirmedIdentity,
      version: 3,
      createdAt: '1970-01-01T00:00:01.000Z',
      updatedAt: '1970-01-01T00:00:03.000Z'
    })
  })

  test('不存在或其他用户所属植物都按统一 USER_PLANT_NOT_FOUND 失败', async () => {
    const { executor } = createExecutor([[]])
    const repository = createMysqlUserPlantRepository(executor)

    await expect(
      resolveReadMethod(repository)(transaction, currentUser, currentPlant)
    ).rejects.toMatchObject({ type: 'USER_PLANT_NOT_FOUND' })
  })

  test('即使查询执行端错误返回 deleting 或 deleted 行也继续按不存在遮蔽', async () => {
    const { executor } = createExecutor([
      [unconfirmedRow({ lifecycle_status: 'deleting' })],
      [unconfirmedRow({ lifecycle_status: 'deleted' })]
    ])
    const repository = createMysqlUserPlantRepository(executor)
    const getOwnedUserPlant = resolveReadMethod(repository)

    await expect(getOwnedUserPlant(transaction, currentUser, currentPlant)).rejects.toMatchObject({
      type: 'USER_PLANT_NOT_FOUND'
    })
    await expect(getOwnedUserPlant(transaction, currentUser, currentPlant)).rejects.toMatchObject({
      type: 'USER_PLANT_NOT_FOUND'
    })
  })

  test('身份状态、身份引用、版本或时间损坏时失败关闭', async () => {
    const badRows = [
      unconfirmedRow({ current_identity_status: 'confirmed' }),
      unconfirmedRow({
        current_identity_status: 'unidentified',
        confirmed_identity_ref: confirmedIdentity
      }),
      unconfirmedRow({
        current_identity_status: 'confirmed',
        confirmed_identity_ref: 'not-a-public-ref'
      }),
      unconfirmedRow({ version: '0' }),
      unconfirmedRow({ created_at_ms: '9007199254740992' }),
      unconfirmedRow({ created_at_ms: '3000', updated_at_ms: '2000' })
    ]

    for (const row of badRows) {
      const { executor } = createExecutor([[row]])
      const repository = createMysqlUserPlantRepository(executor)
      await expect(
        resolveReadMethod(repository)(transaction, currentUser, currentPlant)
      ).rejects.toBeInstanceOf(UserPlantPersistenceError)
    }
  })
})
