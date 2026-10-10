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
    execute: async (sql, parameters) => {
      const [header] = await database.query(sql, parameters as unknown[])
      return { affectedRows: Number((header as { affectedRows?: number }).affectedRows ?? 0) }
    },
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

/** 建立回填读取的外部表读取桩（列类型与排序规则照抄测试库 information_schema；不是正式 DDL）。 */
export async function createVisualSourceStubTables(database: Connection): Promise<void> {
  for (const sql of [
    `CREATE TABLE tropicals_species_encyclopedia_ref (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci, name VARCHAR(512) NOT NULL, scientific_name VARCHAR(512) NULL,
      cover_image_ref VARCHAR(1024) NULL, cover_source_json JSON NULL, UNIQUE KEY uk_tse_taxon_id (taxon_id))`,
    `CREATE TABLE plant_search_documents (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, taxon_id VARCHAR(512) NOT NULL COLLATE utf8mb4_unicode_ci,
      is_searchable TINYINT(1) NOT NULL, UNIQUE KEY uk_search_document_taxon (taxon_id))`,
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
}
