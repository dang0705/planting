import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository,
  createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository,
  type AiQuotaCommitUnknownSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-commit-unknown-repository.js'

const userRef = 'usr_subscription_001' as UserRef

/** 构造记录 SQL 和参数的无事务只读执行器。 */
function createExecutor(rows: readonly AiQuotaCommitUnknownSqlRow[]) {
  const records: { readonly sql: string; readonly parameters: readonly unknown[] }[] = []
  return {
    records,
    executor: {
      executeQuery: vi.fn(async (sql: string, parameters: readonly unknown[]) => {
        records.push({ sql, parameters })
        return rows
      })
    }
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 与 Foundation 的提交结果未知新连接只读合同。
 * 测试层次：L2 / `unit_fake`；仅替换无事务 SQL 执行器。
 * 明确未覆盖：真实 MySQL 连接身份、网络断线、CloudBase、HTTP 和 Provider。
 */
describe('AI 额度提交未知 MySQL 只读 Repository', () => {
  test('预占按公开用户、产品动作和幂等键无锁读回完整摘要', async () => {
    const testDouble = createExecutor([
      {
        kind: 'reservation_commit_unknown',
        reservation_ref: 'aqr_subscription_001',
        request_hash: 'a'.repeat(Number('64')),
        status: 'reserved',
        estimated_amount: '8',
        capability: 'USER_AGENT_TEXT',
        cost_policy_version: 'ai-cost/2026-09-20.1',
        expires_at_ms: '1758376860000'
      }
    ])
    const repository = createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(
      testDouble.executor
    )

    await expect(
      repository.read({
        userRef,
        productActionId: 'action_subscription_001',
        idempotencyKey: 'idem_subscription_001'
      })
    ).resolves.toEqual({
      requestHash: 'a'.repeat(Number('64')),
      reservationRef: 'aqr_subscription_001',
      status: 'reserved',
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      expiresAtMs: Number('1758376860000')
    })
    expect(testDouble.records[Number('0')]?.sql).not.toContain('FOR UPDATE')
    expect(testDouble.records[Number('0')]?.parameters).toEqual([
      userRef,
      'action_subscription_001',
      'idem_subscription_001'
    ])
  })

  test('结算按公开用户和预占引用无锁读回供应商终态证据', async () => {
    const testDouble = createExecutor([
      {
        kind: 'settlement_commit_unknown',
        reservation_ref: 'aqr_subscription_001',
        status: 'settled',
        estimated_amount: '8',
        settled_amount: '6',
        actual_cost_micros: '4800',
        usage_evidence_ref: 'usage_bailian_001',
        platform_absorbed_cost_micros: '2600'
      }
    ])
    const repository = createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository(
      testDouble.executor
    )

    await expect(
      repository.read({ userRef, reservationRef: 'aqr_subscription_001' })
    ).resolves.toEqual({
      reservationRef: 'aqr_subscription_001',
      status: 'settled',
      estimatedAmount: 8,
      settledAmount: 6,
      actualCostMicros: 4800,
      usageEvidenceRef: 'usage_bailian_001',
      platformAbsorbedCostMicros: 2600
    })
    expect(testDouble.records[Number('0')]?.sql).not.toContain('FOR UPDATE')
    expect(testDouble.records[Number('0')]?.parameters).toEqual([
      userRef,
      'aqr_subscription_001'
    ])
  })

  test('不存在返回空，重复或畸形记录失败关闭', async () => {
    const missing = createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(
      createExecutor([]).executor
    )
    await expect(
      missing.read({
        userRef,
        productActionId: 'action_subscription_001',
        idempotencyKey: 'idem_subscription_001'
      })
    ).resolves.toBeNull()

    const duplicate = createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository(
      createExecutor([
        {
          kind: 'settlement_commit_unknown',
          reservation_ref: 'aqr_subscription_001',
          status: 'reserved',
          estimated_amount: '8',
          settled_amount: null,
          actual_cost_micros: null,
          usage_evidence_ref: null,
          platform_absorbed_cost_micros: '0'
        },
        {
          kind: 'settlement_commit_unknown',
          reservation_ref: 'aqr_subscription_001',
          status: 'reserved',
          estimated_amount: '8',
          settled_amount: null,
          actual_cost_micros: null,
          usage_evidence_ref: null,
          platform_absorbed_cost_micros: '0'
        }
      ]).executor
    )
    await expect(
      duplicate.read({ userRef, reservationRef: 'aqr_subscription_001' })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })

    const malformed = createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(
      createExecutor([
        {
          kind: 'reservation_commit_unknown',
          reservation_ref: 'aqr_subscription_001',
          request_hash: 'not-a-hash',
          status: 'reserved',
          estimated_amount: '-1',
          capability: 'USER_AGENT_TEXT',
          cost_policy_version: '',
          expires_at_ms: 'invalid'
        }
      ]).executor
    )
    await expect(
      malformed.read({
        userRef,
        productActionId: 'action_subscription_001',
        idempotencyKey: 'idem_subscription_001'
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
  })
})
