import { describe, expect, test, vi } from 'vitest'

import { createDispatchCareOutboxJob, type LeasedCareEvent } from '../../src/care/application/dispatch-care-outbox.js'
import { createCareOutboxDispatchEventHandler } from '../../src/care/event/care-outbox-dispatch-handler.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-timeline.md §5 与配置目录 care.outbox_dispatch（hard_rule：
 * 每批 100、租约 30 秒、第 5 次尝试仍失败进死信）。层次：L1 / unit_fake（替身领取/投递/结算端口）。
 * 未覆盖：真实 SQL 租约、SKIP LOCKED 与条件写（见 test/e2e/user-plant-timeline.mysql.spec.ts）。
 */
const now = Date.UTC(2026, 9, 10, 12)
const event = (id: string, attempt: number): LeasedCareEvent => ({
  id, eventType: 'care.watering_fact_recorded.v1', userRef: 'usr_dispatch_owner01', userPlantRef: 'upl_dispatch_plant01',
  payload: { factRef: `cft_dispatch_${id}`, occurredAt: new Date(now).toISOString(), amountMl: 200 }, occurredAtMs: now, attempt
})

function fixture(leased: LeasedCareEvent[], options: { deliver?: (value: LeasedCareEvent) => Promise<void>; settleResult?: boolean; leaseError?: boolean; deadLettered?: number } = {}) {
  const lease = vi.fn(async () => {
    if (options.leaseError) { throw new Error('SQL 原文 secret') }
    return { leased, deadLettered: options.deadLettered ?? 0 }
  })
  const deliver = vi.fn(options.deliver ?? (async () => undefined))
  const settle = vi.fn(async () => options.settleResult ?? true)
  const logs: unknown[] = []
  const job = createDispatchCareOutboxJob({ now: () => now, createLeaseOwner: () => 'lease-owner-fixture', lease, deliver, settle, log: value => { logs.push(value) } })
  return { job, lease, deliver, settle, logs }
}

describe('care 发件箱派发用例', () => {
  test('按硬规则领取：每批 100、租约 30 秒、最多 5 次；成功投递结算为 delivered', async () => {
    const f = fixture([event('1', 1), event('2', 3)])
    const summary = await f.job()
    expect(f.lease).toHaveBeenCalledWith({ owner: 'lease-owner-fixture', nowMs: now, leaseMs: 30_000, limit: 100, maxAttempts: 5 })
    expect(f.settle.mock.calls.map(call => (call as unknown as [{ id: string; outcome: string }])[0])).toEqual([
      { id: '1', owner: 'lease-owner-fixture', nowMs: now, outcome: 'delivered' },
      { id: '2', owner: 'lease-owner-fixture', nowMs: now, outcome: 'delivered' }
    ])
    expect(summary).toMatchObject({ outcome: 'completed', leasedCount: 2, deliveredCount: 2, retryCount: 0, deadLetterCount: 0, lostLeaseCount: 0 })
  })

  test('投递失败：未满 5 次回到 pending 等下次重试；第 5 次仍失败进死信', async () => {
    const f = fixture([event('a', 4), event('b', 5)], { deliver: async () => { throw new Error('消费失败') } })
    const summary = await f.job()
    expect(f.settle.mock.calls.map(call => (call as unknown as [{ id: string; outcome: string }])[0].outcome)).toEqual(['retry', 'dead_letter'])
    expect(summary).toMatchObject({ retryCount: 1, deadLetterCount: 1, deliveredCount: 0 })
  })

  test('领取阶段因租约过期且已达 5 次直接死信的条数计入死信', async () => {
    const f = fixture([], { deadLettered: 2 })
    expect(await f.job()).toMatchObject({ outcome: 'completed', leasedCount: 0, deadLetterCount: 2 })
  })

  test('结算时租约已被他人接管（条件写 0 行）：计为丢失租约，不抛出', async () => {
    const f = fixture([event('x', 1)], { settleResult: false })
    expect(await f.job()).toMatchObject({ deliveredCount: 0, lostLeaseCount: 1 })
  })

  test('领取失败：本次结束为 failed，不投递；日志只含类名与计数，不含原文或引用', async () => {
    const f = fixture([event('1', 1)], { leaseError: true })
    const summary = await f.job()
    expect(summary.outcome).toBe('failed')
    expect(f.deliver).not.toHaveBeenCalled()
    const serialized = JSON.stringify(f.logs)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('usr_dispatch_owner01')
  })

  test('事件入口忽略触发器正文，只运行一次派发并返回计数摘要', async () => {
    const f = fixture([event('1', 1)])
    const main = createCareOutboxDispatchEventHandler({ job: f.job })
    const summary = await main({ Message: 'forged', limit: 9999 }, {})
    expect(f.lease).toHaveBeenCalledOnce()
    expect(summary).toMatchObject({ deliveredCount: 1 })
    expect(JSON.stringify(summary)).not.toContain('upl_')
  })
})
