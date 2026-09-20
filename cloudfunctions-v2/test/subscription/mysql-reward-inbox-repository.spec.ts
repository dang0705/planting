import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import type { EventRef, UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlRewardInboxRepository,
  type RewardInboxPrincipalSqlRow,
  type RewardInboxSqlExecutor,
  type RewardInboxSqlRow
} from '../../src/subscription/repository/mysql-reward-inbox-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 证明所有 SQL 复用调用方事务。 */
  readonly testRef: string
}

const zero = Number('0')
const one = Number('1')
const occurredAtMs = Number('1758369600000')
const receivedAtMs = Number('1758369601000')
const payloadJson = '{"decision":"defer_watering"}'
const payloadHash = createHash('sha256').update(payloadJson).digest('hex')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_reward_inbox' }

/** 构造已由服务签名、事件 Schema 和奖励策略解析器验证的收件输入。 */
function createInput() {
  return {
    eventId: 'evt_reward_inbox_0001' as EventRef,
    eventType: 'care.soil_check_completed.v1' as const,
    eventVersion: 1 as const,
    producerDomain: 'care' as const,
    userRef: 'usr_reward_inbox_0001' as UserRef,
    userPlantRef: 'upl_reward_inbox_0001' as UserPlantRef,
    aggregateRef: 'care_plan_reward_0001',
    occurrenceRef: 'soil_check_occurrence_0001',
    businessUniqueKey: 'soil-check:soil_check_occurrence_0001',
    payloadJson,
    payloadHash,
    producerPolicyVersion: 'care-soil-check/2026-09-20.1',
    rewardPolicyVersion: 'care-points/2026-09-20.1',
    rewardPolicyContentSha256: 'b'.repeat(Number('64')),
    occurredAtMs,
    receivedAtMs
  }
}

/** 构造可观察的参数化 SQL 执行端口。 */
function createExecutor(options: {
  /** 活跃用户锁查询的受控行。 */
  readonly principalRows?: readonly RewardInboxPrincipalSqlRow[]
  /** 每次查询按调用顺序返回的受控行。 */
  readonly queryResults: readonly (readonly RewardInboxSqlRow[])[]
  /** 未启用 CLIENT_FOUND_ROWS 时，INSERT ... ON DUPLICATE KEY UPDATE 的影响行数。 */
  readonly affectedRows: number
}) {
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
  const executor: RewardInboxSqlExecutor<TestTransaction> = {
    executePrincipalQuery: async (current, sql, parameters) => {
      calls.push({ kind: 'query', sql, parameters, transactionRef: current.testRef })
      return options.principalRows ?? [{ user_internal_id: '17' }]
    },
    executeQuery: async (current, sql, parameters) => {
      calls.push({ kind: 'query', sql, parameters, transactionRef: current.testRef })
      const rows = options.queryResults[queryIndex] ?? []
      queryIndex += one
      return rows
    },
    executeWrite: async (current, sql, parameters) => {
      calls.push({ kind: 'write', sql, parameters, transactionRef: current.testRef })
      return { affectedRows: options.affectedRows }
    }
  }
  return { executor, calls }
}

/** 构造数据库收件行。 */
function inboxRow(overrides: Partial<RewardInboxSqlRow> = {}): RewardInboxSqlRow {
  return {
    inbox_internal_id: '91',
    event_id: 'evt_reward_inbox_0001',
    event_type: 'care.soil_check_completed.v1',
    event_version: '1',
    producer_domain: 'care',
    user_ref: 'usr_reward_inbox_0001',
    user_plant_ref: 'upl_reward_inbox_0001',
    aggregate_ref: 'care_plan_reward_0001',
    occurrence_ref: 'soil_check_occurrence_0001',
    business_unique_key: 'soil-check:soil_check_occurrence_0001',
    payload_hash: payloadHash,
    producer_policy_version: 'care-soil-check/2026-09-20.1',
    reward_policy_version: 'care-points/2026-09-20.1',
    reward_policy_content_sha256: 'b'.repeat(Number('64')),
    occurred_at_ms: String(occurredAtMs),
    status: 'received',
    result_ref: null,
    rejection_code: null,
    ...overrides
  }
}

