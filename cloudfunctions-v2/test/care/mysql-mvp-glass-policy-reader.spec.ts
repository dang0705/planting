import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMysqlMvpGlassPolicyReader } from '../../src/care/repository/mysql-mvp-glass-policy-reader.js'

/** unit_fake：替换SQL连接，独立合同为mvp-glass-policy-contract.md；不证明真实MySQL。 */
const body = { approximation: 'clear_glass_broadband_proxy', contractVersion: 'mvp-glass-policy/v1', doubleTransmission: 0.70, scopeCode: 'care_mvp_glass', singleTransmission: 0.83, sourceRef: 'explicit-clear-glass-experiment' }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const row = { release_ref: 'bpr_glass_sample01', domain_code: 'care', policy_code: 'mvp_glass', schema_version: 'mvp-glass-policy/v1', release_version: 'experiment-1', content_sha256: sha, policy_json: body, status: 'active', effective_at_ms: '1791072000000', expires_at_ms: null, verified_at_ms: '1791072000000', active_release_version: 'experiment-1', active_content_sha256: sha }
const capturedAt = '2026-10-04T12:00:00Z'

function fixture(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue(rows)
  const release = vi.fn()
  const destroy = vi.fn()
  const reader = createMysqlMvpGlassPolicyReader({ getConnection: async () => ({ query, release, destroy }) } as never)
  return { reader, query, release, destroy }
}

describe('unit_fake MySQL活动玻璃策略完整性', () => {
  it('活动指针连发布行，保留真实发布引用及同一个正文摘要', async () => {
    const f = fixture([row]); const result = await f.reader.read(capturedAt)
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('应有有效策略') }
    expect(result.releaseRef).toBe(row.release_ref)
    expect(result.snapshot.contentSha256).toBe(sha)
    expect(result.snapshot.singleTransmission).toBe(0.83)
    expect(f.query).toHaveBeenCalledOnce()
    expect(f.query.mock.calls[0]?.[0]).toContain('active_business_policy_releases')
    expect(f.query.mock.calls[0]?.[1]).toEqual(['care', 'mvp_glass'])
    expect(f.release).toHaveBeenCalledOnce()
  })
  it.each([
    { ...row, domain_code: 'identity' }, { ...row, policy_code: 'different' },
    { ...row, schema_version: 'unknown/v1' }, { ...row, verified_at_ms: null },
    { ...row, active_content_sha256: '0'.repeat(64) }, { ...row, active_release_version: 'other' },
    { ...row, effective_at_ms: '9007199254740992' }, { ...row, verified_at_ms: 'invalid' },
    { ...row, policy_json: '{broken' }, { ...row, policy_json: { ...body, singleTransmission: 0.99 } },
  ])('不可信发布/指针拒绝%j', async invalid => {
    expect((await fixture([invalid]).reader.read(capturedAt)).status).toBe('invalid')
  })
  it('零条或多条不猜活动版本；合法JSON文本与对象相同', async () => {
    expect((await fixture([]).reader.read(capturedAt)).status).toBe('unavailable')
    expect((await fixture([row, row]).reader.read(capturedAt)).status).toBe('invalid')
    expect((await fixture([{ ...row, policy_json: JSON.stringify(body) }]).reader.read(capturedAt)).status).toBe('available')
  })
  it('过期和退役失败关闭；数据库错误传播且释放连接', async () => {
    expect((await fixture([{ ...row, expires_at_ms: String(Date.parse(capturedAt)) }]).reader.read(capturedAt)).status).toBe('unavailable')
    expect((await fixture([{ ...row, status: 'retired' }]).reader.read(capturedAt)).status).toBe('unavailable')
    const f = fixture([]); f.query.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(f.reader.read(capturedAt)).rejects.toThrow('database unavailable')
    expect(f.destroy).toHaveBeenCalledOnce()
  })
})
