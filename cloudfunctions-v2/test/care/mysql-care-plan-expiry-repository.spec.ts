import { describe, expect, it } from 'vitest'

import { expireDueCarePlans } from '../../src/care/repository/mysql-care-plan-expiry-repository.js'

/**
 * unit_fake（L1，Repository SQL 形态）。Expected：long-term-care-contract.md §12.1/§12.2：
 * 单表条件更新 `WHERE status='planned' AND scheduled_at_ms < 截止` 作为与用户「完成/跳过」竞争的并发闸门，
 * 只把 planned 改为 expired、version+1、写 updated_at_ms，按计划时刻排序分批。
 * 替换边界：mysql2 连接为记录型替身；**不证明** InnoDB 行锁与复核语义（需真实 MySQL，见交付遗留）。
 */
const now = Date.UTC(2026, 9, 9, 4)
const cutoff = now - 72 * 3_600_000

function fakeTransaction(affectedRows: number) {
  const calls: Array<{ sql: string; parameters: readonly unknown[] }> = []
  const connection = {
    execute: async (sql: string, parameters: readonly unknown[]) => { calls.push({ sql, parameters }); return { affectedRows, insertId: 0 } },
    query: async () => { throw new Error('过期扫描不应先读后写') }
  }
  return { calls, transaction: { transactionContext: true, connection } as never }
}
const normalize = (sql: string) => sql.replace(/\s+/gu, ' ').trim()

describe('过期扫描 Repository', () => {
  it('一条条件更新：只改 planned 且早于截止的行；排序 + 批量上限', async () => {
    const { calls, transaction } = fakeTransaction(3)
    await expect(expireDueCarePlans(transaction, { cutoffMs: cutoff, nowMs: now, limit: 500 })).resolves.toBe(3)
    expect(calls).toHaveLength(1)
    const sql = normalize(calls[0]!.sql)
    expect(sql).toMatch(/^UPDATE care_plans SET /u)
    expect(sql).toContain("status = 'expired'")
    expect(sql).toContain('version = version + 1')
    expect(sql).toContain('updated_at_ms = ?')
    expect(sql).toMatch(/WHERE status = 'planned' AND scheduled_at_ms < \? ORDER BY scheduled_at_ms ASC, id ASC LIMIT 500$/u)
    expect(calls[0]!.parameters).toEqual([now, cutoff])
  })

  it('不触碰日历正文、事实、观察或任何用户/平台归属列', async () => {
    const { calls, transaction } = fakeTransaction(0)
    await expireDueCarePlans(transaction, { cutoffMs: cutoff, nowMs: now, limit: 500 })
    const sql = normalize(calls[0]!.sql)
    for (const forbidden of ['plan_payload_json', 'care_facts', 'care_environment_observations', 'care_proposals', 'reminder_jobs', 'user_internal_id', '_openid', 'JOIN']) {
      expect(sql).not.toContain(forbidden)
    }
  })

  it('无到期计划时返回 0（重复运行幂等的 Repository 侧形态）', async () => {
    const { transaction } = fakeTransaction(0)
    await expect(expireDueCarePlans(transaction, { cutoffMs: cutoff, nowMs: now, limit: 500 })).resolves.toBe(0)
  })

  // 主代理 2026-10-10 裁定：每批大小改为运维参数（默认 500，环境变量可在 100–2000 覆盖），守卫上限随之为 2000。
  it.each([0, 2001, 1.5, -1])('批量上限非法（%s）→ 拒绝且不执行 SQL', async limit => {
    const { calls, transaction } = fakeTransaction(0)
    await expect(expireDueCarePlans(transaction, { cutoffMs: cutoff, nowMs: now, limit })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('影响行数超过批量上限 → 视为读回不合法', async () => {
    const { transaction } = fakeTransaction(501)
    await expect(expireDueCarePlans(transaction, { cutoffMs: cutoff, nowMs: now, limit: 500 })).rejects.toThrow()
  })

  it('必须在显式事务内执行', async () => {
    await expect(expireDueCarePlans({ transactionContext: false } as never, { cutoffMs: cutoff, nowMs: now, limit: 500 })).rejects.toThrow(TypeError)
  })
})
