import { spawnSync } from 'node:child_process'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import {
  asVisualFilterIndexConnection,
  buildVisualFilterIndex
} from '../../src/plant-knowledge/visual-filter-index/build-visual-filter-index.js'
import { createVisualFilterIndexBackfillHandler } from '../../src/plant-knowledge/visual-filter-index/visual-filter-index-backfill-handler.js'
import { plantKnowledgePublicSearchRulesV2 } from '../support/business-policy-fixtures.js'
import {
  applyVisualFilterMigration,
  asIndexConnection,
  createVisualSourceStubTables
} from './support/visual-filter-index-fixture.js'

/**
 * Expected：一次性回填事件函数合同（主代理 2026-10-10 转达用户授权）——按时长预算分批、到点保存断点退出、可重复调用续跑，
 * 续跑结果与一次跑完逐行一致；apply=false 不写库；就绪后再调为空操作。
 * 层次：L3 / unit_real_data。真实 031 迁移 + 真实回填模块 + 真实事件入口适配 → mysql2 → 隔离 Docker MySQL 8.0.43；
 * 时钟为测试控制（以批为单位模拟预算到期），不证明 CloudBase 运行时上下文字段与真实超时。
 */
const container = `qhz-visual-backfill-${process.pid}`
let database: Connection | undefined
let port = 0

/** 与事件函数入口相同的连接通道：共享 mysql2 连接来源（预处理语句）+ 每次调用独占一条连接。 */
async function viaFunctionChannel<T>(
  work: (connection: ReturnType<typeof asVisualFilterIndexConnection>) => Promise<T>
): Promise<T> {
  const source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    database: 'visual_backfill',
    user: 'root',
    password: ''
  })
  const connection = await source.getConnection()
  try {
    return await work(asVisualFilterIndexConnection(connection))
  } finally {
    connection.release()
  }
}
const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!
const plantTotal = 300
const batchSize = 50
const entriesSnapshot =
  'SELECT taxon_id, encyclopedia_id, leaf_shape_mask, growth_form_mask, leaf_surface_mask FROM plant_visual_filter_entries ORDER BY taxon_id'
const tableCounts =
  'SELECT (SELECT COUNT(*) FROM plant_visual_filter_sets) AS sets, (SELECT COUNT(*) FROM plant_visual_filter_value_bits) AS bits, (SELECT COUNT(*) FROM plant_visual_filter_entries) AS entries'

function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 清空三张索引表（测试内重置；不是产品行为）。 */
async function resetIndex(): Promise<void> {
  await database!.query('DELETE FROM plant_visual_filter_entries')
  await database!.query('DELETE FROM plant_visual_filter_value_bits')
  await database!.query('DELETE FROM plant_visual_filter_sets')
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
  port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  for (let attempt = 0; attempt < 150; attempt++) {
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
    'CREATE DATABASE visual_backfill CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await database.query('USE visual_backfill')
  await createVisualSourceStubTables(database)
  const catalog: Record<string, string[]> = {
    LEAF_SHAPE: ['HEART', 'ELLIPTIC', 'LOBED'],
    GROWTH_FORM: ['UPRIGHT', 'VINING'],
    LEAF_SURFACE: ['GLOSSY', 'LEATHERY']
  }
  for (const [axis, codes] of Object.entries(catalog)) {
    for (const [index, code] of codes.entries()) {
      await database.execute(
        `INSERT INTO plant_visual_axis_values (axis_code, axis_name_zh, axis_mode, value_code, value_name_zh, value_definition_zh, sort_order, catalog_version, is_active)
        VALUES (?, ?, 'MULTI', ?, ?, ?, ?, 'v1', 1)`,
        [axis, axis, code, code, code, (index + 1) * 10]
      )
    }
  }
  for (let n = 1; n <= plantTotal; n++) {
    const taxon = `https://tropicals.cn/species/b${String(n).padStart(4, '0')}`
    await database.execute(
      'INSERT INTO tropicals_species_encyclopedia_ref (id, taxon_id, name) VALUES (?, ?, ?)',
      [n, taxon, `植物${n}`]
    )
    const rows: Array<[string, unknown]> = []
    if (n % 3 !== 0) {
      rows.push(['LEAF_SHAPE', [catalog.LEAF_SHAPE![n % 3]!, ...(n % 2 === 0 ? ['LOBED'] : [])]])
    }
    if (n % 4 !== 0) {
      rows.push(['GROWTH_FORM', [catalog.GROWTH_FORM![n % 2]!]])
    }
    if (n % 5 !== 0) {
      rows.push(['LEAF_SURFACE', [catalog.LEAF_SURFACE![n % 2]!]])
    }
    for (const [axis, values] of rows) {
      await database.execute(
        `INSERT INTO plant_visual_axis_results (encyclopedia_id, taxon_id, axis_code, values_json, status, confidence, source_field, source_hash, extraction_version)
        VALUES (?, ?, ?, ?, 'EXTRACTED', 'HIGH', 'bio_morphology', ?, 'visual-axis-all-v1')`,
        [n, taxon, axis, JSON.stringify(values), 'a'.repeat(64)]
      )
    }
  }
  await applyVisualFilterMigration(database)
}, 120_000)

