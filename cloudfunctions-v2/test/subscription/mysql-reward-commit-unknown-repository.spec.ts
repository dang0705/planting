import { describe, expect, test, vi } from 'vitest'

import type { EventRef, UserRef } from '../../src/contracts/types.js'
import { createMysqlRewardCommitUnknownReadOnlyRepository } from '../../src/subscription/repository/mysql-reward-commit-unknown-repository.js'

/**
 * Expected 来源：`reward-events/v1` 与 Foundation 的提交结果未知新连接只读合同。
 * 测试层次：L2 / `unit_fake`；替换无事务、新连接 SQL 执行器。
 * 明确未覆盖：真实连接池、网络中断、MySQL JOIN 与事务提交。
 */
describe('奖励事务提交未知 MySQL 只读 Repository', () => {
  test('按用户与事件唯一作用域无锁读回完整对账证据', async () => {
    const executeQuery = vi.fn(async () => [
      {
        event_id: 'evt_reward_commit_unknown_001',
        user_ref: 'usr_reward_commit_unknown_001',
        payload_hash: 'a'.repeat(Number('64')),
        reward_policy_version: 'care-points/2026-09-20.1',
        reward_policy_content_sha256: 'b'.repeat(Number('64')),
        status: 'applied' as const,
        result_ref: 'cpl_reward_commit_unknown_001'
      }
    ])
    const repository = createMysqlRewardCommitUnknownReadOnlyRepository({ executeQuery })

    await expect(
      repository.read({
        eventId: 'evt_reward_commit_unknown_001' as EventRef,
        userRef: 'usr_reward_commit_unknown_001' as UserRef
      })
    ).resolves.toEqual({
      eventId: 'evt_reward_commit_unknown_001',
      userRef: 'usr_reward_commit_unknown_001',
      payloadHash: 'a'.repeat(Number('64')),
      rewardPolicyVersion: 'care-points/2026-09-20.1',
      rewardPolicyContentSha256: 'b'.repeat(Number('64')),
      status: 'applied',
      resultRef: 'cpl_reward_commit_unknown_001'
    })
    const sql = String(executeQuery.mock.calls[Number('0')]?.[Number('0')])
    expect(sql).not.toContain('FOR UPDATE')
    expect(executeQuery).toHaveBeenCalledWith(expect.any(String), [
      'usr_reward_commit_unknown_001',
      'evt_reward_commit_unknown_001'
    ])
  })

  test('重复行或损坏终态失败关闭', async () => {
    const row = {
      event_id: 'evt_reward_commit_unknown_001',
      user_ref: 'usr_reward_commit_unknown_001',
      payload_hash: 'a'.repeat(Number('64')),
      reward_policy_version: 'care-points/2026-09-20.1',
      reward_policy_content_sha256: 'b'.repeat(Number('64')),
      status: 'applied' as const,
      result_ref: null
    }
    const damaged = createMysqlRewardCommitUnknownReadOnlyRepository({
      executeQuery: vi.fn(async () => [row])
    })
    const duplicated = createMysqlRewardCommitUnknownReadOnlyRepository({
      executeQuery: vi.fn(async () => [row, row])
    })
    const scope = {
      eventId: 'evt_reward_commit_unknown_001' as EventRef,
      userRef: 'usr_reward_commit_unknown_001' as UserRef
    }

    await expect(damaged.read(scope)).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
    await expect(duplicated.read(scope)).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })
  })
})
