import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cityProfilesSql, harnessUsers, plantInsertSql, profileWritePoliciesSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness
} from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL + 真实 user-plant HTTP（真实会话、真实发布策略读取、真实 weather 城市目录读取、
 * 真实档案/环境/完整度/outbox 事务）。
 * Expected：docs/backend-v2/contracts/user-plant-environment-profile.md（2026-10-10 用户审定）§1～§5；reward-events.md（首株每用户终身一次）。
 * 不覆盖：CloudBase 网关、云端 MySQL、subscription 消费 outbox 记账、care 侧改用城市中心坐标（§6 待 care 合同修订）。
 */
const now = Date.UTC(2026, 9, 10, 10)
const plants = { first: 'upl_env_first_000001', second: 'upl_env_second_00001', archived: 'upl_env_archived_0001', foreign: 'upl_env_foreign_00001', rollback: 'upl_env_rollback_0001' } as const
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 12, potBottomDiameterCm: 9, potHeightCm: 11 }
const location = { cityRef: 'chongqing', placement: 'indoor' }
// 2026-10-10 用户纠偏：光照只收朝向（城市在 location）。
const lighting = { windowFacing: 'S' }
const ventilation = { airExchange: 'occasional', localAirflow: 'none', directBlowing: false }
const substrate = { materials: ['general', 'perlite'], primaryMaterial: 'general' }
let h: UserPlantMysqlHarness

const patch = (ref: string, body: Record<string, unknown>, key: string, bearer?: string) =>
  h.call('PATCH', `/api/v2/user-plants/${ref}`, { bearer, key, body: JSON.stringify(body) })
const versionOf = (ref: string) => Number(h.sql(`SELECT version FROM user_plants WHERE public_user_plant_id='${ref}';`))
const outbox = () => h.sql("SELECT CONCAT(user_ref, '|', user_plant_ref, '|', occurrence_ref, '|', event_type, '|', producer_policy_version, '|', status, '|', JSON_EXTRACT(payload_json, '$.profileVersion')) FROM user_plant_outbox ORDER BY id;")
const completedAt = (ref: string) => h.sql(`SELECT IFNULL(CAST(f.profile_completed_at_ms AS CHAR), '-') FROM user_plant_profiles f JOIN user_plants p ON p.id = f.user_plant_internal_id WHERE p.public_user_plant_id='${ref}';`)

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'envprofile', now })
  h.sql(profileWritePoliciesSql(now - 3_600_000) + cityProfilesSql([{ code: 'chongqing', lat: 29.563, lon: 106.5516 }, { code: 'beijing', lat: 39.9042, lon: 116.4074 }])
    + plantInsertSql(plants.first, 1, 'active', 1000) + plantInsertSql(plants.second, 1, 'active', 2000) + plantInsertSql(plants.archived, 1, 'archived', 3000)
    + plantInsertSql(plants.foreign, 2, 'active', 4000) + plantInsertSql(plants.rollback, 1, 'active', 5000))
}, 180_000)

afterAll(async () => { await h.stop() })

