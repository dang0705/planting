import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { createMysqlUserPlantLimitsPolicyReader } from '../../src/user-plant/repository/mysql-user-plant-limits-policy-reader.js'

/**
 * unit_fake（L3，替换 MySQL 连接）。Expected：temporary-case-contract.md §2 策略 + 测试矩阵 P1/P2。
 * 替换：连接池为内存替身；真实 JSON 列与指针表行为由 test/e2e/temporary-case.mysql.spec.ts 覆盖。
 */
const body = { contractVersion: 'user-plant-limits-policy/v1', scopeCode: 'userplant_limits', guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168 }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const row = {
  release_ref: 'bpr_userplant_limits01', domain_code: 'user-plant', policy_code: 'userplant_limits', schema_version: 'user-plant-limits-policy/v1',
  release_version: 'userplant-limits/v1', content_sha256: sha, policy_json: body, status: 'active', effective_at_ms: '1790000000000',
  expires_at_ms: null, verified_at_ms: '1790000000000', active_release_version: 'userplant-limits/v1', active_content_sha256: sha
}
const capturedAt = '2026-10-09T04:00:00Z'

function fixture(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue(rows)
  const release = vi.fn()
  const destroy = vi.fn()
  const reader = createMysqlUserPlantLimitsPolicyReader({ getConnection: async () => ({ query, release, destroy }) } as never)
  return { reader, query, release, destroy }
}

describe('MySQL 用户植物限额策略读取｜unit_fake', () => {
  it('P1 活动指针连发布行 → 快照（5 个 / 168 小时）', async () => {
    const f = fixture([row])
    const snapshot = await f.reader.read(capturedAt)
    expect(snapshot).toMatchObject({ guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168, releaseVersion: 'userplant-limits/v1', contentSha256: sha, capturedAt })
    expect(f.query).toHaveBeenCalledOnce()
    expect(f.query.mock.calls[0]?.[0]).toContain('active_business_policy_releases')
    expect(f.query.mock.calls[0]?.[1]).toEqual(['user-plant', 'userplant_limits'])
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('P1 正文为 JSON 文本也可解析', async () => {
    expect(await fixture([{ ...row, policy_json: JSON.stringify(body) }]).reader.read(capturedAt)).toMatchObject({ guestMaxCasesPerSession: 5 })
  })
  it('P2 无行或多行 → null', async () => {
    expect(await fixture([]).reader.read(capturedAt)).toBeNull()
    expect(await fixture([row, row]).reader.read(capturedAt)).toBeNull()
  })
  it.each([
    { ...row, domain_code: 'identity' }, { ...row, policy_code: 'profile_minimum_completeness' }, { ...row, schema_version: 'user-plant-limits-policy/v2' },
    { ...row, active_release_version: 'other' }, { ...row, active_content_sha256: '0'.repeat(64) }, { ...row, verified_at_ms: null },
    { ...row, policy_json: '{broken' }, { ...row, policy_json: { ...body, guestMaxCasesPerSession: 6 } },
    { ...row, policy_json: { ...body, releaseStatus: 'active' } }, { ...row, policy_json: [body] }
  ])('P2 不可信发布或指针 → null（%#）', async invalid => {
    expect(await fixture([invalid]).reader.read(capturedAt)).toBeNull()
  })
  it('P2 退役或已过期 → null', async () => {
    expect(await fixture([{ ...row, status: 'retired' }]).reader.read(capturedAt)).toBeNull()
    expect(await fixture([{ ...row, expires_at_ms: String(Date.parse(capturedAt)) }]).reader.read(capturedAt)).toBeNull()
  })
  it('数据库错误向上传播且连接被销毁', async () => {
    const f = fixture([])
    f.query.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(f.reader.read(capturedAt)).rejects.toThrow('database unavailable')
    expect(f.destroy).toHaveBeenCalledOnce()
  })
})
