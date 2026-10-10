import { describe, expect, test } from 'vitest'

import type { UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlUserPlantLifecycleRepository,
  type UserPlantLifecycleSqlExecutor,
  type UserPlantLifecycleSqlRow,
  type UserPlantLifecycleSqlWriteResult
} from '../../src/user-plant/repository/mysql-user-plant-lifecycle-repository.js'

const userRef = 'usr_lifecycle_owner_001' as UserRef
const plantRef = 'upl_lifecycle_plant_001' as UserPlantRef
const version = Number('9')
const occurredAtMs = Number('1790000000123')

/** 仅用于确认 Repository 所有调用共享同一事务引用。 */
type TestTransaction = TransactionExecutionContext & {
  /** 不包含数据库连接的测试标记。 */
  readonly testRef: string
}

/** 记录 SQL 与参数并返回指定结果的 Repository 执行端口假实现。 */
function createExecutor(
  options: {
    readonly rows?: readonly UserPlantLifecycleSqlRow[]
    readonly affectedRows?: number
  } = {}
) {
  const queries: {
    readonly transaction: TestTransaction
    readonly sql: string
    readonly parameters: readonly unknown[]
  }[] = []
  const writes: {
    readonly transaction: TestTransaction
    readonly sql: string
    readonly parameters: readonly unknown[]
  }[] = []
  const executor: UserPlantLifecycleSqlExecutor<TestTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      queries.push({ transaction: transaction, sql: sql, parameters: parameters })
      return (
        options.rows ?? [
          {
            kind: 'lifecycle-plant',
            lifecycle_status: 'active',
            version: String(version)
          }
        ]
      )
    },
    async executeWrite(transaction, sql, parameters): Promise<UserPlantLifecycleSqlWriteResult> {
      writes.push({ transaction: transaction, sql: sql, parameters: parameters })
      return { affectedRows: options.affectedRows ?? Number('1') }
    }
  }
  return { executor: executor, queries: queries, writes: writes }
}

/**
 * Expected 来源：冻结状态图只允许 active→archived 与 archived→active；user-plant/route registry
 * 要求按统一 user_id、公开引用和 expectedVersion 安全读写，主键不得进公开投影。
 * 测试层次：L3 / `unit_fake`；经过真实 SQL Repository 编排，替换参数化 SQL 执行端口。
 * 明确未覆盖：MySQL 方言执行、并发锁实际效果、持久化读回（由真实 MySQL E2E 覆盖）。
 */
describe('用户植物生命周期 MySQL Repository', () => {
  test('锁定查询按 user_id 与公开引用双重归属过滤，只返回 active/archived 状态与版本', async () => {
    const setup = createExecutor()
    const repository = createMysqlUserPlantLifecycleRepository(setup.executor)
    const transaction: TestTransaction = { transactionContext: true, testRef: 'lifecycle_tx' }

    await expect(repository.lockOwnedLifecycle(transaction, userRef, plantRef)).resolves.toEqual({
      lifecycle: 'active',
      version: version
    })
    expect(setup.queries).toHaveLength(Number('1'))
    const query = setup.queries[Number('0')]
    if (query === undefined) {
      throw new Error('Expected one lifecycle lock query')
    }
    expect(query).toMatchObject({
      transaction: transaction,
      parameters: [userRef, plantRef]
    })
    expect(query.sql).toContain('`u`.`public_user_id` = ?')
    expect(query.sql).toContain('`p`.`public_user_plant_id` = ?')
    expect(query.sql).toContain("`p`.`lifecycle_status` IN ('active', 'archived')")
    expect(query.sql).toContain('FOR UPDATE')
    expect(query.sql).not.toContain('`p`.`user_internal_id` AS')
    expect(query.sql).not.toContain('`u`.`id` AS')
  })

  test('CAS 同时限定 owner、植物公开引用、原状态与 expectedVersion，并递增版本', async () => {
    const setup = createExecutor({ affectedRows: Number('1') })
    const repository = createMysqlUserPlantLifecycleRepository(setup.executor)
    const transaction: TestTransaction = { transactionContext: true, testRef: 'lifecycle_tx' }

    await expect(
      repository.compareAndSwapLifecycle(transaction, {
        userRef: userRef,
        userPlantRef: plantRef,
        expectedLifecycle: 'active',
        expectedVersion: version,
        targetLifecycle: 'archived',
        occurredAtMs: occurredAtMs
      })
    ).resolves.toBe(true)
    // user-plant-timeline.md §5（2026-10-10）：CAS 成功后同一事务写一条 plant_archived / plant_restored 时间线投影。
    expect(setup.writes).toHaveLength(Number('2'))
    expect(setup.writes[Number('1')]!.sql).toContain('INSERT INTO `user_plant_timeline_projection`')
    expect(setup.writes[Number('1')]!.parameters).toContain('plant_archived')
    const write = setup.writes[Number('0')]
    if (write === undefined) {
      throw new Error('Expected one lifecycle CAS write')
    }
    expect(write).toMatchObject({
      transaction: transaction,
      parameters: ['archived', occurredAtMs, userRef, plantRef, 'active', version]
    })
    expect(write.sql).toContain('`p`.`version` = `p`.`version` + 1')
    expect(write.sql).toContain('`p`.`version` = ?')
    expect(write.sql).toContain('`u`.`public_user_id` = ?')
    expect(write.sql).toContain("`u`.`status` = 'active'")
  })

  test('CAS 影响零行时报告竞争失败，不盲目重复写入', async () => {
    const setup = createExecutor({ affectedRows: Number('0') })
    const repository = createMysqlUserPlantLifecycleRepository(setup.executor)
    const transaction: TestTransaction = { transactionContext: true, testRef: 'lifecycle_tx' }

    await expect(
      repository.compareAndSwapLifecycle(transaction, {
        userRef: userRef,
        userPlantRef: plantRef,
        expectedLifecycle: 'active',
        expectedVersion: version,
        targetLifecycle: 'archived',
        occurredAtMs: occurredAtMs
      })
    ).resolves.toBe(false)
    expect(setup.writes).toHaveLength(Number('1'))
  })

  test('损坏版本或非公开生命周期读回必须失败关闭', async () => {
    for (const row of [
      { kind: 'lifecycle-plant', lifecycle_status: 'deleting', version: String(version) },
      { kind: 'lifecycle-plant', lifecycle_status: 'active', version: '01' },
      { kind: 'lifecycle-plant', lifecycle_status: 'active', version: '9007199254740992' }
    ] as const) {
      const setup = createExecutor({ rows: [row as UserPlantLifecycleSqlRow] })
      const repository = createMysqlUserPlantLifecycleRepository(setup.executor)
      const transaction: TestTransaction = { transactionContext: true, testRef: 'lifecycle_tx' }

      await expect(repository.lockOwnedLifecycle(transaction, userRef, plantRef)).rejects.toThrow()
    }
  })
})
