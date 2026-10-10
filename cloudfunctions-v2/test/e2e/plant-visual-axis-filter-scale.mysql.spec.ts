import { spawnSync } from 'node:child_process'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { encodeVisualFilterCursor } from '../../src/plant-knowledge/domain/visual-axis-filter.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import {
  fixturePolicyPorts,
  plantKnowledgePublicSearchRulesV2
} from '../support/business-policy-fixtures.js'
import { applyVisualFilterMigration, buildIndex } from './support/visual-filter-index-fixture.js'

/**
 * 25 万株规模性能与语义回归（ClickUp z8v0kmvgab，用户 2026-10-10 授权改表票）。
 * Expected：plant-visual-axis-filter/v1 修订 1——语义与结果表直查逐条等价；典型组合 3 次中位数 < 1 秒（用户 D8 门槛）。
 * 层次：L3 / unit_real_data。本机 HTTP → 真实路由与 Repository → mysql2 → 隔离 Docker MySQL 8.0.43；
 * InnoDB 缓冲池设为 256 MiB（= 测试库 @@innodb_buffer_pool_size 只读读回），表结构与排序规则照抄测试库。
 * 数据由 SQL 递归 CTE 确定性生成：taxon_id 用 MD5 打散与 id 无关；三轴缺值约三成、可搜索约 97%，
 * 取值分布按测试库 all-v1 实测比例近似（ELLIPTIC 约七成、HEART 约 6%、FORKED_ANTLER 极少）。
 * 语义对照用同库「结果表直查」SQL 独立计算，不读被测实现输出。未覆盖：CloudBase 网络往返与冷启动。
 */
const container = `qhz-visual-scale-${process.pid}`
const plantCount = 250_000
let database: Connection | undefined
let server: Server | undefined
let base = ''
let port = 0
let backfillMs = 0
const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!

function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 各轴取值与权重（千分比，主值 + 可选次值），近似测试库 all-v1 分布。 */
const distributions: Record<string, Array<[string, number]>> = {
  LEAF_SHAPE: [
    ['ELLIPTIC', 560],
    ['LANCEOLATE', 180],
    ['LINEAR_STRAP', 90],
    ['PINNATE_COMPOUND', 45],
    ['HEART', 40],
    ['LOBED', 30],
    ['ROUND', 20],
    ['SPOON', 12],
    ['PALMATE', 10],
    ['KIDNEY', 4],
    ['ARROW_SAGITTATE', 3],
    ['NEEDLELIKE', 3],
    ['FAN', 2],
    ['FIDDLE', 1]
  ],
  GROWTH_FORM: [
    ['UPRIGHT', 520],
    ['CLUMPING', 250],
    ['VINING', 110],
    ['SPREADING', 50],
    ['ROSETTE', 30],
    ['CREEPING', 25],
    ['TRAILING', 15]
  ],
  LEAF_SURFACE: [
    ['LEATHERY', 450],
    ['GLOSSY', 300],
    ['HAIRY', 110],
    ['SMOOTH', 60],
    ['TEXTURED', 50],
    ['FLESHY', 15],
    ['WAXY', 10],
    ['VELVETY', 5]
  ]
}
/** 枚举顺序（sort_order）照抄测试库 catalog v1。 */
const catalogOrder: Record<string, string[]> = {
  LEAF_SHAPE: [
    'HEART',
    'ELLIPTIC',
    'LANCEOLATE',
    'ARROW_SAGITTATE',
    'ROUND',
    'LINEAR_STRAP',
    'SPOON',
    'KIDNEY',
    'PALMATE',
    'PINNATE_COMPOUND',
    'LOBED',
    'FIDDLE',
    'FAN',
    'FORKED_ANTLER',
    'NEEDLELIKE'
  ],
  GROWTH_FORM: ['UPRIGHT', 'SPREADING', 'CLUMPING', 'VINING', 'TRAILING', 'CREEPING', 'ROSETTE'],
  LEAF_SURFACE: ['SMOOTH', 'GLOSSY', 'LEATHERY', 'FLESHY', 'VELVETY', 'WAXY', 'HAIRY', 'TEXTURED']
}

