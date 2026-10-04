import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { readDatabaseConnectionConfig } from '../../src/foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import { findProjectRoot } from '../support/project-root.js'

const containerName = `qhz-v2-get-published-plant-${String(process.pid)}`
const databaseName = `qinghuazhi_v2_get_published_plant_${String(process.pid)}`
const appUser = 'qhz_v2_app'
const appPassword = 'fixture-app-password-01'
const identityRef = 'pid_e2e_monstera_001'
const taxonRef = 'txr_e2e_monstera_001'
const identityReleaseRef = 'rel_e2e_identity_001'
const taxonomyReleaseRef = 'rel_e2e_taxonomy_001'
const sha256HexLength = 64
const identityHash = 'a'.repeat(sha256HexLength)
const taxonomyHash = 'b'.repeat(sha256HexLength)
const itemHash = 'c'.repeat(sha256HexLength)
const evidenceHash = 'd'.repeat(sha256HexLength)
const successExitCode = 0
const mysqlReadyAttempts = 120
const mysqlReadyIntervalMs = 250
const ephemeralPort = 0
const okStatus = 200
const notFoundStatus = 404
const internalErrorStatus = 500
let mysqlPort = 0
let server: Server | undefined
let baseUrl = ''

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

/** 按正式清单顺序应用全部 DDL，并创建只授予该库权限的应用账号。 */
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

/** 发布夹具只证明读取谓词，不冒充人工准入证据。 */
function seedPublishedFixture(): void {
  rootSql(
    `INSERT INTO plant_taxa
       (_openid, public_taxon_ref, authority_source, authority_taxon_id, accepted_scientific_name,
        taxon_rank, nomenclatural_status, source_version, retrieved_at_ms, evidence_hash,
        review_status, created_at_ms, updated_at_ms)
     VALUES ('', '${taxonRef}', 'POWO', 'fixture-e2e-001', 'Monstera deliciosa Liebm.', 'species',
             'accepted', 'fixture-v1', 1000, '${evidenceHash}', 'ACTIVE', 1000, 1000);
     INSERT INTO plant_identities
       (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh, identity_kind,
        review_status, active_release_internal_id, created_at_ms, updated_at_ms)
     SELECT '', '${identityRef}', t.id, '龟背竹', 'taxon', 'ACTIVE', NULL, 1000, 1000
     FROM plant_taxa AS t WHERE t.public_taxon_ref = '${taxonRef}';
     INSERT INTO plant_knowledge_releases
       (_openid, release_ref, release_kind, schema_version, artifact_ref, artifact_hash,
        record_count, released_at_ms, created_at_ms, updated_at_ms)
     VALUES ('', '${taxonomyReleaseRef}', 'taxonomy', 'taxonomy/v1', 'fixture://taxonomy', '${taxonomyHash}', 1, 1000, 1000, 1000),
            ('', '${identityReleaseRef}', 'identity', 'identity/v1', 'fixture://identity', '${identityHash}', 1, 1000, 1000, 1000);
     INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
        decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'taxon', '${taxonRef}', '${evidenceHash}', 'review_taxon_fixture', 'ACTIVE', '${itemHash}', 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = '${taxonomyReleaseRef}';
     INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
        decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'identity', '${identityRef}', '${evidenceHash}', 'review_identity_fixture', 'ACTIVE', '${itemHash}', 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = '${identityReleaseRef}';`,
    databaseName
  )
}

/** 用真实指针表同时激活分类与身份发布。 */
function activateBothReleases(): void {
  rootSql(
    `INSERT INTO active_plant_knowledge_releases
       (_openid, release_kind, release_internal_id, active_release_version, active_artifact_sha256,
        version, activated_at_ms, created_at_ms, updated_at_ms)
     SELECT '', r.release_kind, r.id, r.schema_version, r.artifact_hash, 1, 1000, 1000, 1000
     FROM plant_knowledge_releases AS r
     WHERE r.release_ref IN ('${taxonomyReleaseRef}', '${identityReleaseRef}');`,
    databaseName
  )
}

/** 统计应用账号当前仍打开的服务端连接数，用于证明每请求连接已关闭。 */
function openAppConnections(): number {
  return Number(
    rootSql(`SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE USER = '${appUser}';`)
  )
}

