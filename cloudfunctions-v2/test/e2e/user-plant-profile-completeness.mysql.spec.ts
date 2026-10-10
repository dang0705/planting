import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cityProfilesSql, harnessUsers, plantInsertSql, profileProgressPoliciesSql, profileWritePoliciesSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness
} from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL（含 030）+ 真实 user-plant HTTP（真实会话、真实策略发布读取：user-plant/profile_progress 与
 * care/mvp_watering v3 正文、真实档案/环境/品种绑定读回）。
 * Expected：docs/backend-v2/contracts/user-plant-profile-completeness.md §1～§3、§6；user-plant-environment-profile.md plantLight；
 * user-plant-cover-asset.md §2.1（2026-10-10 用户审定与追加）。
 * 不覆盖：CloudBase 网关、云端 MySQL、真实云存储上传、主代理的线上策略发布。
 */
const now = Date.UTC(2026, 9, 10, 12)
const day = 86_400_000
const plants = { main: 'upl_prog_main_000001', full: 'upl_prog_full_000001', archived: 'upl_prog_archived_01', deleting: 'upl_prog_deleting_01', foreign: 'upl_prog_foreign_001' } as const
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 12, potBottomDiameterCm: null, potHeightCm: null }
const fullGroups = {
  measuredPot: pot, substrate: { materials: ['general'], primaryMaterial: null }, location: { cityRef: 'chongqing', placement: 'indoor' },
  lighting: { windowFacing: 'S' }, ventilation: { airExchange: 'occasional', localAirflow: 'none', directBlowing: null }
}
const freshLight = { lux: 1800, measuredAt: new Date(now - 2 * day).toISOString(), source: 'meter' }
let h: UserPlantMysqlHarness

const patch = (ref: string, body: Record<string, unknown>, key: string) => h.call('PATCH', `/api/v2/user-plants/${ref}`, { key, body: JSON.stringify(body) })
const get = (ref: string) => h.call('GET', `/api/v2/user-plants/${ref}`)
const versionOf = (ref: string) => Number(h.sql(`SELECT version FROM user_plants WHERE public_user_plant_id='${ref}';`))
const lightColumns = (ref: string) => h.sql(`SELECT CONCAT(IFNULL(CAST(c.plant_light_lux AS CHAR), '-'), '|', IFNULL(CAST(c.plant_light_measured_at_ms AS CHAR), '-'), '|', IFNULL(c.plant_light_source, '-'))
  FROM user_plant_care_contexts c JOIN user_plants p ON p.id = c.user_plant_internal_id WHERE p.public_user_plant_id = '${ref}';`)
const bindCatalog = (ref: string) => h.sql(`INSERT INTO user_plant_catalog_bindings (binding_ref, user_internal_id, user_plant_internal_id, catalog_taxon_ref, bound_at_ms, created_at_ms, updated_at_ms)
  SELECT CONCAT('cbd_', p.public_user_plant_id), p.user_internal_id, p.id, 'https://tropicals.cn/species/epipremnum-aureum', ${now - day}, ${now - day}, ${now - day} FROM user_plants p WHERE p.public_user_plant_id = '${ref}';`)

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'progress', now })
  h.sql(profileWritePoliciesSql(now - 3_600_000) + cityProfilesSql([{ code: 'chongqing', lat: 29.563, lon: 106.5516 }])
    + plantInsertSql(plants.main, 1, 'active', 1000) + plantInsertSql(plants.full, 1, 'active', 2000) + plantInsertSql(plants.archived, 1, 'archived', 3000)
    + plantInsertSql(plants.deleting, 1, 'deleting', 4000) + plantInsertSql(plants.foreign, 2, 'active', 5000))
}, 180_000)
afterAll(async () => { await h.stop() })

