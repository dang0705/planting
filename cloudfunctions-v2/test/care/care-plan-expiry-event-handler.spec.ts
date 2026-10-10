import { describe, expect, it } from 'vitest'

import { createCarePlanExpiryEventHandler } from '../../src/care/event/care-plan-expiry-handler.js'

/**
 * unit_fake（L1，事件函数入口适配）。Expected：long-term-care-contract.md §12.5/§12.7：定时触发的事件函数
 * `exports.main(event, context)`；函数超时取运行时上下文 `time_limit_in_ms`，取不到交给用例按 not_started 处理；
 * 触发事件正文不得改变截止时刻、批量等已冻结参数；返回值只含计数摘要。
 * 替换边界：扫描用例为替身。未覆盖：CloudBase 真实上下文字段（部署后读回验证，见交付遗留）。
 */
const summary = { outcome: 'drained', expiredCount: 2, batchCount: 1, cutoffAt: '2026-10-06T04:00:00.000Z', durationMs: 5 } as const

describe('care-plan-expiry 事件入口', () => {
  it('把上下文函数超时传给用例，并原样返回计数摘要', async () => {
    const inputs: unknown[] = []
    const handler = createCarePlanExpiryEventHandler({ job: async input => { inputs.push(input); return summary } })
    await expect(handler({ Type: 'Timer', TriggerName: 'care-plan-expiry-hourly', Time: '2026-10-09T04:00:00Z' }, { time_limit_in_ms: 60_000 })).resolves.toEqual(summary)
    expect(inputs).toEqual([{ functionTimeoutMs: 60_000 }])
  })

  it.each([undefined, null, {}, { time_limit_in_ms: '60000' }, { time_limit_in_ms: 0 }, { time_limit_in_ms: -5 }, { time_limit_in_ms: 1.5 }])('上下文超时不可用（%j）→ functionTimeoutMs=null', async context => {
    const inputs: unknown[] = []
    const handler = createCarePlanExpiryEventHandler({ job: async input => { inputs.push(input); return summary } })
    await handler({}, context)
    expect(inputs).toEqual([{ functionTimeoutMs: null }])
  })

  it('事件正文中的 cutoff/limit/now 等字段被忽略', async () => {
    const inputs: unknown[] = []
    const handler = createCarePlanExpiryEventHandler({ job: async input => { inputs.push(input); return summary } })
    await handler({ cutoffMs: 0, limit: 100000, nowMs: 1, graceHours: 1 }, { time_limit_in_ms: 60_000 })
    expect(inputs).toEqual([{ functionTimeoutMs: 60_000 }])
  })
})
