import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Connection } from 'mysql2/promise'

import type { VisualAxisSources } from '../../../src/configuration/business-policies/index.js'
import {
  buildVisualFilterIndex,
  type VisualFilterIndexBuildReport,
  type VisualFilterIndexConnection
} from '../../../src/plant-knowledge/visual-filter-index/build-visual-filter-index.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * 隔离 Docker MySQL 用的三轴筛选索引夹具：按顺序执行真实 031 迁移文件，并用真实回填模块构建索引。
 * 只连接测试自建容器，不连接任何 CloudBase 环境。
 */

/** 执行仓库中的 031 迁移（逐条语句，不开启 multipleStatements）。 */
export async function applyVisualFilterMigration(database: Connection): Promise<void> {
  const sql = readFileSync(
    join(findProjectRoot(), 'docs/backend-v2/schema/031_plant_visual_filter_index.sql'),
    'utf8'
  )
  const statements = sql
    .split(/;\s*\n/u)
    .map(statement =>
      statement
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter(statement => statement.length > 0)
  for (const statement of statements) {
    await database.query(statement)
  }
}

/** 把 mysql2 连接适配为回填模块的连接端口。 */
export function asIndexConnection(database: Connection): VisualFilterIndexConnection {
  return {
    query: async (sql, parameters) =>
      (await database.query(sql, parameters as unknown[]))[0] as never,
    beginTransaction: () => database.beginTransaction(),
    commit: () => database.commit(),
    rollback: () => database.rollback()
  }
}

/** 以真实回填模块构建（或续建）索引。 */
export function buildIndex(
  database: Connection,
  sources: VisualAxisSources,
  batchSize: number,
  nowMs = Date.parse('2026-10-10T00:00:00Z')
): Promise<VisualFilterIndexBuildReport> {
  return buildVisualFilterIndex(asIndexConnection(database), {
    sources,
    batchSize,
    apply: true,
    nowMs
  })
}
