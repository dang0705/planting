import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { harnessUsers, plantInsertSql, publishedIdentitiesSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness } from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL + 真实 user-plant HTTP 服务 + 真实 plant-knowledge 公开准入 SQL。
 * Expected：docs/backend-v2/contracts/user-plant-identity-confirmation.md（2026-10-10 用户审定冻结）§1～§4。
 * 不覆盖：CloudBase 网关、云端 MySQL、识别候选来源（本期未开放）。
 */
const now = Date.UTC(2026, 9, 10, 9)
const identityA = 'pid_harness_identity_a1'
const identityB = 'pid_harness_identity_b1'
const unpublished = 'pid_harness_unpublished'
const plants = { main: 'upl_identity_main_0001', archived: 'upl_identity_archived01', deleting: 'upl_identity_deleting01', foreign: 'upl_identity_foreign001', race: 'upl_identity_race_00001' } as const
let h: UserPlantMysqlHarness

const confirm = (ref: string, body: Record<string, unknown>, key: string, bearer?: string) =>
  h.call('POST', `/api/v2/user-plants/${ref}/identity-confirmations`, { bearer, key, body: JSON.stringify({ source: { type: 'user_search' }, ...body }) })
const plantState = (ref: string) => h.sql(`SELECT CONCAT(p.lifecycle_status, ':', p.current_identity_status, ':', IFNULL(i.public_identity_ref, '-'), ':', p.version)
  FROM user_plants p LEFT JOIN plant_identities i ON i.id = p.confirmed_identity_internal_id WHERE p.public_user_plant_id = '${ref}';`)
const history = (ref: string) => h.sql(`SELECT CONCAT(i.public_identity_ref, ':', hst.history_status, ':', hst.source_type) FROM user_plant_identity_history hst
  JOIN user_plants p ON p.id = hst.user_plant_internal_id JOIN plant_identities i ON i.id = hst.plant_identity_internal_id
  WHERE p.public_user_plant_id = '${ref}' ORDER BY hst.id;`)

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'identity', now })
  h.sql(publishedIdentitiesSql([{ ref: identityA, published: true }, { ref: identityB, published: true }, { ref: unpublished, published: false }])
    + plantInsertSql(plants.main, 1, 'active', 1000) + plantInsertSql(plants.archived, 1, 'archived', 1000)
    + plantInsertSql(plants.deleting, 1, 'deleting', 1000) + plantInsertSql(plants.foreign, 2, 'active', 1000) + plantInsertSql(plants.race, 1, 'active', 1000))
}, 180_000)

afterAll(async () => { await h.stop() })

