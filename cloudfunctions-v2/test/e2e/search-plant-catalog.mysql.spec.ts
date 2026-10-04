import { spawnSync } from 'node:child_process'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'

const container = `qhz-catalog-${process.pid}`
let database: Connection | undefined
let server: Server | undefined
let base = ''
type Body = {
  data: { items: Array<{ catalogTaxonRef: string; plantIdentityRef?: string }>; truncated: boolean }
}

/** 只操作本测试创建的容器；不使用 CloudBase 账号，不读取 docs 目录。 */
function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/**
 * Expected：plant-catalog-search/v1；字段取自 qinghuazhi_v2_test 的 information_schema 定向读回。
 * e2e_real_api：本机 HTTP → 实际 Repository → mysql2 → 隔离 MySQL 8；无替身数据库。
 * 下列最小真实表仅构造检索和准入数据，未声称验证全量迁移或生产 CloudBase 网关。
 */
beforeAll(async () => {
  docker([
    'run',
    '-d',
    '--name',
    container,
    '-e',
    'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    '-p',
    '127.0.0.1::3306',
    'mysql:8.0.43'
  ])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      database = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await database.query('SELECT 1')
      break
    } catch {
      await database?.end().catch(() => undefined)
      database = undefined
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  if (!database) {
    throw new Error('隔离 MySQL 未就绪')
  }
  await database.query(
    'CREATE DATABASE catalog_fixture CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await database.query('USE catalog_fixture')
  const tables = [
    'CREATE TABLE plant_search_documents (id BIGINT PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL, preferred_display_name VARCHAR(255), scientific_name VARCHAR(255), taxon_rank VARCHAR(32), taxonomic_status VARCHAR(32), is_selectable TINYINT, has_encyclopedia TINYINT, has_image TINYINT, is_searchable TINYINT, v2_identity_internal_id BIGINT)',
    'CREATE TABLE plant_search_terms (id BIGINT PRIMARY KEY, search_document_internal_id BIGINT, target_identity_internal_id BIGINT, normalized_term VARCHAR(255), match_priority SMALLINT, is_primary TINYINT, is_active TINYINT)',
    'CREATE TABLE plant_identities (id BIGINT PRIMARY KEY, public_identity_ref VARCHAR(64), primary_taxon_internal_id BIGINT, review_status VARCHAR(32))',
    'CREATE TABLE plant_taxa (id BIGINT PRIMARY KEY, public_taxon_ref VARCHAR(64), review_status VARCHAR(32))',
    'CREATE TABLE active_plant_knowledge_releases (release_kind VARCHAR(32) PRIMARY KEY, release_internal_id BIGINT)',
    'CREATE TABLE plant_knowledge_release_items (release_internal_id BIGINT, subject_kind VARCHAR(32), subject_ref VARCHAR(64), admission_status VARCHAR(32), UNIQUE(release_internal_id, subject_kind, subject_ref))'
  ]
  for (const sql of tables) {
    await database.query(sql)
  }
  // E02 仅构造已核验的展示列，不复制养护性状与同步原文。
  await database.query(`CREATE TABLE tropicals_species_encyclopedia_ref (
    taxon_id VARCHAR(512) PRIMARY KEY, name VARCHAR(512), scientific_name VARCHAR(512),
    additional_names_json JSON, taxon_rank VARCHAR(64), order_name VARCHAR(255), family VARCHAR(255), genus VARCHAR(255),
    description TEXT, bio_morphology TEXT, bio_distribution TEXT, bio_varieties TEXT, bio_habitat TEXT,
    bio_propagation TEXT, bio_commercial TEXT, bio_pests TEXT, care_difficulty VARCHAR(64),
    temperature_range VARCHAR(64), humidity_range VARCHAR(64), light_requirement VARCHAR(512))`)
  for (const id of [1, 2, 25]) {
    await database.execute(
      'INSERT INTO tropicals_species_encyclopedia_ref (taxon_id, name, scientific_name, additional_names_json, taxon_rank, family, genus) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        `catalog:${id.toString().padStart(2, '0')}`,
        '龟背竹',
        'Monstera deliciosa',
        JSON.stringify(['蓬莱蕉', '铁丝兰', '电线草']),
        'species',
        'Araceae',
        'Monstera'
      ]
    )
  }
  for (let id = 1; id <= 25; id++) {
    await database.execute(
      'INSERT INTO plant_search_documents VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, ?, NULL)',
      [
        id,
        `catalog:${id.toString().padStart(2, '0')}`,
        id === 1 ? 'Zulu' : 'Alpha',
        `Fixture ${id}`,
        'species',
        'accepted',
        id === 25 ? 0 : 1
      ]
    )
    await database.execute('INSERT INTO plant_search_terms VALUES (?, ?, NULL, ?, ?, ?, 1)', [
      id,
      id,
      id === 1 ? '同名' : '同名延伸',
      id === 1 ? 99 : 1,
      1
    ])
  }
  // 重复词条不能重复目录文档；无效词条或不可搜索文档不能进入结果。
  await database.query(
    "INSERT INTO plant_search_terms VALUES (101, 1, NULL, '同名延伸', 0, 1, 1), (102, 1, NULL, '不可见', 0, 1, 0)"
  )
  const literalTerms = ['Mon%', 'Mon_', 'Mon\\', 'Mon!', 'Café', '🌿'.repeat(64)]
  for (let index = 0; index < literalTerms.length; index++) {
    await database.execute('INSERT INTO plant_search_terms VALUES (?, 2, NULL, ?, 0, 1, 1)', [
      200 + index,
      literalTerms[index]!
    ])
  }
  await database.query(
    "INSERT INTO plant_taxa VALUES (10, 'txr_10', 'ACTIVE'), (11, 'txr_11', 'QUARANTINE')"
  )
  await database.query(
    "INSERT INTO plant_identities VALUES (10, 'pid_valid', 10, 'ACTIVE'), (11, 'pid_bad_taxon', 11, 'ACTIVE'), (12, 'pid_no_release', 10, 'ACTIVE')"
  )
  await database.query(
    "INSERT INTO active_plant_knowledge_releases VALUES ('identity', 100), ('taxonomy', 200)"
  )
  await database.query(
    "INSERT INTO plant_knowledge_release_items VALUES (100, 'identity', 'pid_valid', 'ACTIVE'), (100, 'identity', 'pid_bad_taxon', 'ACTIVE'), (200, 'taxon', 'txr_10', 'ACTIVE'), (200, 'taxon', 'txr_11', 'ACTIVE')"
  )
  await database.query(
    "INSERT INTO plant_search_terms VALUES (301, 2, 10, '准入', 0, 1, 1), (302, 3, 11, '准入', 0, 1, 1), (303, 4, 12, '准入', 0, 1, 1), (304, 5, 10, '准入', 0, 1, 1), (305, 5, 12, '准入', 0, 1, 1)"
  )
  server = createPlantKnowledgeServer({
    connectionSource: createMysql2ConnectionSource({
      host: '127.0.0.1',
      port,
      database: 'catalog_fixture',
      user: 'root',
      password: ''
    }),
    writeAudit: () => undefined
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 60_000)
afterAll(async () => {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()))
  }
  await database?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

/** 走真实 HTTP，不直接调用查询函数。 */
async function search(q: string, limit = 10): Promise<Body['data']> {
  const response = await fetch(
    `${base}/api/v2/plant-knowledge/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`
  )
  expect(response.status).toBe(200)
  return ((await response.json()) as Body).data
}
describe('目录搜索真实 MySQL 与 HTTP', () => {
  test('精确优先、同文档去重、同名不同分类保留，按 limit 截断', async () => {
    const result = await search('同名', 20)
    expect(result.items).toHaveLength(20)
    expect(result.items[0]?.catalogTaxonRef).toBe('catalog:01')
    expect(new Set(result.items.map(x => x.catalogTaxonRef)).size).toBe(20)
    expect(result.items.map(x => x.catalogTaxonRef)).not.toContain('catalog:25')
    expect(result.truncated).toBe(true)
    expect(await search('同名', 20)).toEqual(result)
  })
  test.each(['Mon%', 'Mon_', 'Mon\\', 'Mon!'])('SQL 标点 %s 为字面值', async q => {
    expect((await search(q)).items.map(x => x.catalogTaxonRef)).toEqual(['catalog:02'])
  })
  test('NFC 与 Unicode 边界在真实查询有效，无匹配返回空', async () => {
    expect((await search(' Cafe\u0301 ')).items).toHaveLength(1)
    expect((await search('🌿'.repeat(64))).items).toHaveLength(1)
    expect((await search('不存在')).items).toEqual([])
    expect((await search('不可见')).items).toEqual([])
  })
  test('仅当前双发布且唯一的身份可附带；争议、不准入仍保留目录', async () => {
    const result = await search('准入')
    expect(result.items).toHaveLength(4)
    expect(result.items.find(x => x.catalogTaxonRef === 'catalog:02')?.plantIdentityRef).toBe(
      'pid_valid'
    )
    for (const ref of ['catalog:03', 'catalog:04', 'catalog:05']) {
      expect(result.items.find(x => x.catalogTaxonRef === ref)).not.toHaveProperty(
        'plantIdentityRef'
      )
    }
  })
  test('撤回发布不影响目录读取，但停止附带身份引用', async () => {
    await database!.query('DELETE FROM active_plant_knowledge_releases')
    const result = await search('准入')
    expect(result.items).toHaveLength(4)
    expect(result.items.every(item => item.plantIdentityRef === undefined)).toBe(true)
  })
})

/** E02 Expected：plant-encyclopedia-read/v1；真实 HTTP 与同一隔离 MySQL，非生产部署。 */
describe('百科 SQL 精确引用与展示隔离', () => {
  test('相同 slug 的不同目录引用均可精确读取，无内部身份或图片', async () => {
    for (const ref of ['catalog:01', 'catalog:02']) {
      const response = await fetch(
        `${base}/api/v2/plant-knowledge/encyclopedia/monstera-deliciosa?catalogTaxonRef=${encodeURIComponent(ref)}`
      )
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: Record<string, unknown> }
      expect(body.data.catalogTaxonRef).toBe(ref)
      expect(body.data.additionalNames).toEqual(['蓬莱蕉', '铁丝兰', '电线草'])
      expect(body.data.coverImage).toBeNull()
      expect(body.data).not.toHaveProperty('plantIdentityRef')
    }
  })
  test('错误 slug 与精确分类引用不匹配时为 400', async () => {
    expect(
      (
        await fetch(
          `${base}/api/v2/plant-knowledge/encyclopedia/wrong?catalogTaxonRef=catalog%3A01`
        )
      ).status
    ).toBe(400)
  })
  test.each(['catalog:25', 'catalog:%', 'catalog:03'])(
    '不可搜索、通配符或无百科的引用 %s 返回 404',
    async ref => {
      expect(
        (
          await fetch(
            `${base}/api/v2/plant-knowledge/encyclopedia/monstera-deliciosa?catalogTaxonRef=${encodeURIComponent(ref)}`
          )
        ).status
      ).toBe(404)
    }
  )
})
