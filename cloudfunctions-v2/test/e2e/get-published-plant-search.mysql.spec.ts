import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { createConnection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { readDatabaseConnectionConfig } from '../../src/foundation/config/database-config.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import { createMysqlPublishedPlantSearchRepository } from '../../src/plant-knowledge/repository/mysql-published-plant-search-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const containerName = `qhz-v2-search-plants-${String(process.pid)}`
const databaseName = `qinghuazhi_v2_search_plants_${String(process.pid)}`
const appUser = 'qhz_v2_search_app'
const appPassword = 'fixture-search-app-password-01'
const identityReleaseRef = 'rel_search_identity_001'
const taxonomyReleaseRef = 'rel_search_taxonomy_001'
const sha256HexLength = 64
const identityHash = '1'.repeat(sha256HexLength)
const taxonomyHash = '2'.repeat(sha256HexLength)
const itemHash = '3'.repeat(sha256HexLength)
const evidenceHash = '4'.repeat(sha256HexLength)
const successExitCode = 0
const mysqlReadyAttempts = 120
const mysqlReadyIntervalMs = 250
const ephemeralPort = 0
const okStatus = 200
const badRequestStatus = 400
const matchCountLimit = 20
const codePointLimit = 64
const zero = 0
const one = 1
const twoDigitWidth = 2
const threeDigitWidth = 3
const zeroDigit = '0'
const lastArrayIndex = -1
const capFixtureCount = matchCountLimit + one
const publishedItemPrefix = 'pid_search_cap_'
let mysqlPort = 0
let server: Server | undefined
let baseUrl = ''

type SearchFixture = {
  readonly identityRef: string
  readonly taxonRef: string
  readonly displayNameZh: string
  readonly acceptedScientificName: string
  readonly identityAdmission: boolean
  readonly identityStatus: 'ACTIVE' | 'QUARANTINE'
  readonly taxonStatus: 'ACTIVE' | 'QUARANTINE'
}

/** 用固定夹具覆盖精确、前缀、重名、隐藏、规范化、通配符与上限场景。 */
function createSearchFixtures(): SearchFixture[] {
  const fixtures: SearchFixture[] = [
    {
      identityRef: 'pid_search_exact_001',
      taxonRef: 'txr_search_exact_001',
      displayNameZh: 'Zulu exact',
      acceptedScientificName: 'Monstera',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_duplicate_a_001',
      taxonRef: 'txr_search_duplicate_a_001',
      displayNameZh: 'Alpha duplicate',
      acceptedScientificName: 'Monstera same',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_duplicate_b_001',
      taxonRef: 'txr_search_duplicate_b_001',
      displayNameZh: 'Alpha duplicate',
      acceptedScientificName: 'Monstera same',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_name_001',
      taxonRef: 'txr_search_name_001',
      displayNameZh: 'Monstera alpha',
      acceptedScientificName: 'Otherus plantus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_scientific_001',
      taxonRef: 'txr_search_scientific_001',
      displayNameZh: 'Zzz scientific',
      acceptedScientificName: 'Monstera alba',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_unpublished_001',
      taxonRef: 'txr_search_unpublished_001',
      displayNameZh: 'Unpublished specimen',
      acceptedScientificName: 'Unpublishedus specimen',
      identityAdmission: false,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_quarantine_001',
      taxonRef: 'txr_search_quarantine_001',
      displayNameZh: 'Quarantined specimen',
      acceptedScientificName: 'Quarantinus specimen',
      identityAdmission: true,
      identityStatus: 'QUARANTINE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_quarantine_taxon_001',
      taxonRef: 'txr_search_quarantine_taxon_001',
      displayNameZh: 'Quarantined taxon specimen',
      acceptedScientificName: 'Quarantinus taxon',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'QUARANTINE'
    },
    {
      identityRef: 'pid_search_percent_001',
      taxonRef: 'txr_search_percent_001',
      displayNameZh: 'Mon%stera literal',
      acceptedScientificName: 'Percentus plantus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_underscore_001',
      taxonRef: 'txr_search_underscore_001',
      displayNameZh: 'Mon_stera literal',
      acceptedScientificName: 'Underscoreus plantus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_backslash_001',
      taxonRef: 'txr_search_backslash_001',
      displayNameZh: 'Mon\\stera literal',
      acceptedScientificName: 'Backslashus plantus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_escape_001',
      taxonRef: 'txr_search_escape_001',
      displayNameZh: 'Mon!stera literal',
      acceptedScientificName: 'Escapeus plantus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_accent_001',
      taxonRef: 'txr_search_accent_001',
      displayNameZh: '香叶',
      acceptedScientificName: 'Éclair deliciosa',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_alocasia_001',
      taxonRef: 'txr_search_alocasia_001',
      displayNameZh: '海芋',
      acceptedScientificName: 'Alocasia odora',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    },
    {
      identityRef: 'pid_search_length_001',
      taxonRef: 'txr_search_length_001',
      displayNameZh: 'a'.repeat(codePointLimit),
      acceptedScientificName: 'Longus testus',
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    }
  ]

  for (let index = zero; index < capFixtureCount; index += one) {
    const suffix = String(index).padStart(twoDigitWidth, zeroDigit)
    fixtures.push({
      identityRef: `${publishedItemPrefix}${suffix}`,
      taxonRef: `txr_search_cap_${suffix}`,
      displayNameZh: `容量植物${suffix}`,
      acceptedScientificName: `Containerus ${suffix}`,
      identityAdmission: true,
      identityStatus: 'ACTIVE',
      taxonStatus: 'ACTIVE'
    })
  }

  return fixtures
}

const searchFixtures = createSearchFixtures()
const identityFixtureCount = searchFixtures.filter(fixture => fixture.identityAdmission).length

/** SQL 字符串以 UTF-8 十六进制构造，避免反斜杠或标点被 SQL 字面量规则改写。 */
function sqlText(value: string): string {
  return `CONVERT(X'${Buffer.from(value, 'utf8').toString('hex')}' USING utf8mb4) COLLATE utf8mb4_unicode_ci`
}

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
  for (let attempt = zero; attempt < mysqlReadyAttempts; attempt += one) {
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

/** 在全量 DDL 上准备真实 MySQL 搜索记录；仅列入 identity release 的身份才具备身份准入。 */
function seedSearchFixtures(): void {
  const statements = [
    `INSERT INTO plant_knowledge_releases
       (_openid, release_ref, release_kind, schema_version, artifact_ref, artifact_hash,
        record_count, released_at_ms, created_at_ms, updated_at_ms)
     VALUES ('', '${taxonomyReleaseRef}', 'taxonomy', 'taxonomy/v1', 'fixture://search/taxonomy',
             '${taxonomyHash}', ${String(searchFixtures.length)}, 1000, 1000, 1000),
            ('', '${identityReleaseRef}', 'identity', 'identity/v1', 'fixture://search/identity',
             '${identityHash}', ${String(identityFixtureCount)}, 1000, 1000, 1000);`
  ]

  searchFixtures.forEach((fixture, index) => {
    const authorityTaxonId = `search-fixture-${String(index).padStart(threeDigitWidth, zeroDigit)}`
    statements.push(
      `INSERT INTO plant_taxa
         (_openid, public_taxon_ref, authority_source, authority_taxon_id, accepted_scientific_name,
          taxon_rank, nomenclatural_status, source_version, retrieved_at_ms, evidence_hash,
          review_status, created_at_ms, updated_at_ms)
       VALUES ('', ${sqlText(fixture.taxonRef)}, 'POWO', ${sqlText(authorityTaxonId)},
               ${sqlText(fixture.acceptedScientificName)}, 'species', 'accepted', 'fixture-v1',
               1000, '${evidenceHash}', '${fixture.taxonStatus}', 1000, 1000);
       INSERT INTO plant_identities
         (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh, identity_kind,
          review_status, active_release_internal_id, created_at_ms, updated_at_ms)
       SELECT '', ${sqlText(fixture.identityRef)}, taxon.id, ${sqlText(fixture.displayNameZh)},
              'taxon', '${fixture.identityStatus}', NULL, 1000, 1000
       FROM plant_taxa AS taxon WHERE taxon.public_taxon_ref = ${sqlText(fixture.taxonRef)};
       INSERT INTO plant_knowledge_release_items
         (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
          decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
       SELECT '', release_row.id, 'taxon', ${sqlText(fixture.taxonRef)}, '${evidenceHash}',
              'search_taxon_fixture', 'ACTIVE', '${itemHash}', 1000, 1000
       FROM plant_knowledge_releases AS release_row
       WHERE release_row.release_ref = '${taxonomyReleaseRef}';`
    )
    if (fixture.identityAdmission) {
      statements.push(
        `INSERT INTO plant_knowledge_release_items
           (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
            decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
         SELECT '', release_row.id, 'identity', ${sqlText(fixture.identityRef)}, '${evidenceHash}',
                'search_identity_fixture', 'ACTIVE', '${itemHash}', 1000, 1000
         FROM plant_knowledge_releases AS release_row
         WHERE release_row.release_ref = '${identityReleaseRef}';`
      )
    }
  })

  rootSql(statements.join('\n'), databaseName)
}

/** 用真实指针表同时激活分类与身份发布。 */
function activateBothReleases(): void {
  rootSql(
    `INSERT INTO active_plant_knowledge_releases
       (_openid, release_kind, release_internal_id, active_release_version, active_artifact_sha256,
        version, activated_at_ms, created_at_ms, updated_at_ms)
     SELECT '', release_row.release_kind, release_row.id, release_row.schema_version,
            release_row.artifact_hash, 1, 1000, 1000, 1000
     FROM plant_knowledge_releases AS release_row
     WHERE release_row.release_ref IN ('${taxonomyReleaseRef}', '${identityReleaseRef}');`,
    databaseName
  )
}

/** 以给定环境变量启动真实 HTTP 服务，连接隔离 MySQL 8.4。 */
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

/** 应用账号环境变量；与云函数使用相同的变量名。 */
function appEnvironment(): Record<string, string> {
  return {
    V2_MYSQL_HOST: '127.0.0.1',
    V2_MYSQL_PORT: String(mysqlPort),
    V2_MYSQL_DATABASE: databaseName,
    V2_MYSQL_USER: appUser,
    V2_MYSQL_PASSWORD: appPassword
  }
}

/** 请求搜索路由并返回 JSON；查询词使用 URL 编码，保留 `%`、`_` 与反斜杠原义。 */
async function search(query: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v2/plant-knowledge/search?q=${encodeURIComponent(query)}`)
}

/**
 * Expected 来源：plant-knowledge-public-search/v1（匹配字段、排序、双发布准入、字面特殊字符、NFC、64/20 上限）与
 * plant-knowledge-public-read/v1 §2–§4（五字段白名单、详情语义不变）。层次：L3 / unit_real_data。真实路径：
 * node:http → 冻结路由分发 → 固定请求链 → mysql2 → MySQL 8.4 与完整 schema manifest；夹具仅在隔离容器中创建，
 * 应用账号只有该测试库的 DML 权限。不覆盖 CloudBase 网关、生产规模与真实身份发布流程。
 */
describe('已发布植物身份公开搜索（真实 MySQL）', () => {
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
    seedSearchFixtures()
    mysqlPort = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(lastArrayIndex))
    baseUrl = await startServer(appEnvironment())
  })

  beforeEach(() => {
    rootSql('DELETE FROM active_plant_knowledge_releases;', databaseName)
    activateBothReleases()
  })

  afterAll(async () => {
    await stopServer()
    runDocker(['rm', '--force', containerName])
  })

  test('精确学名优先，其余按三个字段稳定排序，且不同公开引用的同名身份均保留', async () => {
    const response = await search('monstera')
    const body = (await response.json()) as {
      data: { items: Array<Record<string, unknown>>; truncated: boolean }
    }

    expect(response.status).toBe(okStatus)
    expect(body).toEqual({
      data: {
        items: [
          expect.objectContaining({ plantIdentityRef: 'pid_search_exact_001' }),
          expect.objectContaining({ plantIdentityRef: 'pid_search_duplicate_a_001' }),
          expect.objectContaining({ plantIdentityRef: 'pid_search_duplicate_b_001' }),
          expect.objectContaining({ plantIdentityRef: 'pid_search_name_001' }),
          expect.objectContaining({ plantIdentityRef: 'pid_search_scientific_001' })
        ],
        truncated: false
      }
    })
    for (const item of body.data.items) {
      expect(Object.keys(item).sort()).toEqual([
        'acceptedScientificName',
        'displayNameZh',
        'identityKind',
        'plantIdentityRef',
        'taxonRank'
      ])
    }
  })

  test('接受学名前缀命中；大小写不敏感且 q 首尾空白与分解 Unicode 规范化', async () => {
    const scientificPrefixResponse = await search('  ALOCASIA  ')
    const normalizedResponse = await search(`  E\u0301clair  `)

    expect(scientificPrefixResponse.status).toBe(okStatus)
    expect(await scientificPrefixResponse.json()).toMatchObject({
      data: { items: [{ plantIdentityRef: 'pid_search_alocasia_001' }], truncated: false }
    })
    expect(normalizedResponse.status).toBe(okStatus)
    expect(await normalizedResponse.json()).toMatchObject({
      data: { items: [{ plantIdentityRef: 'pid_search_accent_001' }], truncated: false }
    })
  })

  test('百分号、下划线、反斜杠和 SQL 转义符作为字面前缀字符', async () => {
    const specialCases = [
      { query: 'Mon%', expectedRef: 'pid_search_percent_001' },
      { query: 'Mon_', expectedRef: 'pid_search_underscore_001' },
      { query: 'Mon\\', expectedRef: 'pid_search_backslash_001' },
      { query: 'Mon!', expectedRef: 'pid_search_escape_001' }
    ]

    for (const specialCase of specialCases) {
      const response = await search(specialCase.query)
      expect(response.status).toBe(okStatus)
      expect(await response.json()).toMatchObject({
        data: {
          items: [{ plantIdentityRef: specialCase.expectedRef }],
          truncated: false
        }
      })
    }
  })

  test('空词与超过 64 个 Unicode 码点均返回 400', async () => {
    for (const query of ['   ', '🌿'.repeat(codePointLimit + one)]) {
      const response = await search(query)
      expect(response.status).toBe(badRequestStatus)
      expect(await response.json()).toEqual({
        error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
      })
    }

    const missingQueryResponse = await fetch(`${baseUrl}/api/v2/plant-knowledge/search`)
    expect(missingQueryResponse.status).toBe(badRequestStatus)
  })

  test('64 个码点的查询有效，NFC 后计数且规范化到 64 个码点仍有效', async () => {
    const maximumQueryResponse = await search('a'.repeat(codePointLimit))
    const decomposedQuery = 'e\u0301'.repeat(codePointLimit)
    const normalizedLengthResponse = await search(decomposedQuery)

    expect(maximumQueryResponse.status).toBe(okStatus)
    expect(await maximumQueryResponse.json()).toMatchObject({
      data: {
        items: [{ plantIdentityRef: 'pid_search_length_001' }],
        truncated: false
      }
    })
    expect(normalizedLengthResponse.status).toBe(okStatus)
    expect(await normalizedLengthResponse.json()).toMatchObject({
      data: { items: [], truncated: false }
    })
  })

  test('超过 20 项时只返回稳定排序的前 20 项并标记 truncated', async () => {
    const response = await search('容量植物')
    const body = (await response.json()) as {
      data: { items: Array<{ plantIdentityRef: string }>; truncated: boolean }
    }

    expect(response.status).toBe(okStatus)
    expect(body.data.items.map(item => item.plantIdentityRef)).toEqual(
      Array.from({ length: matchCountLimit }, (_, index) => {
        return `${publishedItemPrefix}${String(index).padStart(twoDigitWidth, zeroDigit)}`
      })
    )
    expect(body.data.items).toHaveLength(matchCountLimit)
    expect(body.data.truncated).toBe(true)
  })

  test('执行计划由当前发布明细唯一索引驱动，身份与分类按主键/唯一键回表，不全表扫描', async () => {
    const captured: Array<{ sql: string; parameters: readonly (string | number | null)[] }> = []
    await createMysqlPublishedPlantSearchRepository({
      query: async (sql, parameters) => {
        captured.push({ sql, parameters })
        return []
      }
    }).searchPublishedPlants('Monstera')
    const connection = await createConnection({
      host: '127.0.0.1',
      port: mysqlPort,
      user: appUser,
      password: appPassword,
      database: databaseName
    })
    try {
      const [plan] = (await connection.query(`EXPLAIN FORMAT=JSON ${captured[zero]!.sql}`, [
        ...captured[zero]!.parameters
      ])) as unknown as [Array<{ EXPLAIN: string }>]
      const access = new Map<string, { access_type?: string; key?: string }>()
      JSON.parse(plan[zero]!.EXPLAIN, (key, value: unknown) => {
        const table = value as { table_name?: string; access_type?: string; key?: string } | null
        if (table && typeof table === 'object' && typeof table.table_name === 'string') {
          access.set(table.table_name, table)
        }
        return value
      })
      // 名称列无索引：匹配只能是回表后的过滤，工作量必须受当前发布明细数约束，而非身份/分类全表。
      expect([...access.values()].map(table => table.access_type)).not.toContain('ALL')
      expect(access.get('identity_item')).toMatchObject({ key: 'uq_knowledge_release_item' })
      expect(access.get('identity_record')).toMatchObject({
        access_type: 'eq_ref',
        key: 'uq_plant_identity_ref'
      })
      expect(access.get('taxon')).toMatchObject({ access_type: 'eq_ref', key: 'PRIMARY' })
    } finally {
      await connection.end()
    }
  })

  test('仅返回当前双 active release 准入的身份；缺少发布指针时是空结果而非 404', async () => {
    const hiddenResponse = await search('Unpublished')
    const quarantinedIdentityResponse = await search('Quarantined specimen')
    const quarantinedTaxonResponse = await search('Quarantined taxon specimen')
    expect(hiddenResponse.status).toBe(okStatus)
    expect(await hiddenResponse.json()).toEqual({
      data: { items: [], truncated: false }
    })
    expect(quarantinedIdentityResponse.status).toBe(okStatus)
    expect(await quarantinedIdentityResponse.json()).toEqual({
      data: { items: [], truncated: false }
    })
    expect(quarantinedTaxonResponse.status).toBe(okStatus)
    expect(await quarantinedTaxonResponse.json()).toEqual({
      data: { items: [], truncated: false }
    })

    rootSql('DELETE FROM active_plant_knowledge_releases;', databaseName)
    const noReleaseResponse = await search('Monstera')
    expect(noReleaseResponse.status).toBe(okStatus)
    expect(await noReleaseResponse.json()).toEqual({
      data: { items: [], truncated: false }
    })
  })
})
