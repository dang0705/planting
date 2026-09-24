import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { createPool, type Pool } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createMysqlPublishedIdentityRepository } from '../../src/plant-knowledge/repository/mysql-published-identity-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const containerName = `qhz-v2-published-identity-${String(process.pid)}`
const databaseName = `qinghuazhi_v2_published_identity_${String(process.pid)}`
const identityRef = 'pid_published_identity_001'
const taxonRef = 'txr_published_identity_001'
const identityReleaseRef = 'rel_published_identity_001'
const unrelatedIdentityReleaseRef = 'rel_unrelated_identity_001'
const taxonomyReleaseRef = 'rel_published_taxonomy_001'
/** SHA-256 十六进制摘要的固定长度。 */
const sha256HexLength = 64
const identityHash = 'a'.repeat(sha256HexLength)
const unrelatedIdentityHash = 'e'.repeat(sha256HexLength)
const taxonomyHash = 'b'.repeat(sha256HexLength)
const itemHash = 'c'.repeat(sha256HexLength)
const evidenceHash = 'd'.repeat(sha256HexLength)
/** Docker 与 MySQL 命令的成功退出码。 */
const successExitCode = 0
/** 数据库启动探测次数上限。 */
const mysqlReadyAttempts = 60
/** 启动探测间隔毫秒数。 */
const mysqlReadyIntervalMs = 250
/** 循环步长。 */
const loopStep = 1
/** 数组尾项相对下标。 */
const lastItemIndex = -1
let pool: Pool

