import { describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  AiQuotaReservationPersistenceError,
  createMysqlAiQuotaReservationRepository,
  type AiQuotaReservationSqlExecutor,
  type AiQuotaReservationSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'

const zero = Number('0')
const one = Number('1')
const nowMs = Number('1758376800000')
const currentUser = 'usr_subscription_repo_001' as UserRef

/** 测试事务只提供可观察引用，确保全部 SQL 复用调用方事务。 */
type TestTransaction = TransactionExecutionContext & {
  /** 用于断言 SQL 没有逃离当前事务。 */
  readonly testRef: string
}

/** 创建记录参数化 SQL 顺序的受控执行器，不复制 Repository 业务判断。 */
function createTestExecutor(input: {
  /** 每次查询依次返回的受控行。 */
  readonly queryResult?: readonly (readonly AiQuotaReservationSqlRow[])[]
  /** 每次写入依次返回的影响行数。 */
  readonly writeResult?: readonly number[]
}) {
  const sqlRecord: Array<{
    /** SQL 调用类别。 */
    readonly kind: 'query' | 'write'
    /** 调用方事务引用。 */
    readonly transactionRef: string
    /** Repository 生成的参数化 SQL。 */
    readonly sql: string
    /** 与占位符顺序一致的参数。 */
    readonly parameters: readonly unknown[]
  }> = []
  const queryResult = [...(input.queryResult ?? [])]
  const writeResult = [...(input.writeResult ?? [])]
  const executor: AiQuotaReservationSqlExecutor<TestTransaction> = {
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
 * Expected 来源：`care-points-ai-quota/v1`、`001_identity.sql`、`005_subscription.sql`。
 * 测试层次：L3 / `unit_fake`；真实执行 Repository 的 SQL 顺序、参数与行映射，数据库驱动被替换。
 * 明确未覆盖：真实 MySQL 行锁、并发、事务提交/回滚、应用幂等、CloudBase 与 HTTP。
 */
describe('AI 额度预占 MySQL Repository', () => {
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_ai_quota_reserve' }

  test('先锁额度账户再按固定顺序锁定当前能力可用的额度批次', async () => {
    const { executor, sqlRecord } = createTestExecutor({
      queryResult: [
        [
          {
            kind: 'account',
            account_internal_id: '71',
            user_internal_id: '41',
            user_status: 'active',
            available_amount: '12',
            reserved_amount: '0',
            account_version: '3'
          }
        ],
        [
          {
            kind: 'grant',
            grant_internal_id: '81',
            grant_ref: 'aqg_subscription_a',
            granted_amount: '5',
            available_amount: '5',
            reserved_amount: '0',
            consumed_amount: '0',
            grant_status: 'active',
            grant_version: '2',
            granted_at_ms: String(nowMs - Number('2000')),
            expires_at_ms: String(nowMs + Number('1000')),
            capability_scope_json: '["USER_AGENT_TEXT"]'
          },
          {
            kind: 'grant',
            grant_internal_id: '82',
            grant_ref: 'aqg_subscription_b',
            granted_amount: '7',
            available_amount: '7',
            reserved_amount: '0',
            consumed_amount: '0',
            grant_status: 'active',
            grant_version: '4',
            granted_at_ms: String(nowMs - Number('1000')),
            expires_at_ms: String(nowMs + Number('2000')),
            capability_scope_json: ['USER_AGENT_TEXT', 'USER_DIAGNOSIS_TEXT']
          }
        ]
      ]
    })
    const repository = createMysqlAiQuotaReservationRepository(executor)

    const lockedAccount = await repository.lockAccount(transaction, currentUser)
    expect(lockedAccount).toEqual({
      accountInternalId: '71',
      accountVersion: 3,
      userInternalId: '41',
      availableAmount: 12,
      reservedAmount: 0
    })
    await expect(
      repository.readEligibleGrants(transaction, {
        userInternalId: lockedAccount.userInternalId,
        capability: 'USER_AGENT_TEXT',
        occurredAtMs: nowMs
      })
    ).resolves.toEqual([
      {
        grantInternalId: '81',
        grantRef: 'aqg_subscription_a',
        grantVersion: 2,
        availableAmount: 5,
        grantedAtMs: nowMs - Number('2000'),
        expiresAtMs: nowMs + Number('1000'),
        capabilityScope: ['USER_AGENT_TEXT']
      },
      {
        grantInternalId: '82',
        grantRef: 'aqg_subscription_b',
        grantVersion: 4,
        availableAmount: 7,
        grantedAtMs: nowMs - Number('1000'),
        expiresAtMs: nowMs + Number('2000'),
        capabilityScope: ['USER_AGENT_TEXT', 'USER_DIAGNOSIS_TEXT']
      }
    ])

    expect(sqlRecord).toHaveLength(Number('2'))
    expect(sqlRecord[zero]?.sql).toContain('FROM `ai_quota_accounts`')
    expect(sqlRecord[zero]?.sql).toContain('JOIN `users`')
    expect(sqlRecord[zero]?.sql).toContain('FOR UPDATE')
    expect(sqlRecord[zero]?.parameters).toEqual([currentUser])
    expect(sqlRecord[one]?.sql).toContain('FROM `ai_quota_grants`')
    expect(sqlRecord[one]?.sql).toContain('JSON_CONTAINS')
    expect(sqlRecord[one]?.sql).toContain('ORDER BY `expires_at_ms`, `granted_at_ms`, `grant_ref`')
    expect(sqlRecord[one]?.sql).toContain('FOR UPDATE')
    expect(sqlRecord[one]?.parameters).toEqual(['41', nowMs, nowMs, 'USER_AGENT_TEXT'])
    expect(sqlRecord.every(record => record.transactionRef === transaction.testRef)).toBe(true)
  })

  test('失效主体或损坏的额度行失败关闭', async () => {
    const suspended = createTestExecutor({
      queryResult: [
        [
          {
            kind: 'account',
            account_internal_id: '71',
            user_internal_id: '41',
            user_status: 'suspended',
            available_amount: '0',
            reserved_amount: '0',
            account_version: '1'
          }
        ]
      ]
    })
    await expect(
      createMysqlAiQuotaReservationRepository(suspended.executor).lockAccount(
        transaction,
        currentUser
      )
    ).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    expect(suspended.sqlRecord).toHaveLength(one)

    const corrupted = createTestExecutor({
      queryResult: [
        [
          {
            kind: 'account',
            account_internal_id: '71',
            user_internal_id: '41',
            user_status: 'active',
            available_amount: '1',
            reserved_amount: '0',
            account_version: '1'
          }
        ],
        [
          {
            kind: 'grant',
            grant_internal_id: '81',
            grant_ref: 'aqg_subscription_corrupted',
            granted_amount: '1',
            available_amount: '-1',
            reserved_amount: '0',
            consumed_amount: '0',
            grant_status: 'active',
            grant_version: '1',
            granted_at_ms: String(nowMs - Number('1000')),
            expires_at_ms: String(nowMs + Number('1000')),
            capability_scope_json: '["USER_AGENT_TEXT"]'
          }
        ]
      ]
    })
    const corruptedRepository = createMysqlAiQuotaReservationRepository(corrupted.executor)
    const corruptedAccount = await corruptedRepository.lockAccount(transaction, currentUser)
    await expect(
      corruptedRepository.readEligibleGrants(transaction, {
        userInternalId: corruptedAccount.userInternalId,
        capability: 'USER_AGENT_TEXT',
        occurredAtMs: nowMs
      })
    ).rejects.toBeInstanceOf(AiQuotaReservationPersistenceError)
  })

  test('同一幂等作用域同摘要返回原预占，异摘要稳定冲突且不读取 grants', async () => {
    const reservationRow: AiQuotaReservationSqlRow = {
      kind: 'reservation',
      reservation_ref: 'aqr_subscription_existing',
      request_hash: 'a'.repeat(Number('64')),
      status: 'reserved',
      estimated_amount: '8',
      capability: 'USER_AGENT_TEXT',
      cost_policy_version: 'ai-cost/2026-09-20.1',
      expires_at_ms: String(nowMs + Number('60000'))
    }
    const replayExecutor = createTestExecutor({ queryResult: [[reservationRow]] })
    await expect(
      createMysqlAiQuotaReservationRepository(replayExecutor.executor).readExistingReservation(
        transaction,
        {
          userInternalId: '41',
          productActionId: 'action_subscription_001',
          idempotencyKey: 'idem_subscription_001',
          requestHash: 'a'.repeat(Number('64'))
        }
      )
    ).resolves.toEqual({
      reservationRef: 'aqr_subscription_existing',
      status: 'reserved',
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      expiresAtMs: nowMs + Number('60000')
    })
    expect(replayExecutor.sqlRecord).toHaveLength(one)
    expect(replayExecutor.sqlRecord[zero]?.sql).toContain('FROM `ai_quota_reservations`')
    expect(replayExecutor.sqlRecord[zero]?.sql).toContain('FOR UPDATE')

    const conflictExecutor = createTestExecutor({ queryResult: [[reservationRow]] })
    await expect(
      createMysqlAiQuotaReservationRepository(conflictExecutor.executor).readExistingReservation(
        transaction,
        {
          userInternalId: '41',
          productActionId: 'action_subscription_001',
          idempotencyKey: 'idem_subscription_001',
          requestHash: 'b'.repeat(Number('64'))
        }
      )
    ).rejects.toMatchObject({ type: 'IDEMPOTENCY_CONFLICT' })
    expect(conflictExecutor.sqlRecord).toHaveLength(one)
  })

  test('在同一事务完整写入 reservation、grant 转移、allocation、reserve ledger 与账户投影', async () => {
    const { executor, sqlRecord } = createTestExecutor({
      writeResult: Array.from({ length: Number('8') }, () => one)
    })
    const repository = createMysqlAiQuotaReservationRepository(executor)

    await expect(
      repository.applyAllocatedReservation(transaction, {
        userInternalId: '41',
        accountInternalId: '71',
        accountVersion: 3,
        reservationRef: 'aqr_subscription_001',
        productActionId: 'action_subscription_001',
        costPolicyVersion: 'ai-cost/2026-09-20.1',
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 8,
        idempotencyKey: 'idem_subscription_001',
        requestHash: 'a'.repeat(Number('64')),
        expiresAtMs: nowMs + Number('60000'),
        occurredAtMs: nowMs,
        allocations: [
          {
            grantInternalId: '81',
            grantVersion: 2,
            grantRef: 'aqg_subscription_a',
            reservedAmount: 5,
            ledgerRef: 'aql_subscription_a'
          },
          {
            grantInternalId: '82',
            grantVersion: 4,
            grantRef: 'aqg_subscription_b',
            reservedAmount: 3,
            ledgerRef: 'aql_subscription_b'
          }
        ]
      })
    ).resolves.toBeUndefined()

    expect(sqlRecord.map(record => record.kind)).toEqual(
      Array.from({ length: Number('8') }, () => 'write')
    )
    expect(sqlRecord[zero]?.sql).toContain('INSERT INTO `ai_quota_reservations`')
    expect(sqlRecord[one]?.sql).toContain('UPDATE `ai_quota_grants`')
    expect(sqlRecord[one]?.sql).toContain('AND `version` = ?')
    expect(sqlRecord[one]?.parameters[Number('6')]).toBe(Number('2'))
    expect(sqlRecord[Number('2')]?.sql).toContain('INSERT INTO `ai_quota_reservation_allocations`')
    expect(sqlRecord[Number('3')]?.sql).toContain('INSERT INTO `ai_quota_ledger`')
    expect(sqlRecord[Number('4')]?.sql).toContain('UPDATE `ai_quota_grants`')
    expect(sqlRecord[Number('4')]?.sql).toContain('AND `version` = ?')
    expect(sqlRecord[Number('4')]?.parameters[Number('6')]).toBe(Number('4'))
    expect(sqlRecord[Number('5')]?.sql).toContain('INSERT INTO `ai_quota_reservation_allocations`')
    expect(sqlRecord[Number('6')]?.sql).toContain('INSERT INTO `ai_quota_ledger`')
    expect(sqlRecord[Number('7')]?.sql).toContain('UPDATE `ai_quota_accounts`')
    expect(sqlRecord[Number('7')]?.sql).toContain('AND `version` = ?')
    expect(sqlRecord[Number('7')]?.parameters).toEqual([
      Number('8'),
      Number('8'),
      'aql_subscription_b',
      nowMs,
      '71',
      '41',
      Number('3'),
      Number('8')
    ])
    expect(sqlRecord.every(record => record.transactionRef === transaction.testRef)).toBe(true)
  })

  test('分摊总额不守恒时在任何 SQL 前失败', async () => {
    const { executor, sqlRecord } = createTestExecutor({})
    const repository = createMysqlAiQuotaReservationRepository(executor)

    await expect(
      repository.applyAllocatedReservation(transaction, {
        userInternalId: '41',
        accountInternalId: '71',
        accountVersion: 3,
        reservationRef: 'aqr_subscription_001',
        productActionId: 'action_subscription_001',
        costPolicyVersion: 'ai-cost/2026-09-20.1',
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 8,
        idempotencyKey: 'idem_subscription_001',
        requestHash: 'a'.repeat(Number('64')),
        expiresAtMs: nowMs + Number('60000'),
        occurredAtMs: nowMs,
        allocations: [
          {
            grantInternalId: '81',
            grantVersion: 2,
            grantRef: 'aqg_subscription_a',
            reservedAmount: 5,
            ledgerRef: 'aql_subscription_a'
          },
          {
            grantInternalId: '82',
            grantVersion: 4,
            grantRef: 'aqg_subscription_b',
            reservedAmount: 2,
            ledgerRef: 'aql_subscription_b'
          }
        ]
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
    expect(sqlRecord).toHaveLength(zero)
  })

  test('任一写入未恰好影响一行时失败，使调用方事务统一回滚', async () => {
    const { executor, sqlRecord } = createTestExecutor({ writeResult: [one, zero] })
    const repository = createMysqlAiQuotaReservationRepository(executor)

    await expect(
      repository.applyAllocatedReservation(transaction, {
        userInternalId: '41',
        accountInternalId: '71',
        accountVersion: 3,
        reservationRef: 'aqr_subscription_001',
        productActionId: 'action_subscription_001',
        costPolicyVersion: 'ai-cost/2026-09-20.1',
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 5,
        idempotencyKey: 'idem_subscription_001',
        requestHash: 'a'.repeat(Number('64')),
        expiresAtMs: nowMs + Number('60000'),
        occurredAtMs: nowMs,
        allocations: [
          {
            grantInternalId: '81',
            grantVersion: 2,
            grantRef: 'aqg_subscription_a',
            reservedAmount: 5,
            ledgerRef: 'aql_subscription_a'
          }
        ]
      })
    ).rejects.toMatchObject({ type: 'WRITE_CONFLICT' })
    expect(sqlRecord).toHaveLength(Number('2'))
  })
})