/** 把权重表转成 SQL CASE：hashExpression 取 0–999。 */
function pickExpression(axis: string, hashExpression: string): string {
  let cumulative = 0
  const total = distributions[axis]!.reduce((sum, [, weight]) => sum + weight, 0)
  const branches = distributions[axis]!.map(([code, weight]) => {
    cumulative += weight
    return `WHEN ${hashExpression} < ${Math.round((cumulative / total) * 1000)} THEN '${code}'`
  })
  return `(CASE ${branches.join(' ')} ELSE '${distributions[axis]!.at(-1)![0]}' END)`
}

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
    'mysql:8.0.43',
    '--innodb-buffer-pool-size=268435456'
  ])
  port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      database = await createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        password: '',
        supportBigNumbers: true,
        bigNumberStrings: true
      })
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
    'CREATE DATABASE visual_scale CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await database.query('USE visual_scale')
  for (const sql of [
    `CREATE TABLE tropicals_species_encyclopedia_ref (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci, name VARCHAR(512) NOT NULL, scientific_name VARCHAR(512) NULL,
      cover_image_ref VARCHAR(1024) NULL, cover_source_json JSON NULL, description TEXT NULL, UNIQUE KEY uk_tse_taxon_id (taxon_id))`,
    `CREATE TABLE plant_search_documents (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci,
      is_searchable TINYINT(1) NOT NULL, preferred_display_name VARCHAR(255) NULL, UNIQUE KEY uk_search_document_taxon (taxon_id))`,
    `CREATE TABLE plant_visual_axis_results (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, encyclopedia_id BIGINT UNSIGNED NOT NULL,
      taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_0900_ai_ci, axis_code VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, values_json JSON NULL,
      status VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci, confidence VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      evidence_text VARCHAR(1024) NULL COLLATE utf8mb4_0900_ai_ci, source_field VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      source_hash CHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci, extraction_version VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      UNIQUE KEY uk_visual_axis_result (encyclopedia_id, axis_code, extraction_version),
      KEY idx_visual_axis_result_axis (axis_code, status), KEY idx_visual_axis_result_taxon (taxon_id))`,
    `CREATE TABLE plant_visual_axis_values (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      axis_code VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, axis_name_zh VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      axis_mode VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci, value_code VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      value_name_zh VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci, value_definition_zh VARCHAR(255) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      sort_order SMALLINT UNSIGNED NOT NULL, catalog_version VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, is_active TINYINT(1) NOT NULL,
      UNIQUE KEY uk_visual_axis_value (catalog_version, axis_code, value_code))`
  ]) {
    await database.query(sql)
  }
  for (const [axis, codes] of Object.entries(catalogOrder)) {
    for (const [index, code] of codes.entries()) {
      await database.execute(
        `INSERT INTO plant_visual_axis_values (axis_code, axis_name_zh, axis_mode, value_code, value_name_zh, value_definition_zh, sort_order, catalog_version, is_active)
        VALUES (?, ?, 'MULTI', ?, ?, ?, ?, 'v1', 1)`,
        [axis, axis, code, code, code, (index + 1) * 10]
      )
    }
  }
  await database.query('SET SESSION cte_max_recursion_depth = 1000000')
  const seq = `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${plantCount}) `
  await database.query(`INSERT INTO tropicals_species_encyclopedia_ref (id, taxon_id, name, scientific_name, description) ${seq}
    SELECT n, CONCAT('https://tropicals.cn/species/', MD5(n)), CONCAT('植物', n), CONCAT('Plantae s', n), REPEAT('描述', 40) FROM seq`)
  await database.query(`INSERT INTO plant_search_documents (id, taxon_id, is_searchable, preferred_display_name) ${seq}
    SELECT n, CONCAT('https://tropicals.cn/species/', MD5(n)), IF(n % 33 = 0, 0, 1), CONCAT('植物', n) FROM seq`)
  for (const [axisIndex, axis] of Object.keys(distributions).entries()) {
    const h1 = `(CRC32(CONCAT('${axis}', n)) % 1000)`
    const h2 = `(CRC32(CONCAT('${axis}#', n)) % 1000)`
    const h3 = `(CRC32(CONCAT('${axis}?', n)) % 1000)`
    // 约 30% 缺值（不写行）；其余约 45% 带第二个值（可能与主值相同，按 JSON 数组原样存放）。
    await database.query(`INSERT INTO plant_visual_axis_results (encyclopedia_id, taxon_id, axis_code, values_json, status, confidence, evidence_text, source_field, source_hash, extraction_version) ${seq}
      SELECT n, CONCAT('https://tropicals.cn/species/', MD5(n)), '${axis}',
        IF(${h3} < 450, JSON_ARRAY(${pickExpression(axis, h1)}, ${pickExpression(axis, h2)}), JSON_ARRAY(${pickExpression(axis, h1)})),
        'EXTRACTED', 'HIGH', REPEAT('证据', 30), 'bio_morphology', REPEAT('a', 64), 'visual-axis-all-v1'
      FROM seq WHERE (CRC32(CONCAT('missing', ${axisIndex}, n)) % 100) >= 30`)
  }
  await database.query(
    'ANALYZE TABLE plant_visual_axis_results, tropicals_species_encyclopedia_ref, plant_search_documents'
  )
  await applyVisualFilterMigration(database)
  const started = performance.now()
  await buildIndex(database, sources, 5000)
  backfillMs = performance.now() - started
  await database.query('ANALYZE TABLE plant_visual_filter_entries')
  server = createPlantKnowledgeServer({
    ...fixturePolicyPorts(),
    connectionSource: createMysql2ConnectionSource({
      host: '127.0.0.1',
      port,
      database: 'visual_scale',
      user: 'root',
      password: ''
    }),
    writeAudit: () => undefined
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 900_000)

afterAll(async () => {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()))
  }
  await database?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

