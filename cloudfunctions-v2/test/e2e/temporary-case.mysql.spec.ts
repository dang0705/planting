import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import type { GuestPrincipalDto, GuestSessionRef } from '../../src/contracts/types.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection, type Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver, type MysqlTransactionContext } from '../../src/foundation/database/mysql-transaction-driver.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import { createResolveGuestOrUserPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlUserPrincipalRepository, type UserPrincipalSqlRow } from '../../src/identity/repository/mysql-user-principal-repository.js'
import { createTemporaryCaseApplicationService } from '../../src/user-plant/application/create-temporary-case.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { createMysqlTemporaryCaseRepository } from '../../src/user-plant/repository/mysql-temporary-case-repository.js'
import { createMysqlUserPlantLimitsPolicyReader } from '../../src/user-plant/repository/mysql-user-plant-limits-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4 + schema manifest 全量 DDL + 真实 user-plant HTTP 服务、
 * 真实游客/登录主体解析、真实 userplant_limits 策略读取器、真实共享幂等表与行锁事务。
 * Expected：models/user-plant/temporary-case-contract.md；矩阵 D2/D3/D4、A1–A5、R3/R4、S1–S4。
 * 5 / 168 为配置目录 confirmed 值，只出现在测试发布夹具中。不连接 CloudBase、不写云端数据库。
 */
const container = `qhz-temporary-case-${process.pid}`
const database = 'qhz_temporary_case'
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 4)
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const policyBody = { contractVersion: 'user-plant-limits-policy/v1', scopeCode: 'userplant_limits', guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168 }
const policySha = sha(JSON.stringify(policyBody))
const userRef = 'usr_temp_owner_00001'
const userBearer = 'fixture-temp-user-bearer-000000001'
const guests = {
  short: { ref: 'gst_temp_short_00001', token: 'A'.repeat(43), status: 'active', expiresAtMs: now + 24 * hour },
  long: { ref: 'gst_temp_long_000001', token: 'B'.repeat(43), status: 'active', expiresAtMs: now + 200 * hour },
  expired: { ref: 'gst_temp_expired_001', token: 'C'.repeat(43), status: 'active', expiresAtMs: now - hour },
  completed: { ref: 'gst_temp_completed01', token: 'D'.repeat(43), status: 'completed', expiresAtMs: now + 24 * hour }
} as const
let source: ReturnType<typeof createMysql2ConnectionSource>
let server: Server
let baseUrl = ''
const audits: RequestChainAuditEvent[] = []

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
function sql(text: string, db: string | null = database): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
}
const count = (table: string, where = '1=1') => Number(sql(`SELECT COUNT(*) FROM ${table} WHERE ${where};`))
const guestId = (ref: string) => sql(`SELECT id FROM guest_sessions WHERE guest_session_ref='${ref}';`)

function post(bearer: string, key: string, body = '{}') {
  return fetch(`${baseUrl}/api/v2/user-plants/temporary-cases`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'idempotency-key': key }, body
  }).then(async response => ({ status: response.status, text: await response.text() }))
}
const json = (text: string) => JSON.parse(text) as { data?: { caseRef: string; ownerKind: string; expiresAt: string }; error?: { type: string } }

