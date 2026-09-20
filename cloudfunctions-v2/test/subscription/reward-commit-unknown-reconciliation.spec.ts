import { describe, expect, test, vi } from 'vitest'

import type { EventRef, UserRef } from '../../src/contracts/types.js'
import { reconcileRewardCommitResult } from '../../src/subscription/application/reward-commit-unknown-reconciliation.js'

const input = {
  eventId: 'evt_reward_commit_unknown_001' as EventRef,
  userRef: 'usr_reward_commit_unknown_001' as UserRef,
  payloadHash: 'a'.repeat(Number('64')),
  rewardPolicyVersion: 'care-points/2026-09-20.1',
  rewardPolicyContentSha256: 'b'.repeat(Number('64'))
}

/**
 * Expected 来源：`reward-events/v1` 的事件、载荷与首次奖励策略快照不可变合同。
 * 测试层次：L1 / `unit_fake`；只替换提交未知后的新连接只读 Repository。
 * 明确未覆盖：真实 MySQL、新连接池、网络中断与应用事务。
 */
describe('奖励事务提交结果未知只读对账', () => {
  test('只有完整证据一致且已应用的 inbox 才允许安全重放', async () => {
    const repository = {
      read: vi.fn(async () => ({
        ...input,
        status: 'applied' as const,
        resultRef: 'cpl_reward_commit_unknown_001'
      }))
    }

    await expect(reconcileRewardCommitResult(repository, input)).resolves.toEqual({
      kind: 'replay',
      resultRef: 'cpl_reward_commit_unknown_001'
    })
    expect(repository.read).toHaveBeenCalledWith({
      userRef: input.userRef,
      eventId: input.eventId
    })
  })

  test.each([
    ['缺失', null, 'missing'],
    ['仍在处理中', { ...input, status: 'received' as const, resultRef: null }, 'processing'],
    [
      '载荷摘要不一致',
      {
        ...input,
        payloadHash: 'c'.repeat(Number('64')),
        status: 'applied' as const,
        resultRef: 'cpl_reward_commit_unknown_001'
      },
      'evidence_mismatch'
    ],
    [
      '策略版本不一致',
      {
        ...input,
        rewardPolicyVersion: 'care-points/other',
        status: 'applied' as const,
        resultRef: 'cpl_reward_commit_unknown_001'
      },
      'evidence_mismatch'
    ]
  ])('%s时失败关闭', async (_label, record, reason) => {
    const repository = { read: vi.fn(async () => record) }

    await expect(reconcileRewardCommitResult(repository, input)).resolves.toEqual({
      kind: 'unresolved',
      reason
    })
  })

  test('新连接读取失败时转换为稳定内部原因', async () => {
    const repository = { read: vi.fn(async () => Promise.reject(new Error('socket closed'))) }

    await expect(reconcileRewardCommitResult(repository, input)).resolves.toEqual({
      kind: 'unresolved',
      reason: 'read_failed'
    })
  })
})
