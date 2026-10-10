import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createMysqlCapabilitySnapshotReader } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { findProjectRoot } from '../support/project-root.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 + v2 schema manifest 全量 DDL + 真实 user-plant HTTP 服务
 * （真实 Bearer 会话解析、真实能力快照读取、真实列表 SQL、真实删除事务与共享幂等表）。
 * Expected：docs/backend-v2/contracts/user-plant.md「列表公开接口」「删除公开接口」（2026-10-10 用户裁决冻结）、
 * 「生命周期」（deleting 公开视为不存在、不计入 active 上限）、http-api.md §3/§4；
 * 配置目录 user-plant.list.page_size = {default:20,max:50}（hard_rule）。
 * 不覆盖：CloudBase 网关、云端 MySQL、真实平台登录、deleting→deleted 清理编排（未冻结）。
 */
const container = `qhz-up-list-delete-${process.pid}`
const database = 'qhz_up_list_delete'
const hour = 3_600_000
const now = Date.UTC(2026, 9, 10, 4)
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const ownerRef = 'usr_listdel_owner0001'
const strangerRef = 'usr_listdel_stranger01'
const ownerBearer = 'fixture-listdel-owner-bearer-0001'
const strangerBearer = 'fixture-listdel-stranger-bearer-01'
/** 夹具植物：创建时间与生命周期各不相同；t3000 两株同毫秒用于验证同刻按公开引用二进制倒序。 */
const plants = {
  p1: 'upl_listdel_t1000_active',
  p2: 'upl_listdel_t2000_archiv',
  p3: 'upl_listdel_t3000_aaaaaa',
  p4: 'upl_listdel_t3000_bbbbbb',
  p5: 'upl_listdel_t4000_deleting',
  p6: 'upl_listdel_t5000_deleted',
  foreign: 'upl_listdel_foreign_0001'
} as const
let server: Server
let baseUrl = ''
const audits: RequestChainAuditEvent[] = []

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)

type Json = { data?: Record<string, unknown> & { items?: Array<Record<string, unknown>>; nextCursor?: string | null }; error?: { type: string } }
async function call(method: string, pathName: string, options: { bearer?: string | undefined; key?: string; body?: string } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${options.bearer ?? ownerBearer}` }
  if (options.body !== undefined) { headers['content-type'] = 'application/json' }
  if (options.key !== undefined) { headers['idempotency-key'] = options.key }
  const response = await fetch(`${baseUrl}${pathName}`, options.body === undefined ? { method, headers } : { method, headers, body: options.body })
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text) as Json }
}
const list = (query = '', bearer?: string) => call('GET', `/api/v2/user-plants${query}`, { bearer })
const remove = (ref: string, version: number, key: string, bearer?: string) => call('DELETE', `/api/v2/user-plants/${ref}`, { bearer, key, body: JSON.stringify({ expectedVersion: version }) })
const refsOf = (body: Json) => (body.data?.items ?? []).map(item => item.user_plant_id)
const lifecycleOf = (ref: string) => sql(`SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id='${ref}';`)

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
  const plantRow = (ref: string, user: number, lifecycle: string, createdAt: number) =>
    `('', '${ref}', ${user}, '${lifecycle}', 'unidentified', NULL, 1, ${createdAt}, ${createdAt})`
  sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES
      (1, '${ownerRef}', 'active', 1, ${issued}, ${issued}), (2, '${strangerRef}', 'active', 1, ${issued}, ${issued});
    INSERT INTO platform_identities (user_internal_id, platform, platform_subject_hash, subject_hash_key_version, platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms) VALUES
      (1, 'wechat', '${'e'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued}),
      (2, 'wechat', '${'d'.repeat(64)}', 'fixture-k1', NULL, 'wx85bb3976301f75fb', 'active', ${issued}, ${issued}, ${issued});
    INSERT INTO user_sessions (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version, authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms, updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
      SELECT IF(p.user_internal_id = 1, '${sha(ownerBearer)}', '${sha(strangerBearer)}'), p.user_internal_id, p.id, 1, 'wechat', 'active', ${issued}, ${now + 24 * hour}, NULL, ${issued}, ${issued}, 'identity-session-test/v1', '${'a'.repeat(64)}' FROM platform_identities p;
    INSERT INTO user_plants (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, confirmed_identity_internal_id, version, created_at_ms, updated_at_ms) VALUES
      ${plantRow(plants.p1, 1, 'active', 1000)}, ${plantRow(plants.p2, 1, 'archived', 2000)}, ${plantRow(plants.p3, 1, 'active', 3000)},
      ${plantRow(plants.p4, 1, 'active', 3000)}, ${plantRow(plants.p5, 1, 'deleting', 4000)}, ${plantRow(plants.p6, 1, 'deleted', 5000)},
      ${plantRow(plants.foreign, 2, 'active', 6000)};
    INSERT INTO business_policy_releases (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256, policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES ('bpr_test_capability_0001', 'subscription', 'capability_catalog', 'test/v1', 'test-free-create/v1', '${'a'.repeat(64)}', '{}', 'active', ${issued}, NULL, ${issued}, ${issued}, ${issued});
    INSERT INTO capability_snapshots (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json, rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
      capability_policy_domain_code, capability_policy_code, capability_policy_release_ref, capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
      SELECT 'cps_test_listdel_00001', 'user', 1, 'member', '["USER_PLANT_CREATE"]', '[]', 3, r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version, r.content_sha256,
        '${'b'.repeat(64)}', ${now - 1000}, ${now + 60_000}, ${now - 1000}, ${now - 1000} FROM business_policy_releases r;`)
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

