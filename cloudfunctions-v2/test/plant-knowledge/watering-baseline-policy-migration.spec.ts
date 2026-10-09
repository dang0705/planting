import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1，只读真实文件，不连数据库）。
 * Expected 来源：
 * - 22 行种子：主代理 2026-10-09 对测试库 qinghuazhi_v2_test.watering_baseline_policy 的 information_schema/数据只读查询
 *   （scratchpad baseline-table-facts.md，按 id 顺序抄录于下），并与仓库内既有真实读回制品
 *   test/plant-knowledge/fixtures/tropicals-watering-baseline.json 交叉核对；不从种子文件反推。
 * - 024 结构：主代理裁决 A3（v2 惯例：_openid、*_ms BIGINT、COMMENT 以「青花植 v2」开头、utf8mb4_unicode_ci；
 *   业务列与测试库同名同类型；索引名与列照抄）与 A2（种子独立文件、只 INSERT 本表）。
 */
const root = findProjectRoot()
const schemaDirectory = path.join(root, 'docs/backend-v2/schema')
const migrationFile = '024_watering_baseline_policy.sql'
const seedPath = path.join(schemaDirectory, 'seeds/watering_baseline_policy.v1.sql')

/** 测试库 id 顺序的 22 行（tier, trigger, min, max），全部 policy_version='v1'、is_active=1。 */
const expectedRows: ReadonlyArray<readonly [string, string, number, number]> = [
  ['constant_moisture', 'KEEP_WET', 1, 3], ['constant_moisture', 'KEEP_MOIST', 2, 4],
  ['regular', 'KEEP_WET', 3, 5], ['regular', 'KEEP_MOIST', 4, 7], ['regular', 'SURFACE_DRY', 5, 8], ['regular', 'DRY_WET', 7, 14],
  ['occasional', 'DRY_WET', 10, 16], ['occasional', 'FULL_DRY', 14, 21], ['occasional', 'VERY_DRY', 18, 24], ['occasional', 'DROUGHT_SIGNAL', 12, 18],
  ['drought_tolerant', 'DROUGHT_SIGNAL', 14, 21], ['drought_tolerant', 'FULL_DRY', 14, 21], ['drought_tolerant', 'VERY_DRY', 21, 30],
  ['constant_moisture', 'TIER_DEFAULT', 1, 4], ['constant_moisture', 'SURFACE_DRY', 2, 5], ['constant_moisture', 'DRY_WET', 3, 7],
  ['regular', 'TIER_DEFAULT', 5, 12], ['regular', 'FULL_DRY', 10, 16], ['regular', 'VERY_DRY', 14, 21],
  ['occasional', 'TIER_DEFAULT', 10, 18], ['occasional', 'SURFACE_DRY', 8, 12], ['drought_tolerant', 'TIER_DEFAULT', 14, 24]
]

/** 去掉 SQL 行注释，避免注释中的关键字干扰结构断言。 */
function stripComments(text: string): string {
  return text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
}

/** 解析种子文件中的 INSERT：返回目标表与按列名映射的行。 */
function parseSeed(text: string): { tables: string[]; rows: Array<Record<string, string>> } {
  const body = stripComments(text)
  const tables: string[] = []
  const rows: Array<Record<string, string>> = []
  for (const statement of body.split(';').map(part => part.trim()).filter(Boolean)) {
    const match = /^INSERT INTO `([a-z_]+)` \(([^)]*)\) VALUES\s*([\s\S]+)$/u.exec(statement)
    if (!match) { throw new Error(`种子只允许 INSERT 语句：${statement.slice(0, 40)}`) }
    tables.push(match[1]!)
    const columns = match[2]!.split(',').map(column => column.trim().replaceAll('`', ''))
    for (const tuple of match[3]!.matchAll(/\(([^()]*)\)/gu)) {
      const values = tuple[1]!.split(',').map(value => value.trim().replace(/^'(.*)'$/u, '$1'))
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]!])))
    }
  }
  return { tables, rows }
}