type Page = { items: Array<{ catalogTaxonRef: string }>; nextCursor: string | null }

async function timed(query: string): Promise<{ ms: number; data: Page }> {
  const started = performance.now()
  const response = await fetch(`${base}/api/v2/plant-knowledge/catalog/visual-filter?${query}`)
  const body = (await response.json()) as { data: Page }
  const ms = performance.now() - started
  expect(response.status, query).toBe(200)
  return { ms, data: body.data }
}

/** 独立对照：同库直接查结果表（JSON_OVERLAPS），只要可搜索植物，taxon 升序。 */
async function oracle(
  selection: Record<string, string[]>,
  after: string | null,
  limit: number
): Promise<string[]> {
  const clauses: string[] = []
  const parameters: unknown[] = []
  for (const [axis, values] of Object.entries(selection)) {
    clauses.push(`EXISTS (SELECT 1 FROM plant_visual_axis_results r WHERE r.encyclopedia_id = e.id AND r.axis_code = ? AND r.extraction_version = 'visual-axis-all-v1'
      AND r.status = 'EXTRACTED' AND JSON_TYPE(r.values_json) = 'ARRAY' AND JSON_OVERLAPS(r.values_json, CAST(? AS JSON)))`)
    parameters.push(axis, JSON.stringify(values))
  }
  if (after !== null) {
    clauses.push('e.taxon_id > ?')
    parameters.push(after)
  }
  const [rows] = await database!.query(
    `SELECT e.taxon_id FROM tropicals_species_encyclopedia_ref e JOIN plant_search_documents d ON d.taxon_id = e.taxon_id AND d.is_searchable = 1
    WHERE ${clauses.join(' AND ')} ORDER BY e.taxon_id LIMIT ${limit}`,
    parameters
  )
  return (rows as Array<{ taxon_id: string }>).map(row => row.taxon_id)
}

const median = (values: number[]) =>
  [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!

describe('三轴筛选 25 万株规模（预计算索引）', () => {
  const combos: Array<[string, string, Record<string, string[]>, string | null]> = [
    [
      '跨轴稀有组合 HEART × VINING',
      'leafShape=HEART&growthForm=VINING',
      { LEAF_SHAPE: ['HEART'], GROWTH_FORM: ['VINING'] },
      null
    ],
    ['单轴常见值 ELLIPTIC', 'leafShape=ELLIPTIC', { LEAF_SHAPE: ['ELLIPTIC'] }, null],
    [
      '三轴组合 + 同轴 OR',
      'leafShape=HEART,LOBED&growthForm=UPRIGHT&leafSurface=GLOSSY',
      { LEAF_SHAPE: ['HEART', 'LOBED'], GROWTH_FORM: ['UPRIGHT'], LEAF_SURFACE: ['GLOSSY'] },
      null
    ],
    [
      '极稀有值 FIDDLE × ROSETTE（接近全索引扫描）',
      'leafShape=FIDDLE&growthForm=ROSETTE',
      { LEAF_SHAPE: ['FIDDLE'], GROWTH_FORM: ['ROSETTE'] },
      null
    ],
    [
      '深页游标（从 taxon 中段继续）',
      `leafShape=HEART&growthForm=VINING&cursor=${encodeVisualFilterCursor('https://tropicals.cn/species/8')}`,
      { LEAF_SHAPE: ['HEART'], GROWTH_FORM: ['VINING'] },
      'https://tropicals.cn/species/8'
    ]
  ]

  test.each(combos)(
    '%s：首页与结果表直查一致，3 次中位数 < 1 秒',
    async (label, query, selection, after) => {
      const runs = [await timed(query), await timed(query), await timed(query)]
      const expected = await oracle(selection, after, 20)
      for (const run of runs) {
        expect(run.data.items.map(item => item.catalogTaxonRef)).toEqual(expected)
      }
      const ms = runs.map(run => Math.round(run.ms))
      console.info(
        `[visual-filter-scale] ${label} runs_ms=${JSON.stringify(ms)} median_ms=${median(ms)} backfill_ms=${Math.round(backfillMs)}`
      )
      expect(median(ms)).toBeLessThan(1000)
    }
  )

  test('跨页翻 5 页：与直查逐页一致、无重复', async () => {
    let cursor: string | null = null
    let after: string | null = null
    const seen = new Set<string>()
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const { data } = await timed(
        `leafShape=HEART&growthForm=VINING${cursor ? `&cursor=${cursor}` : ''}`
      )
      const refs = data.items.map(item => item.catalogTaxonRef)
      expect(refs).toEqual(
        await oracle({ LEAF_SHAPE: ['HEART'], GROWTH_FORM: ['VINING'] }, after, 20)
      )
      for (const ref of refs) {
        expect(seen.has(ref)).toBe(false)
        seen.add(ref)
      }
      cursor = data.nextCursor
      after = refs.at(-1) ?? null
      expect(cursor).not.toBeNull()
    }
  })
})
