import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver
} from '../../src/foundation/database/transaction-runner.js'
import type { AiQuotaSettlementCommitUnknownRecord } from '../../src/subscription/application/ai-quota-commit-unknown-reconciliation.js'
import { createSettleAiQuotaUseCase } from '../../src/subscription/application/settle-ai-quota.js'
import type { MysqlAiQuotaReservationRepository } from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import type { MysqlAiQuotaSettlementRepository } from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'

type TestTransaction = {
  /** 证明该对象来自事务驱动。 */
  readonly transactionContext: true
  /** 用于核验同一事务边界。 */
  readonly testRef: string
}

const nowMs = Number('1758376800000')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_settle_ai_quota' }

/** 构造可观察的事务、账户锁和结算 Repository。 */
function createDependencies(options?: {
  /** 覆盖预占状态，用于重放和冲突路径。 */
  readonly reservationStatus?: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 覆盖已存结算额度。 */
  readonly storedSettledAmount?: number | null
  /** 覆盖已存实际成本。 */
  readonly storedActualCostMicros?: number | null
  /** 覆盖已存用量证据。 */
  readonly storedUsageEvidenceRef?: string | null
  /** 覆盖平台承担成本。 */
  readonly storedPlatformAbsorbedCostMicros?: number
  /** 模拟 COMMIT 已发送但结果无法确认。 */
  readonly commitError?: DatabaseCommitResultUnknownError
  /** 新连接只读对账返回的已提交结算终态。 */
  readonly reconciliationRecord?: AiQuotaSettlementCommitUnknownRecord | null
}) {
  const callOrder: string[] = []
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    beginTransaction: vi.fn(() => {
      callOrder.push('begin')
      return transaction
    }),
    commitTransaction: vi.fn(() => {
      callOrder.push('commit')
      if (options?.commitError !== undefined) {
        throw options.commitError
      }
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
        accountVersion: 3,
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
        settledAmount: options?.storedSettledAmount ?? null,
        actualCostMicros: options?.storedActualCostMicros ?? null,
        usageEvidenceRef: options?.storedUsageEvidenceRef ?? null,
        platformAbsorbedCostMicros:
          options?.storedPlatformAbsorbedCostMicros ?? Number('0'),
        status: options?.reservationStatus ?? 'reserved',
        reservationVersion: 1
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
  const commitUnknownReadOnlyRepository = {
    read: vi.fn(async () => {
      callOrder.push('reconcile')
      return options?.reconciliationRecord ?? null
    })
  }
  return {
    callOrder,
    driver,
    reservationRepository,
    settlementRepository,
    commitUnknownReadOnlyRepository
  }
}

/** 返回标准结算内部命令。 */
function command(settledAmount = Number('6')) {
  return {
    userRef: 'usr_subscription_001' as UserRef,
    reservationRef: 'aqr_subscription_001',
    settledAmount,
    actualCostMicros: 4800,
    usageEvidenceRef: 'usage_bailian_001',
    platformAbsorbedCostMicros: 0,
    occurredAtMs: nowMs
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的结算、释放、待对账及终态幂等规则。
 * 测试层次：L2 / `unit_fake`；替换事务驱动、Repository 和账本引用生成器。
 * 明确未覆盖：真实 MySQL 新连接、Provider 成本换算、HTTP 和 CloudBase。
 */
describe('AI 额度结算应用用例', () => {
  test('实际额度小于预占时原子结算并释放剩余额度', async () => {
    const dependencies = createDependencies()
    const settle = createSettleAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`
    })

    await expect(settle(command())).resolves.toEqual({
      kind: 'settled',
      reservationRef: 'aqr_subscription_001',
      settledAmount: 6,
      releasedAmount: 2
    })
    expect(dependencies.callOrder).toEqual([
      'begin',
      'lockAccount',
      'lockReservation',
      'lockAllocations',
      'applySettlement',
      'commit'
    ])
    expect(dependencies.settlementRepository.applySettlement).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        settledAmount: 6,
        releasedAmount: 2,
        allocations: [
          expect.objectContaining({
            grantRef: 'aqg_subscription_a',
            settledAmount: 5,
            releasedAmount: 0,
            settleLedgerRef: 'aql_settle_aqg_subscription_a'
          }),
          expect.objectContaining({
            grantRef: 'aqg_subscription_b',
            settledAmount: 1,
            releasedAmount: 2,
            settleLedgerRef: 'aql_settle_aqg_subscription_b',
            releaseLedgerRef: 'aql_release_aqg_subscription_b'
          })
        ]
      })
    )
  })

  test('超出预占时只进入待对账，不修改分摊、批次、账本或账户', async () => {
    const dependencies = createDependencies()
    const settle = createSettleAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: vi.fn(() => 'aql_should_not_be_generated')
    })

    await expect(
      settle({
        ...command(Number('10')),
        actualCostMicros: 9000,
        usageEvidenceRef: 'usage_bailian_over_001',
        platformAbsorbedCostMicros: 2600
      })
    ).resolves.toEqual({
      kind: 'pending_reconciliation',
      reservationRef: 'aqr_subscription_001',
      requestedSettlementAmount: 10,
      quotaShortfallAmount: 2
    })
    expect(dependencies.callOrder).toEqual([
      'begin',
      'lockAccount',
      'lockReservation',
      'lockAllocations',
      'markPending',
      'commit'
    ])
    expect(dependencies.settlementRepository.applySettlement).not.toHaveBeenCalled()
  })

  test('相同终态证据安全重放且不再次锁分摊或写账本', async () => {
    const dependencies = createDependencies({
      reservationStatus: 'settled',
      storedSettledAmount: 6,
      storedActualCostMicros: 4800,
      storedUsageEvidenceRef: 'usage_bailian_001'
    })
    const createLedgerRef = vi.fn(() => 'aql_should_not_be_generated')
    const settle = createSettleAiQuotaUseCase({ ...dependencies, createLedgerRef })

    await expect(settle(command())).resolves.toEqual({
      kind: 'replayed',
      reservationRef: 'aqr_subscription_001',
      status: 'settled',
      settledAmount: 6
    })
    expect(dependencies.callOrder).toEqual(['begin', 'lockAccount', 'lockReservation', 'commit'])
    expect(dependencies.settlementRepository.lockAllocations).not.toHaveBeenCalled()
    expect(createLedgerRef).not.toHaveBeenCalled()
  })

  test('终态证据不一致稳定冲突并回滚', async () => {
    const dependencies = createDependencies({
      reservationStatus: 'settled',
      storedSettledAmount: 5,
      storedActualCostMicros: 4000,
      storedUsageEvidenceRef: 'usage_bailian_other'
    })
    const settle = createSettleAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: vi.fn(() => 'aql_should_not_be_generated')
    })

    await expect(settle(command())).rejects.toMatchObject({ type: 'SETTLEMENT_CONFLICT' })
    expect(dependencies.callOrder).toEqual(['begin', 'lockAccount', 'lockReservation', 'rollback'])
  })

  test('提交结果未知时只用新连接证明同一结算终态且不重跑写入', async () => {
    const dependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('socket closed after COMMIT'),
      reconciliationRecord: {
        reservationRef: 'aqr_subscription_001',
        status: 'settled',
        estimatedAmount: 8,
        settledAmount: 6,
        actualCostMicros: 4800,
        usageEvidenceRef: 'usage_bailian_001',
        platformAbsorbedCostMicros: 0
      }
    })
    const settle = createSettleAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`
    })

    await expect(settle(command())).resolves.toEqual({
      kind: 'replayed',
      reservationRef: 'aqr_subscription_001',
      status: 'settled',
      settledAmount: 6
    })
    expect(dependencies.settlementRepository.applySettlement).toHaveBeenCalledOnce()
    expect(dependencies.driver.rollbackTransaction).not.toHaveBeenCalled()
    expect(dependencies.callOrder.at(Number('-1'))).toBe('reconcile')
  })

  test('提交结果未知且新连接无法证明终态时失败关闭', async () => {
    const dependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('socket closed after COMMIT'),
      reconciliationRecord: null
    })
    const settle = createSettleAiQuotaUseCase({
      ...dependencies,
      createLedgerRef: (entryType, grantRef) => `aql_${entryType}_${grantRef}`
    })

    await expect(settle(command())).rejects.toMatchObject({ type: 'COMMIT_RESULT_UNKNOWN' })
    expect(dependencies.settlementRepository.applySettlement).toHaveBeenCalledOnce()
    expect(dependencies.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
})
