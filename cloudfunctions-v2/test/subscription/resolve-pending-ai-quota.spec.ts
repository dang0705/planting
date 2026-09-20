import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver } from '../../src/foundation/database/transaction-runner.js'
import { createResolvePendingAiQuotaUseCase } from '../../src/subscription/application/resolve-pending-ai-quota.js'
import type { MysqlAiQuotaReservationRepository } from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import type { MysqlAiQuotaSettlementRepository } from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'

type TestTransaction = {
  /** 证明该对象来自测试事务驱动。 */
  readonly transactionContext: true
  /** 用于核验全部写入共享同一事务。 */
  readonly testRef: string
}

const transaction: TestTransaction = {
  transactionContext: true,
  testRef: 'tx_resolve_pending_ai_quota'
}
const nowMs = Number('1758376800000')
const observedActualCostMicros = Number('9000')
const observedPlatformCostMicros = Number('2600')
const zero = Number('0')

/** 构造已经进入待对账的预占及可观察事务依赖。 */
function createDependencies(status: 'reserved' | 'pending_reconciliation' = 'pending_reconciliation') {
  const callOrder: string[] = []
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    beginTransaction: vi.fn(() => {
      callOrder.push('begin')
      return transaction
    }),
    commitTransaction: vi.fn(() => {
      callOrder.push('commit')
    }),
    rollbackTransaction: vi.fn(() => {
      callOrder.push('rollback')
    }),
    recordRollbackFailure: vi.fn()
  }
  const reservationRepository = {
    lockAccount: vi.fn(async () => {
      callOrder.push('lockAccount')
      return {
        accountInternalId: '71',
        accountVersion: 4,
        userInternalId: '41',
        availableAmount: 2,
        reservedAmount: 8
      }
    })
  } as unknown as MysqlAiQuotaReservationRepository<TestTransaction>
  const settlementRepository: MysqlAiQuotaSettlementRepository<TestTransaction> = {
    lockReservation: vi.fn(async () => {
      callOrder.push('lockReservation')
      return {
        reservationInternalId: '91',
        reservationRef: 'aqr_subscription_001',
        estimatedAmount: 8,
        settledAmount: null,
        actualCostMicros:
          status === 'pending_reconciliation' ? observedActualCostMicros : null,
        usageEvidenceRef:
          status === 'pending_reconciliation' ? 'usage_bailian_observed_001' : null,
        platformAbsorbedCostMicros:
          status === 'pending_reconciliation' ? observedPlatformCostMicros : zero,
        status,
        reservationVersion: 2
      }
    }),
    lockAllocations: vi.fn(async () => {
      callOrder.push('lockAllocations')
      return [
        {
          allocationInternalId: '101',
          grantInternalId: '81',
          grantRef: 'aqg_subscription_a',
          grantVersion: 2,
          grantStatus: 'partially_used' as const,
          grantAvailableAmount: 0,
          grantReservedAmount: 5,
          grantConsumedAmount: 0,
          remainingAmount: 5,
          settledAmount: 0,
          releasedAmount: 0
        },
        {
          allocationInternalId: '102',
          grantInternalId: '82',
          grantRef: 'aqg_subscription_b',
          grantVersion: 4,
          grantStatus: 'partially_used' as const,
          grantAvailableAmount: 2,
          grantReservedAmount: 3,
          grantConsumedAmount: 0,
          remainingAmount: 3,
          settledAmount: 0,
          releasedAmount: 0
        }
      ]
    }),
    applySettlement: vi.fn(async () => {
      callOrder.push('applySettlement')
    }),
    markPendingReconciliation: vi.fn(async () => {
      callOrder.push('markPending')
    })
  }
  return { callOrder, driver, reservationRepository, settlementRepository }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 中 pending 只能凭最终证据结算上限或确认未调用后释放。
 * 测试层次：L2 / `unit_fake`；替换事务、Repository 和账本引用生成器。
 * 明确未覆盖：真实 Provider 账单、真实 MySQL、HTTP、CloudBase 与定时扫描。
 */
describe('AI 额度待对账最终裁决', () => {
  test('最终证据确认已调用时最多结算原预占且保留平台差额', async () => {
    const dependencies = createDependencies()
    const resolve = createResolvePendingAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })

    await expect(
      resolve({
        userRef: 'usr_subscription_001' as UserRef,
        reservationRef: 'aqr_subscription_001',
        resolution: 'settle_user_cap',
        actualCostMicros: 9000,
        finalEvidenceRef: 'billing_bailian_final_001',
        platformAbsorbedCostMicros: 2600,
        occurredAtMs: nowMs
      })
    ).resolves.toEqual({
      kind: 'settled',
      reservationRef: 'aqr_subscription_001',
      settledAmount: 8,
      releasedAmount: 0,
      platformAbsorbedCostMicros: 2600
    })
    expect(dependencies.settlementRepository.applySettlement).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        expectedReservationStatus: 'pending_reconciliation',
        settledAmount: 8,
        releasedAmount: 0,
        platformAbsorbedCostMicros: 2600,
        usageEvidenceRef: 'billing_bailian_final_001'
      })
    )
  })

  test('最终证据确认调用未发生时全量释放且不保留平台差额', async () => {
    const dependencies = createDependencies()
    const resolve = createResolvePendingAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })

    await expect(
      resolve({
        userRef: 'usr_subscription_001' as UserRef,
        reservationRef: 'aqr_subscription_001',
        resolution: 'release_no_call',
        actualCostMicros: 0,
        finalEvidenceRef: 'billing_bailian_no_call_001',
        platformAbsorbedCostMicros: 0,
        occurredAtMs: nowMs
      })
    ).resolves.toEqual({
      kind: 'released',
      reservationRef: 'aqr_subscription_001',
      settledAmount: 0,
      releasedAmount: 8,
      platformAbsorbedCostMicros: 0
    })
    expect(dependencies.settlementRepository.applySettlement).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        expectedReservationStatus: 'pending_reconciliation',
        settledAmount: 0,
        releasedAmount: 8,
        platformAbsorbedCostMicros: 0
      })
    )
  })

  test('普通 reserved 预占不得绕过首次结算流程调用最终裁决', async () => {
    const dependencies = createDependencies('reserved')
    const resolve = createResolvePendingAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })

    await expect(
      resolve({
        userRef: 'usr_subscription_001' as UserRef,
        reservationRef: 'aqr_subscription_001',
        resolution: 'release_no_call',
        actualCostMicros: 0,
        finalEvidenceRef: 'billing_bailian_no_call_001',
        platformAbsorbedCostMicros: 0,
        occurredAtMs: nowMs
      })
    ).rejects.toMatchObject({ type: 'SETTLEMENT_CONFLICT' })
    expect(dependencies.settlementRepository.lockAllocations).not.toHaveBeenCalled()
    expect(dependencies.callOrder.at(Number('-1'))).toBe('rollback')
  })
})
