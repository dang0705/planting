import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createMarkAiQuotaProviderResultUnknownUseCase } from '../../src/subscription/application/mark-ai-quota-provider-result-unknown.js'
import type { MysqlAiQuotaProviderUnknownRepository } from '../../src/subscription/repository/mysql-ai-quota-provider-unknown-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 用于证明加锁与更新处于同一事务。 */
  readonly testRef: string
}

const nowMs = Number('1758376800000')
const userRef = 'usr_provider_unknown_owner' as UserRef
const reservationRef = 'aqr_provider_unknown_001'
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_provider_unknown' }

type ReservationStatus = 'reserved' | 'settled' | 'released' | 'pending_reconciliation'

/** 构造可观察的事务驱动、账户锁与专用 Repository。 */
function createDependencies(status: ReservationStatus | null = 'reserved') {
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
  const reservationRepository = {
    lockAccount: vi.fn(async (received: TestTransaction, receivedUserRef: UserRef) => {
      events.push(`lockAccount:${received.testRef}:${receivedUserRef}`)
      return {
        accountInternalId: '501',
        accountVersion: 3,
        userInternalId: '77',
        availableAmount: 2,
        reservedAmount: 8
      }
    })
  }
  const providerUnknownRepository: MysqlAiQuotaProviderUnknownRepository<TestTransaction> = {
    lockReservation: vi.fn(async (received, input) => {
      events.push(
        `lockReservation:${received.testRef}:${input.userInternalId}:${input.reservationRef}`
      )
      return status === null
        ? null
        : { reservationInternalId: '91', reservationRef, status, reservationVersion: 2 }
    }),
    markProviderResultUnknown: vi.fn(async received => {
      events.push(`mark:${received.testRef}`)
    })
  }
  return { driver, reservationRepository, providerUnknownRepository, events }
}

const command = { userRef, reservationRef, occurredAtMs: nowMs }

/**
 * Expected 来源：docs/backend-v2/contracts/care-points-and-ai-quota.md
 * “无法确认供应商结果时进入 pending_reconciliation”与“供应商结果未知为 `provider_result_unknown`”；
 * 预占额度在对账前保持锁定、不得自动释放（同合同 TTL 规则同理）；账户锁先于预占锁（与 settle-ai-quota 同顺序防死锁）。
 * 测试层次：L2 / `unit_fake`；替换事务驱动、账户锁与 Repository，执行真实应用层编排。
 * 明确未覆盖：真实 MySQL 锁与约束、SQL 文本正确性（见 test/e2e/subscription-provider-unknown.mysql.spec.ts）。
 */
describe('AI 额度预占标记供应商结果未知用例', () => {
  test('reserved → 同一事务先锁账户再锁预占，按乐观锁版本标记待对账', async () => {
    const dependencies = createDependencies('reserved')
    const mark = createMarkAiQuotaProviderResultUnknownUseCase(dependencies)

    await expect(mark(command)).resolves.toEqual({ kind: 'pending_reconciliation', reservationRef })
    expect(dependencies.events).toEqual([
      'begin',
      `lockAccount:tx_provider_unknown:${userRef}`,
      `lockReservation:tx_provider_unknown:77:${reservationRef}`,
      'mark:tx_provider_unknown',
      'commit:tx_provider_unknown'
    ])
    expect(dependencies.providerUnknownRepository.markProviderResultUnknown).toHaveBeenCalledWith(
      transaction,
      { reservationInternalId: '91', reservationRef, reservationVersion: 2, occurredAtMs: nowMs }
    )
  })

  test.each(['settled', 'released', 'pending_reconciliation'] as const)(
    '已是 %s → 返回 replayed 与当前状态，零写入并正常提交',
    async status => {
      const dependencies = createDependencies(status)
      const mark = createMarkAiQuotaProviderResultUnknownUseCase(dependencies)

      await expect(mark(command)).resolves.toEqual({ kind: 'replayed', reservationRef, status })
      expect(
        dependencies.providerUnknownRepository.markProviderResultUnknown
      ).not.toHaveBeenCalled()
      expect(dependencies.events.at(Number('-1'))).toBe('commit:tx_provider_unknown')
    }
  )

  test('预占不存在或不属于该用户 → RESERVATION_NOT_FOUND，回滚且零写入', async () => {
    const dependencies = createDependencies(null)
    const mark = createMarkAiQuotaProviderResultUnknownUseCase(dependencies)

    await expect(mark(command)).rejects.toMatchObject({ type: 'RESERVATION_NOT_FOUND' })
    expect(dependencies.providerUnknownRepository.markProviderResultUnknown).not.toHaveBeenCalled()
    expect(dependencies.events.at(Number('-1'))).toBe('rollback:tx_provider_unknown')
  })

  test.each([
    ['预占引用格式非法', { ...command, reservationRef: 'not-a-reservation' }],
    ['预占引用为空', { ...command, reservationRef: '' }],
    ['发生时间非整数', { ...command, occurredAtMs: 1.5 }],
    ['发生时间为负', { ...command, occurredAtMs: -1 }]
  ])('%s → INTERNAL_DATA_INVALID，不开始事务', async (_name, invalidCommand) => {
    const dependencies = createDependencies('reserved')
    const mark = createMarkAiQuotaProviderResultUnknownUseCase(dependencies)

    await expect(mark(invalidCommand)).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
    expect(dependencies.events).toEqual([])
  })

  test('COMMIT 结果未知 → COMMIT_RESULT_UNKNOWN（调用方可安全重试，重试按 replayed 收敛）', async () => {
    const dependencies = createDependencies('reserved')
    const driver: DatabaseTransactionDriver<TestTransaction> = {
      ...dependencies.driver,
      commitTransaction: async () => {
        throw new DatabaseCommitResultUnknownError('connection lost')
      }
    }
    const mark = createMarkAiQuotaProviderResultUnknownUseCase({ ...dependencies, driver })

    await expect(mark(command)).rejects.toMatchObject({ type: 'COMMIT_RESULT_UNKNOWN' })
  })
})
