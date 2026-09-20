import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver } from '../../src/foundation/database/transaction-runner.js'
import type {
  MysqlAiQuotaReservationRepository,
  LockedAiQuotaAccount,
  LockedAiQuotaGrantCandidate
} from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import { createReserveAiQuotaUseCase } from '../../src/subscription/application/reserve-ai-quota.js'

type TestTransaction = {
  /** 证明该对象来自测试事务驱动。 */
  readonly transactionContext: true
  /** 用于核验全部 Repository 调用共享同一事务。 */
  readonly testRef: string
}

const nowMs = Number('1758376800000')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_reserve_ai_quota' }
const lockedAccount: LockedAiQuotaAccount = {
  accountInternalId: '71',
  accountVersion: 3,
  userInternalId: '41',
  availableAmount: 100,
  reservedAmount: 0
}
const lockedGrants: readonly LockedAiQuotaGrantCandidate[] = [
  {
    grantInternalId: '81',
    grantVersion: 2,
    grantRef: 'aqg_subscription_a',
    availableAmount: 5,
    grantedAtMs: nowMs - Number('1000'),
    expiresAtMs: nowMs + Number('1000'),
    capabilityScope: ['USER_AGENT_TEXT']
  },
  {
    grantInternalId: '82',
    grantVersion: 4,
    grantRef: 'aqg_subscription_b',
    availableAmount: 7,
    grantedAtMs: nowMs - Number('2000'),
    expiresAtMs: nowMs + Number('2000'),
    capabilityScope: ['USER_AGENT_TEXT']
  }
]

/** 构造可观察的事务驱动和 Repository，便于证明调用顺序及同事务边界。 */
function createDependencies(options?: {
  /** 已有幂等预占；非空时不得读取或修改批次。 */
  readonly existingReservation?: Awaited<
    ReturnType<MysqlAiQuotaReservationRepository<TestTransaction>['readExistingReservation']>
  >
  /** 覆盖默认额度批次，用于余额不足路径。 */
  readonly grants?: readonly LockedAiQuotaGrantCandidate[]
}) {
  const callOrder: string[] = []
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    beginTransaction: vi.fn(() => {
      callOrder.push('begin')
      return transaction
    }),
    commitTransaction: vi.fn(received => {
      expect(received).toBe(transaction)
      callOrder.push('commit')
    }),
    rollbackTransaction: vi.fn(received => {
      expect(received).toBe(transaction)
      callOrder.push('rollback')
    }),
    recordRollbackFailure: vi.fn()
  }
  const repository: MysqlAiQuotaReservationRepository<TestTransaction> = {
    lockAccount: vi.fn(async received => {
      expect(received).toBe(transaction)
      callOrder.push('lockAccount')
      return lockedAccount
    }),
    readExistingReservation: vi.fn(async received => {
      expect(received).toBe(transaction)
      callOrder.push('readExisting')
      return options?.existingReservation ?? null
    }),
    readEligibleGrants: vi.fn(async received => {
      expect(received).toBe(transaction)
      callOrder.push('readGrants')
      return options?.grants ?? lockedGrants
    }),
    applyAllocatedReservation: vi.fn(async received => {
      expect(received).toBe(transaction)
      callOrder.push('apply')
    })
  }
  return { callOrder, driver, repository }
}

