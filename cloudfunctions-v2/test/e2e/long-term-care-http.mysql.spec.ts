import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createCareServer } from '../../src/care/http/server.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { createResolveGuestOrUserPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../../src/identity/repository/mysql-user-principal-repository.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { findProjectRoot } from '../support/project-root.js'
import { cityProfilesSql } from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4 + schema manifest 全量 DDL（含 024–027）+ 024 种子 + Tropicals 外部表读取桩 +
 * 真实 care 与 user-plant HTTP 服务、真实主体解析与 MySQL 仓储/事务。Open-Meteo 替身返回不可用（光照缺段）。
 * Expected：models/care/long-term-care-contract.md（2026-10-09 冻结；用户裁决 U1–U9、主代理裁决 T1–T8）；
 * 水量 40～300 mL 来自 mvp 矩阵 I1（根区干 + 16/12/14 有孔内盆 + 泥炭珍珠岩）。不连接 CloudBase、不写云端库。
 */
const container = `qhz-ltc-http-${process.pid}`
const database = 'qhz_ltc_http'
const hour = 3_600_000
const day = 24 * hour
const now = Date.UTC(2026, 9, 9, 4)
const root = findProjectRoot()
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const ownerBearer = 'fixture-ltc-owner-bearer-000000001'
const otherBearer = 'fixture-ltc-other-bearer-000000001'
const guestToken = Buffer.alloc(32, 4).toString('base64url')
const taxon = 'https://tropicals.cn/species/epipremnum-aureum'
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 16, potBottomDiameterCm: 12, potHeightCm: 14 }
/** 室外辐射 Provider 替身：返回不可用，并记录收到的坐标（验证长期植物用档案城市中心坐标）。 */
const radiationRequests: Array<{ latitude: number; longitude: number }> = []
let careUrl = ''
let plantUrl = ''
const servers: Server[] = []

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
type Body = { data?: Record<string, any>; error?: { type: string } }
async function call(base: string, method: string, url: string, body: unknown, key: string | null = null, bearer = ownerBearer) {
  const headers: Record<string, string> = { authorization: `Bearer ${bearer}` }
  if (body !== undefined) { headers['content-type'] = 'application/json' }
  if (key !== null) { headers['idempotency-key'] = key }
  const response = await fetch(`${base}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  return { status: response.status, text, body: JSON.parse(text) as Body }
}
const plantPath = (ref: string, suffix: string) => `/api/v2/user-plants/${ref}${suffix}`
/** care 独占前缀（用户 2026-10-09 裁决：网关前缀冲突）。 */
const carePath = (ref: string, suffix: string) => `/api/v2/care/user-plants/${ref}${suffix}`
// 档案 JSON 与 user-plant 写入路径一致：实测盆器存于 measuredPot 键（measured-profile-persistence-contract）。
const advice = (plantRef: string, key: string, extra: Record<string, unknown> = {}, bearer = ownerBearer) => call(careUrl, 'POST', '/api/v2/care/watering-advice', {
  // 2026-10-10 用户裁决：长期植物不再提交坐标，服务端用档案城市中心坐标。
  target: { kind: 'user_plant', userPlantRef: plantRef }, window: { orientation: 'S' },
  soil: { state: 'dry', scope: 'root_zone', observedAt: new Date(now - hour).toISOString() }, substrateMaterials: ['peat', 'perlite'], ...extra
}, key, bearer)
const bind = (plantRef: string, key: string, ref = taxon, bearer = ownerBearer) => call(plantUrl, 'PUT', plantPath(plantRef, '/catalog-binding'), { catalogTaxonRef: ref }, key, bearer)
const water = (plantRef: string, key: string, occurredAt: number, amountMl: number | null = 200) => call(careUrl, 'POST', carePath(plantRef, '/facts'), { factType: 'watering', occurredAt: new Date(occurredAt).toISOString(), amountMl }, key)

beforeAll(async () => {
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') { break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const schemaDirectory = path.join(root, 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  sql(fs.readFileSync(path.join(schemaDirectory, 'seeds/watering_baseline_policy.v1.sql'), 'utf8'))
  sql(cityProfilesSql([{ code: 'chongqing', lat: 29.563, lon: 106.5516 }]))
  // 外部表读取桩：列类型照抄测试库 information_schema（外部表读取合同），只建 v2 读取器用到的列。
  sql(`CREATE TABLE tropicals_species_encyclopedia_ref (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL UNIQUE, name VARCHAR(512) NOT NULL,
      water_frequency_tier VARCHAR(32) NULL, water_frequency_source_json JSON NULL);`)
  const artifact = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/test/plant-knowledge/fixtures/tropicals-watering-baseline.json'), 'utf8')) as { plants: Array<{ taxon_id: string; water_frequency_tier: string; water_frequency_source_json: unknown }> }
  for (const plant of artifact.plants) {
    sql(`INSERT INTO tropicals_species_encyclopedia_ref (taxon_id, name, water_frequency_tier, water_frequency_source_json) VALUES (${quote(plant.taxon_id)}, ${quote(plant.taxon_id.endsWith('epipremnum-aureum') ? '绿萝' : '其他')}, ${quote(plant.water_frequency_tier)}, CAST(${quote(JSON.stringify(plant.water_frequency_source_json))} AS JSON));`)
  }
  const policyBody = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v2.json'), 'utf8')) as CanonicalJsonObject
  const issued = now - 30 * day
  sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES (1, 'usr_ltc_owner_00001', 'active', 1, ${issued}, ${issued}), (2, 'usr_ltc_other_00001', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
    VALUES (1, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued}), (2, 'wechat', '${'d'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued});
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
    SELECT IF(p.user_internal_id = 1, '${sha(ownerBearer)}', '${sha(otherBearer)}'), p.user_internal_id, p.id, 1, 'wechat', 'active', ${issued}, ${now + day}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}' FROM platform_identities p;
    INSERT INTO guest_sessions (guest_session_ref, identity_source, anonymous_subject_hash, issuance_source_hash, possession_proof_hash, possession_proof_version, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES ('gst_ltc_guest_00001', 'server_issued_guest_token', NULL, '${'f'.repeat(64)}', '${sha(guestToken)}', 1, 'active', ${now - hour}, ${now + day}, ${now - hour}, ${now - hour});
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
    VALUES ('bpr_care_mvp_watering02', 'care', 'mvp_watering', 'care-watering-mvp/v2', 'care-watering-mvp/v2.0.0', '${calculateCanonicalJsonSha256(policyBody)}', CAST(${quote(JSON.stringify(policyBody))} AS JSON), 'active', ${issued}, ${issued}, ${issued}, ${issued});
    INSERT INTO active_business_policy_releases (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, activated_at_ms, created_at_ms, updated_at_ms)
    SELECT 'care', 'mvp_watering', id, release_version, content_sha256, ${issued}, ${issued}, ${issued} FROM business_policy_releases;`)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  const resolvePrincipal = createResolveGuestOrUserPrincipal({
    guestRepository: createMysqlGuestSessionRepository(source),
    resolveUser: createResolveUserPrincipalUseCase({ repository: { read: input => withReadConnection(source, connection => createMysqlUserPrincipalRepository({
      executeQuery: async (text, parameters) => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
    }).read(input)) } })
  })
  const care = createCareServer({ connectionSource: source, now: () => now, resolvePrincipal, fetchRadiation: async input => { radiationRequests.push({ latitude: input.latitude, longitude: input.longitude }); return null }, writeAudit: () => undefined, recordRollbackFailure: () => undefined })
  const plants = createUserPlantServer({ connectionSource: source, now: () => now, resolveCapabilitySnapshot: async () => { throw new Error('不需要能力快照') }, writeAudit: () => undefined, recordRollbackFailure: () => undefined })
  for (const server of [care, plants]) { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server) }
  careUrl = `http://127.0.0.1:${(care.address() as AddressInfo).port}`
  plantUrl = `http://127.0.0.1:${(plants.address() as AddressInfo).port}`
}, 180_000)

