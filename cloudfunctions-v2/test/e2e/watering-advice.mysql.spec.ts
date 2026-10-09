import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createCareServer } from '../../src/care/http/server.js'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'
import type { OpenMeteoRadiationQuery } from '../../src/care/provider/open-meteo-radiation-client.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { createResolveGuestOrUserPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../../src/identity/repository/mysql-user-principal-repository.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4 + v2 schema manifest 全量 DDL（含 024 浇水基线表）+ v1 基线种子文件 +
 * 外部表 tropicals_species_encyclopedia_ref 读取桩（只建读取器用到的列，类型照抄测试库，见外部表读取合同）+ 真实 care HTTP 服务、真实主体解析、真实策略读取器、真实基线仓储、真实幂等与临时养护表。
 * Open-Meteo 由替身返回真实公开制品（test/care/fixtures/open-meteo-hourly-radiation.json）标准化结果。
 * Expected：models/care/watering-advice-http-test-matrix.md E1–E5；水量 40～300 mL 来自 mvp 矩阵 I1 独立手算。
 */
const container = `qhz-watering-advice-${process.pid}`
const database = 'qhz_watering_advice'
const hour = 3_600_000
const now = 1_791_126_000_000
const root = findProjectRoot()
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const policyBody = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v1.json'), 'utf8')) as CanonicalJsonObject
const baselineArtifact = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/test/plant-knowledge/fixtures/tropicals-watering-baseline.json'), 'utf8')) as {
  plants: Array<{ taxon_id: string; water_frequency_tier: string; water_frequency_source_json: unknown }>
}
const radiationRaw = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8')) as unknown
const userRef = 'usr_water_owner_0001'
const otherUserRef = 'usr_water_other_0001'
const userBearer = 'fixture-water-user-bearer-00000001'
const guestToken = 'W'.repeat(43)
const guestRef = 'gst_water_session_001'
const guestCase = 'gpc_water_case_000001'
const expiredGuestCase = 'gpc_water_expired_0001'
const userCase = 'epc_water_case_000001'
const otherUserCase = 'epc_water_other_00001'
const guestExpiresAtMs = now + 20 * hour
const userCaseExpiresAtMs = now + 100 * hour
let source: ReturnType<typeof createMysql2ConnectionSource>
let server: Server
let baseUrl = ''
let providerMode: 'ok' | 'down' = 'ok'
const queries: OpenMeteoRadiationQuery[] = []
const audits: RequestChainAuditEvent[] = []

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
const count = (table: string, where = '1=1') => Number(sql(`SELECT COUNT(*) FROM ${table} WHERE ${where};`))
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

const requestBody = (caseRef: string, overrides: Record<string, unknown> = {}) => ({
  target: { kind: 'temporary_case', caseRef },
  catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
  location: { latitude: 31.230416, longitude: 121.473701 },
  window: { orientation: 'S', glassLayers: 'double' },
  lightReading: { lux: 2000, measuredAt: '2026-10-04T04:30:00.000Z', source: 'meter' },
  soil: { state: 'dry', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' },
  pot: { isInnerPot: true, innerTopDiameterCm: 16, innerBottomDiameterCm: 12, innerHeightCm: 14, hasDrainageHole: true },
  substrateMaterials: ['peat', 'perlite'],
  ...overrides
})
type AdviceBody = { data?: { resultRef: string; result: { status: string; details: { action: string; amountMl: unknown } } }; error?: { type: string } }
async function post(bearer: string, key: string, value: unknown) {
  const response = await fetch(`${baseUrl}/api/v2/care/watering-advice`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'idempotency-key': key }, body: JSON.stringify(value)
  })
  const text = await response.text()
  return { status: response.status, text, body: JSON.parse(text) as AdviceBody }
}
function activatePolicy(): void {
  sql(`DELETE FROM active_business_policy_releases;
    INSERT INTO active_business_policy_releases (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, activated_at_ms, created_at_ms, updated_at_ms)
    SELECT 'care', 'mvp_watering', id, release_version, content_sha256, ${now - hour}, ${now - hour}, ${now - hour} FROM business_policy_releases WHERE release_ref='bpr_care_mvp_watering01';`)
}