describe('档案完整度（真实 MySQL + 真实策略发布）', () => {
  test('规则未发布：单株、列表不带完整度字段，接口仍 200', async () => {
    const single = await get(plants.main)
    expect(single.status).toBe(200)
    expect(single.json.data).not.toHaveProperty('completeness')
    const listed = (await h.call('GET', '/api/v2/user-plants')).json.data as { items: Array<Record<string, unknown>> }
    expect(listed.items.every(item => !('completenessPercent' in item))).toBe(true)
  })

  test('发布后：空档案 0 分 starter，缺失项按权重降序，下一步推荐品种绑定', async () => {
    h.sql(profileProgressPoliciesSql(now - 3_600_000))
    const completeness = (await get(plants.main)).json.data?.completeness as Record<string, any>
    expect(completeness).toMatchObject({ percent: 0, level: 'starter', doneItems: [], nextRecommended: 'catalog_binding' })
    expect(completeness.missingItems.map((item: { code: string }) => item.code)).toEqual(['catalog_binding', 'measured_pot', 'substrate', 'location', 'plant_light', 'ventilation', 'lighting'])
  })

  test('PATCH 保存 Lux：响应带 plantLight 与 completeness（plant_light 已完成）；库内三列读回；GET 与 PATCH 一致；版本 +1', async () => {
    const response = await patch(plants.main, { version: 1, plantLight: freshLight }, 'prog-key-000001')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ version: 2, profile: { nickname: '', plantLight: freshLight }, completeness: { percent: 10, doneItems: ['plant_light'] } })
    expect(lightColumns(plants.main)).toBe(`1800|${now - 2 * day}|meter`)
    expect((await get(plants.main)).json).toEqual(response.json)
    expect(versionOf(plants.main)).toBe(2)
  })

  test.each([
    ['测量时间晚于现在', { ...freshLight, measuredAt: new Date(now + 60_000).toISOString() }],
    ['照度为负', { ...freshLight, lux: -1 }],
    ['来源未知', { ...freshLight, source: 'guess' }],
    ['夹带额外字段', { ...freshLight, validUntil: new Date(now).toISOString() }],
    ['时间不是 UTC', { ...freshLight, measuredAt: '2026-10-08T20:00:00+08:00' }]
  ])('plantLight %s → 400，零写入', async (name, plantLight) => {
    const response = await patch(plants.main, { version: 2, plantLight }, `prog-bad-${Buffer.from(name).toString('hex').slice(0, 24)}`)
    expect(response.status).toBe(400)
    expect(versionOf(plants.main)).toBe(2)
    expect(lightColumns(plants.main)).toBe(`1800|${now - 2 * day}|meter`)
  })

  test('过期 Lux（31 天前）可以保存，但 plant_light 不计分；null 清除三列', async () => {
    const stale = { ...freshLight, measuredAt: new Date(now - 31 * day).toISOString(), source: 'camera_estimate' }
    const saved = await patch(plants.main, { version: 2, plantLight: stale }, 'prog-key-000002')
    expect(saved.status).toBe(200)
    expect(saved.json.data).toMatchObject({ profile: { plantLight: stale }, completeness: { percent: 0, nextRecommended: 'catalog_binding' } })
    const cleared = await patch(plants.main, { version: 3, plantLight: null }, 'prog-key-000003')
    expect(cleared.json.data?.profile).not.toHaveProperty('plantLight')
    expect(lightColumns(plants.main)).toBe('-|-|-')
  })

  test('品种绑定 + 全部分组 + 有效 Lux → 100 complete；列表项只带 completenessPercent', async () => {
    bindCatalog(plants.full)
    const response = await patch(plants.full, { version: 1, ...fullGroups, plantLight: freshLight }, 'prog-key-000010')
    expect(response.json.data?.completeness).toEqual({ percent: 100, level: 'complete',
      doneItems: ['catalog_binding', 'measured_pot', 'substrate', 'location', 'plant_light', 'ventilation', 'lighting'], missingItems: [], nextRecommended: null })
    const listed = (await h.call('GET', '/api/v2/user-plants')).json.data as { items: Array<Record<string, unknown>> }
    expect(listed.items.find(item => item.user_plant_id === plants.full)).toMatchObject({ completenessPercent: 100 })
    expect(listed.items.find(item => item.user_plant_id === plants.main)).toMatchObject({ completenessPercent: 0 })
    expect(listed.items.every(item => !('completeness' in item))).toBe(true)
  })

  test('归档植物照常返回完整度；删除中/他人 404', async () => {
    expect((await get(plants.archived)).json.data).toMatchObject({ completeness: { percent: 0 } })
    expect((await get(plants.deleting)).status).toBe(404)
    expect((await get(plants.foreign)).status).toBe(404)
  })

  test('发布记录被篡改（摘要不符）→ 视为不可用：省略完整度，接口仍 200', async () => {
    h.sql("UPDATE business_policy_releases SET content_sha256 = REPEAT('0', 64) WHERE policy_code = 'profile_progress';")
    try {
      const single = await get(plants.full)
      expect(single.status).toBe(200)
      expect(single.json.data).not.toHaveProperty('completeness')
    } finally {
      h.sql(`DELETE FROM active_business_policy_releases WHERE policy_code IN ('profile_progress', 'mvp_watering'); DELETE FROM business_policy_releases WHERE policy_code IN ('profile_progress', 'mvp_watering');`)
      h.sql(profileProgressPoliciesSql(now - 3_600_000))
    }
    expect((await get(plants.full)).json.data).toMatchObject({ completeness: { percent: 100 } })
  })

  test('脱敏：响应不含规则版本、发布引用或有效期天数', async () => {
    const text = (await get(plants.full)).text + (await h.call('GET', '/api/v2/user-plants')).text
    for (const secret of ['user-plant-profile-progress', 'bpr_', 'luxAnchorMaxAgeDays', 'profile_progress']) { expect(text).not.toContain(secret) }
  })
})