function activatePolicy(): void {
  sql(`DELETE FROM active_business_policy_releases;
    INSERT INTO active_business_policy_releases (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, activated_at_ms, created_at_ms, updated_at_ms)
    SELECT 'user-plant', 'userplant_limits', id, release_version, content_sha256, ${now - hour}, ${now - hour}, ${now - hour}
    FROM business_policy_releases WHERE release_ref = 'bpr_temp_case_limits01';`)
}
function seedGuestCases(ref: string, rows: ReadonlyArray<readonly [string, number]>): void {
  const id = guestId(ref)
  rows.forEach(([status, expiresAtMs], index) => {
    const completed = status === 'completed' ? String(now - hour) : 'NULL'
    sql(`INSERT INTO guest_plant_cases (guest_plant_case_ref, guest_session_internal_id, status, completed_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
      VALUES ('gpc_seed_${ref.slice(4)}_${index}', ${id}, '${status}', ${completed}, ${expiresAtMs}, 1, ${now - 2 * hour}, ${now - 2 * hour});`)
  })
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
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  const issued = now - 2 * hour
  sql(`INSERT INTO users (public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES ('${userRef}', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
    SELECT id, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued} FROM users WHERE public_user_id='${userRef}';
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
    SELECT '${sha(userBearer)}', u.id, p.id, 1, 'wechat', 'active', ${issued}, ${now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}'
    FROM users u JOIN platform_identities p ON p.user_internal_id = u.id WHERE u.public_user_id='${userRef}';
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
    VALUES ('bpr_temp_case_limits01', 'user-plant', 'userplant_limits', 'user-plant-limits-policy/v1', 'userplant-limits/v1', '${policySha}', CAST('${JSON.stringify(policyBody)}' AS JSON), 'active', ${now - hour}, ${now - hour}, ${now - hour}, ${now - hour});`)
  for (const guest of Object.values(guests)) {
    sql(`INSERT INTO guest_sessions (guest_session_ref, identity_source, anonymous_subject_hash, issuance_source_hash, possession_proof_hash, possession_proof_version, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
      VALUES ('${guest.ref}', 'server_issued_guest_token', NULL, '${'f'.repeat(64)}', '${sha(guest.token)}', 1, '${guest.status}', ${now - 3 * hour}, ${guest.expiresAtMs}, ${now - 3 * hour}, ${now - 3 * hour});`)
  }
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  const policyReader = createMysqlUserPlantLimitsPolicyReader(source)
  server = createUserPlantServer({ ...fixturePolicyPorts(),
    connectionSource: source,
    now: () => now,
    resolveCapabilitySnapshot: async () => { throw new Error('临时案例不读取能力快照') },
    writeAudit: event => { audits.push(event) },
    recordRollbackFailure: () => undefined,
    readUserPlantLimitsPolicy: capturedAt => policyReader.read(capturedAt),
    resolveGuestOrUserPrincipal: createResolveGuestOrUserPrincipal({
      guestRepository: createMysqlGuestSessionRepository(source),
      resolveUser: createResolveUserPrincipalUseCase({
        repository: {
          read: input => withReadConnection(source, connection => createMysqlUserPrincipalRepository({
            executeQuery: async (text, parameters) => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPrincipalSqlRow[]
          }).read(input))
        }
      })
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
  sql('DROP TRIGGER IF EXISTS reject_guest_case_insert; DELETE FROM guest_plant_cases; DELETE FROM authenticated_ephemeral_plant_cases; DELETE FROM http_idempotency_records;')
  activatePolicy()
  audits.length = 0
})

describe('POST /api/v2/user-plants/temporary-cases（真实 MySQL）', () => {
  test('A1/D2 游客 Happy：会话 24h 内到期 → 案例 expiresAt 取会话到期；行读回一致', async () => {
    const response = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0001')
    expect(response.status).toBe(200)
    const data = json(response.text).data!
    expect(data).toEqual({ caseRef: expect.stringMatching(/^gpc_[A-Za-z0-9_-]{8,60}$/u), ownerKind: 'guest', expiresAt: new Date(now + 24 * hour).toISOString() })
    expect(sql(`SELECT guest_session_internal_id, status, expires_at_ms, version, created_at_ms FROM guest_plant_cases WHERE guest_plant_case_ref='${data.caseRef}';`).split('\t'))
      .toEqual([guestId(guests.short.ref), 'active', String(now + 24 * hour), '1', String(now)])
    expect(count('authenticated_ephemeral_plant_cases')).toBe(0)
  })

  test('D2 游客会话剩余 200h（晚于 now+168h）→ 案例 expiresAt 仍等于会话 expiresAt', async () => {
    const response = await post(`guest.${guests.long.token}`, 'temp-e2e-key-0002')
    expect(json(response.text).data?.expiresAt).toBe(new Date(guests.long.expiresAtMs).toISOString())
    expect(sql(`SELECT expires_at_ms FROM guest_plant_cases WHERE guest_session_internal_id=${guestId(guests.long.ref)};`)).toBe(String(guests.long.expiresAtMs))
  })

  test('A3/S2/S4 第 5 个成功、第 6 个 409；过期/非 active 案例不计数；同键重放（含 409）不新增行', async () => {
    seedGuestCases(guests.short.ref, [
      ['active', now + hour], ['active', now + hour], ['active', now + hour], ['active', now + hour],
      ['active', now - 1], ['expired', now + hour], ['completed', now + hour], ['failed', now + hour]
    ])
    const fifth = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0005')
    expect(fifth.status).toBe(200)
    const sixth = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0006')
    expect(sixth.status).toBe(409)
    expect(json(sixth.text).error?.type).toBe('TEMPORARY_CASE_LIMIT_REACHED')
    const rowsBefore = count('guest_plant_cases')
    expect(await post(`guest.${guests.short.token}`, 'temp-e2e-key-0006')).toEqual(sixth)
    expect(await post(`guest.${guests.short.token}`, 'temp-e2e-key-0005')).toEqual(fifth)
    expect(count('guest_plant_cases')).toBe(rowsBefore)
    expect(count('guest_plant_cases', `status='active' AND expires_at_ms>${now}`)).toBe(5)
    expect(count('http_idempotency_records', "state='completed'")).toBe(2)
  })

  test('S3 并发：已有 4 个时 3 个不同键并发 → 恰好 1 个成功', async () => {
    seedGuestCases(guests.short.ref, [['active', now + hour], ['active', now + hour], ['active', now + hour], ['active', now + hour]])
    const results = await Promise.all(['temp-e2e-par-0001', 'temp-e2e-par-0002', 'temp-e2e-par-0003'].map(key => post(`guest.${guests.short.token}`, key)))
    expect(results.map(result => result.status).sort()).toEqual([200, 409, 409])
    expect(count('guest_plant_cases', `status='active' AND expires_at_ms>${now}`)).toBe(5)
  })

  test('A2/D4 登录 Happy：epc_、now+168h、只写登录临时案例表', async () => {
    const response = await post(userBearer, 'temp-e2e-user-0001')
    expect(response.status).toBe(200)
    const data = json(response.text).data!
    expect(data).toEqual({ caseRef: expect.stringMatching(/^epc_[A-Za-z0-9_-]{8,60}$/u), ownerKind: 'authenticated', expiresAt: new Date(now + 168 * hour).toISOString() })
    expect(sql(`SELECT u.public_user_id, c.status, c.expires_at_ms FROM authenticated_ephemeral_plant_cases c JOIN users u ON u.id=c.user_internal_id WHERE c.ephemeral_plant_case_ref='${data.caseRef}';`).split('\t'))
      .toEqual([userRef, 'active', String(now + 168 * hour)])
    expect(count('guest_plant_cases')).toBe(0)
  })

  test('R4 无活动策略 → 503，任何表无写入', async () => {
    sql('DELETE FROM active_business_policy_releases;')
    const response = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0503')
    expect(response.status).toBe(503)
    expect(json(response.text).error?.type).toBe('SERVICE_UNAVAILABLE')
    expect(count('guest_plant_cases') + count('authenticated_ephemeral_plant_cases') + count('http_idempotency_records')).toBe(0)
  })

  test.each([['已过期游客会话', `guest.${guests.expired.token}`], ['completed 游客会话', `guest.${guests.completed.token}`], ['未知游客令牌', `guest.${'Z'.repeat(43)}`], ['未知登录令牌', 'fixture-unknown-bearer-00000001']])('R3/D3 %s → 401 且无写入', async (_name, bearer) => {
    const response = await post(bearer, 'temp-e2e-key-0401')
    expect(response.status).toBe(401)
    expect(json(response.text).error?.type).toBe('PRINCIPAL_INVALID')
    expect(count('guest_plant_cases') + count('http_idempotency_records')).toBe(0)
  })

  test('A5 插入失败 → 回滚无残留；去掉故障后同键重试成功', async () => {
    sql("CREATE TRIGGER reject_guest_case_insert BEFORE INSERT ON guest_plant_cases FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected failure';")
    const failed = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0500')
    expect(failed.status).toBe(500)
    expect(failed.text).not.toContain('injected')
    expect(count('guest_plant_cases') + count('http_idempotency_records')).toBe(0)
    sql('DROP TRIGGER reject_guest_case_insert;')
    expect((await post(`guest.${guests.short.token}`, 'temp-e2e-key-0500')).status).toBe(200)
  })

  test('S1 响应、审计与幂等快照脱敏', async () => {
    const response = await post(userBearer, 'temp-e2e-user-0002')
    const guestResponse = await post(`guest.${guests.short.token}`, 'temp-e2e-key-0007')
    const stored = sql('SELECT principal_scope_hash, idempotency_key_hash, response_json FROM http_idempotency_records;')
    const observed = response.text + guestResponse.text + JSON.stringify(audits) + stored
    for (const secret of [userBearer, guests.short.token, userRef, guests.short.ref, 'temp-e2e-user-0002', 'temp-e2e-key-0007', sha(userBearer), sha(guests.short.token)]) {
      expect(observed).not.toContain(secret)
    }
    expect(Object.keys(json(response.text).data!).sort()).toEqual(['caseRef', 'expiresAt', 'ownerKind'])
    expect(stored).toContain(sha(userRef))
    expect(stored).toContain(sha(guests.short.ref))
  })

  test('A4 同键异摘要（应用服务直连真实幂等表）→ 409 IDEMPOTENCY_CONFLICT，无第二行', async () => {
    const driver = createMysqlTransactionDriver(source, () => undefined)
    const idempotencyRepository = createMysqlHttpIdempotencyRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
      executeQuery: async (transaction, text, parameters) => (await transaction.connection.query(text, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[],
      executeWrite: (transaction, text, parameters) => transaction.connection.execute(text, toSqlParameters(parameters))
    })
    const service = createTemporaryCaseApplicationService({
      driver, idempotencyRepository, temporaryCaseRepository: createMysqlTemporaryCaseRepository(),
      commitUnknownReadOnlyRepository: createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
        executeQuery: (text, parameters) => withReadConnection(source, async connection => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[])
      })
    })
    const principal: GuestPrincipalDto = { principalType: 'guest', guestSessionRef: guests.short.ref as GuestSessionRef, authProvider: 'server_issued_guest_token', issuedAt: new Date(now - 3 * hour).toISOString(), expiresAt: new Date(guests.short.expiresAtMs).toISOString() }
    const base = {
      principal, limits: { guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168 }, occurredAtMs: now,
      idempotency: { principalType: 'guest' as const, principalScopeHash: sha(guests.short.ref), httpMethod: 'POST', normalizedPath: '/api/v2/user-plants/temporary-cases', operationId: 'createTemporaryCase', idempotencyKeyHash: sha('temp-e2e-conflict'), requestHash: sha('{}'), createdAtMs: now, expiresAtMs: now + hour }
    }
    expect((await service({ ...base, newCaseRef: 'gpc_conflict_case_0001' })).status).toBe(200)
    const conflict = await service({ ...base, newCaseRef: 'gpc_conflict_case_0002', idempotency: { ...base.idempotency, requestHash: sha('{"other":true}') } })
    expect(conflict).toMatchObject({ status: 409, body: { error: { type: 'IDEMPOTENCY_CONFLICT' } } })
    expect(count('guest_plant_cases')).toBe(1)
  })
})
