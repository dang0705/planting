import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createInlineCareEventDispatcher } from '../../src/care/application/dispatch-inline-care-events.js'
import { createCareMaintenanceSweepFromSource, createInlineCareEventDispatcherFromSource } from '../../src/care/event/care-outbox-dispatch-runtime.js'
import { createCareServer, type CareServerDependencies } from '../../src/care/http/server.js'
import { toSqlParameters, withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../../src/identity/repository/mysql-user-principal-repository.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'
import { harnessUsers, plantInsertSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness } from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL + 真实 care HTTP（记录浇水、完成计划）+ 真实同请求派发组装（与 care 入口同一 helper：按 event_id 领取、
 * 真实租约 SQL、user-plant 时间线投影、条件结算）+ 真实合并补扫组装（与 care-maintenance-sweep 入口同一 helper）+ 真实 user-plant 时间线读取。
 * Expected：long-term-care-contract.md §12.3、§12.5、§13 与 user-plant-timeline.md §5（2026-10-10 用户裁决：写入时顺带派发 + 合并低频补扫 + 完成时实时过期判定）。
 * 替换边界：失败/超时场景用替身派发端口；时钟固定。不覆盖：CloudBase 定时触发器真实触发、云端 TDSQL-C 自动暂停与计费。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 10, 14)
const plants = { main: 'upl_inline_main_00001', other: 'upl_inline_other_0001' } as const
let h: UserPlantMysqlHarness
const servers: Server[] = []
const urls: Record<'inline' | 'failing' | 'slow', string> = { inline: '', failing: '', slow: '' }