describe('封面上传路径 GET …/cover-upload-target（真实 MySQL 归属）', () => {
  test('本人 active / archived：200，路径在本人封面目录、带植物引用与随机段，每次不同；不落库', async () => {
    const before = h.sql('SELECT COUNT(*) FROM user_plant_assets;')
    const first = await h.call('GET', `/api/v2/user-plants/${plants.main}/cover-upload-target`)
    const second = await h.call('GET', `/api/v2/user-plants/${plants.archived}/cover-upload-target`)
    expect(first.status).toBe(200)
    expect(first.json.data).toEqual({ purpose: 'profile', cloudPath: expect.stringMatching(new RegExp(`^user-plant/${harnessUsers.ownerRef}/covers/${plants.main}-[a-f0-9]{32}$`, 'u')),
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5_242_880 })
    expect(second.json.data?.cloudPath).toMatch(new RegExp(`^user-plant/${harnessUsers.ownerRef}/covers/${plants.archived}-[a-f0-9]{32}$`, 'u'))
    expect((await h.call('GET', `/api/v2/user-plants/${plants.main}/cover-upload-target`)).json.data?.cloudPath).not.toBe(first.json.data?.cloudPath)
    expect(h.sql('SELECT COUNT(*) FROM user_plant_assets;')).toBe(before)
  })

  test('删除中、他人植物 → 404；他人用自己的会话读不到别人的目录', async () => {
    expect((await h.call('GET', `/api/v2/user-plants/${plants.deleting}/cover-upload-target`)).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await h.call('GET', `/api/v2/user-plants/${plants.foreign}/cover-upload-target`)).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await h.call('GET', `/api/v2/user-plants/${plants.main}/cover-upload-target`, { bearer: harnessUsers.strangerBearer })).status).toBe(404)
  })

  test('审计不含用户编号或路径', async () => {
    await h.call('GET', `/api/v2/user-plants/${plants.main}/cover-upload-target`)
    expect(JSON.stringify(h.audits)).not.toContain(harnessUsers.ownerRef)
    expect(JSON.stringify(h.audits)).not.toContain('covers/')
  })
})
