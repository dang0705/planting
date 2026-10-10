import { describe, expect, it, vi } from 'vitest'

import { createDispatchCareOutboxJob } from '../../src/care/application/dispatch-care-outbox.js'
import { createExpireCarePlansJob } from '../../src/care/application/expire-care-plans.js'
import { expireDueCarePlans } from '../../src/care/repository/mysql-care-plan-expiry-repository.js'
import { careLongTermRulesV1 } from '../support/business-policy-fixtures.js'

/**
 * L1 / unit_fake（替身领取/批次端口与记录型 mysql2 连接）。
 * Expected 来源：主代理 2026-10-10 裁定（依据用户「配置总入口=代码层+环境变量层，用于后期调整各种参数」）：
 * 发件箱租约（默认 30 秒，允许 10–120）、发件箱每批（默认 100，允许 20–500）、过期扫描每批（默认 500，允许 100–2000）
 * 为运维参数，可由部署环境变量在登记范围内覆盖；最大尝试次数 5、过期 72 小时仍为代码层硬规则不开放。
 * 未覆盖：真实 SQL 租约与 InnoDB 并发（见既有 e2e）；环境变量解析见 test/configuration/environment.spec.ts。
 */
const now = Date.UTC(2026, 9, 10, 12)

describe('发件箱派发：运维参数由入口注入', () => {
  const build = (settings?: { leaseSeconds: number; batchSize: number; maxAttempts: number }) => {
    const lease = vi.fn(async () => ({ leased: [], deadLettered: 0 }))
    const job = createDispatchCareOutboxJob({
      now: () => now, createLeaseOwner: () => 'lease-owner-fixture', lease,
      deliver: async () => undefined, settle: async () => true, log: () => undefined,
      ...(settings === undefined ? {} : { settings })
    })
    return { job, lease }
  }

  it('未注入时用代码默认：租约 30 秒、每批 100、最多 5 次', async () => {
    const { job, lease } = build()
    await job()
    expect(lease).toHaveBeenCalledWith({ owner: 'lease-owner-fixture', nowMs: now, leaseMs: 30_000, limit: 100, maxAttempts: 5 })
  })

  it('注入覆盖值时采用覆盖：租约 60 秒、每批 50、最多 5 次', async () => {
    const { job, lease } = build({ leaseSeconds: 60, batchSize: 50, maxAttempts: 5 })
    await job()
    expect(lease).toHaveBeenCalledWith({ owner: 'lease-owner-fixture', nowMs: now, leaseMs: 60_000, limit: 50, maxAttempts: 5 })
  })

  // 用户 2026-10-10 第三轮裁定：最大尝试次数改为运维参数（默认 5，环境变量 3–10）。
  it('最大尝试次数注入 3：领取上限与死信判定都按 3', async () => {
    const lease = vi.fn(async () => ({ leased: [{ id: '7', eventType: 'care.watering_fact_recorded.v1' as const, userRef: 'usr_dispatch_owner01', userPlantRef: 'upl_dispatch_plant01',
      payload: {}, occurredAtMs: now, attempt: 3 }], deadLettered: 0 }))
    const settle = vi.fn(async () => true)
    const job = createDispatchCareOutboxJob({ now: () => now, createLeaseOwner: () => 'lease-owner-fixture', lease,
      deliver: async () => { throw new Error('消费失败') }, settle, log: () => undefined, settings: { leaseSeconds: 30, batchSize: 100, maxAttempts: 3 } })
    await job()
    expect(lease).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 3 }))
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'dead_letter' }))
  })
})

describe('计划过期扫描：每批大小由入口注入', () => {
  it('注入 200 时每批 200；72 小时截止不变', async () => {
    const calls: Array<{ cutoffMs: number; limit: number }> = []
    const run = createExpireCarePlansJob({ now: () => now, batchSize: 200, readLongTermRules: async () => careLongTermRulesV1(), runBudgetFraction: 0.5,
      runBatch: async input => { calls.push(input); return 0 }, log: () => undefined })
    await run({ functionTimeoutMs: 60_000 })
    expect(calls).toEqual([expect.objectContaining({ limit: 200, cutoffMs: now - 72 * 3_600_000 })])
  })

  it('Repository 守卫上限为登记范围最大值 2000：2000 可执行、2001 拒绝', async () => {
    const executed: string[] = []
    const transaction = {
      transactionContext: true,
      connection: { execute: async (sql: string) => { executed.push(sql); return { affectedRows: 0, insertId: 0 } }, query: async () => { throw new Error('不应读') } }
    } as never
    await expect(expireDueCarePlans(transaction, { cutoffMs: now, nowMs: now, limit: 2000 })).resolves.toBe(0)
    expect(executed[0]).toMatch(/LIMIT 2000$/u)
    await expect(expireDueCarePlans(transaction, { cutoffMs: now, nowMs: now, limit: 2001 })).rejects.toThrow(RangeError)
    expect(executed).toHaveLength(1)
  })
})