describe('PATCH 环境档案（真实 MySQL）', () => {
  test('只提交环境分组：200 公开投影带分组且昵称为空串；版本 +1；环境写入 care_contexts；未完整不写 outbox', async () => {
    const response = await patch(plants.first, { version: 1, location, lighting }, 'env-key-0000001')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ version: 2, profile: { nickname: '', location, lighting } })
    expect(response.json.data?.profile).not.toHaveProperty('ventilation')
    expect(h.sql(`SELECT CONCAT(JSON_EXTRACT(c.location_json, '$.cityRef'), '|', JSON_TYPE(c.ventilation_environment_json)) FROM user_plant_care_contexts c JOIN user_plants p ON p.id = c.user_plant_internal_id WHERE p.public_user_plant_id='${plants.first}';`)).toBe('"chongqing"|NULL')
    expect(outbox()).toBe('')
    expect((await h.call('GET', `/api/v2/user-plants/${plants.first}`)).json).toEqual(response.json)
  })

  test('补齐盆器与通风 → 首次完整：写首次完成时间与一条首株 outbox 事件（pending、无积分字段）', async () => {
    const response = await patch(plants.first, { version: 2, measuredPot: pot, ventilation, substrate }, 'env-key-0000002')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ version: 3, profile: { measuredPot: pot, location, lighting, ventilation, substrate } })
    expect(completedAt(plants.first)).toBe(String(now))
    expect(outbox()).toBe(`${harnessUsers.ownerRef}|${plants.first}|first_profile:${harnessUsers.ownerRef}|user_plant.profile_completed.v1|user-plant-profile/v1|pending|"user-plant-profile/v1"`)
    expect(h.sql('SELECT payload_json FROM user_plant_outbox;')).not.toMatch(/point|amount/iu)
  })

  test('同键同参重放原结果、不重复写 outbox；同键异参 409', async () => {
    const replay = await patch(plants.first, { version: 2, measuredPot: pot, ventilation, substrate }, 'env-key-0000002')
    expect(replay.status).toBe(200)
    expect(replay.json.data).toMatchObject({ version: 3 })
    expect((await patch(plants.first, { version: 2, ventilation: null }, 'env-key-0000002')).json.error?.type).toBe('IDEMPOTENCY_CONFLICT')
    expect(outbox().split('\n')).toHaveLength(1)
  })

  test('完整后清除通风：分组消失，但首次完成时间不清空、不收回事件', async () => {
    const response = await patch(plants.first, { version: 3, ventilation: null }, 'env-key-0000003')
    expect(response.json.data?.profile).not.toHaveProperty('ventilation')
    expect(response.json.data?.profile).toMatchObject({ location, lighting, measuredPot: pot })
    expect(completedAt(plants.first)).toBe(String(now))
    expect(outbox().split('\n')).toHaveLength(1)
  })

  test('同一用户第二株完整：记录完成时间，但不再写首株事件（终身一次）', async () => {
    const response = await patch(plants.second, { version: 1, measuredPot: pot, location, lighting, ventilation }, 'env-key-0000004')
    expect(response.status).toBe(200)
    expect(completedAt(plants.second)).toBe(String(now))
    expect(outbox().split('\n')).toHaveLength(1)
  })

  test('省略分组保留原值；基质 null 清除且保留实测盆器；已删除的 potShape 分组 → 400', async () => {
    expect((await patch(plants.second, { version: 2, potShape: null }, 'env-key-0000005a')).status).toBe(400)
    const response = await patch(plants.second, { version: 2, substrate: null, nickname: '二号' }, 'env-key-0000005')
    expect(response.json.data?.profile).toEqual({ nickname: '二号', measuredPot: pot, location, lighting, ventilation })
  })

  test('城市不在目录 → 400，零写入；他人植物 → 404；版本过期 → 409', async () => {
    const before = versionOf(plants.second)
    expect((await patch(plants.second, { version: before, location: { cityRef: 'atlantis', placement: 'indoor' } }, 'env-key-0000006')).status).toBe(400)
    expect(versionOf(plants.second)).toBe(before)
    expect((await patch(plants.foreign, { version: 1, location }, 'env-key-0000007')).status).toBe(404)
    expect((await patch(plants.second, { version: 1, location }, 'env-key-0000008')).json.error?.type).toBe('USER_PLANT_VERSION_CONFLICT')
  })

  test('归档植物仍可修改环境档案，生命周期不变', async () => {
    const response = await patch(plants.archived, { version: 1, location: { cityRef: 'beijing', placement: 'balcony_open' } }, 'env-key-0000009')
    expect(response.json.data).toMatchObject({ lifecycle: 'archived', profile: { location: { cityRef: 'beijing', placement: 'balcony_open' } } })
  })

  test('列表项与单株读取带同一份环境档案', async () => {
    const listed = (await h.call('GET', '/api/v2/user-plants')).json.data as { items: Array<Record<string, unknown>> }
    const single = await h.call('GET', `/api/v2/user-plants/${plants.second}`)
    // 封面合同（2026-10-10）：列表项额外带 hasCover，其余与单株读取一致。
    expect(listed.items.find(item => item.user_plant_id === plants.second)).toEqual({ ...single.json.data, hasCover: false })
  })

  test('事务失败回滚：outbox 写入失败时档案、环境、版本、完成时间与幂等记录都不落库', async () => {
    h.sql("CREATE TRIGGER trg_fail_outbox BEFORE INSERT ON user_plant_outbox FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture outbox failure';")
    h.sql('DELETE FROM user_plant_outbox;')
    h.sql("UPDATE user_plant_profiles SET profile_completed_at_ms = NULL;")
    try {
      const response = await patch(plants.rollback, { version: 1, measuredPot: pot, location, lighting, ventilation }, 'env-key-rollback1')
      expect(response.status).toBe(500)
      expect(response.text).not.toContain('fixture outbox failure')
      expect(versionOf(plants.rollback)).toBe(1)
      expect(h.sql(`SELECT COUNT(*) FROM user_plant_profiles f JOIN user_plants p ON p.id = f.user_plant_internal_id WHERE p.public_user_plant_id='${plants.rollback}';`)).toBe('0')
      expect(h.sql(`SELECT COUNT(*) FROM user_plant_care_contexts c JOIN user_plants p ON p.id = c.user_plant_internal_id WHERE p.public_user_plant_id='${plants.rollback}';`)).toBe('0')
      expect(h.sql("SELECT COUNT(*) FROM http_idempotency_records WHERE operation_id='updateUserPlant' AND state='processing';")).toBe('0')
    } finally {
      h.sql('DROP TRIGGER trg_fail_outbox;')
    }
  })

  test('脱敏：响应与审计不含 user_id、Bearer、幂等键、完整度版本或内部字段名', async () => {
    const response = await patch(plants.second, { version: versionOf(plants.second), nickname: '三号' }, 'env-key-redact01')
    const observed = response.text + JSON.stringify(h.audits)
    for (const secret of [harnessUsers.ownerRef, harnessUsers.ownerBearer, 'env-key-redact01', 'user-plant-profile/v1', 'cultivation', 'profile_completed', 'user_internal_id']) {
      expect(observed).not.toContain(secret)
    }
  })
})