/** 在本测试专属容器内执行命令；不连接 CloudBase 或开发环境数据库。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 10_485_760
  })
  if (result.status !== successExitCode) {
    throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 容器 running 不等于数据库就绪，必须等待真实 SQL 探测成功。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = successExitCode; attempt < mysqlReadyAttempts; attempt += loopStep) {
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

/** 按当前正式清单的顺序应用全部 DDL，避免只挑选有利于测试的表定义。 */
function applyManifest(): void {
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(
    fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')
  ) as {
    files: Array<{ file: string }>
  }
  runDocker([
    'exec',
    containerName,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  ])
  for (const entry of manifest.files) {
    const sql = fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')
    runDocker(['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName], sql)
  }
}

/** 真实发布记录与明细仅作为隔离夹具；不把这些数据冒充人工准入证据。 */
async function seedReleaseFixture(): Promise<void> {
  await pool.execute(
    `INSERT INTO plant_taxa
       (_openid, public_taxon_ref, authority_source, authority_taxon_id,
        accepted_scientific_name, taxon_rank, nomenclatural_status,
        source_version, retrieved_at_ms, evidence_hash, review_status,
        created_at_ms, updated_at_ms)
     VALUES ('', ?, 'POWO', 'fixture-published-identity-001',
             'Monstera deliciosa', 'species', 'accepted', 'fixture-v1',
             1000, ?, 'ACTIVE', 1000, 1000)`,
    [taxonRef, evidenceHash]
  )
  await pool.execute(
    `INSERT INTO plant_identities
       (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh,
        identity_kind, review_status, active_release_internal_id, created_at_ms, updated_at_ms)
     SELECT '', ?, t.id, '龟背竹', 'taxon', 'ACTIVE', NULL, 1000, 1000
     FROM plant_taxa AS t WHERE t.public_taxon_ref = ?`,
    [identityRef, taxonRef]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_releases
       (_openid, release_ref, release_kind, schema_version, artifact_ref,
        artifact_hash, record_count, released_at_ms, created_at_ms, updated_at_ms)
     VALUES
       ('', ?, 'taxonomy', 'taxonomy/v1', 'fixture://taxonomy', ?, 1, 1000, 1000, 1000),
       ('', ?, 'identity', 'identity/v1', 'fixture://identity', ?, 1, 1000, 1000, 1000),
       ('', ?, 'identity', 'identity/v1', 'fixture://unrelated-identity', ?, 1, 1000, 1000, 1000)`,
    [
      taxonomyReleaseRef,
      taxonomyHash,
      identityReleaseRef,
      identityHash,
      unrelatedIdentityReleaseRef,
      unrelatedIdentityHash
    ]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref,
        evidence_manifest_sha256, decision_ref, admission_status,
        release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'taxon', ?, ?, 'review_taxon_fixture', 'ACTIVE', ?, 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = ?`,
    [taxonRef, evidenceHash, itemHash, taxonomyReleaseRef]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref,
        evidence_manifest_sha256, decision_ref, admission_status,
        release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'identity', ?, ?, 'review_identity_fixture', 'ACTIVE', ?, 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = ?`,
    [identityRef, evidenceHash, itemHash, identityReleaseRef]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref,
        evidence_manifest_sha256, decision_ref, admission_status,
        release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'identity', 'pid_unrelated_identity_002', ?,
            'review_unrelated_fixture', 'ACTIVE', ?, 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = ?`,
    [evidenceHash, itemHash, unrelatedIdentityReleaseRef]
  )
}

/** 用真实指针表激活指定发布，不调用尚未实现的发布应用服务。 */
async function activateRelease(
  releaseKind: 'taxonomy' | 'identity',
  releaseRef: string,
  artifactHash: string
): Promise<void> {
  await pool.execute(
    `INSERT INTO active_plant_knowledge_releases
       (_openid, release_kind, release_internal_id, active_release_version,
        active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
     SELECT '', ?, r.id, r.schema_version, ?, 1, 1000, 1000, 1000
     FROM plant_knowledge_releases AS r WHERE r.release_ref = ?`,
    [releaseKind, artifactHash, releaseRef]
  )
}

/** Repository 直接在真实 MySQL 连接执行参数化查询。 */
function createRepository() {
  return createMysqlPublishedIdentityRepository({
    async query(sql, parameters) {
      const values = parameters.map(value => {
        if (typeof value !== 'string' && typeof value !== 'number' && value !== null) {
          throw new Error('植物身份 Repository 传入不受支持的 SQL 参数')
        }
        return value
      })
      const [rows] = await pool.execute(sql, values)
      return rows as unknown as readonly { published: number }[]
    }
  })
}

/**
 * Expected 来源：plant-taxonomy/v1「用户只能确认已发布且未隔离的产品身份」及
 * 「公开读取只经不可变 active release」；P2 ticket 的隔离身份不得进入 catalog/identify。
 * 层次：L3 / unit_real_data。真实路径为 Repository 参数化查询 → MySQL 8.4 全量 v2 DDL。
 * 不覆盖：人工裁决真实性、发布事务、CloudBase、HTTP 鉴权与前端。
 */
describe('植物身份公开读取的双 active release 准入', () => {
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
    applyManifest()
    const port = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(lastItemIndex))
    if (!Number.isSafeInteger(port) || port <= successExitCode) {
      throw new Error('隔离 MySQL 端口无效')
    }
    pool = createPool({
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      database: databaseName,
      connectionLimit: 2,
      decimalNumbers: false
    })
    await seedReleaseFixture()
  })

  beforeEach(async () => {
    await pool.execute('DELETE FROM active_plant_knowledge_releases')
    await pool.execute("UPDATE plant_taxa SET review_status = 'ACTIVE'")
    await pool.execute("UPDATE plant_identities SET review_status = 'ACTIVE'")
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
    runDocker(['rm', '--force', containerName])
  })

  test('只有表状态 ACTIVE 但没有 active release 时不可确认', async () => {
    expect(await createRepository().isPublishedIdentity(identityRef)).toBe(false)
  })

  test('只有分类发布生效而身份发布未生效时不可确认', async () => {
    await activateRelease('taxonomy', taxonomyReleaseRef, taxonomyHash)
    expect(await createRepository().isPublishedIdentity(identityRef)).toBe(false)
  })

  test('分类与身份发布均生效且都含该对象时可以确认', async () => {
    await activateRelease('taxonomy', taxonomyReleaseRef, taxonomyHash)
    await activateRelease('identity', identityReleaseRef, identityHash)
    expect(await createRepository().isPublishedIdentity(identityRef)).toBe(true)
  })

  test('身份指针生效但明细只含其他身份时不可确认', async () => {
    await activateRelease('taxonomy', taxonomyReleaseRef, taxonomyHash)
    await activateRelease('identity', unrelatedIdentityReleaseRef, unrelatedIdentityHash)
    expect(await createRepository().isPublishedIdentity(identityRef)).toBe(false)
  })

  test('发布仍生效但分类实体随后被隔离时不可确认', async () => {
    await activateRelease('taxonomy', taxonomyReleaseRef, taxonomyHash)
    await activateRelease('identity', identityReleaseRef, identityHash)
    await pool.execute(
      "UPDATE plant_taxa SET review_status = 'QUARANTINE' WHERE public_taxon_ref = ?",
      [taxonRef]
    )
    expect(await createRepository().isPublishedIdentity(identityRef)).toBe(false)
  })

  test('相似或非法身份引用不能通过公开准入', async () => {
    await activateRelease('taxonomy', taxonomyReleaseRef, taxonomyHash)
    await activateRelease('identity', identityReleaseRef, identityHash)
    expect(await createRepository().isPublishedIdentity(`${identityRef}_other`)).toBe(false)
    expect(await createRepository().isPublishedIdentity("' OR 1=1 --")).toBe(false)
  })
})