describe('GET /api/v2/user-plants（真实 MySQL）', () => {
  test('缺省：只列本人 active+archived，按创建时间倒序、同毫秒按公开引用二进制倒序；deleting/deleted/他人不出现', async () => {
    const response = await list()
    expect(response.status).toBe(200)
    expect(refsOf(response.json)).toEqual([plants.p4, plants.p3, plants.p2, plants.p1])
    expect(response.json.data?.nextCursor).toBeNull()
  })

  test('lifecycle 筛选：archived 只有归档株，active 只有正常株', async () => {
    expect(refsOf((await list('?lifecycle=archived')).json)).toEqual([plants.p2])
    expect(refsOf((await list('?lifecycle=active')).json)).toEqual([plants.p4, plants.p3, plants.p1])
  })

  test('游标分页：limit=1 逐页翻完，不重不漏，最后一页 nextCursor 为 null', async () => {
    const seen: unknown[] = []
    let cursor: string | null | undefined = null
    for (let page = 0; page < 10; page += 1) {
      const response = await list(`?limit=1${cursor ? `&cursor=${cursor}` : ''}`)
      expect(response.status).toBe(200)
      expect(response.json.data?.items).toHaveLength(1)
      seen.push(...refsOf(response.json))
      cursor = response.json.data?.nextCursor
      if (cursor === null) { break }
      expect(cursor).not.toContain(ownerRef)
    }
    expect(seen).toEqual([plants.p4, plants.p3, plants.p2, plants.p1])
  })

  test('每项与单株读取的公开投影完全一致', async () => {
    const items = (await list()).json.data?.items ?? []
    for (const item of items) {
      const single = await call('GET', `/api/v2/user-plants/${String(item.user_plant_id)}`)
      // 封面合同（2026-10-10）：列表项额外带 hasCover；其余字段与单株读取完全一致。
      const { hasCover, ...rest } = item
      expect(hasCover).toBe(false)
      expect(single.json.data).toEqual(rest)
    }
  })

  test('他人会话只看到自己的植物；limit=51 → 400', async () => {
    expect(refsOf((await list('', strangerBearer)).json)).toEqual([plants.foreign])
    expect((await list('?limit=51')).status).toBe(400)
  })
})

