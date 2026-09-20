import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import type { EventRef, RewardableDomainEventDto, UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  RewardOutboxPersistenceError,
  createMysqlUserPlantOutboxRepository,
  type UserPlantOutboxSqlExecutor
} from '../../src/user-plant/repository/mysql-user-plant-outbox-repository.js'

const zero = Number('0')
const one = Number('1')
const aggregateVersion = Number('7')
const createdAtMs = Number('1758369600000')
const configuredFirstProfilePoints = Number('20')
const sha256HexLength = Number('64')

/** 单元测试使用的可观察事务引用。 */
type TestTransaction = TransactionExecutionContext & {
  /** 证明 outbox 写入复用了调用方事务。 */
  readonly testRef: string
}

/** 以稳定键序计算测试载荷摘要；Expected 不依赖被测实现。 */
function payloadHash(payload: Readonly<Record<string, unknown>>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort())
  return createHash('sha256').update(canonical).digest('hex')
}

/** 构造已冻结的首株完整档案奖励事实，不包含积分或额度结果。 */
function profileCompletedEvent(): RewardableDomainEventDto {
  const payload = { profileVersion: 'user-plant-profile/v1' }
  return {
    eventId: 'evt_profile_completed_0001' as EventRef,
    eventType: 'user_plant.profile_completed.v1',
    eventVersion: 1,
    producerDomain: 'user-plant',
    userRef: 'usr_profile_completed_0001' as UserRef,
    userPlantRef: 'upl_profile_completed_0001' as UserPlantRef,
    aggregateRef: 'upl_profile_completed_0001',
    occurrenceRef: 'first-profile:usr_profile_completed_0001',
    policyVersion: 'user-plant-profile/v1',
    occurredAt: '2026-09-20T12:00:00.000Z',
    payload,
    payloadHash: payloadHash(payload)
  }
}

/**
 * Expected 来源：`reward-events/v1` 与 `006_reliable_events.sql`。
 * 测试层次：L3 / `unit_fake`；真实执行 Repository 的参数化 SQL 和事务传递，替换 MySQL 驱动。
 * 明确未覆盖：真实 MySQL CHECK/唯一键、业务档案写入、HTTP 幂等完成和跨域投递。
 */
describe('用户植物奖励 outbox MySQL Repository', () => {
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_profile_completed' }

  test('在调用方事务中写入完整事件信封，初态固定为 pending', async () => {
    const calls: Array<{ readonly transactionRef: string; readonly sql: string; readonly parameters: readonly unknown[] }> = []
    const executor: UserPlantOutboxSqlExecutor<TestTransaction> = {
      async executeWrite(currentTransaction, sql, parameters) {
        calls.push({ transactionRef: currentTransaction.testRef, sql, parameters })
        return { affectedRows: one }
      }
    }
    const repository = createMysqlUserPlantOutboxRepository(executor)

    await expect(
      repository.insertPending(transaction, profileCompletedEvent(), aggregateVersion, createdAtMs)
    ).resolves.toBeUndefined()

    expect(calls).toHaveLength(one)
    expect(calls[zero]?.transactionRef).toBe(transaction.testRef)
    expect(calls[zero]?.sql).toContain('INSERT INTO `user_plant_outbox`')
    expect(calls[zero]?.sql).toContain("'pending'")
    expect(calls[zero]?.sql).toContain('NULL')
    expect(calls[zero]?.parameters).toContain('user_plant.profile_completed.v1')
    expect(calls[zero]?.parameters).not.toContain(configuredFirstProfilePoints)
  })

  test('载荷摘要与规范化载荷不一致时失败关闭且不写数据库', async () => {
    let writes = 0
    const executor: UserPlantOutboxSqlExecutor<TestTransaction> = {
      async executeWrite() {
        writes += one
        return { affectedRows: one }
      }
    }
    const repository = createMysqlUserPlantOutboxRepository(executor)
    const event = { ...profileCompletedEvent(), payloadHash: 'a'.repeat(sha256HexLength) }

    await expect(
      repository.insertPending(transaction, event, aggregateVersion, createdAtMs)
    ).rejects.toBeInstanceOf(RewardOutboxPersistenceError)
    expect(writes).toBe(zero)
  })

  test('数据库没有恰好写入一行时失败关闭', async () => {
    const executor: UserPlantOutboxSqlExecutor<TestTransaction> = {
      async executeWrite() {
        return { affectedRows: 0 }
      }
    }
    const repository = createMysqlUserPlantOutboxRepository(executor)

    await expect(
      repository.insertPending(transaction, profileCompletedEvent(), aggregateVersion, createdAtMs)
    ).rejects.toBeInstanceOf(RewardOutboxPersistenceError)
  })
})