afterAll(async () => {
  await database?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})

describe('一次性回填事件函数：时长预算、断点与续跑（真实 MySQL）', () => {
  test('apply=false：只读演练，三张索引表保持空', async () => {
    await resetIndex()
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => viaFunctionChannel(connection => buildVisualFilterIndex(connection, input)),
      now: () => Date.now()
    })
    const result = await handler(
      { release: 'plant-knowledge-public-search/v2.0.0', batchSize, apply: false },
      { time_limit_in_ms: 900_000 }
    )
    expect(result).toMatchObject({
      status: 'dry_run',
      processedBatches: Math.ceil((plantTotal + 1) / batchSize),
      nextEncyclopediaId: 0
    })
    const [counts] = await database!.query(tableCounts)
    expect(counts).toEqual([{ sets: 0, bits: 0, entries: 0 }])
  })

  test('预算每次只够一批：逐次续跑直到就绪，结果与一次跑完逐行一致；就绪后再调为空操作', async () => {
    await resetIndex()
    const full = await buildVisualFilterIndex(asIndexConnection(database!), {
      sources,
      batchSize,
      apply: true,
      nowMs: 1
    })
    expect(full.status).toBe('built')
    const [expectedRows] = await database!.query(entriesSnapshot)
    await resetIndex()

    // 每次调用把时钟推进 1 毫秒，maxRunMs=1：首批之后预算即到期，保存断点退出。
    let clock = 1_000
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => viaFunctionChannel(connection => buildVisualFilterIndex(connection, input)),
      now: () => clock++
    })
    const event = {
      release: 'plant-knowledge-public-search/v2.0.0',
      batchSize,
      apply: true,
      maxRunMs: 1
    }
    const results: Array<Record<string, unknown>> = []
    for (let call = 0; call < 20; call++) {
      const result = (await handler(event, { time_limit_in_ms: 900_000 })) as Record<
        string,
        unknown
      >
      results.push(result)
      if (result.status !== 'paused') {
        break
      }
      const [setRows] = await database!.query(
        'SELECT status, next_encyclopedia_id FROM plant_visual_filter_sets'
      )
      expect(setRows).toEqual([
        { status: 'building', next_encyclopedia_id: result.nextEncyclopediaId }
      ])
    }
    const batches = Math.ceil((plantTotal + 1) / batchSize)
    expect(results.map(result => result.status)).toEqual([
      ...Array(batches - 1).fill('paused'),
      'built'
    ])
    expect(results.map(result => result.nextEncyclopediaId)).toEqual(
      Array.from({ length: batches }, (_unused, index) => (index + 1) * batchSize)
    )
    expect(results.every(result => result.processedBatches === 1)).toBe(true)
    expect(results.at(-1)?.plantCount).toBe(full.plantCount)
    const [rebuiltRows] = await database!.query(entriesSnapshot)
    expect(rebuiltRows).toEqual(expectedRows)

    const again = await handler(event, { time_limit_in_ms: 900_000 })
    expect(again).toMatchObject({ status: 'already_ready', processedBatches: 0 })
    const [afterRows] = await database!.query(entriesSnapshot)
    expect(afterRows).toEqual(expectedRows)
  })
})
