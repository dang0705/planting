import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1，只读真实迁移文件）。Expected：models/care/long-term-care-contract.md §10（主代理 2026-10-09 裁决 T1/T4，
 * 用户 2026-10-09 裁决 U1）：025 长期计算结果只追加、与临时结果同形、可空唯一 proposal 链接；026 品种绑定只追加；
 * 027 care_facts 拒绝 UPDATE；均按 v2 惯例（_openid、*_ms、COMMENT 以「青花植 v2」开头）。
 */
const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
const read = (file: string) => fs.readFileSync(path.join(schemaDirectory, file), 'utf8')
const strip = (text: string) => text.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('长期养护迁移 025–027', () => {
  it('manifest 依次登记 025/026/027', () => {
    const manifest = JSON.parse(read('manifest.json')) as { files: Array<{ order: number; owner: string; file: string }> }
    const tail = manifest.files.slice(-3)
    expect(tail.map(entry => entry.file)).toEqual(['025_care_capability_results.sql', '026_user_plant_catalog_bindings.sql', '027_care_fact_immutability.sql'])
    expect(tail.map(entry => entry.owner)).toEqual(['care', 'user-plant', 'care'])
  })

  it('025 care_capability_results：归属、只追加、同形清单与摘要、可空唯一建议链接', () => {
    const content = read('025_care_capability_results.sql')
    expect([...strip(content).matchAll(/CREATE TABLE `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['care_capability_results'])
    for (const column of [
      /`result_ref` VARCHAR\(64\) NOT NULL/u, /`user_internal_id` BIGINT UNSIGNED NOT NULL/u, /`user_plant_internal_id` BIGINT UNSIGNED NOT NULL/u,
      /`proposal_internal_id` BIGINT UNSIGNED NULL/u, /`capability_type` VARCHAR\(24\) NOT NULL/u,
      /`contract_version` VARCHAR\(48\) NOT NULL/u, /`details_schema_version` VARCHAR\(48\) NOT NULL/u, /`environment_contract_version` VARCHAR\(48\) NOT NULL/u,
      /`input_manifest_json` JSON NOT NULL/u, /`input_manifest_sha256` CHAR\(64\) NOT NULL/u,
      /`algorithm_release_manifest_json` JSON NOT NULL/u, /`algorithm_release_manifest_sha256` CHAR\(64\) NOT NULL/u,
      /`derivations_json` JSON NOT NULL/u, /`derivations_sha256` CHAR\(64\) NOT NULL/u, /`result_json` JSON NOT NULL/u, /`result_sha256` CHAR\(64\) NOT NULL/u,
      /`generated_at_ms` BIGINT UNSIGNED NOT NULL/u, /`valid_until_ms` BIGINT UNSIGNED NULL/u
    ]) { expect(content).toMatch(column) }
    expect(content).toMatch(/UNIQUE KEY `uq_care_capability_result_ref` \(`result_ref`\)/u)
    expect(content).toMatch(/UNIQUE KEY `uq_care_capability_result_proposal` \(`proposal_internal_id`\)/u)
    expect(content).toMatch(/FOREIGN KEY \(`user_internal_id`, `user_plant_internal_id`\) REFERENCES `user_plants` \(`user_internal_id`, `id`\)/u)
    expect(content).toMatch(/FOREIGN KEY \(`proposal_internal_id`\) REFERENCES `care_proposals` \(`id`\)/u)
    expect(content).toMatch(/CREATE TRIGGER `trg_care_capability_results_reject_update`\s+BEFORE UPDATE ON `care_capability_results`/u)
    expect(strip(content)).not.toMatch(/\bALTER\b|\bTIMESTAMP\b|\bINSERT\b/u)
    expect(content).toMatch(/COMMENT='青花植 v2/u)
  })

  it('026 user_plant_catalog_bindings：只追加、目录引用 512、归属复合外键', () => {
    const content = read('026_user_plant_catalog_bindings.sql')
    expect([...strip(content).matchAll(/CREATE TABLE `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['user_plant_catalog_bindings'])
    for (const column of [/`binding_ref` VARCHAR\(64\) NOT NULL/u, /`catalog_taxon_ref` VARCHAR\(512\) NOT NULL/u, /`bound_at_ms` BIGINT UNSIGNED NOT NULL/u]) {
      expect(content).toMatch(column)
    }
    expect(content).toMatch(/KEY `idx_catalog_binding_latest` \(`user_internal_id`, `user_plant_internal_id`, `bound_at_ms`, `id`\)/u)
    expect(content).toMatch(/FOREIGN KEY \(`user_internal_id`, `user_plant_internal_id`\) REFERENCES `user_plants` \(`user_internal_id`, `id`\)/u)
    expect(content).toMatch(/CREATE TRIGGER `trg_user_plant_catalog_bindings_reject_update`\s+BEFORE UPDATE ON `user_plant_catalog_bindings`/u)
    expect(strip(content)).not.toMatch(/\bALTER\b|\bTIMESTAMP\b|\bINSERT\b/u)
  })

  it('027 只为 care_facts 增加拒绝 UPDATE 的触发器，不拦截 DELETE、不改表结构', () => {
    const content = strip(read('027_care_fact_immutability.sql'))
    expect([...content.matchAll(/CREATE TRIGGER `([a-z_]+)`/gu)].map(match => match[1])).toEqual(['trg_care_facts_reject_update'])
    expect(content).toMatch(/BEFORE UPDATE ON `care_facts`/u)
    expect(content).not.toMatch(/\bBEFORE DELETE\b|\bCREATE TABLE\b|\bALTER\b|\bDROP\b/u)
  })
})
