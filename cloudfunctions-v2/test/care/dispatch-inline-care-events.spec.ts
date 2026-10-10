import { describe, expect, test } from 'vitest'

import { createDispatchCareOutboxJob, type LeaseCareEventsInput } from '../../src/care/application/dispatch-care-outbox.js'
import { createInlineCareEventDispatcher } from '../../src/care/application/dispatch-inline-care-events.js'

/**
 * Expected 来源：long-term-care-contract.md §13（2026-10-10 用户裁决「写入时顺带派发」）：写事务提交后在同一请求内只派发本请求新写入的事件（按 event_id），
 * 最长等待 inline_budget_ms（默认 1500）；超时、失败都不抛出、不改变响应；没有新事件不派发。
 * 测试层次：L1 / unit_fake（替身领取/投递/结算端口与派发端口）。不覆盖：真实租约 SQL 与并发（见 long-term-care-http.mysql.spec.ts）。
 */
const silent = () => undefined

describe('派发用例：只领取指定事件', () => {
  test('传入 eventIds 时领取输入带上同一组事件标识；不传时为全量补扫', async () => {
    const leases: LeaseCareEventsInput[] = []
    const job = createDispatchCareOutboxJob({ now: () => 1000, createLeaseOwner: () => 'dsp_fixture', log: silent,
      lease: async input => { leases.push(input); return { leased: [], deadLettered: 0 } }, deliver: async () => undefined, settle: async () => true })
    await job({ eventIds: ['evt_a', 'evt_b'] })
    await job()
    expect(leases[0]).toMatchObject({ eventIds: ['evt_a', 'evt_b'] })
    expect(leases[1]).not.toHaveProperty('eventIds')
  })
})

describe('同请求尽力派发', () => {
  test('没有新事件：不调用派发', async () => {
    const calls: string[][] = []
    const dispatcher = createInlineCareEventDispatcher({ budgetMs: 50, dispatch: async ids => { calls.push([...ids]) } })
    expect(await dispatcher([])).toBe('skipped')
    expect(calls).toEqual([])
  })

  test('派发在上限内完成：等待其完成后返回 completed', async () => {
    const calls: string[][] = []
    const dispatcher = createInlineCareEventDispatcher({ budgetMs: 200, dispatch: async ids => { calls.push([...ids]) } })
    expect(await dispatcher(['evt_a'])).toBe('completed')
    expect(calls).toEqual([['evt_a']])
  })

  test('派发超过上限：按上限返回 timed_out，不等它结束', async () => {
    const dispatcher = createInlineCareEventDispatcher({ budgetMs: 30, dispatch: () => new Promise(resolve => setTimeout(resolve, 500)) })
    const started = Date.now()
    expect(await dispatcher(['evt_a'])).toBe('timed_out')
    expect(Date.now() - started).toBeLessThan(400)
  })

  test('派发失败：吞掉错误返回 failed，不抛出', async () => {
    const dispatcher = createInlineCareEventDispatcher({ budgetMs: 200, dispatch: async () => { throw new Error('数据库不可用') } })
    await expect(dispatcher(['evt_a'])).resolves.toBe('failed')
  })

  test.each([0, -1, Number.NaN])('上限 %s 不合法：组装即抛错', budgetMs => {
    expect(() => createInlineCareEventDispatcher({ budgetMs, dispatch: async () => undefined })).toThrow(TypeError)
  })
})
