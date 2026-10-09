import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4 按 schema manifest 全量建库（含 025–027）。
 * Expected：long-term-care-contract.md §10——长期结果与品种绑定只追加（UPDATE 被拒）；care_facts 拒绝 UPDATE、允许 DELETE；
 * 归属复合外键生效。只验证结构与触发器，不覆盖应用用例。
 */
const container = `qhz-long-term-care-schema-${process.pid}`
const database = 'qhz_long_term_care_schema'
function docker(args: readonly string[], input?: string) {
  return spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
}
function sql(text: string) {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', database], text)
}
const ok = (text: string) => { const result = sql(text); if (result.status !== 0) { throw new Error(result.stderr) } return result.stdout.trim() }
const rejected = (text: string) => { const result = sql(text); return result.status !== 0 ? result.stderr : '' }

beforeAll(async () => {
  const started = docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  if (started.status !== 0) { throw new Error(started.stderr) }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = docker(['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'])
    if (probe.status === 0 && probe.stdout.trim() === '1') { break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const create = docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot'], `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  if (create.status !== 0) { throw new Error(create.stderr) }
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
  for (const entry of manifest.files) { ok(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
  ok(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES (1, 'usr_ltcschema_owner1', 'active', 1, 1000, 1000), (2, 'usr_ltcschema_other1', 'active', 1, 1000, 1000);
    INSERT INTO user_plants (id, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, version, created_at_ms, updated_at_ms) VALUES (1, 'upl_ltcschema_plant01', 1, 'active', 'unidentified', 1, 1000, 1000);`)
}, 180_000)
afterAll(() => { docker(['rm', '-f', container]) })

describe('长期养护迁移 025–027（真实 MySQL）', () => {
  test('care_capability_results 可追加、UPDATE 被拒、他人植物外键被拒', () => {
    const insert = (ref: string, user: number) => `INSERT INTO care_capability_results (result_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, environment_contract_version,
      input_manifest_json, input_manifest_sha256, algorithm_release_manifest_json, algorithm_release_manifest_sha256, derivations_json, derivations_sha256, result_json, result_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
      VALUES ('${ref}', ${user}, 1, 'watering', 'care-capability-result/v1', 'watering-assessment/v1', 'care-environment-foundation/v2', '{}', '${'1'.repeat(64)}', '{}', '${'2'.repeat(64)}', '{}', '${'3'.repeat(64)}', '{}', '${'4'.repeat(64)}', 2000, 3000, 2000, 2000);`
    ok(insert('cres_ltcschema_000001', 1))
    expect(rejected("UPDATE care_capability_results SET valid_until_ms=4000 WHERE result_ref='cres_ltcschema_000001';")).toContain('长期养护结果不可修改')
    expect(rejected(insert('cres_ltcschema_000002', 2))).toMatch(/foreign key/iu)
  })
  test('user_plant_catalog_bindings 可追加、UPDATE 被拒', () => {
    ok("INSERT INTO user_plant_catalog_bindings (binding_ref, user_internal_id, user_plant_internal_id, catalog_taxon_ref, bound_at_ms, created_at_ms, updated_at_ms) VALUES ('cbd_ltcschema_000001', 1, 1, 'https://tropicals.cn/species/epipremnum-aureum', 2000, 2000, 2000);")
    expect(rejected("UPDATE user_plant_catalog_bindings SET catalog_taxon_ref='x' WHERE binding_ref='cbd_ltcschema_000001';")).toContain('品种绑定不可修改')
  })
  test('care_facts UPDATE 被拒、DELETE 允许', () => {
    ok(`INSERT INTO care_facts (fact_ref, user_internal_id, user_plant_internal_id, fact_type, occurred_at_ms, fact_payload_json, source_command_ref, created_at_ms, updated_at_ms) VALUES ('cft_ltcschema_000001', 1, 1, 'watering', 1500, '{}', 'cmd_ltcschema_000001', 2000, 2000);`)
    expect(rejected("UPDATE care_facts SET occurred_at_ms=1600 WHERE fact_ref='cft_ltcschema_000001';")).toContain('养护事实不可修改')
    ok("DELETE FROM care_facts WHERE fact_ref='cft_ltcschema_000001';")
    expect(ok('SELECT COUNT(*) FROM care_facts;')).toBe('0')
  })
})
