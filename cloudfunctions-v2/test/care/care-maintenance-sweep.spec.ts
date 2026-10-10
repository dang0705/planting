import { describe, expect, test } from 'vitest'

import type { CareOutboxDispatchSummary } from '../../src/care/application/dispatch-care-outbox.js'
import type { CarePlanExpiryRunSummary, ExpireCarePlansInput } from '../../src/care/application/expire-care-plans.js'
import { createCareMaintenanceSweep } from '../../src/care/application/care-maintenance-sweep.js'

/**
 * Expected 来源：long-term-care-contract.md §12.5、§13 与 user-plant-timeline.md §5（2026-10-10 用户裁决合并低频补扫 care-maintenance-sweep）：
 * 一次运行先跑发件箱补扫（循环领取直到不满一批或用完本阶段预算 = 函数超时 × 0.3），再跑过期扫描（拿到剩余时长作为它的函数超时）；
 * 发件箱阶段失败不阻断过期扫描；取不到函数超时两阶段都不启动。配置目录 care.maintenance_sweep。
 * 测试层次：L1 / unit_fake（替身两个阶段与时钟）。
 */
const summary = (leased: number, extra: Partial<CareOutboxDispatchSummary> = {}): CareOutboxDispatchSummary =>
  ({ outcome: 'completed', leasedCount: leased, deliveredCount: leased, retryCount: 0, deadLetterCount: 0, lostLeaseCount: 0, durationMs: 1, ...extra })
const expirySummary: CarePlanExpiryRunSummary = { outcome: 'drained', expiredCount: 2, batchCount: 1, cutoffAt: '2026-10-07T00:00:00.000Z', durationMs: 5 }

function fixture(batches: CareOutboxDispatchSummary[], options: { tick?: number } = {}) {
  let clock = 0
  const expiryInputs: ExpireCarePlansInput[] = []
  let outboxRuns = 0
  const sweep = createCareMaintenanceSweep({
    now: () => clock, outboxBatchSize: 100, outboxBudgetFraction: 0.3, log: () => undefined,
    dispatchOutbox: async () => { outboxRuns += 1; clock += options.tick ?? 10; return batches.shift() ?? summary(0) },
    expirePlans: async input => { expiryInputs.push(input); return expirySummary }
  })
  return { sweep, expiryInputs, runs: () => outboxRuns, advance: (ms: number) => { clock += ms } }
}

describe('合并补扫 care-maintenance-sweep', () => {
  test('发件箱循环到不满一批即清空；汇总计数；随后过期扫描拿到剩余时长', async () => {
    const f = fixture([summary(100), summary(100), summary(7)])
    const result = await f.sweep({ functionTimeoutMs: 60_000 })
    expect(f.runs()).toBe(3)
    expect(result.outbox).toMatchObject({ outcome: 'drained', runs: 3, leasedCount: 207, deliveredCount: 207 })
    expect(result.expiry).toEqual(expirySummary)
    expect(f.expiryInputs).toEqual([{ functionTimeoutMs: 60_000 - 30 }])
  })

  test('发件箱阶段用完预算（函数超时 × 0.3）即停，过期扫描照常执行', async () => {
    const f = fixture(Array.from({ length: 50 }, () => summary(100)), { tick: 4000 })
    const result = await f.sweep({ functionTimeoutMs: 60_000 })
    expect(result.outbox.outcome).toBe('deadline_reached')
    expect(f.runs()).toBe(5)
    expect(f.expiryInputs).toEqual([{ functionTimeoutMs: 40_000 }])
  })

  test('发件箱领取失败：记为 failed，不阻断过期扫描', async () => {
    const f = fixture([summary(0, { outcome: 'failed' })])
    const result = await f.sweep({ functionTimeoutMs: 60_000 })
    expect(result.outbox).toMatchObject({ outcome: 'failed', runs: 1 })
    expect(result.expiry).toEqual(expirySummary)
  })

  test('取不到函数超时：两阶段都不启动', async () => {
    const f = fixture([summary(100)])
    const result = await f.sweep({ functionTimeoutMs: null })
    expect(f.runs()).toBe(0)
    expect(f.expiryInputs).toEqual([])
    expect(result).toMatchObject({ outbox: { outcome: 'not_started', runs: 0 }, expiry: { outcome: 'not_started' } })
  })
})
