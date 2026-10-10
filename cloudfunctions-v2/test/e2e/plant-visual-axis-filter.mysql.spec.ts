import { spawnSync } from 'node:child_process'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import {
  fixturePolicyPorts,
  plantKnowledgePublicSearchRulesV2
} from '../support/business-policy-fixtures.js'
import { applyVisualFilterMigration, buildIndex } from './support/visual-filter-index-fixture.js'

/**
 * Expected：plant-visual-axis-filter/v1（用户 2026-10-10 审定）。
 * 层次：L3 / unit_real_data。本机 HTTP → 真实路由与 Repository → mysql2 → 隔离 Docker MySQL 8；无替身数据库。
 * 表结构、列类型与排序规则照抄 qinghuazhi_v2_test 的 information_schema（2026-10-10 只读读回）：
 * 结果表 utf8mb4_0900_ai_ci、百科表与目录表 utf8mb4_unicode_ci，以复现跨排序规则联表。
 * 策略快照用仓库 v2 发布文档（真实数据库策略读取见 test/foundation/mysql-typed-policy-reader.spec.ts）。
 * 期望集合由下方夹具定义按合同规则在测试内独立计算，不读取被测实现输出。
 * 未覆盖：CloudBase 网关、测试库真实数据规模下的延迟（见证据文件计时）。
 */
const container = `qhz-visual-axis-${process.pid}`
let database: Connection | undefined
let server: Server | undefined
let base = ''
const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!
let buildReport: Awaited<ReturnType<typeof buildIndex>> | undefined

function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 夹具植物：编号决定 taxon_id；未列出的轴即缺值（无行）。 */
type PlantFixture = {
  readonly n: number
  readonly searchable: boolean
  readonly shape?: readonly string[] | undefined
  readonly form?: readonly string[] | undefined
  readonly surface?: readonly string[] | undefined
}
const taxon = (n: number) => `https://tropicals.cn/species/p${String(n).padStart(3, '0')}`
const shapes = ['HEART', 'ELLIPTIC', 'LANCEOLATE', 'LOBED']
const forms = ['UPRIGHT', 'VINING', 'CLUMPING']
const surfaces = ['GLOSSY', 'LEATHERY', 'HAIRY']

/** 120 株确定性夹具：约三成缺某轴、约一成不可搜索，同轴多值普遍。 */
const plants: PlantFixture[] = Array.from({ length: 120 }, (_unused, index) => {
  const n = index + 1
  return {
    n,
    searchable: n % 10 !== 0,
    shape:
      n % 3 === 0
        ? undefined
        : n % 4 === 0
          ? [shapes[n % 4]!, shapes[(n + 1) % 4]!]
          : [shapes[n % 4]!],
    form: n % 5 === 0 ? undefined : [forms[n % 3]!],
    surface:
      n % 7 === 0
        ? undefined
        : n % 2 === 0
          ? [surfaces[n % 3]!, surfaces[(n + 1) % 3]!]
          : [surfaces[n % 3]!]
  }
})

/** 干扰植物（编号 201–204）：只有 204 的 all-v1 叶型是合法 EXTRACTED 数组（含一个目录外代码）。 */
const decoys: PlantFixture[] = [
  { n: 201, searchable: true },
  { n: 202, searchable: true },
  { n: 203, searchable: true },
  { n: 204, searchable: true, shape: ['HEART', 'NOT_IN_CATALOG'] }
]