describe('DELETE /api/v2/user-plants/{ref}（真实 MySQL）', () => {
  test('标记删除：200 deleting、版本 +1；之后单株读取/列表/归档/恢复均视为不存在；同键重放原结果；同键异参 409；新键 404', async () => {
    const first = await remove(plants.p3, 1, 'listdel-delete-key-0001')
    expect(first.status).toBe(200)
    expect(first.json).toEqual({ data: { user_plant_id: plants.p3, lifecycle: 'deleting', version: 2, updatedAt: new Date(now).toISOString() } })
    expect(lifecycleOf(plants.p3)).toBe('deleting:2')
    expect((await call('GET', `/api/v2/user-plants/${plants.p3}`)).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect(refsOf((await list()).json)).not.toContain(plants.p3)
    for (const action of ['archive', 'restore']) {
      const blocked = await call('POST', `/api/v2/user-plants/${plants.p3}/${action}`, { key: `listdel-${action}-key-01`, body: '{"expectedVersion":2}' })
      expect(blocked.status).toBe(404)
    }
    const replay = await remove(plants.p3, 1, 'listdel-delete-key-0001')
    expect(replay.status).toBe(200)
    expect(replay.json).toEqual(first.json) // 幂等表以 JSON 列保存，字段顺序可能不同；比较语义相同
    expect((await remove(plants.p3, 2, 'listdel-delete-key-0001')).json.error?.type).toBe('IDEMPOTENCY_CONFLICT')
    expect((await remove(plants.p3, 2, 'listdel-delete-key-0002')).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect(lifecycleOf(plants.p3)).toBe('deleting:2')
  })

  test('deleting 不计入 active 上限：上限 3、原有 3 株 active，删除一株后可以新建', async () => {
    const created = await call('POST', '/api/v2/user-plants', { key: 'listdel-create-after-delete', body: '{}' })
    expect(created.status).toBe(200)
    const blocked = await call('POST', '/api/v2/user-plants', { key: 'listdel-create-over-limit', body: '{}' })
    expect(blocked.json.error?.type).toBe('CAPABILITY_DENIED')
  })

  test('版本过期 → 409 USER_PLANT_VERSION_CONFLICT，状态不变', async () => {
    const response = await remove(plants.p1, 9, 'listdel-delete-stale-01')
    expect(response.json.error?.type).toBe('USER_PLANT_VERSION_CONFLICT')
    expect(response.status).toBe(409)
    expect(lifecycleOf(plants.p1)).toBe('active:1')
  })

  test('跨用户删除他人植物 → 404，目标不变；已在删除中/已删除 → 404', async () => {
    expect((await remove(plants.p1, 1, 'listdel-delete-foreign1', strangerBearer)).status).toBe(404)
    expect(lifecycleOf(plants.p1)).toBe('active:1')
    expect((await remove(plants.p5, 1, 'listdel-delete-deleting')).status).toBe(404)
    expect((await remove(plants.p6, 1, 'listdel-delete-deleted1')).status).toBe(404)
    expect(lifecycleOf(plants.p5)).toBe('deleting:1')
  })

  test('归档植物可以删除', async () => {
    const response = await remove(plants.p2, 1, 'listdel-delete-archived')
    expect(response.json.data).toMatchObject({ lifecycle: 'deleting', version: 2 })
    expect(lifecycleOf(plants.p2)).toBe('deleting:2')
  })

  test('两个请求用不同幂等键同时删除同一株：只有一个 200，最终版本只 +1', async () => {
    const results = await Promise.all([
      remove(plants.p4, 1, 'listdel-race-key-00001'),
      remove(plants.p4, 1, 'listdel-race-key-00002')
    ])
    expect(results.filter(result => result.status === 200)).toHaveLength(1)
    expect(results.filter(result => result.status !== 200).map(result => result.json.error?.type))
      .toEqual([expect.stringMatching(/^(USER_PLANT_NOT_FOUND|USER_PLANT_VERSION_CONFLICT)$/u)])
    expect(lifecycleOf(plants.p4)).toBe('deleting:2')
  })

  test('脱敏：响应与审计不含 user_id、Bearer、幂等键原文或内部主键字段名', async () => {
    const response = await remove(plants.p1, 1, 'listdel-delete-redact01')
    const observed = response.text + JSON.stringify(audits) + (await list()).text
    for (const secret of [ownerRef, ownerBearer, 'listdel-delete-redact01', 'user_internal_id', '"id"']) {
      expect(observed).not.toContain(secret)
    }
  })
})
