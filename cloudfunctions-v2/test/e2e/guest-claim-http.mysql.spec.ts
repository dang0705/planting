import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createMysqlCapabilitySnapshotReader } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { findProjectRoot } from '../support/project-root.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4 + v2 schema manifest 全量 DDL + 真实 user-plant HTTP 服务（真实登录主体解析、
 * 真实能力快照读取、真实证明/登记/租约/完成/收据/对象类别仓储与事务）。
 * Expected：guest-session-claim.md（2026-10-09 修订）、guest-token/v1 §3、http-api 错误码表、主代理 2026-10-09 裁决 1–4。
 * 不连接 CloudBase、不写云端数据库。
 */
const container = `qhz-guest-claim-http-${process.pid}`
const database = 'qhz_guest_claim_http'
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 4)
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const userRef = 'usr_claimhttp_owner01'
const userBearer = 'fixture-claimhttp-bearer-00000001'
// 真实形态的游客令牌：32 字节随机数的规范 base64url（43 字符）。
const guestToken = Buffer.alloc(32, 7).toString('base64url')
const legacyToken = Buffer.alloc(32, 8).toString('base64url')
const guestRef = 'gst_claimhttp_session1'
const legacyRef = 'gst_claimhttp_legacy01'
let server: Server
let baseUrl = ''
const audits: RequestChainAuditEvent[] = []

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
const scalar = (text: string) => sql(text)

type ClaimBody = { data?: { claimRef: string; userPlantId: string; claimedObjectKinds: string[]; replayed: boolean }; error?: { type: string } }
async function post(value: unknown, key: string | null = 'claim-http-key-0001', bearer: string | null = userBearer) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key !== null) { headers['idempotency-key'] = key }
  if (bearer !== null) { headers.authorization = `Bearer ${bearer}` }
  const response = await fetch(`${baseUrl}/api/v2/user-plants/claims`, { method: 'POST', headers, body: JSON.stringify(value) })
  const text = await response.text()
  return { status: response.status, text, body: JSON.parse(text) as ClaimBody }
}
const claimBody = (caseRef: string, target: unknown = { type: 'existing_user_plant', user_plant_id: 'upl_claimhttp_existing' }, token = guestToken, sessionRef = guestRef) => ({ guestSessionRef: sessionRef, guestPlantCaseRef: caseRef, guestToken: token, target })