/** 合同 §3–§4 的独立实现：同轴 OR、跨轴 AND，缺值不命中，只要可搜索植物，taxon 升序。 */
function expected(selection: { shape?: string[]; form?: string[]; surface?: string[] }): string[] {
  const hit = (values: readonly string[] | undefined, wanted: string[] | undefined) =>
    wanted === undefined || (values !== undefined && values.some(value => wanted.includes(value)))
  return [...plants, ...decoys]
    .filter(
      plant =>
        plant.searchable &&
        hit(plant.shape, selection.shape) &&
        hit(plant.form, selection.form) &&
        hit(plant.surface, selection.surface)
    )
    .map(plant => taxon(plant.n))
    .sort()
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
    'mysql:8.0.43'
  ])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      database = await createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        password: '',
        multipleStatements: false
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
    'CREATE DATABASE visual_fixture CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await database.query('USE visual_fixture')
  // 读取桩：只建 v2 读取的列，类型照抄测试库；不是正式 DDL（外部表合同 §1）。
  for (const sql of [
    `CREATE TABLE tropicals_species_encyclopedia_ref (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci, name VARCHAR(512) NOT NULL, scientific_name VARCHAR(512) NULL,
      cover_image_ref VARCHAR(1024) NULL, cover_source_json JSON NULL, UNIQUE KEY uk_tse_taxon_id (taxon_id))`,
    `CREATE TABLE plant_search_documents (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci,
      is_searchable TINYINT(1) NOT NULL, UNIQUE KEY uk_taxon (taxon_id))`,
    `CREATE TABLE plant_visual_axis_results (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, encyclopedia_id BIGINT UNSIGNED NOT NULL,
      taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_0900_ai_ci, axis_code VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, values_json JSON NULL,
      status VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci, confidence VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      evidence_text VARCHAR(1024) NULL COLLATE utf8mb4_0900_ai_ci, source_field VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      source_encyclopedia_id BIGINT UNSIGNED NULL, source_hash CHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      extraction_version VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      UNIQUE KEY uk_visual_axis_result (encyclopedia_id, axis_code, extraction_version),
      KEY idx_visual_axis_result_axis (axis_code, status), KEY idx_visual_axis_result_taxon (taxon_id))`,
    `CREATE TABLE plant_visual_axis_values (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      axis_code VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, axis_name_zh VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      axis_mode VARCHAR(16) NOT NULL COLLATE utf8mb4_0900_ai_ci, value_code VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      value_name_zh VARCHAR(64) NOT NULL COLLATE utf8mb4_0900_ai_ci, value_definition_zh VARCHAR(255) NOT NULL COLLATE utf8mb4_0900_ai_ci,
      sort_order SMALLINT UNSIGNED NOT NULL, catalog_version VARCHAR(32) NOT NULL COLLATE utf8mb4_0900_ai_ci, is_active TINYINT(1) NOT NULL,
      UNIQUE KEY uk_visual_axis_value (catalog_version, axis_code, value_code), KEY idx_visual_axis (axis_code, is_active))`
  ]) {
    await database.query(sql)
  }
  const catalog: Array<[string, string, string, number]> = [
    ...shapes.map(
      (code, index) =>
        ['LEAF_SHAPE', '叶型', code, (index + 1) * 10] as [string, string, string, number]
    ),
    ...forms.map(
      (code, index) =>
        ['GROWTH_FORM', '株型', code, (index + 1) * 10] as [string, string, string, number]
    ),
    ...surfaces.map(
      (code, index) =>
        ['LEAF_SURFACE', '叶面质感', code, (index + 1) * 10] as [string, string, string, number]
    ),
    ['LEAF_MARGIN', '叶缘/裂孔特征', 'ENTIRE', 10]
  ]
  for (const [axis, axisName, code, order] of catalog) {
    await database.execute(
      `INSERT INTO plant_visual_axis_values (axis_code, axis_name_zh, axis_mode, value_code, value_name_zh, value_definition_zh, sort_order, catalog_version, is_active)
       VALUES (?, ?, 'MULTI', ?, ?, ?, ?, 'v1', 1)`,
      [axis, axisName, code, `名-${code}`, `定义-${code}`, order]
    )
  }
  // 另一枚举版本与停用值：不得被 v1 策略读到。
  await database.execute(`INSERT INTO plant_visual_axis_values (axis_code, axis_name_zh, axis_mode, value_code, value_name_zh, value_definition_zh, sort_order, catalog_version, is_active)
    VALUES ('LEAF_SHAPE', '叶型', 'MULTI', 'SQUARE', '方形', '定义', 5, 'v2', 1), ('LEAF_SHAPE', '叶型', 'MULTI', 'RETIRED', '停用', '定义', 6, 'v1', 0)`)
  const insertAxis = (
    id: number,
    axis: string,
    values: unknown,
    version = 'visual-axis-all-v1',
    status = 'EXTRACTED'
  ) =>
    database!.execute(
      `INSERT INTO plant_visual_axis_results (encyclopedia_id, taxon_id, axis_code, values_json, status, confidence, evidence_text, source_field, source_hash, extraction_version)
       VALUES (?, ?, ?, ?, ?, 'HIGH', '内部证据', 'bio_morphology', ?, ?)`,
      [
        id,
        taxon(id),
        axis,
        values === null ? null : JSON.stringify(values),
        status,
        'a'.repeat(64),
        version
      ]
    )
  for (const plant of plants) {
    await database.execute(
      `INSERT INTO tropicals_species_encyclopedia_ref (id, taxon_id, name, scientific_name, cover_image_ref, cover_source_json) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        plant.n,
        taxon(plant.n),
        `植物${plant.n}`,
        `Plantae p${plant.n}`,
        plant.n === 1 ? 'img/2026/04/95279010eb36.webp' : null,
        plant.n === 1
          ? JSON.stringify({
              schemaVersion: 'tropicals-cover-reference/v1',
              imageRef: 'img/2026/04/95279010eb36.webp',
              coverCreator: '作者甲',
              reviewStatus: 'PENDING'
            })
          : null
      ]
    )
    await database.execute(
      'INSERT INTO plant_search_documents (id, taxon_id, is_searchable) VALUES (?, ?, ?)',
      [plant.n, taxon(plant.n), plant.searchable ? 1 : 0]
    )
    if (plant.shape) {
      await insertAxis(plant.n, 'LEAF_SHAPE', plant.shape)
    }
    if (plant.form) {
      await insertAxis(plant.n, 'GROWTH_FORM', plant.form)
    }
    if (plant.surface) {
      await insertAxis(plant.n, 'LEAF_SURFACE', plant.surface)
    }
  }
  // 干扰数据：其他版本、UNKNOWN / CONFLICT、非数组、目录外代码——都不得让缺值植物命中。
  for (const n of [3, 6, 9]) {
    await insertAxis(n, 'LEAF_SHAPE', ['HEART'], 'visual-axis-v2')
    await insertAxis(n, 'LEAF_SHAPE', null, 'visual-axis-v1', 'UNKNOWN')
  }
  await insertAxis(201, 'LEAF_SHAPE', ['HEART'], 'visual-axis-all-v1', 'UNKNOWN')
  await insertAxis(202, 'LEAF_SHAPE', ['HEART'], 'visual-axis-all-v1', 'CONFLICT')
  await insertAxis(203, 'LEAF_SHAPE', 'HEART')
  await insertAxis(204, 'LEAF_SHAPE', ['HEART', 'NOT_IN_CATALOG'])
  for (const n of [201, 202, 203, 204]) {
    await database.execute(
      'INSERT INTO tropicals_species_encyclopedia_ref (id, taxon_id, name, scientific_name) VALUES (?, ?, ?, NULL)',
      [n, taxon(n), `植物${n}`]
    )
    await database.execute(
      'INSERT INTO plant_search_documents (id, taxon_id, is_searchable) VALUES (?, ?, 1)',
      [n, taxon(n)]
    )
  }
  await database.query(
    'ANALYZE TABLE plant_visual_axis_results, tropicals_species_encyclopedia_ref, plant_search_documents'
  )
  // 修订 1（z8v0kmvgab）：执行真实 031 迁移并用真实回填模块构建索引；批大小取 37 以覆盖多批与跨批边界。
  await applyVisualFilterMigration(database)
  buildReport = await buildIndex(database, sources, 37)
  server = createPlantKnowledgeServer({
    ...fixturePolicyPorts(),
    connectionSource: createMysql2ConnectionSource({
      host: '127.0.0.1',
      port,
      database: 'visual_fixture',
      user: 'root',
      password: ''
    }),
    writeAudit: () => undefined
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 120_000)

afterAll(async () => {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()))
  }
  await database?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

type Item = {
  catalogTaxonRef: string
  displayName: string
  scientificName: string | null
  coverImage: unknown
  visualAxes: Record<string, string[] | null>
}
type Page = { policyReleaseVersion: string; items: Item[]; nextCursor: string | null }

async function page(query: string): Promise<Page> {
  const response = await fetch(`${base}/api/v2/plant-knowledge/catalog/visual-filter?${query}`)
  expect(response.status, query).toBe(200)
  return ((await response.json()) as { data: Page }).data
}

/** 沿游标翻完全部页，返回逐页结果与总并集。 */
async function walk(query: string, limit: number): Promise<{ pages: Item[][]; all: string[] }> {
  const pages: Item[][] = []
  let cursor: string | null = null
  do {
    const data: Page = await page(`${query}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`)
    expect(data.items.length).toBeLessThanOrEqual(limit)
    pages.push(data.items)
    cursor = data.nextCursor
  } while (cursor !== null && pages.length < 100)
  return { pages, all: pages.flat().map(item => item.catalogTaxonRef) }
}

describe('三轴筛选真实 MySQL → HTTP', () => {
  test.each([
    ['单值', 'leafShape=HEART', { shape: ['HEART'] }],
    ['同轴 OR', 'leafShape=HEART,LOBED', { shape: ['HEART', 'LOBED'] }],
    ['跨轴 AND', 'leafShape=HEART&growthForm=VINING', { shape: ['HEART'], form: ['VINING'] }],
    [
      '三轴 AND + 同轴 OR',
      'leafShape=ELLIPTIC,LANCEOLATE&growthForm=UPRIGHT,CLUMPING&leafSurface=GLOSSY',
      { shape: ['ELLIPTIC', 'LANCEOLATE'], form: ['UPRIGHT', 'CLUMPING'], surface: ['GLOSSY'] }
    ],
    ['只选株型（叶型缺值的植物也可出现）', 'growthForm=CLUMPING', { form: ['CLUMPING'] }]
  ])('%s：游标翻页并集 = 独立期望集合，不重不漏、taxon 升序', async (_label, query, selection) => {
    const want = expected(selection)
    expect(want.length).toBeGreaterThan(5)
    const { pages, all } = await walk(query, 4)
    expect(all).toEqual(want)
    expect(new Set(all).size).toBe(all.length)
    expect(pages.at(-1)!.length).toBeGreaterThan(0)
  })

  test('UNKNOWN、CONFLICT、非数组、其他版本行都不命中；目录外代码不影响同行合法代码', async () => {
    const { all } = await walk('leafShape=HEART', 50)
    for (const n of [3, 6, 9, 201, 202, 203]) {
      expect(all).not.toContain(taxon(n))
    }
    expect(all).toContain(taxon(204))
  })

  test('不可搜索目录植物不返回', async () => {
    const { all } = await walk('leafShape=HEART,ELLIPTIC,LANCEOLATE,LOBED', 50)
    expect(
      all.some(ref => plants.find(plant => taxon(plant.n) === ref)?.searchable === false)
    ).toBe(false)
    expect(all).not.toContain(taxon(10))
  })

  test('同一请求重复两次结果完全一致（排序稳定）', async () => {
    const first = await page('leafSurface=LEATHERY&limit=9')
    const second = await page('leafSurface=LEATHERY&limit=9')
    expect(second).toEqual(first)
  })

  test('结果项：白名单字段、三轴取值按枚举排序、缺值为 null、封面 DTO 与来源；不含内部字段', async () => {
    const response = await fetch(
      `${base}/api/v2/plant-knowledge/catalog/visual-filter?leafSurface=HAIRY,GLOSSY,LEATHERY&limit=50`
    )
    const text = await response.text()
    const data = (JSON.parse(text) as { data: Page }).data
    const first = data.items.find(item => item.catalogTaxonRef === taxon(1))!
    expect(first).toEqual({
      catalogTaxonRef: taxon(1),
      displayName: '植物1',
      scientificName: 'Plantae p1',
      coverImage: {
        url: 'https://cdn.tropicals.cn/img/2026/04/95279010eb36.webp',
        source: {
          provider: 'Tropicals.cn',
          pageUrl: taxon(1),
          sourceName: null,
          originalUrl: null,
          creator: '作者甲',
          license: null,
          licenseUrl: null,
          attribution: null
        }
      },
      visualAxes: { leafShape: ['ELLIPTIC'], growthForm: ['VINING'], leafSurface: ['LEATHERY'] }
    })
    const twelve = data.items.find(item => item.catalogTaxonRef === taxon(12))!
    expect(twelve.visualAxes).toEqual({
      leafShape: null,
      growthForm: ['UPRIGHT'],
      leafSurface: ['GLOSSY', 'LEATHERY']
    })
    expect(data.policyReleaseVersion).toBe('plant-knowledge-public-search/v2.0.0')
    for (const forbidden of [
      '内部证据',
      'bio_morphology',
      'EXTRACTED',
      'HIGH',
      'visual-axis',
      'PENDING',
      '"encyclopedia'
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  test('未知枚举（含其他枚举版本与停用值）→ 400', async () => {
    for (const query of ['leafShape=SQUARE', 'leafShape=RETIRED', 'leafSurface=ENTIRE']) {
      expect(
        (await fetch(`${base}/api/v2/plant-knowledge/catalog/visual-filter?${query}`)).status,
        query
      ).toBe(400)
    }
  })

  test('visual-axes：只返回三准入轴的 v1 生效值，按 sort_order', async () => {
    const response = await fetch(`${base}/api/v2/plant-knowledge/catalog/visual-axes`)
    expect(response.status).toBe(200)
    const data = (
      (await response.json()) as {
        data: { axes: Array<{ axisCode: string; values: Array<{ valueCode: string }> }> }
      }
    ).data
    expect(
      data.axes.map(axis => [axis.axisCode, axis.values.map(value => value.valueCode)])
    ).toEqual([
      ['LEAF_SHAPE', shapes],
      ['GROWTH_FORM', forms],
      ['LEAF_SURFACE', surfaces]
    ])
  })

  test('回填报告：一次建成并就绪，收录至少一轴有合法取值的植物', async () => {
    expect(buildReport).toMatchObject({ status: 'built' })
    const [rows] = await database!.query('SELECT status, plant_count FROM plant_visual_filter_sets')
    expect(rows).toEqual([{ status: 'ready', plant_count: buildReport!.plantCount }])
    // 独立期望：主体 120 株中三轴全缺的只有 n 同时被 3、5、7 整除者（105），另加干扰植物 204。
    expect(buildReport!.plantCount).toBe(120 - 1 + 1)
  })

  test('重复执行回填为空操作（幂等）', async () => {
    const [before] = await database!.query(
      'SELECT COUNT(*) AS n, MAX(updated_at_ms) AS t FROM plant_visual_filter_entries'
    )
    expect(
      await buildIndex(database!, sources, 37, Date.parse('2026-10-11T00:00:00Z'))
    ).toMatchObject({ status: 'already_ready' })
    const [after] = await database!.query(
      'SELECT COUNT(*) AS n, MAX(updated_at_ms) AS t FROM plant_visual_filter_entries'
    )
    expect(after).toEqual(before)
  })

  test('中断后续跑：断点落在半写入批次中，再次回填得到与首次完全相同的条目', async () => {
    const snapshot =
      'SELECT taxon_id, encyclopedia_id, leaf_shape_mask, growth_form_mask, leaf_surface_mask FROM plant_visual_filter_entries ORDER BY taxon_id'
    const [full] = await database!.query(snapshot)
    await database!.query(
      "UPDATE plant_visual_filter_sets SET status = 'building', built_at_ms = NULL, next_encyclopedia_id = 60"
    )
    // 模拟中断在批次中途：断点停在 60，但 60–79 已写入（同一区间重跑必须先删再写，不能重复或报唯一键冲突）。
    await database!.query('DELETE FROM plant_visual_filter_entries WHERE encyclopedia_id >= 80')
    // 构建中的索引不可读：接口 503，而不是返回半份结果。
    expect(
      (await fetch(`${base}/api/v2/plant-knowledge/catalog/visual-filter?leafShape=HEART`)).status
    ).toBe(503)
    expect(await buildIndex(database!, sources, 37)).toMatchObject({ status: 'built' })
    const [rebuilt] = await database!.query(snapshot)
    expect(rebuilt).toEqual(full)
  })

  test('策略指向尚未构建索引的数据版本 → 503（不回退结果表直查）', async () => {
    const ports = fixturePolicyPorts()
    const v2 = plantKnowledgePublicSearchRulesV2()
    const other = createPlantKnowledgeServer({
      ...ports,
      readPublicSearchSnapshot: async () => ({
        rules: {
          ...v2,
          visualAxisSources: { ...v2.visualAxisSources!, LEAF_SHAPE: 'visual-axis-all-v2' }
        },
        releaseVersion: 'plant-knowledge-public-search/v2.0.1'
      }),
      connectionSource: createMysql2ConnectionSource({
        host: '127.0.0.1',
        port: Number(docker(['port', container, '3306/tcp']).split(':').at(-1)),
        database: 'visual_fixture',
        user: 'root',
        password: ''
      }),
      writeAudit: () => undefined
    })
    await new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve))
    try {
      const response = await fetch(
        `http://127.0.0.1:${(other.address() as AddressInfo).port}/api/v2/plant-knowledge/catalog/visual-filter?leafShape=HEART`
      )
      expect(response.status).toBe(503)
    } finally {
      await new Promise<void>(resolve => other.close(() => resolve()))
    }
  })
})
