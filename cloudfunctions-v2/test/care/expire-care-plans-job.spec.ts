import { describe, expect, it } from 'vitest'

import { createExpireCarePlansJob, type CarePlanExpiryLogEvent } from '../../src/care/application/expire-care-plans.js'

/**
 * unit_fake（L1，用例编排）。Expected：long-term-care-contract.md §12.1/§12.5/§12.6 与配置目录
 * care.plans.expiry_grace_hours=72、care.plans.expiry_scan={每批 500、时长上限=函数超时一半}。
 * 替换边界：Repository 批次由「合同谓词模型表」替身实现（status=planned 且 scheduledAt < 截止 → expired，按时刻排序取前 N）；
 * 时钟为可控替身。真实经过：批次循环、截止时刻、时长上限、失败停止、日志白名单。
 * 未覆盖：真实 SQL 与 InnoDB 并发（见 Repository 测试与交付遗留）。
 */
const hour = 3_600_000
const start = Date.UTC(2026, 9, 9, 4)
const cutoff = start - 72 * hour

type Row = { planRef: string; userInternalId: string; status: string; scheduledAtMs: number; version: number }

/** 合同谓词模型：一批条件更新。 */
function modelTable(rows: Row[]) {
  const calls: Array<{ cutoffMs: number; nowMs: number; limit: number }> = []
  const runBatch = async (input: { cutoffMs: number; nowMs: number; limit: number }) => {
    calls.push(input)
    const due = rows.filter(row => row.status === 'planned' && row.scheduledAtMs < input.cutoffMs)
      .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs).slice(0, input.limit)
    for (const row of due) { row.status = 'expired'; row.version += 1 }
    return due.length
  }
  return { rows, calls, runBatch }
}

function clock(stepMs = 0) {
  let current = start
  return () => { const value = current; current += stepMs; return value }
}

function job(runBatch: (input: { cutoffMs: number; nowMs: number; limit: number }) => Promise<number>, now = clock()) {
  const logs: CarePlanExpiryLogEvent[] = []
  return { logs, run: createExpireCarePlansJob({ now, runBatch, log: event => { logs.push(event) } }) }
}

const plan = (index: number, status: string, scheduledAtMs: number): Row =>
  ({ planRef: `cpl_secret_plan_${String(index).padStart(6, '0')}`, userInternalId: `9${index}`, status, scheduledAtMs, version: 1 })