beforeAll(async () => {
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  let ready = false
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) { throw new Error('隔离 MySQL 未就绪') }
  const schemaDirectory = path.join(root, 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  // watering_baseline_policy 由 manifest 中的真实 024 迁移建表，种子用 v1 种子文件（裁决 A2/A3）。
  sql(fs.readFileSync(path.join(schemaDirectory, 'seeds/watering_baseline_policy.v1.sql'), 'utf8'))
  // tropicals_species_encyclopedia_ref 不属 v2 迁移（裁决 B）：读取桩只建 v2 读取器用到的列，类型照抄测试库 information_schema。
  sql(`CREATE TABLE tropicals_species_encyclopedia_ref (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL UNIQUE,
      water_frequency_tier VARCHAR(32) NULL, water_frequency_source_json JSON NULL);`)
  for (const plant of baselineArtifact.plants) {
    sql(`INSERT INTO tropicals_species_encyclopedia_ref (taxon_id, water_frequency_tier, water_frequency_source_json)
      VALUES (${quote(plant.taxon_id)}, ${quote(plant.water_frequency_tier)}, CAST(${quote(JSON.stringify(plant.water_frequency_source_json))} AS JSON));`)
  }
  const issued = now - 2 * hour
  const policySha = calculateCanonicalJsonSha256(policyBody)
  sql(`INSERT INTO users (public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES ('${userRef}', 'active', 1, ${issued}, ${issued}), ('${otherUserRef}', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
    SELECT id, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued} FROM users WHERE public_user_id='${userRef}';
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
    SELECT '${sha(userBearer)}', u.id, p.id, 1, 'wechat', 'active', ${issued}, ${now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}'
    FROM users u JOIN platform_identities p ON p.user_internal_id = u.id WHERE u.public_user_id='${userRef}';
    INSERT INTO guest_sessions (guest_session_ref, identity_source, anonymous_subject_hash, issuance_source_hash, possession_proof_hash, possession_proof_version, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES ('${guestRef}', 'server_issued_guest_token', NULL, '${'f'.repeat(64)}', '${sha(guestToken)}', 1, 'active', ${issued}, ${guestExpiresAtMs}, ${issued}, ${issued});
    INSERT INTO guest_plant_cases (guest_plant_case_ref, guest_session_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
    SELECT '${guestCase}', id, 'active', ${guestExpiresAtMs}, 1, ${issued}, ${issued} FROM guest_sessions WHERE guest_session_ref='${guestRef}';
    INSERT INTO guest_plant_cases (guest_plant_case_ref, guest_session_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
    SELECT '${expiredGuestCase}', id, 'active', ${now - hour}, 1, ${issued - 2 * hour}, ${issued - 2 * hour} FROM guest_sessions WHERE guest_session_ref='${guestRef}';
    INSERT INTO authenticated_ephemeral_plant_cases (ephemeral_plant_case_ref, user_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
    SELECT '${userCase}', id, 'active', ${userCaseExpiresAtMs}, 1, ${issued}, ${issued} FROM users WHERE public_user_id='${userRef}';
    INSERT INTO authenticated_ephemeral_plant_cases (ephemeral_plant_case_ref, user_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
    SELECT '${otherUserCase}', id, 'active', ${userCaseExpiresAtMs}, 1, ${issued}, ${issued} FROM users WHERE public_user_id='${otherUserRef}';
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
    VALUES ('bpr_care_mvp_watering01', 'care', 'mvp_watering', 'care-watering-mvp/v1', 'care-watering-mvp/v1.0.0', '${policySha}', CAST(${quote(JSON.stringify(policyBody))} AS JSON), 'active', ${now - 24 * hour}, ${now - 24 * hour}, ${now - 24 * hour}, ${now - 24 * hour});`)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  server = createCareServer({
    connectionSource: source,
    now: () => now,
    writeAudit: event => { audits.push(event) },
    recordRollbackFailure: () => undefined,
    fetchRadiation: async query => {
      queries.push(query)
      return providerMode === 'ok' ? normalizeOpenMeteoRadiation(radiationRaw, { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: now }) : null
    },
    resolvePrincipal: createResolveGuestOrUserPrincipal({
      guestRepository: createMysqlGuestSessionRepository(source),
      resolveUser: createResolveUserPrincipalUseCase({ repository: { read: input => withReadConnection(source, connection => createMysqlUserPrincipalRepository({
        executeQuery: async (text, parameters) => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
      }).read(input)) } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 180_000)

afterAll(async () => {
  await new Promise(resolve => (server ? server.close(resolve) : resolve(undefined)))
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

beforeEach(() => {
  sql('DELETE FROM temporary_care_results; DELETE FROM temporary_care_sessions; DELETE FROM http_idempotency_records;')
  activatePolicy()
  providerMode = 'ok'
  queries.length = 0
  audits.length = 0
})

describe('POST /api/v2/care/watering-advice（真实 MySQL）', () => {
  test('E1 游客 Happy：可以浇水 40～300 mL；结果可读回且与响应一致；会话/结果 expires = 案例 expires', async () => {
    const response = await post(`guest.${guestToken}`, 'water-e2e-key-0001', requestBody(guestCase))
    expect(response.status).toBe(200)
    const data = response.body.data!
    expect(data.resultRef).toMatch(/^cres_[A-Za-z0-9_-]{8,60}$/u)
    expect(data.result).toMatchObject({ status: 'ready', details: { action: 'water_allowed', amountMl: { min: 40, max: 300 } } })
    const [stored] = await withReadConnection(source, connection => connection.query('SELECT result_json, CAST(expires_at_ms AS CHAR) AS expires FROM temporary_care_results WHERE result_ref=?', [data.resultRef]))
    const storedResult = typeof stored!.result_json === 'string' ? JSON.parse(stored!.result_json) : stored!.result_json
    expect(storedResult).toEqual(data.result)
    expect(stored!.expires).toBe(String(guestExpiresAtMs))
    expect(sql("SELECT capability_type, status, expires_at_ms FROM temporary_care_sessions;").split('\t')).toEqual(['watering', 'active', String(guestExpiresAtMs)])
    expect(queries).toEqual([{ latitude: 31.23, longitude: 121.47, pastDays: 1, forecastDays: 16 }])
  })

  test('E2 同键同体重放 → 同一结果、不新增行；同键异体 → 409', async () => {
    const first = await post(`guest.${guestToken}`, 'water-e2e-key-0002', requestBody(guestCase))
    const replay = await post(`guest.${guestToken}`, 'water-e2e-key-0002', requestBody(guestCase))
    // 合同要求「返回首次结果」：语义相等；MySQL JSON 列会规范化键序，故不比较字节。
    expect(replay.status).toBe(first.status)
    expect(replay.body).toEqual(first.body)
    expect(count('temporary_care_results')).toBe(1)
    const conflict = await post(`guest.${guestToken}`, 'water-e2e-key-0002', requestBody(guestCase, { substrateMaterials: ['coco'] }))
    expect(conflict).toMatchObject({ status: 409, body: { error: { type: 'IDEMPOTENCY_CONFLICT' } } })
    expect(count('temporary_care_results')).toBe(1)
  })

  test('E4 不同键第二次请求复用同一 active 浇水会话', async () => {
    await post(`guest.${guestToken}`, 'water-e2e-key-0003', requestBody(guestCase))
    await post(`guest.${guestToken}`, 'water-e2e-key-0004', requestBody(guestCase, { soil: { state: 'wet', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' } }))
    expect(count('temporary_care_sessions')).toBe(1)
    expect(count('temporary_care_results')).toBe(2)
  })

  test('E3 登录用户临时案例 Happy；他人案例 / 游客拿登录案例 / 已过期案例 → 404 且无写入', async () => {
    const own = await post(userBearer, 'water-e2e-user-0001', requestBody(userCase))
    expect(own.status).toBe(200)
    expect(sql('SELECT expires_at_ms FROM temporary_care_results;')).toBe(String(userCaseExpiresAtMs))
    expect(count('temporary_care_sessions', 'authenticated_ephemeral_case_internal_id IS NOT NULL AND guest_plant_case_internal_id IS NULL')).toBe(1)
    for (const [bearer, caseRef] of [[userBearer, otherUserCase], [`guest.${guestToken}`, userCase], [`guest.${guestToken}`, expiredGuestCase]] as const) {
      const denied = await post(bearer, `water-e2e-deny-${caseRef.slice(4, 12)}`, requestBody(caseRef))
      expect(denied).toMatchObject({ status: 404, body: { error: { type: 'NOT_FOUND' } } })
    }
    expect(count('temporary_care_results')).toBe(1)
  })

  test('E3 无活动策略 → 200 temporarily_unavailable，仍写真实结果行并记录无发布', async () => {
    sql('DELETE FROM active_business_policy_releases;')
    const response = await post(`guest.${guestToken}`, 'water-e2e-key-0005', requestBody(guestCase))
    expect(response.status).toBe(200)
    expect(response.body.data?.result.status).toBe('temporarily_unavailable')
    const manifest = sql(`SELECT algorithm_release_manifest_json FROM temporary_care_results WHERE result_ref='${response.body.data!.resultRef}';`)
    expect(manifest).toContain('none_published')
  })

  test('Provider 不可用 → 仍 200 且给出盆土安全门结论', async () => {
    providerMode = 'down'
    const response = await post(`guest.${guestToken}`, 'water-e2e-key-0006', requestBody(guestCase, { soil: { state: 'wet', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' } }))
    expect(response.status).toBe(200)
    expect(response.body.data?.result.details.action).toBe('pause_watering')
  })

  test('E5 脱敏：响应、审计、结果表与幂等表不含令牌、user_id、会话引用、精确坐标', async () => {
    const guestResponse = await post(`guest.${guestToken}`, 'water-e2e-key-0007', requestBody(guestCase))
    const userResponse = await post(userBearer, 'water-e2e-user-0002', requestBody(userCase))
    const stored = sql('SELECT input_manifest_json, algorithm_release_manifest_json, derivations_json, result_json FROM temporary_care_results;')
      + sql('SELECT principal_scope_hash, idempotency_key_hash, response_json FROM http_idempotency_records;')
    const observed = guestResponse.text + userResponse.text + JSON.stringify(audits) + stored
    for (const secret of [guestToken, userBearer, userRef, guestRef, '31.230416', '121.473701', 'water-e2e-key-0007', sha(guestToken)]) {
      expect(observed).not.toContain(secret)
    }
    expect(stored).toContain('31.23')
  })
})
