import { describe, expect, test } from 'vitest'

import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlAiQuotaSettlementRepository,
  type AiQuotaSettlementSqlExecutor,
  type AiQuotaSettlementSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 用于证明全部 SQL 使用同一事务。 */
  readonly testRef: string
}

type SqlRecord = {
  /** 本次 SQL 的读写类别。 */
  readonly kind: 'query' | 'write'
  /** 参数化 SQL 文本。 */
  readonly sql: string
  /** 传给驱动的参数快照。 */
  readonly parameters: readonly unknown[]
  /** 当前事务的测试引用。 */
  readonly transactionRef: string
}

const zero = Number('0')
const one = Number('1')
const nowMs = Number('1758376800000')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_settlement' }

/** 构造可观察 SQL 执行端口。 */
function createExecutor(options: {
  /** 每次查询按调用顺序返回的受控行。 */
  readonly queryResults?: readonly (readonly AiQuotaSettlementSqlRow[])[]
  /** 每次写入按调用顺序返回的影响行数。 */
  readonly writeResults?: readonly number[]
}) {
  const records: SqlRecord[] = []
  let queryIndex = zero
  let writeIndex = zero
  const executor: AiQuotaSettlementSqlExecutor<TestTransaction> = {
    executeQuery: async (received, sql, parameters) => {
      records.push({ kind: 'query', sql, parameters, transactionRef: received.testRef })
      const result = options.queryResults?.[queryIndex] ?? []
      queryIndex += one
      return result
    },
    executeWrite: async (received, sql, parameters) => {
      records.push({ kind: 'write', sql, parameters, transactionRef: received.testRef })
      const affectedRows = options.writeResults?.[writeIndex] ?? one
      writeIndex += one
      return { affectedRows }
    }
  }
  return { executor, records }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的 reservation 状态、allocation 守恒和不可变账本规则。
 * 测试层次：L2 / `unit_fake`；替换参数化 SQL 驱动，执行真实 Repository 校验与写入编排。
 * 明确未覆盖：真实 MySQL 约束、并发锁等待、应用用例、CloudBase、HTTP 和成本 Provider。
 */
describe('AI 额度结算 MySQL Repository', () => {
  test('锁定 reservation 与原稳定批次顺序的 allocation，并拒绝内部数据损坏', async () => {
    const reservationRow: AiQuotaSettlementSqlRow = {
      kind: 'settlement_reservation',
      reservation_internal_id: '91',
      reservation_ref: 'aqr_subscription_001',
      estimated_amount: '8',
      settled_amount: null,
      actual_cost_micros: null,
      usage_evidence_ref: null,
      platform_absorbed_cost_micros: '0',
      reservation_status: 'reserved',
      reservation_version: '1'
    }
    const allocationRows: readonly AiQuotaSettlementSqlRow[] = [
      {
        kind: 'settlement_allocation',
        allocation_internal_id: '101',
        grant_internal_id: '81',
        grant_ref: 'aqg_subscription_a',
        grant_version: '2',
        grant_status: 'partially_used',
        grant_available_amount: '0',
        grant_reserved_amount: '5',
        grant_consumed_amount: '0',
        allocation_remaining_amount: '5',
        allocation_settled_amount: '0',
        allocation_released_amount: '0'
      },
      {
        kind: 'settlement_allocation',
        allocation_internal_id: '102',
        grant_internal_id: '82',
        grant_ref: 'aqg_subscription_b',
        grant_version: '4',
        grant_status: 'partially_used',
        grant_available_amount: '2',
        grant_reserved_amount: '3',
        grant_consumed_amount: '0',
        allocation_remaining_amount: '3',
        allocation_settled_amount: '0',
        allocation_released_amount: '0'
      }
    ]
    const { executor, records } = createExecutor({
      queryResults: [[reservationRow], allocationRows]
    })
    const repository = createMysqlAiQuotaSettlementRepository(executor)

    const reservation = await repository.lockReservation(transaction, {
      userInternalId: '41',
      reservationRef: 'aqr_subscription_001'
    })
    await expect(
      repository.lockAllocations(transaction, {
        userInternalId: '41',
        reservationInternalId: reservation.reservationInternalId,
        estimatedAmount: reservation.estimatedAmount
      })
    ).resolves.toEqual([
      expect.objectContaining({ grantRef: 'aqg_subscription_a', remainingAmount: 5 }),
      expect.objectContaining({ grantRef: 'aqg_subscription_b', remainingAmount: 3 })
    ])
    expect(records[zero]?.sql).toContain('FROM `ai_quota_reservations`')
    expect(records[zero]?.sql).toContain('FOR UPDATE')
    expect(records[one]?.sql).toContain('ORDER BY `g`.`expires_at_ms`')
    expect(records[one]?.sql).toContain('FOR UPDATE')

    const corrupt = createExecutor({
      queryResults: [[reservationRow], [allocationRows[zero]!]]
    })
    const corruptRepository = createMysqlAiQuotaSettlementRepository(corrupt.executor)
    const locked = await corruptRepository.lockReservation(transaction, {
      userInternalId: '41',
      reservationRef: 'aqr_subscription_001'
    })
    await expect(
      corruptRepository.lockAllocations(transaction, {
        userInternalId: '41',
        reservationInternalId: locked.reservationInternalId,
        estimatedAmount: locked.estimatedAmount
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
  })

  test('结算计划原子更新 grant、allocation、双类型 ledger、reservation 和账户投影', async () => {
    const { executor, records } = createExecutor({
      writeResults: Array.from({ length: Number('9') }, () => one)
    })
    const repository = createMysqlAiQuotaSettlementRepository(executor)

    await expect(
      repository.applySettlement(transaction, {
        userInternalId: '41',
        accountInternalId: '71',
        accountVersion: 3,
        reservationInternalId: '91',
        reservationRef: 'aqr_subscription_001',
        reservationVersion: 1,
        expectedReservationStatus: 'reserved',
        estimatedAmount: 8,
        settledAmount: 6,
        releasedAmount: 2,
        actualCostMicros: 4800,
        usageEvidenceRef: 'usage_bailian_001',
        platformAbsorbedCostMicros: 0,
        occurredAtMs: nowMs,
        allocations: [
          {
            allocationInternalId: '101',
            grantInternalId: '81',
            grantRef: 'aqg_subscription_a',
            grantVersion: 2,
            remainingAmount: 5,
            settledAmount: 5,
            releasedAmount: 0,
            settleLedgerRef: 'aql_settle_a'
          },
          {
            allocationInternalId: '102',
            grantInternalId: '82',
            grantRef: 'aqg_subscription_b',
            grantVersion: 4,
            remainingAmount: 3,
            settledAmount: 1,
            releasedAmount: 2,
            settleLedgerRef: 'aql_settle_b',
            releaseLedgerRef: 'aql_release_b'
          }
        ]
      })
    ).resolves.toBeUndefined()

    expect(records.map(record => record.kind)).toEqual(
      Array.from({ length: Number('9') }, () => 'write')
    )
    expect(records[zero]?.sql).toContain('UPDATE `ai_quota_grants`')
    expect(records[one]?.sql).toContain('UPDATE `ai_quota_reservation_allocations`')
    expect(records[Number('2')]?.parameters).toContain('settle')
    expect(records[Number('3')]?.sql).toContain('UPDATE `ai_quota_grants`')
    expect(records[Number('4')]?.sql).toContain('UPDATE `ai_quota_reservation_allocations`')
    expect(records[Number('5')]?.parameters).toContain('settle')
    expect(records[Number('6')]?.parameters).toContain('release')
    expect(records[Number('7')]?.sql).toContain('UPDATE `ai_quota_reservations`')
    expect(records[Number('8')]?.sql).toContain('UPDATE `ai_quota_accounts`')
    expect(records[Number('8')]?.parameters).toContain('aql_release_b')
    expect(records.every(record => record.transactionRef === transaction.testRef)).toBe(true)
  })

  test('超额成本只把 reservation 标记待对账，不改变 grant、allocation、ledger 或账户', async () => {
    const { executor, records } = createExecutor({ writeResults: [one] })
    const repository = createMysqlAiQuotaSettlementRepository(executor)

    await expect(
      repository.markPendingReconciliation(transaction, {
        userInternalId: '41',
        reservationInternalId: '91',
        reservationRef: 'aqr_subscription_001',
        reservationVersion: 1,
        actualCostMicros: 9000,
        usageEvidenceRef: 'usage_bailian_over_001',
        platformAbsorbedCostMicros: 2600,
        occurredAtMs: nowMs
      })
    ).resolves.toBeUndefined()

    expect(records).toHaveLength(one)
    expect(records[zero]?.sql).toContain('UPDATE `ai_quota_reservations`')
    expect(records[zero]?.sql).toContain("`status` = 'pending_reconciliation'")
    expect(records[zero]?.sql).not.toContain('UPDATE `ai_quota_grants`')
    expect(records[zero]?.sql).not.toContain('INSERT INTO `ai_quota_ledger`')
  })

  test('最终证据可从待对账状态结算用户上限并保留平台承担成本', async () => {
    const { executor, records } = createExecutor({
      writeResults: Array.from({ length: Number('5') }, () => one)
    })
    const repository = createMysqlAiQuotaSettlementRepository(executor)

    await expect(
      repository.applySettlement(transaction, {
        userInternalId: '41',
        accountInternalId: '71',
        accountVersion: 4,
        reservationInternalId: '91',
        reservationRef: 'aqr_subscription_001',
        reservationVersion: 2,
        expectedReservationStatus: 'pending_reconciliation',
        estimatedAmount: 8,
        settledAmount: 8,
        releasedAmount: 0,
        actualCostMicros: 9000,
        usageEvidenceRef: 'billing_bailian_final_001',
        platformAbsorbedCostMicros: 2600,
        occurredAtMs: nowMs,
        allocations: [
          {
            allocationInternalId: '101',
            grantInternalId: '81',
            grantRef: 'aqg_subscription_a',
            grantVersion: 2,
            remainingAmount: 8,
            settledAmount: 8,
            releasedAmount: 0,
            settleLedgerRef: 'aql_settle_final_a'
          }
        ]
      })
    ).resolves.toBeUndefined()

    expect(records[Number('3')]?.sql).toContain('`status` = ?')
    expect(records[Number('3')]?.parameters).toContain('pending_reconciliation')
    expect(records[Number('3')]?.parameters).toContain(Number('2600'))
  })
})
