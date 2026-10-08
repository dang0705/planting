import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createMysqlIdentitySessionPolicyReader } from '../../src/identity/repository/mysql-identity-session-policy-reader.js'

/** unit_fake：替换 SQL 连接；Expected 见 models/identity/wechat-login-provider-test-matrix.md 登录会话策略读取器一节。 */
const body = { contractVersion: 'identity-session-policy/v1', scopeCode: 'identity_sessions', sessionTtlHours: 24, refreshWindowHours: 0 }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const row = { release_ref: 'bpr_identity_sess01', domain_code: 'identity', policy_code: 'identity_sessions', schema_version: 'identity-session-policy/v1',
  release_version: 'identity-sessions/v1', content_sha256: sha, policy_json: body, status: 'active', effective_at_ms: '1791072000000',
  expires_at_ms: null, verified_at_ms: '1791072000000', active_release_version: 'identity-sessions/v1', active_content_sha256: sha }
const capturedAt = '2026-10-08T12:00:00Z'

function fixture(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue(rows)
  const release = vi.fn()
  const destroy = vi.fn()
  const reader = createMysqlIdentitySessionPolicyReader({ getConnection: async () => ({ query, release, destroy }) } as never)
  return { reader, query, release, destroy }
}

describe('MySQL 活动登录会话策略读取｜L3 unit_fake', () => {
  it('Happy：活动指针连发布行 → 24 小时、续期 0 的只读快照', async () => {
    const f = fixture([row])
    const snapshot = await f.reader.read(capturedAt)
    expect(snapshot).toMatchObject({ sessionTtlHours: 24, refreshWindowHours: 0, releaseVersion: 'identity-sessions/v1', contentSha256: sha, capturedAt })
    expect(f.query).toHaveBeenCalledOnce()
    expect(f.query.mock.calls[0]?.[0]).toContain('active_business_policy_releases')
    expect(f.query.mock.calls[0]?.[1]).toEqual(['identity', 'identity_sessions'])
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('无行或多行 → null（拒签，不猜活动版本）', async () => {
    expect(await fixture([]).reader.read(capturedAt)).toBeNull()
    expect(await fixture([row, row]).reader.read(capturedAt)).toBeNull()
  })
  it.each([
    { ...row, domain_code: 'care' }, { ...row, policy_code: 'other' }, { ...row, schema_version: 'unknown/v1' },
    { ...row, active_release_version: 'other' }, { ...row, active_content_sha256: '0'.repeat(64) },
    { ...row, policy_json: '{broken' }, { ...row, policy_json: { ...body, sessionTtlHours: 48 } }, { ...row, verified_at_ms: null },
  ])('不可信发布或指针 %j → null', async invalid => {
    expect(await fixture([invalid]).reader.read(capturedAt)).toBeNull()
  })
  it('Reverse：退役或已过期 → null，不回退源码默认 TTL', async () => {
    expect(await fixture([{ ...row, status: 'retired' }]).reader.read(capturedAt)).toBeNull()
    expect(await fixture([{ ...row, expires_at_ms: String(Date.parse(capturedAt)) }]).reader.read(capturedAt)).toBeNull()
  })
  it('数据库错误向上传播且连接被销毁', async () => {
    const f = fixture([]); f.query.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(f.reader.read(capturedAt)).rejects.toThrow('database unavailable')
    expect(f.destroy).toHaveBeenCalledOnce()
  })
})