describe('计划过期扫描用例', () => {
  it('到期 planned → expired；未到期、恰好 72 小时、已完成/已跳过/已过期不动', async () => {
    const table = modelTable([
      plan(1, 'planned', cutoff - 1),
      plan(2, 'planned', cutoff),
      plan(3, 'planned', start),
      plan(4, 'completed', cutoff - hour),
      plan(5, 'cancelled', cutoff - hour),
      plan(6, 'expired', cutoff - hour)
    ])
    const { run } = job(table.runBatch)
    const summary = await run({ functionTimeoutMs: 60_000 })
    expect(summary).toEqual({ outcome: 'drained', expiredCount: 1, batchCount: 1, cutoffAt: new Date(cutoff).toISOString(), durationMs: 0 })
    expect(table.rows.map(row => [row.status, row.version])).toEqual([['expired', 2], ['planned', 1], ['planned', 1], ['completed', 1], ['cancelled', 1], ['expired', 1]])
    expect(table.calls).toEqual([{ cutoffMs: cutoff, nowMs: start, limit: 500 }])
  })

  it('分批：每批 500，直到某批不足 500 即清空', async () => {
    const table = modelTable(Array.from({ length: 1120 }, (_, index) => plan(index, 'planned', cutoff - 1 - index)))
    const { run } = job(table.runBatch)
    const summary = await run({ functionTimeoutMs: 60_000 })
    expect(summary).toMatchObject({ outcome: 'drained', expiredCount: 1120, batchCount: 3 })
    expect(table.calls.map(call => call.limit)).toEqual([500, 500, 500])
    expect(new Set(table.calls.map(call => call.cutoffMs))).toEqual(new Set([cutoff]))
    expect(table.rows.every(row => row.status === 'expired')).toBe(true)
  })

  it('恰好 500 条：第二批返回 0 后结束', async () => {
    const table = modelTable(Array.from({ length: 500 }, (_, index) => plan(index, 'planned', cutoff - 1)))
    const { run } = job(table.runBatch)
    expect(await run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'drained', expiredCount: 500, batchCount: 2 })
  })

  it('重复运行幂等：第二次不再改写任何行', async () => {
    const table = modelTable([plan(1, 'planned', cutoff - 1), plan(2, 'planned', cutoff - 2)])
    const { run } = job(table.runBatch)
    await run({ functionTimeoutMs: 60_000 })
    const versions = table.rows.map(row => row.version)
    expect(await run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'drained', expiredCount: 0, batchCount: 1 })
    expect(table.rows.map(row => row.version)).toEqual(versions)
  })

  it('并发（用户先完成）：扫描前已变为 completed 的计划不会被改成 expired', async () => {
    const rows = [plan(1, 'planned', cutoff - 1), plan(2, 'planned', cutoff - 2)]
    const table = modelTable(rows)
    const raced = async (input: { cutoffMs: number; nowMs: number; limit: number }) => {
      rows[0]!.status = 'completed'
      rows[0]!.version += 1
      return table.runBatch(input)
    }
    const { run } = job(raced)
    expect(await run({ functionTimeoutMs: 60_000 })).toMatchObject({ expiredCount: 1 })
    expect(rows.map(row => [row.status, row.version])).toEqual([['completed', 2], ['expired', 2]])
  })

  it('到达时长上限（函数超时一半）后不再开新批次', async () => {
    const table = modelTable(Array.from({ length: 2000 }, (_, index) => plan(index, 'planned', cutoff - 1 - index)))
    // 每次读时钟前进 10 秒；超时 60 秒 → 上限 30 秒。
    const { run } = job(table.runBatch, clock(10_000))
    const summary = await run({ functionTimeoutMs: 60_000 })
    expect(summary.outcome).toBe('deadline_reached')
    expect(summary.batchCount).toBeGreaterThan(0)
    expect(summary.expiredCount).toBe(summary.batchCount * 500)
    expect(table.rows.filter(row => row.status === 'planned').length).toBe(2000 - summary.expiredCount)
  })

  it('取不到函数超时 → not_started，不执行任何批次', async () => {
    const table = modelTable([plan(1, 'planned', cutoff - 1)])
    const { run, logs } = job(table.runBatch)
    expect(await run({ functionTimeoutMs: null })).toEqual({ outcome: 'not_started', expiredCount: 0, batchCount: 0, cutoffAt: null, durationMs: 0 })
    expect(table.calls).toHaveLength(0)
    expect(logs.at(-1)).toMatchObject({ event: 'care_plan_expiry_run', outcome: 'not_started' })
  })

  it('数据库失败恢复：失败批停止本次运行、已提交批次保留，不抛出；下次运行补齐', async () => {
    const table = modelTable(Array.from({ length: 700 }, (_, index) => plan(index, 'planned', cutoff - 1 - index)))
    let call = 0
    const flaky = async (input: { cutoffMs: number; nowMs: number; limit: number }) => {
      call += 1
      if (call === 2) { throw Object.assign(new Error("ER_LOCK_WAIT_TIMEOUT: UPDATE care_plans ... user_internal_id = 91 openid=o_wx_secret"), { name: 'DatabaseError' }) }
      return table.runBatch(input)
    }
    const first = job(flaky)
    expect(await first.run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'failed', expiredCount: 500, batchCount: 1 })
    expect(first.logs.map(event => event.event)).toEqual(['care_plan_expiry_batch_failed', 'care_plan_expiry_run'])
    expect(first.logs[0]).toEqual({ event: 'care_plan_expiry_batch_failed', errorName: 'DatabaseError' })
    const second = job(table.runBatch)
    expect(await second.run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'drained', expiredCount: 200 })
    expect(table.rows.every(row => row.status === 'expired')).toBe(true)
  })

  it('批次返回非法影响行数 → failed（不累计）', async () => {
    const { run } = job(async () => 501)
    expect(await run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'failed', expiredCount: 0, batchCount: 0 })
  })

  it('日志与返回值只含计数与时刻：无计划引用、用户主键、平台标识或错误原文', async () => {
    const table = modelTable(Array.from({ length: 3 }, (_, index) => plan(index, 'planned', cutoff - 1)))
    let call = 0
    const { run, logs } = job(async input => {
      call += 1
      if (call === 2) { throw new Error('user_internal_id=93 cpl_secret_plan_000002 oWx_openid_secret') }
      return table.runBatch({ ...input, limit: 1 }).then(() => 500)
    })
    const summary = await run({ functionTimeoutMs: 60_000 })
    const text = JSON.stringify({ summary, logs })
    for (const forbidden of ['cpl_secret_plan', 'user_internal_id', 'openid', 'oWx', '93', 'UPDATE']) { expect(text).not.toContain(forbidden) }
    for (const event of logs) {
      const allowed = event.event === 'care_plan_expiry_run'
        ? ['event', 'outcome', 'expiredCount', 'batchCount', 'cutoffAt', 'durationMs']
        : ['event', 'errorName']
      expect(Object.keys(event).sort()).toEqual([...allowed].sort())
    }
  })
})
