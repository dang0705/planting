import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { readDatabaseConnectionConfig } from '../../src/foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createMysqlCapabilitySnapshotReader } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { findProjectRoot } from '../support/project-root.js'

const containerName = `qhz-v2-get-user-plant-http-${String(process.pid)}`
const databaseName = `qinghuazhi_v2_get_user_plant_http_${String(process.pid)}`
const appUser = 'qhz_v2_app'
const appPassword = 'fixture-app-password-02'
const successExitCode = 0
const mysqlReadyAttempts = 120
const mysqlReadyIntervalMs = 250
const ephemeralPort = 0
const dayMs = 86_400_000
const nowMs = Date.UTC(2026, 8, 24, 3, 0, 0)
const ownerRef = 'usr_http_owner_0001'
const strangerRef = 'usr_http_stranger_01'
const newOwnerRef = 'usr_http_new_owner_01'
const ownedPlantRef = 'upl_http_owned_00001'
const foreignPlantRef = 'upl_http_foreign_0001'
const subjectHash = 'e'.repeat(64)
const subjectKeyVersion = 'fixture-k1'
const appScope = 'wx85bb3976301f75fb'
/** 隔离夹具锁定的会话策略版本；仅满足当前 DDL，非生产发布证明。 */
const sessionPolicyReleaseVersion = 'identity-session-test/v1'
/** 隔离夹具的策略快照摘要；不得当作真实配置发布读回。 */
const sessionPolicySnapshotSha256 = 'a'.repeat(64)
const activeBearer = 'fixture-active-bearer-0123456789'
const newOwnerBearer = 'fixture-new-owner-bearer-0123456789'
const expiredBearer = 'fixture-expired-bearer-012345678'
const revokedBearer = 'fixture-revoked-bearer-012345678'
let mysqlPort = 0
let server: Server | undefined
let baseUrl = ''
const auditEvents: RequestChainAuditEvent[] = []

/** 在测试专属容器内执行命令；不连接 CloudBase 或开发环境数据库。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== successExitCode) {
    throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 以 root 在隔离容器中执行 SQL。 */
function rootSql(sql: string, database = ''): string {
  const args = [
    'exec',
    '-i',
    containerName,
    'mysql',
    '--no-defaults',
    '--default-character-set=utf8mb4',
    '-uroot',
    '--batch',
    '--skip-column-names'
  ]
  if (database) {
    args.push(database)
  }
  return runDocker(args, sql)
}

