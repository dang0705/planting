import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { resolveIdentitySessionPolicySnapshot } from '../../src/configuration/identity-session-policy.js'
import { createMysqlIdentitySessionPolicyReader } from '../../src/identity/repository/mysql-identity-session-policy-reader.js'

/**
 * Expected：models/identity/guest-token-test-matrix.md「身份策略 v2」。
 * v1 回归用测试库已发布制品 .codex/backend-v2/evidence/E03-identity-session-policy-published.json（unit_real_data）；
 * 读取器替换 SQL 连接（unit_fake）。
 */
const capturedAt = '2026-10-09T03:00:00Z'
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const v2Body = {
  contractVersion: 'identity-session-policy/v2', scopeCode: 'identity_sessions', sessionTtlHours: 24, refreshWindowHours: 0,
  guestSessionTtlHours: 168, guestIssuanceRatePerHour: 10, douyinAnonymousSignalEnabled: true,
}
const meta = { releaseVersion: 'identity-sessions/v2', releaseStatus: 'active', effectiveAt: '2026-10-09T00:00:00Z' }
const v2Release = (body: Record<string, unknown> = v2Body, contentSha256 = sha256(body)) => ({ ...body, ...meta, contentSha256 })
const publishedV1Body = { contractVersion: 'identity-session-policy/v1', scopeCode: 'identity_sessions', sessionTtlHours: 24, refreshWindowHours: 0 }
const publishedV1Sha = '5d7592f4830373bcad41a162ab033a796dfaac0b81c54297296ef154c6bb0e22'

describe('身份策略 v2 解析｜L1', () => {
  it('P1：v2 合法发布 → 快照含游客策略', () => {
    const resolution = resolveIdentitySessionPolicySnapshot(v2Release(), capturedAt)
    expect(resolution.valid).toBe(true)
    if (!resolution.valid) { return }
    expect(resolution.snapshot.guest).toEqual({ ttlHours: 168, ratePerHour: 10, douyinAnonymousSignalEnabled: true })
    expect(resolution.snapshot.sessionTtlHours).toBe(24)
    expect(resolution.snapshot.contentSha256).toBe(sha256(v2Body))
  })
  it('P2：测试库已发布 v1 → 摘要不变，游客部分 null', () => {
    expect(sha256(publishedV1Body)).toBe(publishedV1Sha)
    const resolution = resolveIdentitySessionPolicySnapshot({ ...publishedV1Body, releaseVersion: 'identity-sessions/v1', releaseStatus: 'active',
      effectiveAt: '2026-10-08T00:00:00Z', contentSha256: publishedV1Sha }, capturedAt)
    expect(resolution.valid).toBe(true)
    if (resolution.valid) { expect(resolution.snapshot.guest).toBeNull() }
  })
  it.each([
    ['缺游客有效期', (({ guestSessionTtlHours: _omit, ...rest }) => rest)(v2Body)],
    ['缺限流', (({ guestIssuanceRatePerHour: _omit, ...rest }) => rest)(v2Body)],
    ['缺开关', (({ douyinAnonymousSignalEnabled: _omit, ...rest }) => rest)(v2Body)],
    ['限流为 0', { ...v2Body, guestIssuanceRatePerHour: 0 }],
    ['有效期非整数', { ...v2Body, guestSessionTtlHours: 1.5 }],
    ['开关非布尔', { ...v2Body, douyinAnonymousSignalEnabled: 'true' }],
    ['v1 混入游客字段', { ...publishedV1Body, guestSessionTtlHours: 168 }],
  ])('P3：%s → invalid', (_label, body) => {
    expect(resolveIdentitySessionPolicySnapshot(v2Release(body as Record<string, unknown>), capturedAt)).toEqual({ valid: false, reason: 'IDENTITY_SESSION_POLICY_INVALID' })
  })
  it('P4：v2 摘要漏掉游客字段 → invalid', () => {
    const v1StyleSha = sha256({ contractVersion: v2Body.contractVersion, scopeCode: v2Body.scopeCode, sessionTtlHours: 24, refreshWindowHours: 0 })
    expect(resolveIdentitySessionPolicySnapshot(v2Release(v2Body, v1StyleSha), capturedAt).valid).toBe(false)
  })
})

const v2Row = {
  release_ref: 'bpr_identity_sess02', domain_code: 'identity', policy_code: 'identity_sessions', schema_version: 'identity-session-policy/v2',
  release_version: 'identity-sessions/v2', content_sha256: sha256(v2Body), policy_json: v2Body, status: 'active', effective_at_ms: '1791504000000',
  expires_at_ms: null, verified_at_ms: '1791504000000', active_release_version: 'identity-sessions/v2', active_content_sha256: sha256(v2Body),
}
function reader(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue(rows)
  return createMysqlIdentitySessionPolicyReader({ getConnection: async () => ({ query, release: vi.fn(), destroy: vi.fn() }) } as never)
}

describe('身份策略 v2 读取｜L3 unit_fake', () => {
  it('D1：v2 行 → 快照含游客策略；schema_version 与正文版本不一致 → null', async () => {
    expect((await reader([v2Row]).read(capturedAt))?.guest).toEqual({ ttlHours: 168, ratePerHour: 10, douyinAnonymousSignalEnabled: true })
    expect(await reader([{ ...v2Row, schema_version: 'identity-session-policy/v1' }]).read(capturedAt)).toBeNull()
  })
  it('D2：v2 正文含未知字段 → null', async () => {
    const body = { ...v2Body, extra: 1 }
    expect(await reader([{ ...v2Row, policy_json: body, content_sha256: sha256(body), active_content_sha256: sha256(body) }]).read(capturedAt)).toBeNull()
  })
})
