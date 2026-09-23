import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const NOT_FOUND = -1

/** 从单个 CREATE TABLE 语句提取定义，防止一个表的字段误满足另一个表的约束。 */
function tableBody(sql: string, table: string): string {
  const marker = `CREATE TABLE \`${table}\` (`
  const start = sql.indexOf(marker)
  assert.notEqual(start, NOT_FOUND, `缺少诊断知识表：${table}`)
  const end = sql.indexOf(') ENGINE=InnoDB', start)
  assert.notEqual(end, NOT_FOUND, `${table} 缺少 InnoDB 表定义结束标记`)
  return sql.slice(start + marker.length, end)
}

/**
 * Expected 来源：Master Plan P1 诊断知识发布门，以及
 * `docs/backend-v2/contracts/diagnosis-knowledge-persistence.md` 的逻辑表与审核摘要硬锁。
 * 测试层次：unit_real_data；读取真实 DDL 文件与 manifest，不连接 MySQL/CMS。
 * 本文件是刻意保持 RED 的结构探针，不能作为真实事务或发布验收。
 */
test('诊断知识 DDL 独立保存来源、审核摘要和原子发布指针', () => {
  const schemaRoot = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'manifest.json'), 'utf8')) as {
    files: Array<{ owner: string; file: string }>
  }
  const diagnosisMigration = manifest.files.find(entry =>
    entry.owner === 'diagnosis' && /^\d{3}_diagnosis_knowledge\.sql$/u.test(entry.file)
  )

  assert.ok(diagnosisMigration, '独立的 diagnosis 知识迁移尚未登记；不得复用一次结果 JSON 或通用发布槽位')
  const sql = fs.readFileSync(path.join(schemaRoot, diagnosisMigration.file), 'utf8')

  for (const table of [
    'diagnosis_sources',
    'diagnosis_source_claim_revisions',
    'diagnosis_knowledge_candidates',
    'diagnosis_cause_entries',
    'diagnosis_outcome_entries',
    'diagnosis_action_entries',
    'diagnosis_outcome_action_mappings',
    'diagnosis_claim_links',
    'diagnosis_review_attestations',
    'diagnosis_knowledge_releases',
    'active_diagnosis_knowledge_releases',
    'diagnosis_release_activation_audit'
  ]) {
    assert.ok(sql.includes(`CREATE TABLE \`${table}\``), `缺少诊断知识专属表：${table}`)
  }

  const candidate = tableBody(sql, 'diagnosis_knowledge_candidates')
  const attestation = tableBody(sql, 'diagnosis_review_attestations')
  const active = tableBody(sql, 'active_diagnosis_knowledge_releases')
  const release = tableBody(sql, 'diagnosis_knowledge_releases')
  assert.match(candidate, /`content_sha256` CHAR\(64\) NOT NULL/u, '候选修订必须保存完整被审内容摘要')
  assert.match(attestation, /`content_sha256` CHAR\(64\) NOT NULL/u, '审核凭据必须绑定准确候选摘要')
  assert.match(attestation, /FOREIGN KEY .*REFERENCES `diagnosis_knowledge_candidates`/u)
  assert.match(release, /`package_sha256` CHAR\(64\) NOT NULL/u, '不可变发布包必须保存内容摘要')
  assert.match(active, /`version` INT UNSIGNED NOT NULL/u, '活动指针必须具有并发切换版本')
  assert.match(active, /FOREIGN KEY .*REFERENCES `diagnosis_knowledge_releases`/u)
})