/** 容器 running 不等于数据库就绪，必须等待真实 SQL 探测成功。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = 0; attempt < mysqlReadyAttempts; attempt += 1) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === successExitCode && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, mysqlReadyIntervalMs))
  }
  throw new Error('隔离 MySQL 未在规定时间内就绪')
}

/** 按正式清单顺序应用全部 DDL，并创建只授予该库 DML 权限的应用账号。 */
function applyManifestAndAppUser(): void {
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(
    fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')
  ) as {
    files: Array<{ file: string }>
  }
  rootSql(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  for (const entry of manifest.files) {
    rootSql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8'), databaseName)
  }
  rootSql(
    `CREATE USER '${appUser}'@'%' IDENTIFIED BY '${appPassword}';
     GRANT SELECT, INSERT, UPDATE, DELETE ON \`${databaseName}\`.* TO '${appUser}'@'%';
     FLUSH PRIVILEGES;`
  )
}

/** 小写十六进制 SHA-256，与 identity 域会话摘要规则一致。 */
function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** 写入一个带微信绑定与 active/expired/revoked 三个会话的用户，以及本人与他人各一株植物。 */
function seedIdentityAndPlants(): void {
  const issued = nowMs - dayMs
  const sessions = [
    [activeBearer, 'active', issued, nowMs + dayMs, 'NULL'],
    [expiredBearer, 'active', nowMs - 2 * dayMs, nowMs - dayMs, 'NULL'],
    [revokedBearer, 'revoked', issued, nowMs + dayMs, String(nowMs - 1000)]
  ] as const
  rootSql(
    `INSERT INTO users (public_user_id, status, session_version, created_at_ms, updated_at_ms)
     VALUES ('${ownerRef}', 'active', 1, ${String(issued)}, ${String(issued)}),
            ('${strangerRef}', 'active', 1, ${String(issued)}, ${String(issued)}),
            ('${newOwnerRef}', 'active', 1, ${String(issued)}, ${String(issued)});
     INSERT INTO platform_identities
       (user_internal_id, platform, platform_subject_hash, subject_hash_key_version,
        platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
     SELECT id, 'wechat', '${subjectHash}', '${subjectKeyVersion}', NULL, '${appScope}', 'active',
            ${String(issued)}, ${String(issued)}, ${String(issued)}
     FROM users WHERE public_user_id = '${ownerRef}';
     INSERT INTO platform_identities
       (user_internal_id, platform, platform_subject_hash, subject_hash_key_version,
        platform_subject_ciphertext, app_scope, binding_status, bound_at_ms, created_at_ms, updated_at_ms)
     SELECT id, 'wechat', '${'f'.repeat(64)}', '${subjectKeyVersion}', NULL, '${appScope}', 'active',
            ${String(issued)}, ${String(issued)}, ${String(issued)}
     FROM users WHERE public_user_id = '${newOwnerRef}';
     ${sessions
       .map(
         ([bearer, status, issuedAt, expiresAt, revokedAt]) => `INSERT INTO user_sessions
       (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version,
        authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms,
        updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
     SELECT '${sha256(bearer)}', u.id, p.id, 1, 'wechat', '${status}', ${String(issuedAt)},
            ${String(expiresAt)}, ${revokedAt}, ${String(issuedAt)}, ${String(issuedAt)},
            '${sessionPolicyReleaseVersion}', '${sessionPolicySnapshotSha256}'
     FROM users AS u JOIN platform_identities AS p ON p.user_internal_id = u.id
     WHERE u.public_user_id = '${ownerRef}';`
       )
       .join('\n')}
     INSERT INTO user_sessions
       (session_ref_hash, user_internal_id, platform_identity_internal_id, session_version,
        authenticated_via, status, issued_at_ms, expires_at_ms, revoked_at_ms, created_at_ms,
        updated_at_ms, session_policy_release_version, session_policy_snapshot_sha256)
     SELECT '${sha256(newOwnerBearer)}', u.id, p.id, 1, 'wechat', 'active', ${String(issued)},
            ${String(nowMs + dayMs)}, NULL, ${String(issued)}, ${String(issued)},
            '${sessionPolicyReleaseVersion}', '${sessionPolicySnapshotSha256}'
     FROM users AS u JOIN platform_identities AS p ON p.user_internal_id = u.id
     WHERE u.public_user_id = '${newOwnerRef}';
     INSERT INTO user_plants
       (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status,
        confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
     SELECT '', '${ownedPlantRef}', id, 'active', 'unidentified', NULL, 1, 1000, 2000
     FROM users WHERE public_user_id = '${ownerRef}';
     INSERT INTO user_plants
       (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status,
        confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
     SELECT '', '${foreignPlantRef}', id, 'active', 'unidentified', NULL, 1, 1000, 2000
     FROM users WHERE public_user_id = '${strangerRef}';`,
    databaseName
  )
  rootSql(
    `INSERT INTO business_policy_releases
       (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256,
        policy_json, status, effective_at_ms, expires_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
     VALUES ('bpr_test_capability_0001', 'subscription', 'capability_catalog', 'test/v1',
             'test-free-create/v1', '${'a'.repeat(64)}', '{}', 'active', ${String(issued)}, NULL,
             ${String(issued)}, ${String(issued)}, ${String(issued)});
     INSERT INTO capability_snapshots
       (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json,
        rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
        capability_policy_domain_code, capability_policy_code, capability_policy_release_ref,
        capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256,
        generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
     SELECT 'cps_test_create_00001', 'user', u.id, 'free', '["USER_PLANT_CREATE"]', '[]', 1,
            r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version, r.content_sha256,
            '${'b'.repeat(64)}', ${String(nowMs - 1000)}, ${String(nowMs + 60_000)},
            ${String(nowMs - 1000)}, ${String(nowMs - 1000)}
     FROM users AS u JOIN business_policy_releases AS r ON r.release_ref = 'bpr_test_capability_0001'
     WHERE u.public_user_id = '${newOwnerRef}';`,
    databaseName
  )
}

/** 统计应用账号当前仍打开的服务端连接数，用于证明每请求连接已关闭。 */
function openAppConnections(): number {
  return Number(
    rootSql(`SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE USER = '${appUser}';`)
  )
}

/** 以 Bearer 请求单株读取。 */
function getPlant(ref: string, bearer: string) {
  return fetch(`${baseUrl}/api/v2/user-plants/${ref}`, {
    headers: { authorization: `Bearer ${bearer}` }
  })
}

/**
 * Expected 来源：route-registry.json getUserPlant、http-api/v1 §3、principal-and-capability.md §1
 * （过期、撤销会话无效 → 401）、user-plant.md 与 contracts/types.ts UserPlantDto 公开投影、
 * 001_identity.sql 会话摘要约束、AGENTS.md §4 他人植物统一 404。
 * 层次：L3 / unit_real_data。真实路径：node:http → 冻结路由分发 → 固定请求链 → Principal 解析 →
 * mysql2 单连接事务 → MySQL 8.4 全量 v2 DDL（应用账号仅 DML）。不替换会话或归属查询。
 * 不覆盖：登录时平台凭证验真、CloudBase 网关、私有网络与云端 MySQL。
 */
describe('已认证读取用户植物（真实 MySQL）', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '-P',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      'mysql:8.4'
    ])
    await waitForMysql()
    applyManifestAndAppUser()
    seedIdentityAndPlants()
    mysqlPort = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(-1))
    const connectionSource = createMysql2ConnectionSource(
      readDatabaseConnectionConfig({
        V2_MYSQL_HOST: '127.0.0.1',
        V2_MYSQL_PORT: String(mysqlPort),
        V2_MYSQL_DATABASE: databaseName,
        V2_MYSQL_USER: appUser,
        V2_MYSQL_PASSWORD: appPassword
      })
    )
    server = createUserPlantServer({
      connectionSource,
      now: () => nowMs,
      resolveCapabilitySnapshot: createMysqlCapabilitySnapshotReader(connectionSource, () => nowMs),
      writeAudit: event => {
        auditEvents.push(event)
      },
      recordRollbackFailure: () => undefined
    })
    await new Promise<void>(resolve => server?.listen(ephemeralPort, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  }, 120_000)

  afterAll(async () => {
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
    runDocker(['rm', '--force', containerName])
  })

  test('有效会话读取本人植物返回 200 公开投影', async () => {
    const response = await getPlant(ownedPlantRef, activeBearer)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        user_plant_id: ownedPlantRef,
        lifecycle: 'active',
        identityStatus: 'unidentified',
        version: 1,
        createdAt: '1970-01-01T00:00:01.000Z',
        updatedAt: '1970-01-01T00:00:02.000Z'
      }
    })
  })

  /**
   * Expected：user-plant.md 创建合同要求服务端生成引用、空 JSON 请求、200 初始投影；
   * 同一已认证用户随后 GET 必须读回同一株植物，MySQL 只产生一条持久化记录。
   * 层次：L3 / e2e_real_api（隔离 MySQL）；能力快照从测试库真实读取，未覆盖其生成与发布流程。
   */
  test('创建用户植物写入 MySQL 后可由同一登录用户读取', async () => {
    const response = await fetch(`${baseUrl}/api/v2/user-plants`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${newOwnerBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'create-new-owner-plant-0001'
      },
      body: '{}'
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: 1,
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString()
    })
    expect(body.data.user_plant_id).toMatch(/^upl_[A-Za-z0-9_-]{8,}$/u)
    expect(Object.keys(body.data).sort()).toEqual(
      ['createdAt', 'identityStatus', 'lifecycle', 'updatedAt', 'user_plant_id', 'version'].sort()
    )
    const read = await getPlant(String(body.data.user_plant_id), newOwnerBearer)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(body)
    const replay = await fetch(`${baseUrl}/api/v2/user-plants`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${newOwnerBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'create-new-owner-plant-0001'
      },
      body: '{}'
    })
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(body)
    expect(
      rootSql(
        `SELECT COUNT(*) FROM user_plants AS p JOIN users AS u ON u.id = p.user_internal_id WHERE u.public_user_id = '${newOwnerRef}';`,
        databaseName
      )
    ).toBe('1')
  })

  /** Expected：HTTP 公共合同要求必要能力依赖不可用时返回脱敏的 503；不得编造默认权限。 */
  test('已有登录会话但没有能力快照时拒绝创建，不新增植物', async () => {
    const response = await fetch(`${baseUrl}/api/v2/user-plants`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'missing-capability-snapshot-0001'
      },
      body: '{}'
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' }
    })
    expect(
      rootSql(
        `SELECT COUNT(*) FROM user_plants AS p JOIN users AS u ON u.id = p.user_internal_id WHERE u.public_user_id = '${ownerRef}';`,
        databaseName
      )
    ).toBe('1')
  })

  /**
   * Expected 来源：user-plant/v1 的归档与恢复公开接口、active↔archived 状态机及
   * route-registry 中两个 POST 路由，以及 user-plant.md 中同键同参必须返回首次结果。
   * L3 Happy：真实 HTTP、身份、事务和 MySQL；
   * 能力快照是测试库中预置的可信服务端夹具，不能证明 Subscription 签发流程。
   * 若服务端把归档当成删除、恢复未检查快照，或没有把状态与版本写回 MySQL，本例应失败。
   */
  test('本人植物归档后可读到 archived，再恢复为 active 且版本逐次递增', async () => {
    const snapshotRef = 'cps_test_owner_lifecycle_01'
    rootSql(
      `INSERT INTO capability_snapshots
         (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json,
          rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
          capability_policy_domain_code, capability_policy_code, capability_policy_release_ref,
          capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256,
          generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
       SELECT '${snapshotRef}', 'user', u.id, 'free', '["USER_PLANT_CREATE"]', '[]', 1,
              r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version,
              r.content_sha256, '${'c'.repeat(64)}', ${String(nowMs - 1000)},
              ${String(nowMs + 60_000)}, ${String(nowMs - 1000)}, ${String(nowMs - 1000)}
       FROM users AS u JOIN business_policy_releases AS r
         ON r.release_ref = 'bpr_test_capability_0001'
       WHERE u.public_user_id = '${ownerRef}';`,
      databaseName
    )
    try {
      const archive = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/archive`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeBearer}`,
          'content-type': 'application/json',
          'idempotency-key': 'archive-owned-plant-0001'
        },
        body: '{"expectedVersion":1}'
      })
      expect(archive.status).toBe(200)
      expect((await archive.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'archived', version: 2 }
      })
      const archivedRead = await getPlant(ownedPlantRef, activeBearer)
      expect(archivedRead.status).toBe(200)
      expect((await archivedRead.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'archived', version: 2 }
      })

      const restore = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeBearer}`,
          'content-type': 'application/json',
          'idempotency-key': 'restore-owned-plant-0001'
        },
        body: '{"expectedVersion":2}'
      })
      expect(restore.status).toBe(200)
      expect((await restore.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'active', version: 3 }
      })
      const restoredRead = await getPlant(ownedPlantRef, activeBearer)
      expect(restoredRead.status).toBe(200)
      expect((await restoredRead.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'active', version: 3 }
      })
      expect(
        rootSql(
          `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
          databaseName
        )
      ).toBe('active:3')

      // 首次恢复已完成后，快照被撤下不应阻断同键同参读取原结果。
      rootSql(
        `DELETE FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';`,
        databaseName
      )
      const restoreReplay = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeBearer}`,
          'content-type': 'application/json',
          'idempotency-key': 'restore-owned-plant-0001'
        },
        body: '{"expectedVersion":2}'
      })
      expect(restoreReplay.status).toBe(200)
      expect((await restoreReplay.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'active', version: 3 }
      })

      const archiveReplay = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/archive`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${activeBearer}`,
          'content-type': 'application/json',
          'idempotency-key': 'archive-owned-plant-0001'
        },
        body: '{"expectedVersion":1}'
      })
      expect(archiveReplay.status).toBe(200)
      expect((await archiveReplay.json()) as unknown).toMatchObject({
        data: { user_plant_id: ownedPlantRef, lifecycle: 'archived', version: 2 }
      })
      expect(
        rootSql(
          `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
          databaseName
        )
      ).toBe('active:3')
    } finally {
      rootSql(
        `DELETE FROM capability_snapshots WHERE snapshot_ref = '${snapshotRef}';`,
        databaseName
      )
    }
  })

  /** Expected：恢复必须重查当前 active 上限；名额已满时保持原植物 archived。 */
  test('已有一株活跃植物时恢复另一株返回 403，归档状态不变', async () => {
    const archivedRef = 'upl_http_capacity_0001'
    rootSql(
      `INSERT INTO user_plants
         (_openid, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status,
          confirmed_identity_internal_id, version, created_at_ms, updated_at_ms)
       SELECT '', '${archivedRef}', id, 'archived', 'unidentified', NULL, 1, 1000, 2000
       FROM users WHERE public_user_id = '${newOwnerRef}';`,
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${archivedRef}/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${newOwnerBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'restore-over-capacity-0001'
      },
      body: '{"expectedVersion":1}'
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { type: 'CAPABILITY_DENIED' } })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${archivedRef}';`,
        databaseName
      )
    ).toBe('archived:1')
  })

  /** Expected：恢复也必须隐藏他人植物；服务端快照有效不代表拥有目标植物。 */
  test('有恢复资格但目标是他人植物时返回 404，目标状态不变', async () => {
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${newOwnerBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'restore-foreign-plant-0001'
      },
      body: '{"expectedVersion":3}'
    })
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toMatchObject({ error: { type: 'USER_PLANT_NOT_FOUND' } })
    expect(JSON.stringify(body)).not.toContain(ownedPlantRef)
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe('active:3')
  })

  /**
   * Expected 来源：user-plant/v1 归属合同及 route-registry 的 authenticated 声明。
   * L3 Reverse：无登录凭证不得归档；请求经过真实 HTTP，但必须在任何植物写入前拒绝。
   */
  test('未登录归档返回 401，植物状态与版本不变', async () => {
    const before = rootSql(
      `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/archive`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'archive-without-session-0001'
      },
      body: '{"expectedVersion":1}'
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { type: 'PRINCIPAL_INVALID' } })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe(before)
  })

  /** Expected：用户植物归档版本必须是安全正整数，非法 DTO 不得触发写入。 */
  test('非法归档版本返回 400，植物状态与版本不变', async () => {
    const before = rootSql(
      `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/archive`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'archive-invalid-version-0001'
      },
      body: '{"expectedVersion":0}'
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { type: 'VALIDATION_FAILED' } })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe(before)
  })

  /**
   * Expected 来源：user-plant/v1 规定跨用户对象统一视为不存在，不允许写入他人植物。
   * L3 Reverse：有效会话也不能把另一用户的植物归档，且不能透露对象是否存在。
   */
  test('本人会话归档他人植物返回 404，目标植物不变', async () => {
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${foreignPlantRef}/archive`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'archive-foreign-plant-0001'
      },
      body: '{"expectedVersion":1}'
    })
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toMatchObject({ error: { type: 'USER_PLANT_NOT_FOUND' } })
    expect(JSON.stringify(body)).not.toContain(strangerRef)
    expect(JSON.stringify(body)).not.toContain(foreignPlantRef)
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${foreignPlantRef}';`,
        databaseName
      )
    ).toBe('active:1')
  })

  test.each([
    ['已过期会话', expiredBearer],
    ['已撤销会话', revokedBearer],
    ['不存在的会话', 'fixture-unknown-bearer-012345678']
  ])('%s → 401 PRINCIPAL_INVALID', async (_label, bearer) => {
    const response = await getPlant(ownedPlantRef, bearer)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效或已过期' }
    })
  })

  test('有效会话读取他人植物 → 404 USER_PLANT_NOT_FOUND', async () => {
    const response = await getPlant(foreignPlantRef, activeBearer)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在或不可访问' }
    })
  })

  /** Expected：user-plant.md 恢复错误合同区分已过期快照 409 与快照缺失 503。 */
  test('恢复时最近的服务端快照已过期返回 409，植物仍归档', async () => {
    const archived = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/archive`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'archive-before-expired-snapshot-0001'
      },
      body: '{"expectedVersion":3}'
    })
    expect(archived.status).toBe(200)
    const snapshotRef = 'cps_test_expired_restore_01'
    rootSql(
      `INSERT INTO capability_snapshots
         (snapshot_ref, subject_type, user_internal_id, tier, allowed_capabilities_json,
          rewarded_ai_scopes_json, active_user_plant_limit, capability_policy_release_internal_id,
          capability_policy_domain_code, capability_policy_code, capability_policy_release_ref,
          capability_policy_release_version, capability_policy_content_sha256, snapshot_sha256,
          generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
       SELECT '${snapshotRef}', 'user', u.id, 'free', '["USER_PLANT_CREATE"]', '[]', 1,
              r.id, r.domain_code, r.policy_code, r.release_ref, r.release_version,
              r.content_sha256, '${'d'.repeat(64)}', ${String(nowMs - 2000)},
              ${String(nowMs - 1000)}, ${String(nowMs - 2000)}, ${String(nowMs - 2000)}
       FROM users AS u JOIN business_policy_releases AS r
         ON r.release_ref = 'bpr_test_capability_0001'
       WHERE u.public_user_id = '${ownerRef}';`,
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'restore-expired-snapshot-0001'
      },
      body: '{"expectedVersion":4}'
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { type: 'CAPABILITY_SNAPSHOT_EXPIRED' }
    })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe('archived:4')
  })

  /** Expected：没有任何服务端能力快照时失败关闭，不借用客户端输入或免费默认值。 */
  test('恢复时能力快照缺失返回 503，植物仍归档', async () => {
    rootSql(
      "DELETE FROM capability_snapshots WHERE snapshot_ref = 'cps_test_expired_restore_01';",
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'restore-missing-snapshot-0001'
      },
      body: '{"expectedVersion":4}'
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe('archived:4')
  })

  /** Expected：他人植物始终隐藏为 404，不应被调用者是否拥有恢复快照改变。 */
  test('无能力快照也不能探知他人植物，恢复返回 404', async () => {
    rootSql(
      "DELETE FROM capability_snapshots WHERE snapshot_ref = 'cps_test_create_00001';",
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/user-plants/${ownedPlantRef}/restore`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${newOwnerBearer}`,
        'content-type': 'application/json',
        'idempotency-key': 'restore-foreign-without-snapshot-0001'
      },
      body: '{"expectedVersion":4}'
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { type: 'USER_PLANT_NOT_FOUND' } })
    expect(
      rootSql(
        `SELECT CONCAT(lifecycle_status, ':', version) FROM user_plants WHERE public_user_plant_id = '${ownedPlantRef}';`,
        databaseName
      )
    ).toBe('archived:4')
  })

  test('审计事件不含 Bearer 或用户引用，且请求结束后不遗留应用账号连接', async () => {
    for (let index = 0; index < 5; index += 1) {
      await getPlant(ownedPlantRef, activeBearer)
    }
    await new Promise(resolve => setTimeout(resolve, 300))

    const serialized = JSON.stringify(auditEvents)
    expect(serialized).not.toContain(activeBearer)
    expect(serialized).not.toContain(ownerRef)
    expect(openAppConnections()).toBe(0)
  })
})
