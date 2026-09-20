import { describe, expect, test, vi } from 'vitest'

import type {
  DatabaseTransactionDriver,
  TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createScanExpiredAiQuotaReservationsUseCase } from '../../src/subscription/application/scan-expired-ai-quota-reservations.js'
import type { MysqlAiQuotaExpiryRepository } from '../../src/subscription/repository/mysql-ai-quota-expiry-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 用于证明扫描与更新处于同一事务。 */
  readonly testRef: string
}

const nowMs = Number('1758376800000')
const one = Number('1')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_scan_expiry' }

/** 构造可观察的事务驱动与 Repository。 */
function createDependencies() {
  const events: string[] = []
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    beginTransaction: async () => {
      events.push('begin')
      return transaction
    },
    commitTransaction: async received => {
      events.push(`commit:${received.testRef}`)
    },
    rollbackTransaction: async received => {
      events.push(`rollback:${received.testRef}`)
    },
    recordRollbackFailure: async () => undefined
  }
  const repository: MysqlAiQuotaExpiryRepository<TestTransaction> = {
    lockExpiredReservations: vi.fn(async received => {
      events.push(`lock:${received.testRef}`)
      return [
        {
          reservationInternalId: '91',
          reservationRef: 'aqr_expired_001',
          status: 'reserved' as const,
          expiresAtMs: nowMs,
          reservationVersion: 1
        }
      ]
    }),
    markPendingReconciliation: vi.fn(async received => {
      events.push(`pending:${received.testRef}`)
    })
  }
  return { driver, repository, events }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的 TTL 到期进入待对账且不得自动释放规则。
 * 测试层次：L2 / `unit_fake`；替换事务驱动与 Repository，执行真实应用层编排和领域裁决。
 * 明确未覆盖：真实 MySQL 并发锁、定时任务认证、CloudBase 与供应商最终证据。
 */
describe('AI 额度预占 TTL 扫描用例', () => {
  test('在同一事务把到期预占转入待对账，并返回可审计批次结果', async () => {
    const dependencies = createDependencies()
    const scan = createScanExpiredAiQuotaReservationsUseCase(dependencies)

    await expect(scan({ occurredAtMs: nowMs, batchLimit: 20 })).resolves.toEqual({
      pendingCount: 1,
      reservationRefs: ['aqr_expired_001']
    })
    expect(dependencies.events).toEqual([
      'begin',
      'lock:tx_scan_expiry',
      'pending:tx_scan_expiry',
      'commit:tx_scan_expiry'
    ])
    expect(dependencies.repository.markPendingReconciliation).toHaveBeenCalledWith(transaction, {
      reservationInternalId: '91',
      reservationRef: 'aqr_expired_001',
      status: 'reserved',
      expiresAtMs: nowMs,
      reservationVersion: 1,
      occurredAtMs: nowMs
    })
  })

  test('空批次成功提交且零写入，非法批次上限不开始事务', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.repository.lockExpiredReservations).mockResolvedValueOnce([])
    const scan = createScanExpiredAiQuotaReservationsUseCase(dependencies)

    await expect(scan({ occurredAtMs: nowMs, batchLimit: 20 })).resolves.toEqual({
      pendingCount: 0,
      reservationRefs: []
    })
    expect(dependencies.repository.markPendingReconciliation).not.toHaveBeenCalled()
    await expect(scan({ occurredAtMs: nowMs, batchLimit: 0 })).rejects.toMatchObject({
      type: 'INTERNAL_DATA_INVALID'
    })
    expect(dependencies.events.filter(event => event === 'begin')).toHaveLength(one)
  })
})
