import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createCareOutboxDispatchJobFromSource } from '../../src/care/event/care-outbox-dispatch-runtime.js'
import { createCareServer } from '../../src/care/http/server.js'
import { toSqlParameters, withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createResolveGuestOrUserPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../../src/identity/repository/mysql-user-principal-repository.js'
import { findProjectRoot } from '../support/project-root.js'
import { harnessUsers, plantInsertSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness } from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL（含 029）+ 真实 care HTTP（记录浇水、完成计划写事实与事件）+ 真实派发用例
 * （与事件函数入口同一组装：租约 SQL、user-plant 时间线投影、结算条件写）+ 真实 user-plant HTTP（时间线读取、归档/恢复同事务投影）。
 * Expected：docs/backend-v2/contracts/user-plant-timeline.md（2026-10-10 用户审定与裁决）§1～§6；long-term-care-contract.md §13；
 * 配置目录 care.outbox_dispatch（每批 100、租约 30 秒、5 次后死信）。不覆盖：CloudBase 定时触发器真实触发、云端 MySQL。
 */
const day = 86_400_000
let now = Date.UTC(2026, 9, 10, 14)
const plants = { main: 'upl_timeline_main_0001', other: 'upl_timeline_other_001', foreign: 'upl_timeline_foreign01' } as const
let h: UserPlantMysqlHarness
let careServer: Server
let careUrl = ''
let ownerUserId = 0

async function care(method: string, url: string, body: unknown, key: string) {
  const response = await fetch(`${careUrl}${url}`, { method, headers: { authorization: `Bearer ${harnessUsers.ownerBearer}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() as { data?: Record<string, unknown> } }
}
const water = (ref: string, key: string, occurredAt: number, amountMl: number | null = 200) => care('POST', `/api/v2/care/user-plants/${ref}/facts`, { factType: 'watering', occurredAt: new Date(occurredAt).toISOString(), amountMl }, key)
const dispatch = () => createCareOutboxDispatchJobFromSource({ source: h.source, now: () => now, log: () => undefined })()
const timeline = (ref: string, query = '', bearer?: string) => h.call('GET', `/api/v2/user-plants/${ref}/timeline${query}`, { bearer })
const items = async (ref: string) => ((await timeline(ref)).json.data as { items: Array<Record<string, any>> }).items
const outboxStates = () => h.sql("SELECT CONCAT(event_type, '|', status, '|', attempt_count, '|', IFNULL(terminal_reason_code, '-')) FROM care_outbox ORDER BY id;")

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'timeline', now })
  h.sql(plantInsertSql(plants.main, 1, 'active', now - 30 * day) + plantInsertSql(plants.other, 1, 'active', now - 30 * day) + plantInsertSql(plants.foreign, 2, 'active', now - 30 * day))
  ownerUserId = 1
  const resolvePrincipal = createResolveGuestOrUserPrincipal({
    guestRepository: createMysqlGuestSessionRepository(h.source),
    resolveUser: createResolveUserPrincipalUseCase({ repository: { read: input => withReadConnection(h.source, connection => createMysqlUserPrincipalRepository({
      executeQuery: async (text, parameters) => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
    }).read(input)) } })
  })
  careServer = createCareServer({ connectionSource: h.source, now: () => now, resolvePrincipal, fetchRadiation: async () => null, writeAudit: () => undefined, recordRollbackFailure: () => undefined })
  await new Promise<void>(resolve => careServer.listen(0, '127.0.0.1', resolve))
  careUrl = `http://127.0.0.1:${(careServer.address() as AddressInfo).port}`
}, 180_000)

afterAll(async () => {
  await new Promise(resolve => careServer.close(resolve))
  await h.stop()
})

describe('时间线异步投影（真实 MySQL）', () => {
  test('记录浇水：同事务写 pending 事件；派发后投影为 care_watering，事件 delivered', async () => {
    const recorded = await water(plants.main, 'tl-water-key-0001', now - 2 * 3_600_000, 180)
    expect(recorded.status).toBe(200)
    expect(outboxStates()).toBe('care.watering_fact_recorded.v1|pending|0|-')
    expect(await items(plants.main)).toEqual([])
    expect(await dispatch()).toMatchObject({ outcome: 'completed', leasedCount: 1, deliveredCount: 1 })
    expect(outboxStates()).toBe('care.watering_fact_recorded.v1|delivered|1|-')
    expect(await items(plants.main)).toEqual([{ timelineItemRef: expect.stringMatching(/^tli_[a-f0-9]{40}$/u), itemType: 'care_watering', occurredAt: new Date(now - 2 * 3_600_000).toISOString(), summary: { itemType: 'care_watering', amountMl: 180 } }])
  })

  test('重复投递不重复：把已投递事件改回 pending 再派发，投影仍只有一行', async () => {
    h.sql("UPDATE care_outbox SET status = 'pending', delivered_at_ms = NULL;")
    expect(await dispatch()).toMatchObject({ deliveredCount: 1 })
    expect(await items(plants.main)).toHaveLength(1)
    expect(await dispatch()).toMatchObject({ leasedCount: 0 })
  })

  test('补录按实际发生时间排序：先记 1 小时前、再补记 3 天前，时间线倒序', async () => {
    await water(plants.main, 'tl-water-key-0002', now - 3_600_000, 100)
    await water(plants.main, 'tl-water-key-0003', now - 3 * day, null)
    await dispatch()
    const list = await items(plants.main)
    expect(list.map(item => item.occurredAt)).toEqual([now - 3_600_000, now - 2 * 3_600_000, now - 3 * day].map(ms => new Date(ms).toISOString()))
    expect(list[2]!.summary).toEqual({ itemType: 'care_watering', amountMl: null })
  })

  test('完成检查计划：plan_completed 与附带的浇水事实各投影一条；跳过计划不产生事件', async () => {
    const created = now - day
    const calendar = { title: '检查植物盆土', startAt: new Date(now).toISOString(), endAt: new Date(now + 1_800_000).toISOString(), notes: 'n' }
    h.sql(`INSERT INTO care_proposals (id, proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
      VALUES (1, 'cpr_timeline_00000001', ${ownerUserId}, (SELECT id FROM user_plants WHERE public_user_plant_id='${plants.other}'), 'watering', 'care-capability/v1', 'watering-details/v1', CAST('{}' AS JSON), 'confirmed', NULL, '${'1'.repeat(64)}', ${created}, ${created}),
             (2, 'cpr_timeline_00000002', ${ownerUserId}, (SELECT id FROM user_plants WHERE public_user_plant_id='${plants.other}'), 'watering', 'care-capability/v1', 'watering-details/v1', CAST('{}' AS JSON), 'confirmed', NULL, '${'2'.repeat(64)}', ${created}, ${created});
      INSERT INTO care_plans (id, plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
      VALUES (1, 'cpl_timeline_00000001', ${ownerUserId}, (SELECT id FROM user_plants WHERE public_user_plant_id='${plants.other}'), 1, 'check_soil', ${now}, 'planned', CAST('${JSON.stringify({ calendar, completedFactRef: null })}' AS JSON), 1, ${created}, ${created}),
             (2, 'cpl_timeline_00000002', ${ownerUserId}, (SELECT id FROM user_plants WHERE public_user_plant_id='${plants.other}'), 2, 'check_soil', ${now}, 'planned', CAST('${JSON.stringify({ calendar, completedFactRef: null })}' AS JSON), 1, ${created}, ${created});`)
    expect((await care('POST', `/api/v2/care/user-plants/${plants.other}/plans/cpl_timeline_00000001/completions`, { version: 1, outcome: 'done', watering: { occurredAt: new Date(now - 60_000).toISOString(), amountMl: 150 } }, 'tl-plan-key-00001')).status).toBe(200)
    expect((await care('POST', `/api/v2/care/user-plants/${plants.other}/plans/cpl_timeline_00000002/completions`, { version: 1, outcome: 'skipped' }, 'tl-plan-key-00002')).status).toBe(200)
    await dispatch()
    const list = await items(plants.other)
    expect(list.map(item => item.itemType).sort()).toEqual(['care_plan_completed', 'care_watering'])
    expect(list.find(item => item.itemType === 'care_plan_completed')!.summary).toEqual({ itemType: 'care_plan_completed', outcome: 'done' })
  })

  test('投递失败重试：前 4 次失败回到 pending，第 5 次仍失败进死信；恢复后不再投递死信', async () => {
    h.sql("CREATE TRIGGER trg_fail_timeline BEFORE INSERT ON user_plant_timeline_projection FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture projection failure';")
    try {
      await water(plants.main, 'tl-water-key-0010', now - 10 * 60_000, 50)
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        expect(await dispatch()).toMatchObject({ retryCount: 1 })
        expect(h.sql("SELECT CONCAT(status, '|', attempt_count) FROM care_outbox ORDER BY id DESC LIMIT 1;")).toBe(`pending|${attempt}`)
      }
      expect(await dispatch()).toMatchObject({ deadLetterCount: 1 })
      expect(h.sql("SELECT CONCAT(status, '|', attempt_count, '|', terminal_reason_code, '|', IFNULL(lease_owner, '-')) FROM care_outbox ORDER BY id DESC LIMIT 1;")).toBe('dead_letter|5|delivery_failed|-')
    } finally {
      h.sql('DROP TRIGGER trg_fail_timeline;')
    }
    expect(await dispatch()).toMatchObject({ leasedCount: 0 })
  })

  test('租约过期被接管：他人持有且已过期的 dispatching 事件被下一次运行领取并投递', async () => {
    await water(plants.main, 'tl-water-key-0020', now - 20 * 60_000, 60)
    h.sql(`UPDATE care_outbox SET status = 'dispatching', lease_owner = 'crashed-runner', lease_until_ms = ${now - 1}, attempt_count = 1 WHERE status = 'pending';`)
    expect(await dispatch()).toMatchObject({ leasedCount: 1, deliveredCount: 1 })
    expect(h.sql("SELECT CONCAT(status, '|', attempt_count) FROM care_outbox ORDER BY id DESC LIMIT 1;")).toBe('delivered|2')
  })

  test('租约未过期不被接管；已尝试 5 次且租约过期的直接死信', async () => {
    await water(plants.main, 'tl-water-key-0030', now - 30 * 60_000, 70)
    h.sql(`UPDATE care_outbox SET status = 'dispatching', lease_owner = 'live-runner', lease_until_ms = ${now + 30_000}, attempt_count = 1 WHERE status = 'pending';`)
    expect(await dispatch()).toMatchObject({ leasedCount: 0 })
    h.sql(`UPDATE care_outbox SET lease_until_ms = ${now - 1}, attempt_count = 5 WHERE lease_owner = 'live-runner';`)
    expect(await dispatch()).toMatchObject({ leasedCount: 0, deadLetterCount: 1 })
    expect(h.sql("SELECT CONCAT(status, '|', terminal_reason_code) FROM care_outbox WHERE lease_owner IS NULL ORDER BY id DESC LIMIT 1;")).toBe('dead_letter|lease_expired_max_attempts')
  })
})

describe('归档/恢复同事务投影与读取规则（真实 MySQL）', () => {
  test('归档与恢复各写一条时间线；重放不重复', async () => {
    const version = Number(h.sql(`SELECT version FROM user_plants WHERE public_user_plant_id='${plants.other}';`))
    expect((await h.call('POST', `/api/v2/user-plants/${plants.other}/archive`, { key: 'tl-archive-key-01', body: JSON.stringify({ expectedVersion: version }) })).status).toBe(200)
    now += 1000
    expect((await h.call('POST', `/api/v2/user-plants/${plants.other}/restore`, { key: 'tl-restore-key-01', body: JSON.stringify({ expectedVersion: version + 1 }) })).status).toBe(200)
    expect((await h.call('POST', `/api/v2/user-plants/${plants.other}/archive`, { key: 'tl-archive-key-01', body: JSON.stringify({ expectedVersion: version }) })).status).toBe(200)
    const list = await items(plants.other)
    expect(list.slice(0, 2).map(item => item.itemType)).toEqual(['plant_restored', 'plant_archived'])
    expect(list.filter(item => item.itemType === 'plant_archived')).toHaveLength(1)
  })

  test('游标分页：limit=1 逐页翻完不重不漏；limit=51 → 400', async () => {
    const all = (await items(plants.main)).map(item => item.timelineItemRef)
    const seen: unknown[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const response = await timeline(plants.main, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`)
      const data = response.json.data as { items: Array<Record<string, unknown>>; nextCursor: string | null }
      seen.push(...data.items.map(item => item.timelineItemRef))
      cursor = data.nextCursor
      if (cursor === null) { break }
    }
    expect(seen).toEqual(all)
    expect((await timeline(plants.main, '?limit=51')).status).toBe(400)
  })

  test('他人植物或他人会话 → 404；删除中植物 → 404', async () => {
    expect((await timeline(plants.foreign)).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await timeline(plants.main, '', harnessUsers.strangerBearer)).status).toBe(404)
    h.sql(`UPDATE user_plants SET lifecycle_status = 'deleting' WHERE public_user_plant_id = '${plants.other}';`)
    expect((await timeline(plants.other)).status).toBe(404)
    h.sql(`UPDATE user_plants SET lifecycle_status = 'active' WHERE public_user_plant_id = '${plants.other}';`)
  })

  test('脱敏：响应不含来源事实/计划引用、user_id、内部字段名', async () => {
    const response = await timeline(plants.other)
    const sourceRefs = h.sql('SELECT source_ref FROM user_plant_timeline_projection;').split('\n')
    for (const secret of [...sourceRefs, harnessUsers.ownerRef, 'user_internal_id', 'source_domain', 'projection_version']) {
      expect(response.text).not.toContain(secret)
    }
  })
})

describe('上线前历史回填脚本（本机执行验证，云端只写文件不执行）', () => {
  test('历史浇水与已完成计划回填为投影；重复执行不产生重复行；与派发结果引用一致', async () => {
    const plantId = h.sql(`SELECT id FROM user_plants WHERE public_user_plant_id='${plants.foreign}';`)
    h.sql(`INSERT INTO care_facts (fact_ref, user_internal_id, user_plant_internal_id, fact_type, occurred_at_ms, fact_payload_json, source_command_ref, created_at_ms, updated_at_ms)
      VALUES ('cft_backfill_00000001', 2, ${plantId}, 'watering', ${now - 5 * day}, CAST('{"amountMl":90}' AS JSON), 'cmd_backfill_0000001', ${now - 5 * day}, ${now - 5 * day});`)
    const script = fs.readFileSync(path.join(findProjectRoot(), 'cloudfunctions-v2/scripts/backfill-user-plant-timeline.sql'), 'utf8')
    const before = h.sql('SELECT COUNT(*) FROM user_plant_timeline_projection;')
    h.sql(script)
    const after = Number(h.sql('SELECT COUNT(*) FROM user_plant_timeline_projection;'))
    h.sql(script)
    expect(Number(h.sql('SELECT COUNT(*) FROM user_plant_timeline_projection;'))).toBe(after)
    // +3：新插入的历史浇水 + 先前两条进死信、尚未投影的浇水事实（投递失败 1 条、租约过期满次 1 条），回填同样覆盖。
    expect(after).toBe(Number(before) + 3)
    const foreignItems = (await timeline(plants.foreign, '', harnessUsers.strangerBearer)).json.data as { items: Array<Record<string, unknown>> }
    expect(foreignItems.items).toEqual([expect.objectContaining({ itemType: 'care_watering', occurredAt: new Date(now - 5 * day).toISOString(), summary: { itemType: 'care_watering', amountMl: 90 } })])
    // 已经由派发投影过的事实，回填计算出的引用与派发一致，因此不会多出一行。
    expect(Number(h.sql("SELECT COUNT(*) FROM user_plant_timeline_projection WHERE source_domain = 'care';")))
      .toBe(Number(h.sql("SELECT COUNT(*) FROM care_facts WHERE fact_type='watering';")) + Number(h.sql("SELECT COUNT(*) FROM care_plans WHERE status='completed';")))
  })
})