describe('POST …/identity-confirmations（真实 MySQL）', () => {
  test('首次确认：200 confirmed 投影、版本 +1、追加一条 confirmed 历史；单株读取一致；不写品种绑定', async () => {
    const response = await confirm(plants.main, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-key-0000001')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ user_plant_id: plants.main, identityStatus: 'confirmed', confirmedIdentityRef: identityA, version: 2, updatedAt: new Date(now).toISOString() })
    expect(plantState(plants.main)).toBe(`active:confirmed:${identityA}:2`)
    expect(history(plants.main)).toBe(`${identityA}:confirmed:user`)
    expect((await h.call('GET', `/api/v2/user-plants/${plants.main}`)).json).toEqual(response.json)
    expect(h.sql('SELECT COUNT(*) FROM user_plant_catalog_bindings;')).toBe('0')
  })

  test('同键同参重放原结果；同键异参 409 IDEMPOTENCY_CONFLICT；状态不变', async () => {
    const replay = await confirm(plants.main, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-key-0000001')
    expect(replay.status).toBe(200)
    expect(replay.json.data).toMatchObject({ version: 2, confirmedIdentityRef: identityA })
    expect((await confirm(plants.main, { expectedVersion: 1, plantIdentityRef: identityB }, 'identity-key-0000001')).json.error?.type).toBe('IDEMPOTENCY_CONFLICT')
    expect(plantState(plants.main)).toBe(`active:confirmed:${identityA}:2`)
  })

  test('重复确认同一身份（新键、当前版本）：200 当前投影，不涨版本、不写历史', async () => {
    const response = await confirm(plants.main, { expectedVersion: 2, plantIdentityRef: identityA }, 'identity-key-0000002')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ version: 2, confirmedIdentityRef: identityA })
    expect(plantState(plants.main)).toBe(`active:confirmed:${identityA}:2`)
    expect(history(plants.main)).toBe(`${identityA}:confirmed:user`)
  })

  test('改确认为另一身份：旧历史 superseded、新历史 confirmed、版本 +1', async () => {
    const response = await confirm(plants.main, { expectedVersion: 2, plantIdentityRef: identityB }, 'identity-key-0000003')
    expect(response.json.data).toMatchObject({ confirmedIdentityRef: identityB, version: 3 })
    expect(plantState(plants.main)).toBe(`active:confirmed:${identityB}:3`)
    expect(history(plants.main).split('\n')).toEqual([`${identityA}:superseded:user`, `${identityB}:confirmed:user`])
  })

  test('改回曾经确认过的身份 A：再追加一条 confirmed（来源引用每次不同，不撞唯一约束）', async () => {
    const response = await confirm(plants.main, { expectedVersion: 3, plantIdentityRef: identityA }, 'identity-key-0000004')
    expect(response.status).toBe(200)
    expect(history(plants.main).split('\n')).toEqual([`${identityA}:superseded:user`, `${identityB}:superseded:user`, `${identityA}:confirmed:user`])
  })

  test('版本过期 → 409 USER_PLANT_VERSION_CONFLICT，零写入', async () => {
    const before = history(plants.main)
    expect((await confirm(plants.main, { expectedVersion: 1, plantIdentityRef: identityB }, 'identity-key-0000005')).json.error?.type).toBe('USER_PLANT_VERSION_CONFLICT')
    expect(plantState(plants.main)).toBe(`active:confirmed:${identityA}:4`)
    expect(history(plants.main)).toBe(before)
  })

  test('未发布身份 / 不存在身份 → 404 NOT_FOUND，零写入', async () => {
    expect((await confirm(plants.race, { expectedVersion: 1, plantIdentityRef: unpublished }, 'identity-key-0000006')).json.error?.type).toBe('NOT_FOUND')
    expect((await confirm(plants.race, { expectedVersion: 1, plantIdentityRef: 'pid_harness_missing01' }, 'identity-key-0000007')).json.error?.type).toBe('NOT_FOUND')
    expect(plantState(plants.race)).toBe('active:unidentified:-:1')
  })

  test('归档植物 → 409 USER_PLANT_ARCHIVED；删除中/他人植物 → 404 USER_PLANT_NOT_FOUND；均零写入', async () => {
    expect((await confirm(plants.archived, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-key-0000008')).json.error?.type).toBe('USER_PLANT_ARCHIVED')
    expect((await confirm(plants.deleting, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-key-0000009')).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await confirm(plants.foreign, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-key-0000010')).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await confirm(plants.main, { expectedVersion: 4, plantIdentityRef: identityB }, 'identity-key-0000011', harnessUsers.strangerBearer)).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect(plantState(plants.archived)).toBe('archived:unidentified:-:1')
    expect(plantState(plants.foreign)).toBe('active:unidentified:-:1')
    expect(h.sql(`SELECT COUNT(*) FROM user_plant_identity_history hst JOIN user_plants p ON p.id = hst.user_plant_internal_id WHERE p.public_user_plant_id IN ('${plants.archived}', '${plants.deleting}', '${plants.foreign}');`)).toBe('0')
  })

  test('两个请求用不同键、同一旧版本并发确认不同身份：只有一个成功，历史只有一条 confirmed', async () => {
    const results = await Promise.all([
      confirm(plants.race, { expectedVersion: 1, plantIdentityRef: identityA }, 'identity-race-key-001'),
      confirm(plants.race, { expectedVersion: 1, plantIdentityRef: identityB }, 'identity-race-key-002')
    ])
    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    expect(h.sql(`SELECT COUNT(*) FROM user_plant_identity_history hst JOIN user_plants p ON p.id = hst.user_plant_internal_id WHERE p.public_user_plant_id = '${plants.race}' AND hst.history_status = 'confirmed';`)).toBe('1')
    expect(plantState(plants.race)).toMatch(/^active:confirmed:pid_harness_identity_[ab]1:2$/u)
  })

  test('脱敏：响应与审计不含 user_id、Bearer、幂等键、内部主键字段名或确认来源引用', async () => {
    const response = await confirm(plants.main, { expectedVersion: 4, plantIdentityRef: identityB }, 'identity-key-redact01')
    const sourceRefs = h.sql('SELECT source_ref FROM user_plant_identity_history;').split('\n')
    const observed = response.text + JSON.stringify(h.audits)
    for (const secret of [harnessUsers.ownerRef, harnessUsers.ownerBearer, 'identity-key-redact01', 'user_internal_id', ...sourceRefs]) {
      expect(observed).not.toContain(secret)
    }
    expect(sourceRefs.every(ref => /^idc_[A-Za-z0-9_-]{8,60}$/u.test(ref))).toBe(true)
  })
})
