import { describe, expect, test, vi } from 'vitest'

import type { EventRef, UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver } from '../../src/foundation/database/transaction-runner.js'
import { createApplyRewardPointsEventUseCase } from '../../src/subscription/application/apply-reward-points-event.js'
import type { MysqlRewardInboxRepository } from '../../src/subscription/repository/mysql-reward-inbox-repository.js'
import type { MysqlRewardPointsRepository } from '../../src/subscription/repository/mysql-reward-points-repository.js'

type TestTransaction = {
  /** 证明应用层始终复用同一事务上下文。 */
  readonly transactionContext: true
  /** 测试事务的稳定引用。 */
  readonly testRef: string
}

const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_apply_reward_points' }
const occurredAtMs = Number('1758376800000')
const appliedAtMs = Number('1758376801000')
const levelRewardExpiresAtMs = Number('1766246400000')
const levelPolicy = [
  { code: 'L0', threshold: 0, aiReward: 0 },
  { code: 'L1', threshold: 100, aiReward: 50 },
  { code: 'L2', threshold: 300, aiReward: 100 }
] as const

/** 构造已完成签名、Schema 和奖励策略解析的应用命令。 */
function command() {
  const payloadJson = '{"decision":"defer_watering"}'
  return {
    inbox: {
      eventId: 'evt_reward_apply_0001' as EventRef,
      eventType: 'care.soil_check_completed.v1' as const,
      eventVersion: 1 as const,
      producerDomain: 'care' as const,
      userRef: 'usr_reward_apply_0001' as UserRef,
      userPlantRef: 'upl_reward_apply_0001' as UserPlantRef,
      aggregateRef: 'care_plan_reward_apply_0001',
      occurrenceRef: 'soil_check_reward_apply_0001',
      businessUniqueKey: 'soil-check:soil_check_reward_apply_0001',
      payloadJson,
      payloadHash: 'f33d199040bccf8a5e6db78a293df33455b90d32b098970b5d5c53c855dbf01d',
      producerPolicyVersion: 'care-soil-check/2026-09-20.1',
      rewardPolicyVersion: 'care-points/2026-09-20.1',
      rewardPolicyContentSha256: 'b'.repeat(Number('64')),
      occurredAtMs,
      receivedAtMs: appliedAtMs
    },
    pointsAmount: 250,
    levelPolicy,
    levelRewardExpiresAtMs,
    appliedAtMs
  }
}

/** 构造可观察的事务与两个 Repository 端口。 */
function createDependencies(options?: { readonly replay?: boolean; readonly failApply?: boolean }) {
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
  const inboxRepository: MysqlRewardInboxRepository<TestTransaction> = {
    reserve: vi.fn(async () => {
      callOrder.push('reserveInbox')
      return options?.replay
        ? {
            kind: 'replayed' as const,
            status: 'applied' as const,
            resultRef: 'cpl_reward_existing',
            rejectionCode: null
          }
        : { kind: 'reserved' as const, inboxInternalId: '91' }
    }),
    markApplied: vi.fn(async () => {
      callOrder.push('markApplied')
    })
  }
  const pointsRepository: MysqlRewardPointsRepository<TestTransaction> = {
    lockState: vi.fn(async () => {
      callOrder.push('lockState')
      return {
        userInternalId: '41',
        pointAccountInternalId: '51',
        pointAccountVersion: 3,
        availablePoints: 80,
        lifetimeNetEarned: 80,
        currentLevelCode: 'L0',
        aiAccountInternalId: '61',
        aiAccountVersion: 4,
        aiAvailableAmount: 200,
        previouslyGrantedLevelCodes: []
      }
    }),
    apply: vi.fn(async () => {
      callOrder.push('applyPoints')
      if (options?.failApply === true) {
        throw new Error('受控积分写入失败')
      }
    })
  }
  return { callOrder, driver, inboxRepository, pointsRepository }
}

/**
 * Expected 来源：`reward-events/v1` 与 `care-points-ai-quota/v1` 的 inbox、积分、等级和 AI grant 同事务合同。
 * 测试层次：L2 / `unit_fake`；替换事务驱动、Repository 和高熵引用生成器。
 * 明确未覆盖：真实 MySQL、策略发布读取、跨域 HTTP、CloudBase 和提交结果未知只读对账。
 */
describe('奖励积分事件应用用例', () => {
  test('首次事件在同一事务中完成 inbox、积分、跨级奖励和应用状态', async () => {
    const dependencies = createDependencies()
    const applyReward = createApplyRewardPointsEventUseCase({
      ...dependencies,
      createPointLedgerRef: () => 'cpl_reward_apply_0001',
      createLevelGrantRef: levelCode => `clg_reward_apply_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_reward_apply_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_reward_apply_${levelCode}`
    })

    await expect(applyReward(command())).resolves.toEqual({
      kind: 'applied',
      resultRef: 'cpl_reward_apply_0001',
      pointsAmount: 250,
      nextAvailablePoints: 330,
      nextLifetimeNetEarned: 330,
      nextLevelCode: 'L2',
      awardedLevels: ['L1', 'L2']
    })
    expect(dependencies.callOrder).toEqual([
      'begin',
      'reserveInbox',
      'lockState',
      'applyPoints',
      'markApplied',
      'commit'
    ])
    expect(dependencies.pointsRepository.apply).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        pointLedgerRef: 'cpl_reward_apply_0001',
        sourceType: 'DUE_SOIL_CHECK',
        sourceRef: 'soil_check_reward_apply_0001',
        levelRewards: [
          expect.objectContaining({ levelCode: 'L1', amount: 50 }),
          expect.objectContaining({ levelCode: 'L2', amount: 100 })
        ]
      })
    )
    expect(dependencies.inboxRepository.markApplied).toHaveBeenCalledWith(
      transaction,
      '91',
      'cpl_reward_apply_0001',
      appliedAtMs
    )
  })

  test('已应用事件只重放既有结果，不再锁账户或生成奖励', async () => {
    const dependencies = createDependencies({ replay: true })
    const createPointLedgerRef = vi.fn(() => 'cpl_should_not_be_generated')
    const applyReward = createApplyRewardPointsEventUseCase({
      ...dependencies,
      createPointLedgerRef,
      createLevelGrantRef: vi.fn(() => 'clg_should_not_be_generated'),
      createAiGrantRef: vi.fn(() => 'aqg_should_not_be_generated'),
      createAiLedgerRef: vi.fn(() => 'aql_should_not_be_generated')
    })

    await expect(applyReward(command())).resolves.toEqual({
      kind: 'replayed',
      status: 'applied',
      resultRef: 'cpl_reward_existing'
    })
    expect(dependencies.callOrder).toEqual(['begin', 'reserveInbox', 'commit'])
    expect(dependencies.pointsRepository.lockState).not.toHaveBeenCalled()
    expect(createPointLedgerRef).not.toHaveBeenCalled()
  })

  test('任一积分写入失败都会回滚且 inbox 不得标记 applied', async () => {
    const dependencies = createDependencies({ failApply: true })
    const applyReward = createApplyRewardPointsEventUseCase({
      ...dependencies,
      createPointLedgerRef: () => 'cpl_reward_apply_0001',
      createLevelGrantRef: levelCode => `clg_reward_apply_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_reward_apply_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_reward_apply_${levelCode}`
    })

    await expect(applyReward(command())).rejects.toThrow('受控积分写入失败')
    expect(dependencies.callOrder).toEqual([
      'begin',
      'reserveInbox',
      'lockState',
      'applyPoints',
      'rollback'
    ])
    expect(dependencies.inboxRepository.markApplied).not.toHaveBeenCalled()
  })
})
