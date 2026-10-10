import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createMysqlMvpWateringPolicyReader } from '../../src/care/repository/mysql-mvp-watering-policy-reader.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_fake（L3，替换 MySQL 连接）。Expected：mvp-watering-policy-contract.md「所有数值只来自不可变发布正文
 * （business_policy_releases 的 care/mvp_watering）…没有活动发布时整体返回 temporarily_unavailable」；
 * 正文为已批准制品 models/care/mvp-watering-policy-release.v1.json，摘要按既有规范 JSON 规则。矩阵 P1。
 */
const body = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v1.json'), 'utf8')) as CanonicalJsonObject
const sha = calculateCanonicalJsonSha256(body)
const row = {
  release_ref: 'bpr_care_mvp_watering01', domain_code: 'care', policy_code: 'mvp_watering', schema_version: 'care-watering-mvp/v1',
  release_version: 'care-watering-mvp/v1.0.0', content_sha256: sha, policy_json: body, status: 'active',
  effective_at_ms: String(Date.UTC(2026, 9, 1)), expires_at_ms: null, verified_at_ms: String(Date.UTC(2026, 9, 1)),
  active_release_version: 'care-watering-mvp/v1.0.0', active_content_sha256: sha
}
const capturedAt = '2026-10-09T04:00:00.000Z'

function fixture(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue(rows)
  const release = vi.fn()
  const destroy = vi.fn()
  const reader = createMysqlMvpWateringPolicyReader({ getConnection: async () => ({ query, release, destroy }) } as never)
  return { reader, query, release, destroy }
}

describe('MySQL MVP 浇水策略读取｜unit_fake', () => {
  it('P1 活动指针连发布 → available + releaseRef + 快照', async () => {
    const f = fixture([row])
    const result = await f.reader.read(capturedAt)
    expect(result.status).toBe('available')
    if (result.status !== 'available') { return }
    expect(result.releaseRef).toBe('bpr_care_mvp_watering01')
    expect(result.snapshot).toMatchObject({ releaseVersion: 'care-watering-mvp/v1.0.0', contentSha256: sha, scopeCode: 'care_mvp_watering', confidence: 'low' })
    expect(f.query.mock.calls[0]?.[1]).toEqual(['care', 'mvp_watering'])
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('P1 正文为 JSON 文本也可解析', async () => {
    expect((await fixture([{ ...row, policy_json: JSON.stringify(body) }]).reader.read(capturedAt)).status).toBe('available')
  })
  it('P1 无活动指针 → unavailable', async () => {
    expect(await fixture([]).reader.read(capturedAt)).toEqual({ status: 'unavailable' })
  })
  it.each([
    { ...row, domain_code: 'identity' }, { ...row, policy_code: 'mvp_glass' }, { ...row, schema_version: 'care-watering-mvp/v2' },
    { ...row, active_release_version: 'other' }, { ...row, active_content_sha256: '0'.repeat(64) }, { ...row, verified_at_ms: null },
    { ...row, release_ref: 'not-a-ref' }, { ...row, policy_json: '{broken' }, { ...row, policy_json: { ...body, referencePpfd: 51 } },
    { ...row, policy_json: { ...body, releaseStatus: 'active' } }, { ...row, policy_json: { ...body, effectiveAt: '2020-01-01T00:00:00Z' } }
  ])('P1 不可信发布或指针 → invalid（%#）', async invalid => {
    expect(await fixture([invalid]).reader.read(capturedAt)).toEqual({ status: 'invalid' })
  })
  it('P1 多行 → invalid；退役 → unavailable；未生效 → not_effective', async () => {
    expect(await fixture([row, row]).reader.read(capturedAt)).toEqual({ status: 'invalid' })
    expect(await fixture([{ ...row, status: 'retired' }]).reader.read(capturedAt)).toEqual({ status: 'unavailable' })
    expect(await fixture([{ ...row, effective_at_ms: String(Date.UTC(2026, 9, 10)) }]).reader.read(capturedAt)).toEqual({ status: 'not_effective' })
  })
  it('数据库错误向上传播且连接被销毁', async () => {
    const f = fixture([])
    f.query.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(f.reader.read(capturedAt)).rejects.toThrow('database unavailable')
    expect(f.destroy).toHaveBeenCalledOnce()
  })
})

describe('MySQL MVP 浇水策略读取 v2｜unit_fake', () => {
  // Expected：用户 2026-10-09 裁决 U6——读取器接受 v1/v2；Schema 版本必须与正文合同版本一致。
  const v2Body = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v2.json'), 'utf8')) as CanonicalJsonObject
  const v2Sha = calculateCanonicalJsonSha256(v2Body)
  const v2Row = { ...row, schema_version: 'care-watering-mvp/v2', release_version: 'care-watering-mvp/v2.0.0', active_release_version: 'care-watering-mvp/v2.0.0', content_sha256: v2Sha, active_content_sha256: v2Sha, policy_json: v2Body }
  it('v2 行 → available，快照为 v2', async () => {
    const result = await fixture([v2Row]).reader.read(capturedAt)
    expect(result).toMatchObject({ status: 'available', snapshot: { contractVersion: 'care-watering-mvp/v2', soilEvidenceMaxHours: 72 } })
  })
  it('Schema 版本与正文合同版本不一致 → invalid', async () => {
    expect(await fixture([{ ...v2Row, schema_version: 'care-watering-mvp/v1' }]).reader.read(capturedAt)).toEqual({ status: 'invalid' })
    expect(await fixture([{ ...row, schema_version: 'care-watering-mvp/v2' }]).reader.read(capturedAt)).toEqual({ status: 'invalid' })
  })
})

describe('MySQL MVP 浇水策略读取 v3｜unit_fake', () => {
  // Expected：用户 2026-10-10 审定 v3（盆型与基质参与干燥）；读取器接受 v1/v2/v3，Schema 版本须与正文一致。
  const v3Body = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v3.json'), 'utf8')) as CanonicalJsonObject
  const v3Sha = calculateCanonicalJsonSha256(v3Body)
  const v3Row = { ...row, schema_version: 'care-watering-mvp/v3', release_version: 'care-watering-mvp/v3.0.0', active_release_version: 'care-watering-mvp/v3.0.0', content_sha256: v3Sha, active_content_sha256: v3Sha, policy_json: v3Body }
  it('v3 行 → available，快照带参考盆', async () => {
    const result = await fixture([v3Row]).reader.read(capturedAt)
    expect(result).toMatchObject({ status: 'available', snapshot: { contractVersion: 'care-watering-mvp/v3', referenceAvailableWater: 0.3 } })
  })
  it('v3 正文配 v2 Schema 版本 → invalid', async () => {
    expect(await fixture([{ ...v3Row, schema_version: 'care-watering-mvp/v2' }]).reader.read(capturedAt)).toEqual({ status: 'invalid' })
  })
})