/** 返回所有测试共享的可信内部命令。 */
function command() {
  return {
    userRef: 'usr_subscription_001' as UserRef,
    productActionId: 'action_subscription_001',
    costPolicyVersion: 'ai-cost/2026-09-20.1',
    capability: 'USER_AGENT_TEXT' as const,
    estimatedAmount: 8,
    idempotencyKey: 'idem_subscription_001',
    requestHash: 'a'.repeat(Number('64')),
    expiresAtMs: nowMs + Number('60000'),
    occurredAtMs: nowMs
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 与额度 Repository 已冻结的锁顺序、幂等和原子分摊规则。
 * 测试层次：L2 / `unit_fake`；替换事务驱动、Repository 与高熵引用生成器。
 * 明确未覆盖：真实 MySQL 行锁、唯一约束、提交结果未知后的新连接只读对账、HTTP 和模型调用。
 */
describe('AI 额度预占应用用例', () => {
  test('同键同摘要重放已有预占，不读取 grants、不生成引用且不再次写入', async () => {
    const dependencies = createDependencies({
      existingReservation: {
        reservationRef: 'aqr_subscription_existing',
        status: 'reserved',
        estimatedAmount: 8,
        capability: 'USER_AGENT_TEXT',
        costPolicyVersion: 'ai-cost/2026-09-20.1',
        expiresAtMs: nowMs + Number('60000')
      }
    })
    const createReservationRef = vi.fn(() => 'aqr_should_not_be_generated')
    const createLedgerRef = vi.fn(() => 'aql_should_not_be_generated')
    const reserve = createReserveAiQuotaUseCase({
      ...dependencies,
      createReservationRef,
      createLedgerRef
    })

    await expect(reserve(command())).resolves.toEqual({
      kind: 'replayed',
      reservationRef: 'aqr_subscription_existing',
      status: 'reserved',
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      expiresAtMs: nowMs + Number('60000')
    })
    expect(dependencies.callOrder).toEqual(['begin', 'lockAccount', 'readExisting', 'commit'])
    expect(dependencies.repository.readEligibleGrants).not.toHaveBeenCalled()
    expect(dependencies.repository.applyAllocatedReservation).not.toHaveBeenCalled()
    expect(createReservationRef).not.toHaveBeenCalled()
    expect(createLedgerRef).not.toHaveBeenCalled()
  })

  test('额度不足时提交只读事务并返回完整缺口，绝不写半分摊', async () => {
    const dependencies = createDependencies({ grants: [lockedGrants[Number('0')]!] })
    const reserve = createReserveAiQuotaUseCase({
      ...dependencies,
      createReservationRef: vi.fn(() => 'aqr_should_not_be_generated'),
      createLedgerRef: vi.fn(() => 'aql_should_not_be_generated')
    })

    await expect(reserve(command())).resolves.toEqual({
      kind: 'insufficient_quota',
      estimatedAmount: 8,
      availableAmount: 5,
      shortfallAmount: 3
    })
    expect(dependencies.callOrder).toEqual([
      'begin',
      'lockAccount',
      'readExisting',
      'readGrants',
      'commit'
    ])
    expect(dependencies.repository.applyAllocatedReservation).not.toHaveBeenCalled()
  })

  test('额度充足时按领域计划生成引用并在同一事务持久化完整分摊', async () => {
    const dependencies = createDependencies()
    const createLedgerRef = vi
      .fn<(grantRef: string) => string>()
      .mockImplementation(grantRef => `aql_for_${grantRef}`)
    const reserve = createReserveAiQuotaUseCase({
      ...dependencies,
      createReservationRef: () => 'aqr_subscription_001',
      createLedgerRef
    })

    await expect(reserve(command())).resolves.toEqual({
      kind: 'reserved',
      reservationRef: 'aqr_subscription_001',
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      expiresAtMs: nowMs + Number('60000')
    })
    expect(dependencies.callOrder).toEqual([
      'begin',
      'lockAccount',
      'readExisting',
      'readGrants',
      'apply',
      'commit'
    ])
    expect(dependencies.repository.applyAllocatedReservation).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        accountInternalId: '71',
        accountVersion: 3,
        userInternalId: '41',
        reservationRef: 'aqr_subscription_001',
        allocations: [
          {
            grantInternalId: '81',
            grantVersion: 2,
            grantRef: 'aqg_subscription_a',
            reservedAmount: 5,
            ledgerRef: 'aql_for_aqg_subscription_a'
          },
          {
            grantInternalId: '82',
            grantVersion: 4,
            grantRef: 'aqg_subscription_b',
            reservedAmount: 3,
            ledgerRef: 'aql_for_aqg_subscription_b'
          }
        ]
      })
    )
  })

  test('Repository 写入失败时事务回滚且不返回成功结果', async () => {
    const dependencies = createDependencies()
    vi.mocked(dependencies.repository.applyAllocatedReservation).mockImplementationOnce(
      async received => {
        expect(received).toBe(transaction)
        dependencies.callOrder.push('apply')
        throw new Error('受控写入失败')
      }
    )
    const reserve = createReserveAiQuotaUseCase({
      ...dependencies,
      createReservationRef: () => 'aqr_subscription_001',
      createLedgerRef: grantRef => `aql_for_${grantRef}`
    })

    await expect(reserve(command())).rejects.toThrow('受控写入失败')
    expect(dependencies.callOrder).toEqual([
      'begin',
      'lockAccount',
      'readExisting',
      'readGrants',
      'apply',
      'rollback'
    ])
  })
})