describe('024 watering_baseline_policy 迁移与 v1 种子', () => {
  it('Expected 自洽：抄录的 22 行与仓库真实读回制品为同一集合', () => {
    const artifact = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions-v2/test/plant-knowledge/fixtures/tropicals-watering-baseline.json'), 'utf8')) as {
      policies: Array<{ policy_version: string; water_frequency_tier: string; trigger_state: string; min_days: number; max_days: number; is_active: number }>
    }
    const key = (row: readonly [string, string, number, number]) => row.join('|')
    expect(artifact.policies.every(row => row.policy_version === 'v1' && row.is_active === 1)).toBe(true)
    expect(artifact.policies.map(row => key([row.water_frequency_tier, row.trigger_state, row.min_days, row.max_days])).sort())
      .toEqual(expectedRows.map(key).sort())
  })

  it('种子：只 INSERT watering_baseline_policy，22 行按测试库 id 顺序逐字一致', () => {
    const { tables, rows } = parseSeed(fs.readFileSync(seedPath, 'utf8'))
    expect(new Set(tables)).toEqual(new Set(['watering_baseline_policy']))
    expect(rows.map(row => [row.water_frequency_tier, row.trigger_state, Number(row.min_days), Number(row.max_days)])).toEqual(expectedRows)
    expect(rows.every(row => row.policy_version === 'v1' && row.is_active === '1')).toBe(true)
    expect(rows.every(row => /^\d+$/u.test(row.created_at_ms ?? '') && row.created_at_ms === row.updated_at_ms)).toBe(true)
    expect(rows.some(row => 'id' in row)).toBe(false)
  })

  it('024 只创建本表，不含数据语句、ALTER、TIMESTAMP', () => {
    const content = stripComments(fs.readFileSync(path.join(schemaDirectory, migrationFile), 'utf8'))
    expect([...content.matchAll(/CREATE TABLE `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['watering_baseline_policy'])
    expect(content).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TIMESTAMP|DATETIME|IF NOT EXISTS)\b/iu)
  })

  it('024 业务列与测试库同名同类型，另加 v2 惯例列、原名索引与 CHECK', () => {
    const content = fs.readFileSync(path.join(schemaDirectory, migrationFile), 'utf8')
    for (const column of [
      /`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '[^']+'/u,
      /`_openid` VARCHAR\(64\) NOT NULL DEFAULT '' COMMENT 'CloudBase 技术兼容字段，服务端表固定为空，不作为用户归属'/u,
      /`policy_version` VARCHAR\(32\) NOT NULL COMMENT '[^']+'/u,
      /`water_frequency_tier` VARCHAR\(32\) NOT NULL COMMENT '[^']+'/u,
      /`trigger_state` VARCHAR\(32\) NOT NULL COMMENT '[^']+'/u,
      /`min_days` SMALLINT UNSIGNED NOT NULL COMMENT '[^']+'/u,
      /`max_days` SMALLINT UNSIGNED NOT NULL COMMENT '[^']+'/u,
      /`is_active` TINYINT\(1\) NOT NULL DEFAULT 1 COMMENT '[^']+'/u,
      /`created_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '[^']+'/u,
      /`updated_at_ms` BIGINT UNSIGNED NOT NULL COMMENT '[^']+'/u
    ]) {
      expect(content).toMatch(column)
    }
    expect(content).toMatch(/PRIMARY KEY \(`id`\)/u)
    expect(content).toMatch(/UNIQUE KEY `uk_policy_tier_trigger` \(`policy_version`, `water_frequency_tier`, `trigger_state`\)/u)
    expect(content).toMatch(/KEY `idx_active_lookup` \(`is_active`, `water_frequency_tier`, `trigger_state`\)/u)
    expect(content).toMatch(/CHECK \(`min_days` <= `max_days`\)/u)
    expect(content).toMatch(/CHECK \(`is_active` IN \(0, 1\)\)/u)
    expect(content).toMatch(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='青花植 v2[^']*'/u)
    expect(content).toMatch(/qinghuazhi_v2_test/u)
  })

  it('manifest 按顺序登记 024（plant-knowledge）', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ order: number; owner: string; file: string }> }
    const entry = manifest.files.find(item => item.file === migrationFile)
    expect(entry).toMatchObject({ owner: 'plant-knowledge', order: manifest.files.length })
  })
})