/** 以给定环境变量启动真实插件服务。 */
async function startServer(environment: Record<string, string>): Promise<string> {
  const connectionSource = createMysql2ConnectionSource(readDatabaseConnectionConfig(environment))
  server = createPlantKnowledgeServer({ connectionSource, writeAudit: () => undefined })
  await new Promise<void>(resolve => server?.listen(ephemeralPort, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

/** 关闭当前 HTTP 服务。 */
async function stopServer(): Promise<void> {
  await new Promise<void>(resolve => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  server = undefined
}

/** 应用账号环境变量；与云端函数使用相同的变量名。 */
function appEnvironment(): Record<string, string> {
  return {
    V2_MYSQL_HOST: '127.0.0.1',
    V2_MYSQL_PORT: String(mysqlPort),
    V2_MYSQL_DATABASE: databaseName,
    V2_MYSQL_USER: appUser,
    V2_MYSQL_PASSWORD: appPassword
  }
}

/**
 * Expected 来源：plant-knowledge-public-read/v1 §2–§4、plant-taxonomy/v1「公开 API 只读取不可变 active
 * release」「QUARANTINE 不得被读取」；AGENTS.md §8.1 连接池 pending 时不预置连接池。
 * 层次：L3 / unit_real_data。真实路径：node:http → 冻结路由分发 → 固定请求链 → mysql2 单连接 →
 * MySQL 8.4 全量 v2 DDL（应用账号仅 DML 权限）。不覆盖：CloudBase 网关、私有网络与云端 MySQL。
 */
describe('已发布植物公开读取（真实 MySQL）', () => {
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
    seedPublishedFixture()
    mysqlPort = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(-1))
    baseUrl = await startServer(appEnvironment())
  })

  beforeEach(() => {
    rootSql('DELETE FROM active_plant_knowledge_releases;', databaseName)
    rootSql(
      "UPDATE plant_identities SET review_status = 'ACTIVE'; UPDATE plant_taxa SET review_status = 'ACTIVE';",
      databaseName
    )
  })

  afterAll(async () => {
    await stopServer()
    runDocker(['rm', '--force', containerName])
  })

  test('分类与身份发布均生效时返回 200 与五字段 DTO', async () => {
    activateBothReleases()

    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/${identityRef}`)

    expect(response.status).toBe(okStatus)
    expect(await response.json()).toEqual({
      data: {
        plantIdentityRef: identityRef,
        displayNameZh: '龟背竹',
        identityKind: 'taxon',
        acceptedScientificName: 'Monstera deliciosa Liebm.',
        taxonRank: 'species'
      }
    })
  })

  test('没有 active release 时返回 404', async () => {
    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/${identityRef}`)
    expect(response.status).toBe(notFoundStatus)
  })

  test('发布仍生效但身份被隔离时返回 404', async () => {
    activateBothReleases()
    rootSql(
      `UPDATE plant_identities SET review_status = 'QUARANTINE' WHERE public_identity_ref = '${identityRef}';`,
      databaseName
    )
    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/${identityRef}`)
    expect(response.status).toBe(notFoundStatus)
  })

  test('不存在的身份引用返回 404', async () => {
    activateBothReleases()
    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/pid_e2e_missing_001`)
    expect(response.status).toBe(notFoundStatus)
  })

  test('请求结束后不遗留应用账号连接', async () => {
    activateBothReleases()
    for (let index = 0; index < Number('5'); index += 1) {
      await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/${identityRef}`)
    }
    await new Promise(resolve => setTimeout(resolve, Number('300')))
    expect(openAppConnections()).toBe(0)
  })

  test('数据库凭证错误时返回泛化 500，不泄露连接信息', async () => {
    await stopServer()
    const wrongUrl = await startServer({
      ...appEnvironment(),
      V2_MYSQL_PASSWORD: 'wrong-password-01'
    })
    try {
      const response = await fetch(`${wrongUrl}/api/v2/plant-knowledge/plants/${identityRef}`)
      const text = await response.text()
      expect(response.status).toBe(internalErrorStatus)
      expect(text).not.toMatch(/wrong-password|qhz_v2_app|127\.0\.0\.1|Access denied/u)
    } finally {
      await stopServer()
      baseUrl = await startServer(appEnvironment())
    }
  })
})
