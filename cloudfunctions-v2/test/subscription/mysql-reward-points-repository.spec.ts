import { describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlRewardPointsRepository,
  type RewardPointsSqlExecutor,
  type RewardPointsSqlRow
} from '../../src/subscription/repository/mysql-reward-points-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 证明每条 SQL 都复用调用方事务。 */
  readonly testRef: string
}

const zero = Number('0')
const one = Number('1')
const occurredAtMs = Number('1758376800000')
const expiresAtMs = Number('1766246400000')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_reward_points' }

/** 构造账户联合锁读回。 */
function accountRow(overrides: Partial<RewardPointsSqlRow> = {}): RewardPointsSqlRow {
  return {
    kind: 'account',
    user_internal_id: '41',
    user_status: 'active',
    point_account_internal_id: '51',
    available_points: '80',
    lifetime_net_earned: '80',
    level_code: 'L0',
    point_account_version: '3',
    ai_account_internal_id: '61',
    ai_available_amount: '200',
    ai_reserved_amount: '0',
    ai_consumed_amount: '0',
    ai_account_version: '4',
    ...overrides
  }
}

/** 构造可观察的参数化 SQL 执行端口。 */
function createExecutor(queryResults: readonly (readonly RewardPointsSqlRow[])[]) {
  const calls: Array<{
    /** SQL 操作类别。 */
    readonly kind: 'query' | 'write'
    /** 参数化 SQL 文本。 */
    readonly sql: string
    /** 参数化值快照。 */
    readonly parameters: readonly unknown[]
    /** 当前事务引用。 */
    readonly transactionRef: string
  }> = []
  let queryIndex = zero
  const executor: RewardPointsSqlExecutor<TestTransaction> = {
    executeQuery: async (current, sql, parameters) => {
      calls.push({ kind: 'query', sql, parameters, transactionRef: current.testRef })
      const rows = queryResults[queryIndex] ?? []
      queryIndex += one
      return rows
    },
    executeWrite: async (current, sql, parameters) => {
      calls.push({ kind: 'write', sql, parameters, transactionRef: current.testRef })
      return { affectedRows: one }
    }
  }
  return { executor, calls }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的不可变积分账本、账户投影、累计等级和每级终身一次 AI 奖励。
 * 测试层次：L2 / `unit_fake`；替换参数化 MySQL 驱动，执行真实 Repository 编排。
 * 明确未覆盖：真实 MySQL 约束/并发、inbox 状态、策略解析、HTTP 与 CloudBase。
 */
describe('奖励积分 MySQL Repository', () => {
  test('先锁积分与 AI 账户，再锁已发等级并返回完整领域快照', async () => {
    const { executor, calls } = createExecutor([
      [accountRow()],
      [
        { kind: 'level', level_code: 'L1' },
        { kind: 'level', level_code: 'L2' }
      ]
    ])
    const repository = createMysqlRewardPointsRepository(executor)

    await expect(
      repository.lockState(transaction, 'usr_reward_points_0001' as UserRef)
    ).resolves.toEqual({
      userInternalId: '41',
      pointAccountInternalId: '51',
      pointAccountVersion: 3,
      availablePoints: 80,
      lifetimeNetEarned: 80,
      currentLevelCode: 'L0',
      aiAccountInternalId: '61',
      aiAccountVersion: 4,
      aiAvailableAmount: 200,
      previouslyGrantedLevelCodes: ['L1', 'L2']
    })
    expect(calls.map(call => call.sql.includes('FOR UPDATE'))).toEqual([true, true])
    expect(calls.every(call => call.transactionRef === transaction.testRef)).toBe(true)
  })

  test('积分与跨级 AI 奖励按不可变事实顺序写入并最后更新两个账户投影', async () => {
    const { executor, calls } = createExecutor([])
    const repository = createMysqlRewardPointsRepository(executor)

    await repository.apply(transaction, {
      userInternalId: '41',
      pointAccountInternalId: '51',
      pointAccountVersion: 3,
      aiAccountInternalId: '61',
      aiAccountVersion: 4,
      pointLedgerRef: 'cpl_reward_points_0001',
      sourceType: 'DUE_SOIL_CHECK',
      sourceRef: 'soil_check_occurrence_0001',
      businessUniqueKey: 'soil-check:soil_check_occurrence_0001',
      pointsAmount: 250,
      currentAvailablePoints: 80,
      currentLifetimeNetEarned: 80,
      nextAvailablePoints: 330,
      nextLifetimeNetEarned: 330,
      nextLevelCode: 'L2',
      policyVersion: 'care-points/2026-09-20.1',
      occurredAtMs,
      levelRewards: [
        {
          levelCode: 'L1',
          amount: 50,
          levelGrantRef: 'clg_reward_level_0001',
          aiGrantRef: 'aqg_reward_level_0001',
          aiLedgerRef: 'aql_reward_level_0001',
          expiresAtMs
        },
        {
          levelCode: 'L2',
          amount: 100,
          levelGrantRef: 'clg_reward_level_0002',
          aiGrantRef: 'aqg_reward_level_0002',
          aiLedgerRef: 'aql_reward_level_0002',
          expiresAtMs
        }
      ]
    })

    const writes = calls.filter(call => call.kind === 'write')
    expect(writes[zero]?.sql).toContain('INSERT INTO `care_point_ledger`')
    expect(writes[one]?.sql).toContain('UPDATE `care_point_accounts`')
    expect(writes.filter(call => call.sql.includes('INSERT INTO `ai_quota_grants`'))).toHaveLength(
      2
    )
    expect(writes.filter(call => call.sql.includes('INSERT INTO `ai_quota_ledger`'))).toHaveLength(
      2
    )
    expect(
      writes.filter(call => call.sql.includes('INSERT INTO `care_level_grants`'))
    ).toHaveLength(2)
    expect(writes.at(-one)?.sql).toContain('UPDATE `ai_quota_accounts`')
    expect(writes.at(-one)?.parameters.slice(zero, Number('2'))).toEqual([
      150,
      'aql_reward_level_0002'
    ])
    expect(calls.every(call => call.transactionRef === transaction.testRef)).toBe(true)
  })

  test('账户缺失或积分终态不守恒时失败关闭且不写 SQL', async () => {
    const missing = createExecutor([[]])
    await expect(
      createMysqlRewardPointsRepository(missing.executor).lockState(
        transaction,
        'usr_reward_points_0001' as UserRef
      )
    ).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    expect(missing.calls.filter(call => call.kind === 'write')).toEqual([])

    const invalid = createExecutor([])
    await expect(
      createMysqlRewardPointsRepository(invalid.executor).apply(transaction, {
        userInternalId: '41',
        pointAccountInternalId: '51',
        pointAccountVersion: 3,
        aiAccountInternalId: '61',
        aiAccountVersion: 4,
        pointLedgerRef: 'cpl_reward_points_0001',
        sourceType: 'DUE_SOIL_CHECK',
        sourceRef: 'soil_check_occurrence_0001',
        businessUniqueKey: 'soil-check:soil_check_occurrence_0001',
        pointsAmount: 5,
        currentAvailablePoints: 80,
        currentLifetimeNetEarned: 80,
        nextAvailablePoints: 999,
        nextLifetimeNetEarned: 85,
        nextLevelCode: 'L0',
        policyVersion: 'care-points/2026-09-20.1',
        occurredAtMs,
        levelRewards: []
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
    expect(invalid.calls).toEqual([])
  })
})
