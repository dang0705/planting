import { spawnSync } from 'node:child_process'
import { createHash, createHmac, hkdfSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { resolveGuestPrincipal } from '../../src/identity/application/resolve-guest-principal.js'
import { deriveGuestIssuanceSourceKey } from '../../src/identity/http/guest-session-route.js'
import { createIdentityServer } from '../../src/identity/http/server.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { createMysqlIdentitySessionPolicyReader } from '../../src/identity/repository/mysql-identity-session-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected：models/identity/guest-token-test-matrix.md「游客签发与解析 MySQL 端到端」。
 * unit_real_data：真实 MySQL 8.4 + 真实 identity HTTP 服务 + 真实策略读取器；不接抖音换取，不是云端验收。
 */
const container = `qhz-identity-guest-${process.pid}`
const database = 'qhz_identity_guest'
const now = Date.UTC(2026, 9, 9, 4)
const hour = 3_600_000
const masterKey = Buffer.alloc(32, 5)
// 独立按合同顺序构造策略正文与摘要，不调用被测摘要函数。
const v1Body = { contractVersion: 'identity-session-policy/v1', scopeCode: 'identity_sessions', sessionTtlHours: 24, refreshWindowHours: 0 }
const v2Body = { ...v1Body, contractVersion: 'identity-session-policy/v2', guestSessionTtlHours: 168, guestIssuanceRatePerHour: 10, douyinAnonymousSignalEnabled: true }
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const derivedKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'qinghuazhi/guest-issuance-source/v1', 32))
const ipDigest = (ip: string) => createHmac('sha256', derivedKey).update(`client_ip:${ip}`).digest('hex')
let source: ReturnType<typeof createMysql2ConnectionSource>
let server: Server
let baseUrl: string
const releaseIds: Record<string, number> = {}

function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input })
  if (result.status !== 0) { throw new Error(result.stderr || '隔离MySQL操作失败') }
  return result.stdout.trim()
}
function mysql(sql: string, db?: string): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', '-N', ...(db ? [db] : [])], sql)
}
/** 插入一条已审校发布（模拟测试库发布，不代表云端已发布）。 */
async function insertRelease(ref: string, body: Record<string, unknown>, releaseVersion: string): Promise<number> {
  const connection = await source.getConnection()
  try {
    const result = await connection.execute(`INSERT INTO business_policy_releases
      (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256,
       policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, 'identity', 'identity_sessions', ?, ?, ?, CAST(? AS JSON), 'active', ?, ?, ?, ?)`,
    [ref, String(body.contractVersion), releaseVersion, sha(body), JSON.stringify(body), now - hour, now - hour, now - hour, now - hour])
    return result.insertId as number
  } finally { connection.release() }
}
/** 把活动指针指向某条发布。 */
function activate(key: 'v1' | 'v2'): void {
  const body = key === 'v1' ? v1Body : v2Body
  mysql(`DELETE FROM active_business_policy_releases; INSERT INTO active_business_policy_releases
    (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256, activated_at_ms, created_at_ms, updated_at_ms)
    VALUES ('identity', 'identity_sessions', ${releaseIds[key]}, 'identity-sessions/${key}', '${sha(body)}', ${now - hour}, ${now - hour}, ${now - hour});`, database)
}
async function issue(ip: string) {
  const response = await fetch(`${baseUrl}/api/v2/identity/guest-sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ platform: 'xiaohongshu' }),
  })
  return { status: response.status, body: await response.json() as { data?: { guestToken: string; guestSessionRef: string; expiresAt: string } } }
}
const rowCount = () => Number(mysql('SELECT COUNT(*) FROM guest_sessions;', database))

describe('unit_real_data 游客签发与解析（真实 MySQL + HTTP）', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) { throw new Error('隔离MySQL尚未就绪') }
    mysql(`CREATE DATABASE ${database}`)
    const root = findProjectRoot()
    const configuration = readFileSync(join(root, 'docs/backend-v2/schema/007_configuration.sql'), 'utf8')
    for (const name of ['business_policy_releases', 'active_business_policy_releases']) {
      mysql(configuration.match(new RegExp('CREATE TABLE `' + name + '`[^;]*;', 's'))![0], database)
    }
    mysql(readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8').match(/CREATE TABLE `guest_sessions`[^;]*;/s)![0], database)
    mysql(readFileSync(join(root, 'docs/backend-v2/schema/023_guest_token_sessions.sql'), 'utf8'), database)
    const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
    source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
    releaseIds.v1 = await insertRelease('bpr_identity_e2e_v1', v1Body, 'identity-sessions/v1')
    releaseIds.v2 = await insertRelease('bpr_identity_e2e_v2', v2Body, 'identity-sessions/v2')
    const reader = createMysqlIdentitySessionPolicyReader(source)
    server = createIdentityServer({
      connectionSource: source,
      verifyPlatformCode: async () => { throw new Error('本用例不调用登录') },
      resolveSessionPolicy: () => reader.read(new Date(now).toISOString()),
      now: () => now,
      writeAudit: () => undefined,
      recordRollbackFailure: () => undefined,
      guestIssuance: {
        resolveGuestPolicy: async () => (await reader.read(new Date(now).toISOString()))?.guest ?? null,
        exchangeDouyinAnonymousCode: null,
        issuanceSourceKey: deriveGuestIssuanceSourceKey(masterKey),
      },
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }, 60_000)
  afterAll(async () => {
    await new Promise(resolve => server?.close(resolve))
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  })
  beforeEach(() => { mysql('DELETE FROM guest_sessions;', database); activate('v2') })

  it('E1+E2：签发写入摘要行，令牌可经真实存储解析为游客', async () => {
    const result = await issue('203.0.113.20')
    expect(result.status).toBe(200)
    const data = result.body.data!
    expect(data.expiresAt).toBe(new Date(now + 168 * hour).toISOString())
    const row = mysql(`SELECT guest_session_ref, identity_source, possession_proof_hash, issuance_source_hash, IFNULL(anonymous_subject_hash,'NULL'), status, expires_at_ms FROM guest_sessions;`, database).split('\t')
    expect(row).toEqual([data.guestSessionRef, 'server_issued_guest_token', createHash('sha256').update(data.guestToken).digest('hex'),
      ipDigest('203.0.113.20'), 'NULL', 'active', String(now + 168 * hour)])
    const everything = mysql('SELECT * FROM guest_sessions;', database)
    expect(everything).not.toContain(data.guestToken)
    expect(everything).not.toContain('203.0.113.20')
    const principal = await resolveGuestPrincipal({ repository: createMysqlGuestSessionRepository(source) }, { guestToken: data.guestToken, nowMs: now + hour })
    expect(principal).toMatchObject({ principalType: 'guest', guestSessionRef: data.guestSessionRef, authProvider: 'server_issued_guest_token' })
  })
  it('E3：同 IP 10 次后第 11 次 429；另一 IP 仍可签发', async () => {
    for (let index = 0; index < 10; index += 1) { expect((await issue('203.0.113.21')).status).toBe(200) }
    expect((await issue('203.0.113.21')).status).toBe(429)
    expect(rowCount()).toBe(10)
    expect((await issue('203.0.113.22')).status).toBe(200)
  })
  it('E4：活动指针切回 v1 → 503，不新增行', async () => {
    activate('v1')
    expect((await issue('203.0.113.23')).status).toBe(503)
    expect(rowCount()).toBe(0)
  })
})
