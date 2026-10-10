import { describe, expect, it } from 'vitest'

import {
  buildVisualFilterIndex,
  type VisualFilterIndexConnection
} from '../../src/plant-knowledge/visual-filter-index/build-visual-filter-index.js'
import { createVisualFilterIndexBackfillHandler } from '../../src/plant-knowledge/visual-filter-index/visual-filter-index-backfill-handler.js'
import { plantKnowledgePublicSearchRulesV2 } from '../support/business-policy-fixtures.js'

/**
 * Expected：主代理 2026-10-10 测试环境回填失败复盘——失败结果与日志「至少记录 MySQL 错误码（code / errno），不含数据内容」，
 * 并标明失败阶段；同一索引批次不得被两个调用同时回填（并发会互相删写、回退断点）。
 * 层次：L1 / unit_fake（只替换数据库连接为脚本化假连接）。真实并发见 test/e2e/visual-filter-index-backfill.mysql.spec.ts。
 */
const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!
const catalogRows = [
  ['LEAF_SHAPE', '叶型', 'HEART'],
  ['GROWTH_FORM', '株型', 'VINING'],
  ['LEAF_SURFACE', '叶面质感', 'GLOSSY']
].map(([axis_code, axis_name_zh, value_code], index) => ({
  axis_code,
  axis_name_zh,
  value_code,
  value_name_zh: value_code,
  value_definition_zh: value_code,
  sort_order: index + 1
}))

/** MySQL 驱动风格的错误：message 含数据（主键值），code / errno / sqlState 不含。 */
function mysqlError(code: string, errno: number, sqlState: string): Error {
  return Object.assign(
    new Error(
      `Duplicate entry 'https://tropicals.cn/species/secret-taxon' for key 'uk_visual_filter_entry_taxon'`
    ),
    { code, errno, sqlState }
  )
}

type Script = { failOn?: RegExp; error?: Error; lockAcquired?: number; checkpointAffected?: number }

function fakeConnection(script: Script = {}): {
  connection: VisualFilterIndexConnection
  statements: string[]
} {
  const statements: string[] = []
  const maybeFail = (sql: string) => {
    statements.push(sql)
    if (script.failOn?.test(sql)) {
      throw script.error ?? new Error('boom')
    }
  }
  const connection: VisualFilterIndexConnection = {
    query: async sql => {
      maybeFail(sql)
      if (sql.includes('FROM plant_visual_axis_values')) {
        return catalogRows
      }
      if (sql.includes('GET_LOCK')) {
        return [{ acquired: script.lockAcquired ?? 1 }]
      }
      if (sql.includes('RELEASE_LOCK')) {
        return [{ released: 1 }]
      }
      if (sql.includes('FROM plant_visual_filter_sets')) {
        return [{ id: 1, status: 'building', next_encyclopedia_id: 0 }]
      }
      if (sql.includes('FROM plant_visual_filter_value_bits')) {
        return []
      }
      if (sql.includes('MAX(id)')) {
        return [{ max_id: 3 }]
      }
      if (sql.includes('FROM tropicals_species_encyclopedia_ref')) {
        return [{ id: 1, taxon_id: 'https://tropicals.cn/species/a' }]
      }
      if (sql.includes('FROM plant_visual_axis_results')) {
        return [{ encyclopedia_id: 1, axis_code: 'LEAF_SHAPE', values_json: ['HEART'] }]
      }
      if (sql.includes('COUNT(*)')) {
        return [{ plant_count: 1 }]
      }
      return []
    },
    execute: async sql => {
      maybeFail(sql)
      if (sql.includes('SET next_encyclopedia_id')) {
        return { affectedRows: script.checkpointAffected ?? 1 }
      }
      return { affectedRows: 1 }
    },
    beginTransaction: async () => {
      statements.push('BEGIN')
    },
    commit: async () => {
      statements.push('COMMIT')
    },
    rollback: async () => {
      statements.push('ROLLBACK')
    }
  }
  return { connection, statements }
}

const event = {
  release: 'plant-knowledge-public-search/v2.0.0',
  batchSize: 5000,
  apply: true,
  maxRunMs: 600_000
}

describe('回填失败可定位、并发互斥', () => {
  it('写批次失败：返回失败阶段与 MySQL 错误码，不含错误原文与数据', async () => {
    const { connection, statements } = fakeConnection({
      failOn: /^\s*INSERT INTO plant_visual_filter_entries/u,
      error: mysqlError('ER_DUP_ENTRY', 1062, '23000')
    })
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => buildVisualFilterIndex(connection, input),
      now: () => 1_000
    })
    const result = await handler(event, { time_limit_in_ms: 900_000 })
    expect(result).toEqual({
      status: 'failed',
      reason: 'INTERNAL_ERROR',
      stage: 'write_batch',
      errorCode: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000'
    })
    expect(JSON.stringify(result)).not.toContain('secret-taxon')
    expect(statements).toContain('ROLLBACK')
  })

  it('非 MySQL 错误：errorCode / errno / sqlState 为 null，仍标明阶段', async () => {
    const { connection } = fakeConnection({
      failOn: /FROM plant_visual_axis_results/u,
      error: new Error('socket hang up with data')
    })
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => buildVisualFilterIndex(connection, input),
      now: () => 1_000
    })
    await expect(handler(event, { time_limit_in_ms: 900_000 })).resolves.toEqual({
      status: 'failed',
      reason: 'INTERNAL_ERROR',
      stage: 'compute_batch',
      errorCode: null,
      errno: null,
      sqlState: null
    })
  })

  it('同一索引批次已有调用在跑（拿不到命名锁）→ busy，不写任何数据', async () => {
    const { connection, statements } = fakeConnection({ lockAcquired: 0 })
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => buildVisualFilterIndex(connection, input),
      now: () => 1_000
    })
    await expect(handler(event, { time_limit_in_ms: 900_000 })).resolves.toMatchObject({
      status: 'busy',
      processedBatches: 0
    })
    expect(statements.some(sql => /^\s*(INSERT|DELETE|UPDATE)/u.test(sql))).toBe(false)
  })

  it('断点被别的调用改动（条件推进影响 0 行）→ 回滚本批并以 checkpoint_conflict 失败', async () => {
    const { connection, statements } = fakeConnection({ checkpointAffected: 0 })
    const handler = createVisualFilterIndexBackfillHandler({
      build: input => buildVisualFilterIndex(connection, input),
      now: () => 1_000
    })
    await expect(handler(event, { time_limit_in_ms: 900_000 })).resolves.toMatchObject({
      status: 'failed',
      stage: 'checkpoint_conflict'
    })
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })

  it('演练（apply=false）不取锁、不写库', async () => {
    const { connection, statements } = fakeConnection()
    await buildVisualFilterIndex(connection, { sources, batchSize: 5000, apply: false, nowMs: 1 })
    expect(statements.some(sql => /GET_LOCK|^\s*(INSERT|DELETE|UPDATE)/u.test(sql))).toBe(false)
  })
})
