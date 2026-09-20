import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  reconcileAiQuotaReservationCommitResult,
  reconcileAiQuotaSettlementCommitResult
} from '../../src/subscription/application/ai-quota-commit-unknown-reconciliation.js'

const userRef = 'usr_subscription_001' as UserRef
const expectedSettledAmount = Number('6')
const conflictingSettledAmount = Number('5')
const actualCostMicros = Number('4800')

/**
 * Expected 来源：`care-points-ai-quota/v1` 与 Foundation 的提交结果未知失败关闭合同。
 * 测试层次：L2 / `unit_fake`；替换提交后新连接只读 Repository。
 * 明确未覆盖：真实网络断线、真实 MySQL 新连接、CloudBase、HTTP 和 Provider。
 */
describe('AI 额度提交结果未知只读对账', () => {
  test('预占只在同一幂等作用域和相同请求摘要已提交时返回可重放结果', async () => {
    const read = vi.fn(async () => ({
      requestHash: 'a'.repeat(Number('64')),
      reservationRef: 'aqr_subscription_001',
      status: 'reserved' as const,
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT' as const,
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      expiresAtMs: Number('1758376860000')
    }))

    await expect(
      reconcileAiQuotaReservationCommitResult(
        { read },
        {
          userRef,
          productActionId: 'action_subscription_001',
          idempotencyKey: 'idem_subscription_001',
          requestHash: 'a'.repeat(Number('64'))
        }
      )
    ).resolves.toEqual({
      kind: 'replay',
      reservation: expect.objectContaining({ reservationRef: 'aqr_subscription_001' })
    })
    expect(read).toHaveBeenCalledOnce()
  })

  test.each([
    ['missing', null],
    [
      'request_hash_mismatch',
      {
        requestHash: 'b'.repeat(Number('64')),
        reservationRef: 'aqr_subscription_001',
        status: 'reserved' as const,
        estimatedAmount: 8,
        capability: 'USER_AGENT_TEXT' as const,
        costPolicyVersion: 'ai-cost/2026-09-20.1',
        expiresAtMs: Number('1758376860000')
      }
    ]
  ])('预占无法由已提交记录证明时返回 %s 且不猜测事务结果', async (reason, record) => {
    await expect(
      reconcileAiQuotaReservationCommitResult(
        { read: vi.fn(async () => record) },
        {
          userRef,
          productActionId: 'action_subscription_001',
          idempotencyKey: 'idem_subscription_001',
          requestHash: 'a'.repeat(Number('64'))
        }
      )
    ).resolves.toEqual({ kind: 'unresolved', reason })
  })

  test('结算只在终态金额和供应商证据完全一致时返回安全重放', async () => {
    const read = vi.fn(async () => ({
      reservationRef: 'aqr_subscription_001',
      status: 'settled' as const,
      estimatedAmount: 8,
      settledAmount: 6,
      actualCostMicros: 4800,
      usageEvidenceRef: 'usage_bailian_001',
      platformAbsorbedCostMicros: 0
    }))

    await expect(
      reconcileAiQuotaSettlementCommitResult(
        { read },
        {
          userRef,
          reservationRef: 'aqr_subscription_001',
          settledAmount: 6,
          actualCostMicros: 4800,
          usageEvidenceRef: 'usage_bailian_001',
          platformAbsorbedCostMicros: 0
        }
      )
    ).resolves.toEqual({
      kind: 'replay',
      status: 'settled',
      settledAmount: 6
    })
    expect(read).toHaveBeenCalledOnce()
  })

  test.each([
    ['processing', 'reserved', expectedSettledAmount, 'usage_bailian_001'],
    ['evidence_mismatch', 'settled', conflictingSettledAmount, 'usage_bailian_other']
  ])('结算无法证明同一终态时返回 %s', async (reason, status, settledAmount, evidenceRef) => {
    await expect(
      reconcileAiQuotaSettlementCommitResult(
        {
          read: vi.fn(async () => ({
            reservationRef: 'aqr_subscription_001',
            status: status as 'reserved' | 'settled',
            estimatedAmount: 8,
            settledAmount: status === 'reserved' ? null : settledAmount,
            actualCostMicros: status === 'reserved' ? null : actualCostMicros,
            usageEvidenceRef: status === 'reserved' ? null : evidenceRef,
            platformAbsorbedCostMicros: 0
          }))
        },
        {
          userRef,
          reservationRef: 'aqr_subscription_001',
          settledAmount: 6,
          actualCostMicros: 4800,
          usageEvidenceRef: 'usage_bailian_001',
          platformAbsorbedCostMicros: 0
        }
      )
    ).resolves.toEqual({ kind: 'unresolved', reason })
  })

  test('新连接读取失败只返回 read_failed，不泄漏驱动异常', async () => {
    await expect(
      reconcileAiQuotaReservationCommitResult(
        { read: vi.fn(async () => Promise.reject(new Error('mysql host secret'))) },
        {
          userRef,
          productActionId: 'action_subscription_001',
          idempotencyKey: 'idem_subscription_001',
          requestHash: 'a'.repeat(Number('64'))
        }
      )
    ).resolves.toEqual({ kind: 'unresolved', reason: 'read_failed' })
  })
})
