#!/usr/bin/env node
/**
 * 向 CloudBase 测试库 `qinghuazhi_v2_test` 写入最小已发布植物夹具，仅用于 GET /api/v2/plant-knowledge/plants/{ref}
 * 云端验收。夹具只证明读取谓词，不冒充人工准入证据；所有引用带 `cbtest` 标记，便于识别与清理。
 * `tcb db execute` 单语句且默认库为生产库，因此每条语句的表名都显式限定到测试库。
 */
import { execFileSync } from 'node:child_process'

const envId = 'cloud1-2grufevs395a9d5e'
const db = '`qinghuazhi_v2_test`'
const identityRef = 'pid_cbtest_monstera_001'
const taxonRef = 'txr_cbtest_monstera_001'
const identityReleaseRef = 'rel_cbtest_identity_001'
const taxonomyReleaseRef = 'rel_cbtest_taxonomy_001'
const identityHash = '1'.repeat(64)
const taxonomyHash = '2'.repeat(64)
const itemHash = '3'.repeat(64)
const evidenceHash = '4'.repeat(64)
const nowMs = Date.now()

const statements = [
  `INSERT INTO ${db}.plant_taxa
     (_openid, public_taxon_ref, authority_source, authority_taxon_id, accepted_scientific_name,
      taxon_rank, nomenclatural_status, source_version, retrieved_at_ms, evidence_hash,
      review_status, created_at_ms, updated_at_ms)
   VALUES ('', '${taxonRef}', 'POWO', 'cbtest-fixture-001', 'Monstera deliciosa Liebm.', 'species',
           'accepted', 'cbtest-fixture-v1', ${nowMs}, '${evidenceHash}', 'ACTIVE', ${nowMs}, ${nowMs})`,
  `INSERT INTO ${db}.plant_identities
     (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh, identity_kind,
      review_status, active_release_internal_id, created_at_ms, updated_at_ms)
   SELECT '', '${identityRef}', t.id, '龟背竹', 'taxon', 'ACTIVE', NULL, ${nowMs}, ${nowMs}
   FROM ${db}.plant_taxa AS t WHERE t.public_taxon_ref = '${taxonRef}'`,
  `INSERT INTO ${db}.plant_knowledge_releases
     (_openid, release_ref, release_kind, schema_version, artifact_ref, artifact_hash,
      record_count, released_at_ms, created_at_ms, updated_at_ms)
   VALUES ('', '${taxonomyReleaseRef}', 'taxonomy', 'taxonomy/v1', 'cbtest://taxonomy', '${taxonomyHash}', 1, ${nowMs}, ${nowMs}, ${nowMs}),
          ('', '${identityReleaseRef}', 'identity', 'identity/v1', 'cbtest://identity', '${identityHash}', 1, ${nowMs}, ${nowMs}, ${nowMs})`,
  `INSERT INTO ${db}.plant_knowledge_release_items
     (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
      decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
   SELECT '', r.id, 'taxon', '${taxonRef}', '${evidenceHash}', 'review_taxon_cbtest', 'ACTIVE', '${itemHash}', ${nowMs}, ${nowMs}
   FROM ${db}.plant_knowledge_releases AS r WHERE r.release_ref = '${taxonomyReleaseRef}'`,
  `INSERT INTO ${db}.plant_knowledge_release_items
     (_openid, release_internal_id, subject_kind, subject_ref, evidence_manifest_sha256,
      decision_ref, admission_status, release_item_sha256, created_at_ms, updated_at_ms)
   SELECT '', r.id, 'identity', '${identityRef}', '${evidenceHash}', 'review_identity_cbtest', 'ACTIVE', '${itemHash}', ${nowMs}, ${nowMs}
   FROM ${db}.plant_knowledge_releases AS r WHERE r.release_ref = '${identityReleaseRef}'`,
  `INSERT INTO ${db}.active_plant_knowledge_releases
     (_openid, release_kind, release_internal_id, active_release_version, active_artifact_sha256,
      version, activated_at_ms, created_at_ms, updated_at_ms)
   SELECT '', r.release_kind, r.id, r.schema_version, r.artifact_hash, 1, ${nowMs}, ${nowMs}, ${nowMs}
   FROM ${db}.plant_knowledge_releases AS r
   WHERE r.release_ref IN ('${taxonomyReleaseRef}', '${identityReleaseRef}')`
]

for (const [index, sql] of statements.entries()) {
  if (!sql.startsWith('INSERT INTO `qinghuazhi_v2_test`.')) {
    throw new Error(`第 ${index + 1} 条未限定测试库`)
  }
  const output = execFileSync('tcb', ['db', 'execute', '-e', envId, '--json', '--sql', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const affected = /"rowsAffected":\s*(\d+)/u.exec(output)?.[1] ?? 'unknown'
  console.log(JSON.stringify({ statement: index + 1, rowsAffected: affected }))
}