async function care(base: string, url: string, body: unknown, key: string) {
  const started = Date.now()
  const response = await fetch(`${base}${url}`, { method: 'POST', headers: { authorization: `Bearer ${harnessUsers.ownerBearer}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() as { data?: Record<string, unknown>; error?: { type: string } }, elapsedMs: Date.now() - started }
}
const water = (base: string, ref: string, key: string, occurredAt: number, amountMl = 120) =>
  care(base, `/api/v2/care/user-plants/${ref}/facts`, { factType: 'watering', occurredAt: new Date(occurredAt).toISOString(), amountMl }, key)
const items = async (ref: string) => ((await h.call('GET', `/api/v2/user-plants/${ref}/timeline`)).json.data as { items: Array<Record<string, unknown>> }).items
const outbox = () => h.sql("SELECT CONCAT(status, '|', attempt_count) FROM care_outbox ORDER BY id;")
const sweep = () => createCareMaintenanceSweepFromSource({ source: h.source, now: () => now, outboxBudgetFraction: 0.3, expiryBatchSize: 500, runBudgetFraction: 0.5,
  readLongTermRules: fixturePolicyPorts().readLongTermRules, log: () => undefined })({ functionTimeoutMs: 60_000 })

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'inline', now })
  h.sql(plantInsertSql(plants.main, 1, 'active', now - 30 * 24 * hour) + plantInsertSql(plants.other, 1, 'active', now - 30 * 24 * hour))
  const resolvePrincipal = createResolveGuestOrUserPrincipal({
    guestRepository: createMysqlGuestSessionRepository(h.source),
    resolveUser: createResolveUserPrincipalUseCase({ repository: { read: input => withReadConnection(h.source, connection => createMysqlUserPrincipalRepository({
      executeQuery: async (text, parameters) => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
    }).read(input)) } })
  })
  const base: CareServerDependencies = { ...fixturePolicyPorts(), connectionSource: h.source, now: () => now, resolvePrincipal, fetchRadiation: async () => null,
    writeAudit: () => undefined, recordRollbackFailure: () => undefined }
  const variants = {
    // 与 care 入口相同的组装：默认上限 1500 毫秒。
    inline: createInlineCareEventDispatcherFromSource({ source: h.source, now: () => now, budgetMs: 1500, log: () => undefined }),
    failing: async () => { throw new Error('fixture inline dispatch failure') },
    slow: createInlineCareEventDispatcher({ budgetMs: 100, dispatch: () => new Promise<void>(resolve => setTimeout(resolve, 3000)) })
  }
  for (const [name, dispatchCreatedEvents] of Object.entries(variants) as Array<[keyof typeof urls, NonNullable<CareServerDependencies['dispatchCreatedEvents']>]>) {
    const server = createCareServer({ ...base, dispatchCreatedEvents })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    urls[name] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
}, 180_000)
afterAll(async () => {
  for (const server of servers) { await new Promise(resolve => server.close(resolve)) }
  await h.stop()
})

describe('写入时顺带派发（真实 MySQL）', () => {
  test('记录浇水：同请求派发成功 → 响应后时间线立即可见，事件 delivered 且只尝试 1 次', async () => {
    const response = await water(urls.inline, plants.main, 'inline-key-000001', now - hour)
    expect(response.status).toBe(200)
    expect(outbox()).toBe('delivered|1')
    expect(await items(plants.main)).toEqual([expect.objectContaining({ itemType: 'care_watering', occurredAt: new Date(now - hour).toISOString() })])
  })

  test('同键重放：不新写事件、不再派发，响应与首次一致', async () => {
    const first = await water(urls.inline, plants.main, 'inline-key-000002', now - 2 * hour)
    const replay = await water(urls.inline, plants.main, 'inline-key-000002', now - 2 * hour)
    expect(replay.body).toEqual(first.body)
    expect(h.sql('SELECT COUNT(*) FROM care_outbox;')).toBe('2')
    expect(outbox().split('\n')).toEqual(['delivered|1', 'delivered|1'])
  })

  test('派发失败：响应状态与正文不变（与成功路径同形），事件留 pending；合并补扫后可见', async () => {
    h.sql('DELETE FROM user_plant_timeline_projection; DELETE FROM care_outbox;')
    const response = await water(urls.failing, plants.other, 'inline-key-000010', now - hour, 90)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { factRef: expect.stringMatching(/^cft_/u), factType: 'watering', occurredAt: new Date(now - hour).toISOString(), amountMl: 90 } })
    expect(outbox()).toBe('pending|0')
    expect(await items(plants.other)).toEqual([])
    const result = await sweep()
    expect(result.outbox).toMatchObject({ outcome: 'drained', deliveredCount: 1 })
    expect(result.expiry).toMatchObject({ outcome: 'drained' })
    expect(outbox()).toBe('delivered|1')
    expect(await items(plants.other)).toHaveLength(1)
  })

  test('派发超过上限：响应按上限返回（远小于派发耗时），不改变响应', async () => {
    const response = await water(urls.slow, plants.other, 'inline-key-000011', now - 3 * hour)
    expect(response.status).toBe(200)
    expect(response.elapsedMs).toBeLessThan(1500)
  })

  test('并发：同请求派发与补扫竞争同一事件 → 只投递一次，时间线一行', async () => {
    h.sql('DELETE FROM user_plant_timeline_projection; DELETE FROM care_outbox;')
    await water(urls.failing, plants.other, 'inline-key-000020', now - 4 * hour)
    const eventId = h.sql('SELECT event_id FROM care_outbox;')
    const inline = createInlineCareEventDispatcherFromSource({ source: h.source, now: () => now, budgetMs: 3000, log: () => undefined })
    const [, swept] = await Promise.all([inline([eventId]), sweep()])
    expect(outbox()).toBe('delivered|1')
    expect(await items(plants.other)).toHaveLength(1)
    expect(swept.outbox.deliveredCount).toBeLessThanOrEqual(1)
  })
})

describe('完成计划时实时过期判定（补扫低频后语义不变）', () => {
  const insertPlan = (planRef: string, scheduledAtMs: number) => {
    const created = now - 10 * 24 * hour
    const calendar = { title: '检查植物盆土', startAt: new Date(scheduledAtMs).toISOString(), endAt: new Date(scheduledAtMs + 1_800_000).toISOString(), notes: 'n' }
    h.sql(`INSERT INTO care_proposals (proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
      SELECT 'cpr_${planRef.slice(4)}', 1, p.id, 'watering', 'care-capability/v1', 'watering-details/v1', CAST('{}' AS JSON), 'confirmed', NULL, SHA2('${planRef}', 256), ${created}, ${created} FROM user_plants p WHERE p.public_user_plant_id = '${plants.main}';
      INSERT INTO care_plans (plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
      SELECT '${planRef}', 1, p.id, (SELECT id FROM care_proposals WHERE proposal_ref = 'cpr_${planRef.slice(4)}'), 'check_soil', ${scheduledAtMs}, 'planned', CAST('${JSON.stringify({ calendar, completedFactRef: null })}' AS JSON), 1, ${created}, ${created}
      FROM user_plants p WHERE p.public_user_plant_id = '${plants.main}';`)
  }
  const complete = (planRef: string, key: string) => care(urls.inline, `/api/v2/care/user-plants/${plants.main}/plans/${planRef}/completions`, { version: 1, outcome: 'skipped' }, key)

  test('已超 72 小时但尚未被补扫：完成实时返回 409 CARE_PLAN_EXPIRED，计划与事实不变；补扫后标为 expired', async () => {
    insertPlan('cpl_inline_overdue_001', now - 72 * hour - 1)
    const response = await complete('cpl_inline_overdue_001', 'inline-plan-key-01')
    expect(response.status).toBe(409)
    expect(response.body.error?.type).toBe('CARE_PLAN_EXPIRED')
    expect(h.sql("SELECT CONCAT(status, '|', version) FROM care_plans WHERE plan_ref = 'cpl_inline_overdue_001';")).toBe('planned|1')
    await sweep()
    expect(h.sql("SELECT status FROM care_plans WHERE plan_ref = 'cpl_inline_overdue_001';")).toBe('expired')
  })

  test('恰好 72 小时：不过期，可以完成', async () => {
    insertPlan('cpl_inline_boundary01', now - 72 * hour)
    expect((await complete('cpl_inline_boundary01', 'inline-plan-key-02')).status).toBe(200)
  })
})
