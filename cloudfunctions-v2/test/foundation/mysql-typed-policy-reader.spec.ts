import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CARE_LONG_TERM_RULES_POLICY } from '../../src/configuration/business-policies/index.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../src/foundation/json/canonical-json-sha256.js'
import { createMysqlTypedPolicyReader } from '../../src/foundation/policy/mysql-typed-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_fake（替换 mysql2 连接为记录型替身，返回预设行）。
 * Expected 来源：configuration-and-providers.md §4「请求级配置快照」与 configuration-layers.md v2 §3：
 * 只读 active 指针对应的不可变发布；元数据、指针一致性、生效/过期/验证时间、正文 SHA 与 Schema 全部可信才返回；
 * 否则返回 null（调用方 503），不回退源码默认值。真实 MySQL 读回见 test/e2e/policy-release-cli.mysql.spec.ts。
 */
const root = findProjectRoot()
const release = JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/models/policy-releases/care.long_term_rules.v1.release.json'), 'utf8')) as { policy: Record<string, unknown> }
const nowMs = Date.parse('2026-10-11T00:00:00Z')
const sha = calculateCanonicalJsonSha256(release.policy as CanonicalJsonValue)
const validRow = () => ({
  release_ref: 'bpr_reader_fixture_01', domain_code: 'care', policy_code: 'long_term_rules', schema_version: 'care-long-term-rules/v1',
  release_version: 'care-long-term-rules/v1.0.0', content_sha256: sha, policy_json: JSON.stringify(release.policy), status: 'active',
  effective_at_ms: String(Date.parse('2026-10-10T00:00:00Z')), expires_at_ms: null, verified_at_ms: String(Date.parse('2026-10-10T00:00:00Z')),
  active_release_version: 'care-long-term-rules/v1.0.0', active_content_sha256: sha
})

/** 记录 SQL 的只读连接来源替身。 */
function sourceReturning(rows: readonly Record<string, unknown>[] | Error) {
  const calls: Array<{ sql: string; parameters: unknown }> = []
  const connection = {
    query: async (sql: string, parameters: unknown) => { calls.push({ sql, parameters }); if (rows instanceof Error) { throw rows } return rows },
    execute: async () => { throw new Error('读取器不得写入') },
    release: () => undefined
  }
  return { calls, source: { getConnection: async () => connection } as never }
}

describe('类型化策略读取器（请求内只读快照）', () => {
  it('可信 active 发布 → 冻结快照；只按 domain/policy 查询一次', async () => {
    const { calls, source } = sourceReturning([validRow()])
    const snapshot = await createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY).read(nowMs)
    expect(snapshot).toMatchObject({ releaseVersion: 'care-long-term-rules/v1.0.0', contentSha256: sha, schemaVersion: 'care-long-term-rules/v1',
      rules: { planExpiryGraceHours: 72, planPageSize: { default: 20, max: 50 } } })
    expect(Object.isFrozen(snapshot!.rules)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.parameters).toEqual(['care', 'long_term_rules'])
  })

  it.each([
    ['没有活动指针', () => []],
    ['正文 JSON 损坏', () => [{ ...validRow(), policy_json: '{bad' }]],
    ['正文摘要不符', () => [{ ...validRow(), content_sha256: 'a'.repeat(64), active_content_sha256: 'a'.repeat(64) }]],
    ['指针版本与发布不一致', () => [{ ...validRow(), active_release_version: 'care-long-term-rules/v0.9.0' }]],
    ['Schema 版本不被接受', () => [{ ...validRow(), schema_version: 'care-long-term-rules/v9' }]],
    ['状态不是 active', () => [{ ...validRow(), status: 'verified' }]],
    ['尚未生效', () => [{ ...validRow(), effective_at_ms: String(nowMs + 1) }]],
    ['已过期', () => [{ ...validRow(), expires_at_ms: String(nowMs) }]],
    ['正文越过代码硬边界', () => {
      const policy = { ...release.policy, planPageSize: { default: 20, max: 51 } }
      const digest = calculateCanonicalJsonSha256(policy as CanonicalJsonValue)
      return [{ ...validRow(), policy_json: JSON.stringify(policy), content_sha256: digest, active_content_sha256: digest }]
    }],
    ['多行（指针重复）', () => [validRow(), validRow()]],
  ])('%s → null（调用方 503）', async (_name, rows) => {
    const { source } = sourceReturning(rows())
    await expect(createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY).read(nowMs)).resolves.toBeNull()
  })

  it('数据库错误向上抛出，由 HTTP 边界泛化为 503', async () => {
    const { source } = sourceReturning(new Error('SQL 原文 secret'))
    await expect(createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY).read(nowMs)).rejects.toThrow()
  })
})