/**
 * Expected 来源：`reward-events/v1` 的 eventId/payload 防篡改、业务唯一键去重和首次策略快照规则。
 * 测试层次：L2 / `unit_fake`；替换参数化 MySQL 驱动，真实执行 Repository 的 SQL 编排与行校验。
 * 明确未覆盖：真实 MySQL 唯一键等待、积分账本、等级奖励、dispatcher、HTTP 与 CloudBase。
 */
describe('奖励事件 inbox MySQL Repository', () => {
  test('首次事件以 received 状态保存完整事实与独立奖励策略快照', async () => {
    const { executor, calls } = createExecutor({
      affectedRows: one,
      queryResults: [[], [inboxRow()]]
    })
    const repository = createMysqlRewardInboxRepository(executor)

    await expect(repository.reserve(transaction, createInput())).resolves.toEqual({
      kind: 'reserved',
      inboxInternalId: '91'
    })
    expect(calls[zero]?.sql).toContain('FROM `users`')
    expect(calls[zero]?.sql).toContain('FOR UPDATE')
    expect(calls[one]?.sql).toContain('subscription_reward_inbox')
    expect(calls[one]?.sql).toContain('FOR UPDATE')
    expect(calls[Number('2')]?.sql).toContain('INSERT INTO `subscription_reward_inbox`')
    expect(calls[Number('2')]?.sql).toContain('ON DUPLICATE KEY UPDATE')
    expect(calls[Number('2')]?.sql).toContain('`producer_policy_version`')
    expect(calls[Number('2')]?.sql).toContain('`reward_policy_version`')
    expect(calls[Number('2')]?.sql).toContain('`reward_policy_content_sha256`')
    expect(calls[Number('3')]?.sql).toContain('FOR UPDATE')
    expect(calls.every(call => call.transactionRef === transaction.testRef)).toBe(true)
  })

  test('相同事件与快照安全重放，载荷或策略被改写则冲突', async () => {
    const replay = createExecutor({
      affectedRows: zero,
      queryResults: [[inboxRow({ status: 'applied', result_ref: 'cpl_reward_0001' })]]
    })
    const repository = createMysqlRewardInboxRepository(replay.executor)
    await expect(repository.reserve(transaction, createInput())).resolves.toEqual({
      kind: 'replayed',
      status: 'applied',
      resultRef: 'cpl_reward_0001',
      rejectionCode: null
    })

    const tampered = createExecutor({
      affectedRows: zero,
      queryResults: [[inboxRow({ payload_hash: 'c'.repeat(Number('64')) })]]
    })
    await expect(
      createMysqlRewardInboxRepository(tampered.executor).reserve(transaction, createInput())
    ).rejects.toMatchObject({ type: 'IDEMPOTENCY_CONFLICT' })
  })

  test('不同事件 ID 命中同一业务事实时确认重复但不再次入账', async () => {
    const { executor } = createExecutor({
      affectedRows: zero,
      queryResults: [
        [
          inboxRow({
            event_id: 'evt_reward_inbox_existing',
            status: 'applied',
            result_ref: 'cpl_reward_existing'
          })
        ]
      ]
    })
    const repository = createMysqlRewardInboxRepository(executor)

    await expect(repository.reserve(transaction, createInput())).resolves.toEqual({
      kind: 'duplicate_business',
      status: 'applied',
      resultRef: 'cpl_reward_existing'
    })
  })

  test('载荷摘要与规范化载荷不一致时在执行 SQL 前拒绝', async () => {
    const { executor, calls } = createExecutor({ affectedRows: zero, queryResults: [] })
    const repository = createMysqlRewardInboxRepository(executor)

    await expect(
      repository.reserve(transaction, {
        ...createInput(),
        payloadHash: 'a'.repeat(Number('64'))
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
    expect(calls).toEqual([])
  })

  test('应用结果只能把 received 原子推进为 applied 并保存公开结果引用', async () => {
    const { executor, calls } = createExecutor({ affectedRows: one, queryResults: [] })
    const repository = createMysqlRewardInboxRepository(executor)

    await expect(
      repository.markApplied(transaction, '91', 'cpl_reward_0001', receivedAtMs)
    ).resolves.toBeUndefined()
    expect(calls).toHaveLength(one)
    expect(calls[zero]?.sql).toContain("SET `status` = 'applied'")
    expect(calls[zero]?.sql).toContain("AND `status` = 'received'")
    expect(calls[zero]?.parameters).toEqual(['cpl_reward_0001', receivedAtMs, receivedAtMs, '91'])
  })
})