beforeAll(async () => {
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  let ready = false
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) { throw new Error('隔离 MySQL 未就绪') }
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  server = createUserPlantServer({ ...fixturePolicyPorts(),
    connectionSource: source,
    now: () => now,
    resolveCapabilitySnapshot: createMysqlCapabilitySnapshotReader(source, () => now),
    writeAudit: event => { audits.push(event) },
    recordRollbackFailure: () => undefined
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 180_000)

afterAll(async () => {
  await new Promise(resolve => (server ? server.close(resolve) : resolve(undefined)))
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

beforeEach(() => {
  audits.length = 0
  const issued = now - 2 * hour
  sql(`SET FOREIGN_KEY_CHECKS=0;
    DELETE FROM temporary_care_results; DELETE FROM temporary_care_sessions; DELETE FROM guest_case_claims; DELETE FROM guest_claim_commands;
    DELETE FROM guest_plant_cases; DELETE FROM guest_sessions; DELETE FROM capability_snapshots; DELETE FROM business_policy_releases;
    DELETE FROM user_plants; DELETE FROM user_sessions; DELETE FROM platform_identities; DELETE FROM users;
    SET FOREIGN_KEY_CHECKS=1;
    INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES (1, '${userRef}', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
    VALUES (1, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued});
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
    SELECT '${sha(userBearer)}', 1, p.id, 1, 'wechat', 'active', ${issued}, ${now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}' FROM platform_identities p WHERE p.user_internal_id = 1;
    INSERT INTO user_plants (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
    VALUES ('', 'upl_claimhttp_existing', 1, 'active', 'unidentified', NULL, 1, ${issued}, ${issued});
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
    VALUES ('bpr_test_capability_0001', 'subscription', 'capability_catalog', 'test/v1', 'test-free-create/v1', '${'a'.repeat(64)}', '{}', 'active', ${issued}, NULL, ${issued}, ${issued}, ${issued});
    INSERT INTO capability_snapshots (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json, rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
      capability_policy_domain_code, capability_policy_code, capability_policy_release_ref, capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
    SELECT 'cps_test_claim_000001', 'user', 1, 'free', '["USER_PLANT_CREATE"]', '[]', 5, r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version, r.content_sha256,
      '${'b'.repeat(64)}', ${now - 1000}, ${now + 60_000}, ${now - 1000}, ${now - 1000} FROM business_policy_releases r WHERE r.release_ref = 'bpr_test_capability_0001';
    INSERT INTO guest_sessions (id, guest_session_ref, identity_source, anonymous_subject_hash, issuance_source_hash, possession_proof_hash, possession_proof_version, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES (1, '${guestRef}', 'server_issued_guest_token', NULL, '${'f'.repeat(64)}', '${sha(guestToken)}', 1, 'active', ${issued}, ${now + 20 * hour}, ${issued}, ${issued}),
           (2, '${legacyRef}', 'cloudbase_anonymous', '${'c'.repeat(64)}', '', '${sha(legacyToken)}', 1, 'active', ${issued}, ${now + 20 * hour}, ${issued}, ${issued});
    INSERT INTO guest_plant_cases (id, guest_plant_case_ref, guest_session_internal_id, status, completed_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
    VALUES (1, 'gpc_claimhttp_case0001', 1, 'active', NULL, ${now + 20 * hour}, 1, ${issued}, ${issued}),
           (2, 'gpc_claimhttp_case0002', 1, 'active', NULL, ${now + 20 * hour}, 1, ${issued}, ${issued}),
           (3, 'gpc_claimhttp_legacy01', 2, 'active', NULL, ${now + 20 * hour}, 1, ${issued}, ${issued});
    INSERT INTO temporary_care_sessions (id, session_ref, guest_plant_case_internal_id, capability_type, status, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES (1, 'tcs_claimhttp_session1', 1, 'watering', 'active', ${now + 20 * hour}, ${issued}, ${issued});
    INSERT INTO temporary_care_results (result_ref, temporary_care_session_internal_id, guest_plant_case_internal_id, contract_version, details_schema_version, environment_contract_version,
      input_manifest_json, input_manifest_sha256, algorithm_release_manifest_json, algorithm_release_manifest_sha256, derivations_json, derivations_sha256, result_json, result_sha256, generated_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
    VALUES ('cres_claimhttp_result01', 1, 1, 'care-capability-result/v1', 'watering-assessment/v1', 'care-environment-foundation/v2', '{}', '${'1'.repeat(64)}', '{}', '${'2'.repeat(64)}', '{}', '${'3'.repeat(64)}', '{}', '${'4'.repeat(64)}', ${issued}, ${now + 20 * hour}, ${issued}, ${issued});`)
})

describe('POST /api/v2/user-plants/claims（真实 MySQL）', () => {
  test('已有目标：200 白名单结果、对象类别来自临时表；案例 claimed、会话仍 active（同会话还有未认领案例）；同键重放 replayed=true', async () => {
    const first = await post(claimBody('gpc_claimhttp_case0001'))
    expect(first.status).toBe(200)
    expect(first.body.data).toEqual({ claimRef: expect.stringMatching(/^gcl_[A-Za-z0-9_-]{8,}$/u), userPlantId: 'upl_claimhttp_existing', claimedObjectKinds: ['independent_watering_advice'], replayed: false })
    expect(scalar("SELECT CONCAT(status,'|',claimed_user_internal_id) FROM guest_plant_cases WHERE id=1;")).toBe('claimed|1')
    expect(scalar('SELECT status FROM guest_sessions WHERE id=1;')).toBe('active')
    const replay = await post(claimBody('gpc_claimhttp_case0001'))
    expect(replay.body.data).toEqual({ ...first.body.data, replayed: true })
    expect(scalar('SELECT COUNT(*) FROM guest_case_claims;')).toBe('1')
  })

  test('新建目标认领最后一个案例：200 新植物，会话同事务置 completed；completed 会话新命令 → 409', async () => {
    await post(claimBody('gpc_claimhttp_case0001'))
    const created = await post(claimBody('gpc_claimhttp_case0002', { type: 'new_user_plant' }), 'claim-http-key-0002')
    expect(created.status).toBe(200)
    expect(created.body.data).toMatchObject({ userPlantId: expect.stringMatching(/^upl_/u), claimedObjectKinds: [], replayed: false })
    expect(created.body.data?.userPlantId).not.toBe('upl_claimhttp_existing')
    expect(scalar('SELECT status FROM guest_sessions WHERE id=1;')).toBe('completed')
    const again = await post(claimBody('gpc_claimhttp_case0002', { type: 'new_user_plant' }), 'claim-http-key-0003')
    expect(again).toMatchObject({ status: 409, body: { error: { type: 'GUEST_SESSION_NOT_CLAIMABLE' } } })
    expect(scalar('SELECT COUNT(*) FROM user_plants;')).toBe('2')
  })

  test('错误令牌 / 历史 cloudbase_anonymous 会话 → 409 GUEST_SESSION_NOT_CLAIMABLE，零命令', async () => {
    expect((await post(claimBody('gpc_claimhttp_case0001', undefined, Buffer.alloc(32, 9).toString('base64url')))).body.error?.type).toBe('GUEST_SESSION_NOT_CLAIMABLE')
    expect((await post(claimBody('gpc_claimhttp_legacy01', undefined, legacyToken, legacyRef))).body.error?.type).toBe('GUEST_SESSION_NOT_CLAIMABLE')
    expect(scalar('SELECT COUNT(*) FROM guest_claim_commands;')).toBe('0')
  })

  test('案例已过期 → 410 GUEST_SESSION_EXPIRED', async () => {
    sql(`UPDATE guest_plant_cases SET expires_at_ms=${now - 1} WHERE id=1;`)
    expect(await post(claimBody('gpc_claimhttp_case0001'))).toMatchObject({ status: 410, body: { error: { type: 'GUEST_SESSION_EXPIRED' } } })
  })

  test('协议拒绝：body 携带 idempotencyKey / 缺幂等头 → 400；缺 Bearer、游客 Bearer → 401；均零命令', async () => {
    expect((await post({ ...claimBody('gpc_claimhttp_case0001'), idempotencyKey: 'claim-http-key-0001' })).status).toBe(400)
    expect((await post(claimBody('gpc_claimhttp_case0001'), null)).status).toBe(400)
    expect((await post(claimBody('gpc_claimhttp_case0001'), 'claim-http-key-0001', null)).status).toBe(401)
    expect((await post(claimBody('gpc_claimhttp_case0001'), 'claim-http-key-0001', `guest.${guestToken}`)).status).toBe(401)
    expect(scalar('SELECT COUNT(*) FROM guest_claim_commands;')).toBe('0')
  })

  test('脱敏：响应、审计与认领表不含游客令牌、user_id、会话引用、幂等键原文', async () => {
    const response = await post(claimBody('gpc_claimhttp_case0001'))
    const stored = sql('SELECT * FROM guest_claim_commands; SELECT * FROM guest_case_claims;')
    const observed = response.text + JSON.stringify(audits) + stored
    for (const secret of [guestToken, userRef, guestRef, 'claim-http-key-0001', userBearer]) {
      expect(observed).not.toContain(secret)
    }
  })

  /**
   * Expected 来源：guest-session-claim.md「认领只补充归属，不把结果转为事实、建议转为计划，也不追溯发放积分」、
   * 「认领成功只新增归属关系」；配置目录硬规则 `user-plant.guest_claim.direct_fact_or_plan_write=false`、
   * `user-plant.guest_claim.retroactive_points=false`；user-plant.md「事实边界」。
   * 层次：L3 / unit_real_data（真实 HTTP + 真实 MySQL 全量 DDL）。只核对本仓库已有的事实/计划/提醒/事件/积分表行数，
   * 不覆盖 care / subscription 域之后由用户显式操作产生的写入。
   */
  test('认领成功（已有目标与新建目标）不写养护事实、建议、计划、提醒、user-plant 事件或积分账本', async () => {
    const sideEffectTables = ['care_facts', 'care_proposals', 'care_plans', 'reminder_jobs', 'user_plant_outbox',
      'care_outbox', 'subscription_outbox', 'subscription_reward_inbox', 'care_point_ledger', 'care_point_accounts']
    const countAll = () => sql(sideEffectTables.map(table => `SELECT '${table}', COUNT(*) FROM ${table};`).join('\n'))
    const before = countAll()
    expect((await post(claimBody('gpc_claimhttp_case0001'))).status).toBe(200)
    expect((await post(claimBody('gpc_claimhttp_case0002', { type: 'new_user_plant' }), 'claim-http-key-0002')).status).toBe(200)
    expect(countAll()).toBe(before)
    expect(before.split('\n').every(line => line.endsWith('\t0'))).toBe(true)
    // 临时结果仍是临时对象，没有被改写为长期事实，只是通过认领解析出新归属。
    expect(scalar('SELECT COUNT(*) FROM temporary_care_results;')).toBe('1')
  })

  /**
   * Expected 来源：guest-session-claim.md「成功后案例 owner、命令目标和成功事实目标均不可更换」、
   * 配置目录硬规则 `user-plant.guest_claim.once`；http-api.md §3 `GUEST_SESSION_NOT_CLAIMABLE`=409。
   * 层次：L3 / unit_real_data。第二个登录用户即使持有同一游客令牌（模拟令牌泄露/共享设备）也不能改写归属。
   */
  test('跨用户：案例已被 A 认领后，B 用同一游客令牌认领 → 409，归属与成功事实不变', async () => {
    const issued = now - 2 * hour
    const otherBearer = 'fixture-claimhttp-bearer-00000002'
    sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES (2, 'usr_claimhttp_other001', 'active', 1, ${issued}, ${issued});
      INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
      VALUES (2, 'wechat', '${'d'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued});
      INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
      SELECT '${sha(otherBearer)}', 2, p.id, 1, 'wechat', 'active', ${issued}, ${now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}' FROM platform_identities p WHERE p.user_internal_id = 2;
      INSERT INTO user_plants (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
      VALUES ('', 'upl_claimhttp_other001', 2, 'active', 'unidentified', NULL, 1, ${issued}, ${issued});`)
    expect((await post(claimBody('gpc_claimhttp_case0001'))).status).toBe(200)
    const stolen = await post(claimBody('gpc_claimhttp_case0001', { type: 'existing_user_plant', user_plant_id: 'upl_claimhttp_other001' }), 'claim-http-key-0009', otherBearer)
    expect(stolen).toMatchObject({ status: 409, body: { error: { type: 'GUEST_SESSION_NOT_CLAIMABLE' } } })
    expect(stolen.text).not.toContain(userRef)
    expect(scalar("SELECT CONCAT(claimed_user_internal_id,'|',claimed_user_plant_internal_id) FROM guest_plant_cases WHERE id=1;"))
      .toBe(scalar("SELECT CONCAT(user_internal_id,'|',id) FROM user_plants WHERE public_user_plant_id='upl_claimhttp_existing';"))
    expect(scalar('SELECT COUNT(*) FROM guest_case_claims;')).toBe('1')
    expect(scalar('SELECT COUNT(*) FROM guest_case_claims WHERE user_internal_id=2;')).toBe('0')
  })

  /**
   * Expected 来源：guest-session-claim.md（2026-10-10 用户裁决）：新建目标时服务端能力快照已失效且无可重放原成功 →
   * 409 CAPABILITY_SNAPSHOT_EXPIRED，不新建植物、不改变案例。层次：L3 / unit_real_data（真实快照读取器读到过期快照）。
   */
  test('新建目标且能力快照已过期 → 409 CAPABILITY_SNAPSHOT_EXPIRED，不建植物、案例仍 active、无成功事实', async () => {
    sql(`UPDATE capability_snapshots SET valid_until_ms=${now - 1} WHERE snapshot_ref='cps_test_claim_000001';`)
    const response = await post(claimBody('gpc_claimhttp_case0002', { type: 'new_user_plant' }), 'claim-http-key-0021')
    expect(response).toMatchObject({ status: 409, body: { error: { type: 'CAPABILITY_SNAPSHOT_EXPIRED' } } })
    expect(scalar('SELECT COUNT(*) FROM user_plants;')).toBe('1')
    expect(scalar('SELECT status FROM guest_plant_cases WHERE id=2;')).toBe('active')
    expect(scalar('SELECT COUNT(*) FROM guest_case_claims;')).toBe('0')
  })
})