afterAll(async () => {
  for (const server of servers) { await new Promise(resolve => server.close(resolve)) }
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

beforeEach(() => {
  const created = now - 30 * day
  sql(`SET FOREIGN_KEY_CHECKS=0;
    DELETE FROM care_capability_results; DELETE FROM care_plans; DELETE FROM care_proposals; DELETE FROM care_facts; DELETE FROM user_plant_catalog_bindings;
    DELETE FROM user_plant_care_contexts; DELETE FROM user_plant_profiles; DELETE FROM user_plants; DELETE FROM http_idempotency_records;
    SET FOREIGN_KEY_CHECKS=1;
    INSERT INTO user_plants (id, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, version, created_at_ms, updated_at_ms)
    VALUES (1, 'upl_ltc_active_0001', 1, 'active', 'unidentified', 1, ${created}, ${created}), (2, 'upl_ltc_archived_01', 1, 'archived', 'unidentified', 2, ${created}, ${created}),
           (3, 'upl_ltc_other_00001', 2, 'active', 'unidentified', 1, ${created}, ${created}), (4, 'upl_ltc_unbound_001', 1, 'active', 'unidentified', 1, ${created}, ${created});
    INSERT INTO user_plant_profiles (user_internal_id, user_plant_internal_id, nickname, pot_profile_json, profile_completeness_version, version, created_at_ms, updated_at_ms)
    VALUES (1, 1, '小绿', CAST(${quote(JSON.stringify({ measuredPot: pot }))} AS JSON), 'user-plant-profile/v1', 1, ${created}, ${created}), (1, 4, '', CAST(${quote(JSON.stringify({ measuredPot: pot }))} AS JSON), 'user-plant-profile/v1', 1, ${created}, ${created});
    INSERT INTO user_plant_care_contexts (user_internal_id, user_plant_internal_id, location_json, cultivation_method, light_environment_json, ventilation_environment_json, version, created_at_ms, updated_at_ms)
    VALUES (1, 1, CAST('{"cityRef":"chongqing","placement":"indoor"}' AS JSON), 'unspecified', CAST('null' AS JSON), CAST('null' AS JSON), 1, ${created}, ${created}),
           (1, 4, CAST('{"cityRef":"chongqing","placement":"indoor"}' AS JSON), 'unspecified', CAST('null' AS JSON), CAST('null' AS JSON), 1, ${created}, ${created});`)
  radiationRequests.length = 0
})

describe('品种绑定 PUT（user-plant）', () => {
  test('绑定成功、同键重放；目录不存在 404；归档 409；他人植物 404', async () => {
    const first = await bind('upl_ltc_active_0001', 'bind-key-00000001')
    expect(first).toMatchObject({ status: 200, body: { data: { catalogTaxonRef: taxon, boundAt: new Date(now).toISOString() } } })
    expect(await bind('upl_ltc_active_0001', 'bind-key-00000001')).toMatchObject({ status: 200, body: first.body })
    expect(sql('SELECT COUNT(*) FROM user_plant_catalog_bindings;')).toBe('1')
    expect((await bind('upl_ltc_active_0001', 'bind-key-00000002', 'https://tropicals.cn/species/unknown-x')).body.error?.type).toBe('NOT_FOUND')
    expect((await bind('upl_ltc_archived_01', 'bind-key-00000003')).body.error?.type).toBe('USER_PLANT_ARCHIVED')
    expect((await bind('upl_ltc_other_00001', 'bind-key-00000004')).body.error?.type).toBe('USER_PLANT_NOT_FOUND')
  })
})

describe('长期浇水建议', () => {
  test('有品种与盆器：根区干 → 可以浇水 40～300 mL，同事务写结果与建议（建议有效期按 U7）', async () => {
    await bind('upl_ltc_active_0001', 'bind-key-00000010')
    const response = await advice('upl_ltc_active_0001', 'advice-key-000001')
    expect(response.status).toBe(200)
    const data = response.body.data!
    expect(data.result).toMatchObject({ status: 'ready', details: { action: 'water_allowed', amountMl: { min: 40, max: 300 } } })
    expect(data.proposalRef).toMatch(/^cpr_/u)
    // 可以浇水时检查窗口为 [现在, 现在]；Q1：最晚端不晚于生成时刻 → 有效期 = 生成 + 24 小时。
    expect(data.result.details.checkWindow?.latestAt).toBe(data.result.generatedAt)
    const expectedValidUntil = now + 24 * hour
    expect(sql(`SELECT CONCAT(p.status,'|',p.valid_until_ms,'|',r.result_ref) FROM care_proposals p JOIN care_capability_results r ON r.proposal_internal_id = p.id WHERE p.proposal_ref = ${quote(data.proposalRef)};`)).toBe(`proposed|${expectedValidUntil}|${data.resultRef}`)
    expect(await advice('upl_ltc_active_0001', 'advice-key-000001')).toMatchObject({ status: 200, body: response.body })
    expect(sql('SELECT COUNT(*) FROM care_capability_results;')).toBe('1')
  })
  test('无品种绑定 → 200 insufficient_evidence，无建议，仍写结果', async () => {
    const response = await advice('upl_ltc_unbound_001', 'advice-key-000002')
    expect(response.body.data).toMatchObject({ proposalRef: null, result: { status: 'insufficient_evidence' } })
    expect(sql('SELECT COUNT(*) FROM care_proposals;')).toBe('0')
    expect(sql('SELECT COUNT(*) FROM care_capability_results;')).toBe('1')
  })
  test('长期植物不得提交 pot / catalogTaxonRef / lastWatering → 400；游客 → 400；归档 → 409；他人 → 404', async () => {
    for (const extra of [{ pot: { isInnerPot: true, innerTopDiameterCm: 16, innerBottomDiameterCm: 12, innerHeightCm: 14, hasDrainageHole: true } }, { catalogTaxonRef: taxon }, { lastWatering: { wateredAt: new Date(now - day).toISOString() } }]) {
      expect((await advice('upl_ltc_active_0001', `advice-bad-${Object.keys(extra)[0]}`, extra)).status).toBe(400)
    }
    expect((await advice('upl_ltc_active_0001', 'advice-key-guest1', {}, `guest.${guestToken}`)).status).toBe(400)
    expect((await advice('upl_ltc_archived_01', 'advice-key-000003')).body.error?.type).toBe('USER_PLANT_ARCHIVED')
    expect((await advice('upl_ltc_other_00001', 'advice-key-000004')).body.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect(sql('SELECT COUNT(*) FROM care_capability_results;')).toBe('0')
  })
  /**
   * Expected：watering-advice-http-contract.md「长期植物的坐标」与 long-term-care-contract.md §2（2026-10-10 用户裁决）：
   * 长期植物用档案城市中心坐标（城市目录 lat/lon，0.01°）；档案无城市 → 不取辐射，insufficient_evidence 时缺失码 plant_location；
   * 长期植物提交 location → 400。层次：L3 / unit_real_data（真实 care + user-plant HTTP、真实城市目录读取）。
   */
  test('长期植物用档案城市中心坐标取辐射，输入清单记录城市', async () => {
    await bind('upl_ltc_active_0001', 'bind-key-00000020')
    const response = await advice('upl_ltc_active_0001', 'advice-key-city001', { soil: null })
    expect(response.status).toBe(200)
    expect(radiationRequests).toEqual([{ latitude: 29.56, longitude: 106.55 }])
    expect(sql(`SELECT CONCAT(JSON_EXTRACT(input_manifest_json, '$.location.latitude'), '|', JSON_UNQUOTE(JSON_EXTRACT(input_manifest_json, '$.cityRef'))) FROM care_capability_results WHERE result_ref = ${quote(response.body.data!.resultRef)};`)).toBe('29.56|chongqing')
    expect(response.body.data?.result.details.missingEvidence).not.toContain('plant_location')
  })
  test('档案没有城市 → 不取辐射；证据不足时缺失码含 plant_location、不含 outdoor_radiation', async () => {
    await bind('upl_ltc_active_0001', 'bind-key-00000021')
    sql("UPDATE user_plant_care_contexts SET location_json = CAST('null' AS JSON) WHERE user_plant_internal_id = 1;")
    const response = await advice('upl_ltc_active_0001', 'advice-key-city002', { soil: null })
    expect(radiationRequests).toEqual([])
    expect(response.body.data?.result).toMatchObject({ status: 'insufficient_evidence' })
    expect(response.body.data?.result.details.missingEvidence).toContain('plant_location')
    expect(response.body.data?.result.details.missingEvidence).not.toContain('outdoor_radiation')
  })
  test('档案城市不在目录 → 同样按无城市处理', async () => {
    await bind('upl_ltc_active_0001', 'bind-key-00000022')
    sql("UPDATE user_plant_care_contexts SET location_json = CAST('{\"cityRef\":\"atlantis\",\"placement\":\"indoor\"}' AS JSON) WHERE user_plant_internal_id = 1;")
    const response = await advice('upl_ltc_active_0001', 'advice-key-city003', { soil: null })
    expect(radiationRequests).toEqual([])
    expect(response.body.data?.result.details.missingEvidence).toContain('plant_location')
  })
  test('长期植物提交 cityCode 或旧 location → 400，零写入', async () => {
    expect((await advice('upl_ltc_active_0001', 'advice-key-city005', { location: { latitude: 31.23, longitude: 121.47 } })).status).toBe(400)
    const response = await advice('upl_ltc_active_0001', 'advice-key-city004', { cityCode: 'chongqing' })
    expect(response.status).toBe(400)
    expect(sql('SELECT COUNT(*) FROM care_capability_results;')).toBe('0')
  })
  test('根区干观察之后记录浇水 → 干观察失效（U6），不再给可以浇水', async () => {
    await bind('upl_ltc_active_0001', 'bind-key-00000011')
    expect((await water('upl_ltc_active_0001', 'fact-key-0000009', now - 30 * 60_000)).status).toBe(200)
    expect((await advice('upl_ltc_active_0001', 'advice-key-000005')).body.data?.result.details.action).not.toBe('water_allowed')
  })
})

describe('记录浇水', () => {
  test('成功、同键重放、规则拒绝（7 天、未来、非 watering）、归档 409', async () => {
    const first = await water('upl_ltc_active_0001', 'fact-key-0000001', now - hour, 250)
    expect(first).toMatchObject({ status: 200, body: { data: { factRef: expect.stringMatching(/^cft_/u), factType: 'watering', occurredAt: new Date(now - hour).toISOString(), amountMl: 250 } } })
    expect(await water('upl_ltc_active_0001', 'fact-key-0000001', now - hour, 250)).toMatchObject({ status: 200, body: first.body })
    expect((await water('upl_ltc_active_0001', 'fact-key-0000002', now - 7 * day - 1)).status).toBe(400)
    expect((await water('upl_ltc_active_0001', 'fact-key-0000003', now + 1)).status).toBe(400)
    expect((await call(careUrl, 'POST', carePath('upl_ltc_active_0001', '/facts'), { factType: 'fertilizing', occurredAt: new Date(now).toISOString() }, 'fact-key-0000004')).status).toBe(400)
    expect((await water('upl_ltc_archived_01', 'fact-key-0000005', now - hour)).body.error?.type).toBe('USER_PLANT_ARCHIVED')
    expect(sql('SELECT COUNT(*) FROM care_facts;')).toBe('1')
  })
})

describe('确认建议 → 计划 → 完成', () => {
  async function proposal(key: string) {
    await bind('upl_ltc_active_0001', `bind-${key}`)
    return (await advice('upl_ltc_active_0001', key)).body.data!.proposalRef as string
  }
  const confirm = (proposalRef: string, key: string, body: unknown) => call(careUrl, 'POST', carePath('upl_ltc_active_0001', `/proposals/${proposalRef}/confirmations`), body, key)
  test('安排检查（缺省时刻、日历中文标题）；二次确认 409；同键重放；计划列表与摘要', async () => {
    const proposalRef = await proposal('advice-key-000010')
    const confirmed = await confirm(proposalRef, 'confirm-key-00001', { decision: 'schedule_check' })
    expect(confirmed.status).toBe(200)
    const plan = confirmed.body.data!.plan
    expect(confirmed.body.data).toMatchObject({ proposalRef, proposalStatus: 'confirmed', factRef: null })
    expect(plan).toMatchObject({ planRef: expect.stringMatching(/^cpl_/u), planType: 'check_soil', status: 'planned', calendar: { title: '检查小绿盆土', notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。' } })
    expect(Date.parse(plan.calendar.endAt) - Date.parse(plan.calendar.startAt)).toBe(30 * 60_000)
    expect(await confirm(proposalRef, 'confirm-key-00001', { decision: 'schedule_check' })).toMatchObject({ status: 200, body: confirmed.body })
    expect((await confirm(proposalRef, 'confirm-key-00002', { decision: 'dismiss' })).body.error?.type).toBe('CARE_PROPOSAL_NOT_CONFIRMABLE')
    const list = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/plans'), undefined)
    expect(list.body.data).toEqual({ items: [{ ...plan, sourceProposalRef: proposalRef, completedFactRef: null }], nextCursor: null })
    const summary = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/summary'), undefined)
    expect(summary.body.data).toMatchObject({ lastWatering: null, nextPlan: plan, profileReadiness: { hasMeasuredPot: true, hasCatalogBinding: true },
      latestWateringAdvice: { status: 'ready', action: 'water_allowed', proposal: { proposalRef, status: 'confirmed' } } })
  })
  test('自选时刻超出检查窗口 → 400；过期建议 → 409；忽略 → dismissed', async () => {
    const proposalRef = await proposal('advice-key-000011')
    expect((await confirm(proposalRef, 'confirm-key-00010', { decision: 'schedule_check', scheduledAt: new Date(now + 8 * day).toISOString() })).status).toBe(400)
    sql(`UPDATE care_proposals SET valid_until_ms = ${now - 1} WHERE proposal_ref = ${quote(proposalRef)};`)
    expect((await confirm(proposalRef, 'confirm-key-00011', { decision: 'dismiss' })).body.error?.type).toBe('CARE_PROPOSAL_NOT_CONFIRMABLE')
    sql(`UPDATE care_proposals SET valid_until_ms = ${now + day} WHERE proposal_ref = ${quote(proposalRef)};`)
    expect((await confirm(proposalRef, 'confirm-key-00012', { decision: 'dismiss' })).body.data).toMatchObject({ proposalStatus: 'dismissed', plan: null, factRef: null })
  })
  test('可以浇水时窗口为 [现在, 现在]：自选检查时刻按无最晚端，可推迟至最早端 + 7 天', async () => {
    const proposalRef = await proposal('advice-key-000015')
    const response = await confirm(proposalRef, 'confirm-key-00015', { decision: 'schedule_check', scheduledAt: new Date(now + 3 * day).toISOString() })
    expect(response.body.data?.plan).toMatchObject({ scheduledAt: new Date(now + 3 * day).toISOString(), status: 'planned' })
  })
  test('按建议浇了 → 浇水事实；摘要显示最近浇水', async () => {
    const proposalRef = await proposal('advice-key-000012')
    const response = await confirm(proposalRef, 'confirm-key-00020', { decision: 'record_watering', occurredAt: new Date(now - 10 * 60_000).toISOString(), amountMl: 150 })
    expect(response.body.data).toMatchObject({ proposalStatus: 'confirmed', plan: null, factRef: expect.stringMatching(/^cft_/u) })
    const summary = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/summary'), undefined)
    expect(summary.body.data?.lastWatering).toEqual({ factRef: response.body.data!.factRef, occurredAt: new Date(now - 10 * 60_000).toISOString(), amountMl: 150 })
  })
  test('完成计划附浇水 → completed、版本+1、事实；旧版本 409；跳过带浇水 400；跳过 → cancelled', async () => {
    const proposalRef = await proposal('advice-key-000013')
    const plan = (await confirm(proposalRef, 'confirm-key-00030', { decision: 'schedule_check' })).body.data!.plan
    // 第二个计划须在记录浇水之前生成：浇水事实会让此前的根区干观察失效（U6），不再产生可确认建议。
    const second = await proposal('advice-key-000014')
    const secondPlan = (await confirm(second, 'confirm-key-00031', { decision: 'schedule_check' })).body.data!.plan
    const complete = (key: string, body: unknown, planRef = plan.planRef) => call(careUrl, 'POST', carePath('upl_ltc_active_0001', `/plans/${planRef}/completions`), body, key)
    // 计划仍为 planned 但版本号不符 → 409（版本比对本身，不依赖状态）。
    expect((await complete('complete-key-0000', { version: 2, outcome: 'done' })).body.error?.type).toBe('CARE_PLAN_VERSION_CONFLICT')
    const done = await complete('complete-key-0001', { version: 1, outcome: 'done', soil: { state: 'moist', scope: 'surface' }, watering: { occurredAt: new Date(now - 5 * 60_000).toISOString(), amountMl: 220 } })
    // 合同 §7（裁决 Q2）：盆土观察固定字段回读。
    expect(sql(`SELECT CONCAT_WS('|', factor_type, source_scope, source_kind, source_ref, unit_code, confidence_band, contract_version, JSON_EXTRACT(normalized_value_json, '$.state'), JSON_EXTRACT(normalized_value_json, '$.scope'), observed_at_ms, IFNULL(valid_until_ms, 'null')) FROM care_environment_observations;`))
      .toBe(`soil_surface|pot|user_context|${plan.planRef}|category|low|long-term-care/v1|"moist"|"surface"|${now}|null`)
    expect(done.body.data).toMatchObject({ planRef: plan.planRef, status: 'completed', version: 2, factRef: expect.stringMatching(/^cft_/u), calendar: plan.calendar })
    expect((await complete('complete-key-0002', { version: 1, outcome: 'done' })).body.error?.type).toBe('CARE_PLAN_VERSION_CONFLICT')
    expect((await complete('complete-key-0003', { version: 2, outcome: 'skipped', watering: { occurredAt: new Date(now).toISOString() } })).status).toBe(400)
    const listed = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/plans?status=completed'), undefined)
    expect(listed.body.data?.items).toEqual([{ ...plan, status: 'completed', sourceProposalRef: proposalRef, completedFactRef: done.body.data!.factRef }])
    expect((await complete('complete-key-0004', { version: 1, outcome: 'skipped' }, secondPlan.planRef)).body.data).toMatchObject({ status: 'cancelled', version: 2, factRef: null })
  })
  test('计划列表分页：limit=1 → 游标翻页；limit=51 → 400；他人植物 → 404', async () => {
    for (const key of ['advice-key-000020', 'advice-key-000021']) {
      const proposalRef = await proposal(key)
      await confirm(proposalRef, `confirm-${key}`, { decision: 'schedule_check' })
    }
    const page1 = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/plans?limit=1'), undefined)
    expect(page1.body.data?.items).toHaveLength(1)
    expect(page1.body.data?.nextCursor).toEqual(expect.any(String))
    const page2 = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', `/plans?limit=1&cursor=${encodeURIComponent(page1.body.data!.nextCursor)}`), undefined)
    expect(page2.body.data?.items).toHaveLength(1)
    expect(page2.body.data?.items[0].planRef).not.toBe(page1.body.data?.items[0].planRef)
    expect(page2.body.data?.nextCursor).toBeNull()
    expect((await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/plans?limit=51'), undefined)).status).toBe(400)
    expect((await call(careUrl, 'GET', carePath('upl_ltc_other_00001', '/plans'), undefined)).body.error?.type).toBe('USER_PLANT_NOT_FOUND')
  })
  test('分页按二进制引用排序：大小写不同的同刻计划翻页不丢项', async () => {
    const calendarJson = JSON.stringify({ calendar: { title: '检查小绿盆土', startAt: new Date(now).toISOString(), endAt: new Date(now + 30 * 60_000).toISOString(), notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。' }, completedFactRef: null })
    for (const [index, ref] of [['1', 'aaaaaaaaaaaa'], ['2', 'BBBBBBBBBBBB']] as const) {
      sql(`INSERT INTO care_proposals (id, proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
        VALUES (${index}, 'cpr_${ref}', 1, 1, 'watering', 'care-capability-result/v1', 'watering-assessment/v1', JSON_OBJECT(), 'confirmed', NULL, '${index.repeat(64)}', ${now}, ${now});
        INSERT INTO care_plans (plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
        VALUES ('cpl_${ref}', 1, 1, ${index}, 'check_soil', ${now}, 'planned', CAST(${quote(calendarJson)} AS JSON), 1, ${now}, ${now});`)
    }
    const page1 = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/plans?limit=1'), undefined)
    const page2 = await call(careUrl, 'GET', carePath('upl_ltc_active_0001', `/plans?limit=1&cursor=${encodeURIComponent(page1.body.data!.nextCursor)}`), undefined)
    expect([page1.body.data?.items[0]?.planRef, page2.body.data?.items[0]?.planRef]).toEqual(['cpl_BBBBBBBBBBBB', 'cpl_aaaaaaaaaaaa'])
  })
  test('脱敏：响应不含 user_id、内部主键字段名、Bearer、幂等键', async () => {
    const proposalRef = await proposal('advice-key-000030')
    const texts = [(await confirm(proposalRef, 'confirm-key-00040', { decision: 'schedule_check' })).text,
      (await call(careUrl, 'GET', carePath('upl_ltc_active_0001', '/summary'), undefined)).text]
    for (const secret of ['usr_ltc_owner_00001', ownerBearer, 'confirm-key-00040', 'internal_id', '"id"']) {
      for (const text of texts) { expect(text).not.toContain(secret) }
    }
  })
})
