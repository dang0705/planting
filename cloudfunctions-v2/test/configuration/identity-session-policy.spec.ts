import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createIdentitySessionPolicyValidator,
  resolveIdentitySessionPolicySnapshot
} from '../../src/configuration/identity-session-policy.js'
import type { IdentitySessionPolicyRelease } from '../../src/configuration/identity-session-policy.js'

/** 配置目录中当前身份会话发布记录的 TTL Expected；不是源码默认值。 */
const CURRENT_APPROVED_SESSION_TTL_HOURS = 24
/** MVP 登录策略明确禁止静默续期，测试用零值来自配置目录 Expected。 */
const CURRENT_APPROVED_REFRESH_WINDOW_HOURS = 0
/** SHA-256 十六进制摘要的标准字符数，用于验证摘要格式。 */
const SHA256_HEX_LENGTH = 64

/**
 * 测试层：unit_fake。
 * Expected 来源：`docs/backend-v2/architecture/configuration-variable-catalog.json` 的登录 TTL/续期窗口条目；`docs/backend-v2/architecture/configuration-and-providers.md` 的请求快照与失败关闭规则；`docs/backend-v2/contracts/identity-session-policy.md` 的 v1 摘要与时间窗合同。
 * 真实经过路径：未知发布值 → AJV 严格 Schema → 当前策略 SHA/有效时间语义校验 → 共享配置快照生成器。
 * 替换边界：没有替换发布解析、Schema、摘要或快照代码；仅未连接配置仓库、MySQL、CloudBase 与真实平台凭证。
 * 覆盖：正常 active 发布、无默认值、未知字段、正整数 TTL 与零续期约束、错误摘要、未来/过期/无效时间、版本快照稳定性与冻结。
 * 明确未覆盖：数据库 active 指针、会话签发/撤销、HTTP/OpenAPI、Provider 和部署。
 */
describe('identity session policy release and request snapshot', () => {
  /** 构造基于合同 Expected 的当前 active 发布测试样本。 */
  const createRelease = (): IdentitySessionPolicyRelease => ({
    contractVersion: 'identity-session-policy/v1',
    scopeCode: 'identity_sessions',
    releaseVersion: 'v1.0.0',
    sessionTtlHours: CURRENT_APPROVED_SESSION_TTL_HOURS,
    refreshWindowHours: CURRENT_APPROVED_REFRESH_WINDOW_HOURS,
    contentSha256: '5d7592f4830373bcad41a162ab033a796dfaac0b81c54297296ef154c6bb0e22',
    releaseStatus: 'active',
    effectiveAt: '2026-09-24T00:00:00.000Z',
    expiresAt: '2026-09-25T00:00:00.000Z'
  })

  it('只解析当前已确认策略，并锁定不可变的版本与摘要快照', () => {
    const release = createRelease()
    const result = resolveIdentitySessionPolicySnapshot(release, '2026-09-24T12:00:00.000Z')

    expect(result.valid).toBe(true)
    if (!result.valid) {
      return
    }

    expect(result.snapshot.sessionTtlHours).toBe(CURRENT_APPROVED_SESSION_TTL_HOURS)
    expect(result.snapshot.refreshWindowHours).toBe(CURRENT_APPROVED_REFRESH_WINDOW_HOURS)
    expect(result.snapshot.releaseVersion).toBe('v1.0.0')
    expect(result.snapshot.contentSha256).toBe(release.contentSha256)
    expect(result.snapshot.configurationSnapshot.policyReleases).toEqual([
      {
        scopeCode: 'identity_sessions',
        releaseVersion: 'v1.0.0',
        sha256: release.contentSha256
      }
    ])
    expect(result.snapshot.configurationSnapshot.providerReleases).toEqual([])
    expect(Object.isFrozen(result.snapshot)).toBe(true)
    expect(Object.isFrozen(result.snapshot.configurationSnapshot)).toBe(true)
    expect(Object.isFrozen(result.snapshot.configurationSnapshot.policyReleases)).toBe(true)
    const [policyRelease] = result.snapshot.configurationSnapshot.policyReleases
    expect(Object.isFrozen(policyRelease)).toBe(true)
  })

  it('没有有效发布时失败关闭，不把目录当前值当成隐式默认值', () => {
    expect(resolveIdentitySessionPolicySnapshot(null, '2026-09-24T12:00:00.000Z')).toEqual({
      valid: false,
      reason: 'IDENTITY_SESSION_POLICY_UNAVAILABLE'
    })
  })

  it('AJV 要求正整数 TTL、v1 零续期，并严格拒绝未知属性', () => {
    const validate = createIdentitySessionPolicyValidator()
    const release = createRelease()

    expect(validate(release)).toBe(true)
    expect(validate({ ...release, sessionTtlHours: 25 })).toBe(true)
    expect(validate({ ...release, sessionTtlHours: 0 })).toBe(false)
    expect(validate({ ...release, refreshWindowHours: 1 })).toBe(false)
    expect(validate({ ...release, contractVersion: 'identity-session-policy/v2' })).toBe(false)
    expect(validate({ ...release, releaseVersion: '' })).toBe(false)
    expect(validate({ ...release, scopeCode: 'identity_other' })).toBe(false)
    const releaseWithoutSha: Record<string, unknown> = { ...release }
    delete releaseWithoutSha.contentSha256
    expect(validate(releaseWithoutSha)).toBe(false)
    expect(validate({ ...release, secret: 'must-not-enter-policy' })).toBe(false)
  })

  it('拒绝策略内容摘要不匹配，不能仅凭 64 位格式生成快照', () => {
    const release = { ...createRelease(), contentSha256: 'a'.repeat(SHA256_HEX_LENGTH) }

    expect(resolveIdentitySessionPolicySnapshot(release, '2026-09-24T12:00:00.000Z')).toEqual({
      valid: false,
      reason: 'IDENTITY_SESSION_POLICY_INVALID'
    })
  })

  it('生效时间含首时刻、失效时间不含边界', () => {
    const release = createRelease()

    expect(resolveIdentitySessionPolicySnapshot(release, release.effectiveAt).valid).toBe(true)
    expect(resolveIdentitySessionPolicySnapshot(release, release.expiresAt ?? '').valid).toBe(false)
    expect(
      resolveIdentitySessionPolicySnapshot(
        { ...release, effectiveAt: '2026-09-24T00:00:00Z' },
        '2026-09-24T12:00:00Z'
      ).valid
    ).toBe(true)
    expect(
      resolveIdentitySessionPolicySnapshot(
        { ...release, expiresAt: null },
        '2026-09-24T12:00:00.000Z'
      ).valid
    ).toBe(true)
  })

  it('拒绝未来生效、非 active、无效日期和倒置的有效期', () => {
    const release = createRelease()

    expect(resolveIdentitySessionPolicySnapshot(release, '2026-09-23T23:59:59.999Z')).toEqual({
      valid: false,
      reason: 'IDENTITY_SESSION_POLICY_NOT_EFFECTIVE'
    })
    expect(
      resolveIdentitySessionPolicySnapshot(
        { ...release, releaseStatus: 'retired' },
        '2026-09-24T12:00:00.000Z'
      )
    ).toEqual({ valid: false, reason: 'IDENTITY_SESSION_POLICY_UNAVAILABLE' })
    expect(
      resolveIdentitySessionPolicySnapshot(
        { ...release, effectiveAt: '2026-02-30T00:00:00.000Z' },
        '2026-09-24T12:00:00.000Z'
      ).valid
    ).toBe(false)
    expect(
      resolveIdentitySessionPolicySnapshot(
        { ...release, expiresAt: release.effectiveAt },
        '2026-09-24T12:00:00.000Z'
      ).valid
    ).toBe(false)
  })

  it('快照摘要稳定绑定捕获时点、发布版本与内容摘要', () => {
    const release = createRelease()
    const capturedAt = '2026-09-24T12:00:00.000Z'
    const first = resolveIdentitySessionPolicySnapshot(release, capturedAt)
    const second = resolveIdentitySessionPolicySnapshot(release, capturedAt)
    const nextVersion = resolveIdentitySessionPolicySnapshot(
      { ...release, releaseVersion: 'v1.0.1' },
      capturedAt
    )

    expect(first.valid && second.valid && nextVersion.valid).toBe(true)
    if (!first.valid || !second.valid || !nextVersion.valid) {
      return
    }
    expect(first.snapshot.configurationSnapshot.snapshotSha256).toBe(
      second.snapshot.configurationSnapshot.snapshotSha256
    )
    expect(first.snapshot.configurationSnapshot.snapshotSha256).not.toBe(
      nextVersion.snapshot.configurationSnapshot.snapshotSha256
    )
    expect(first.snapshot.configurationSnapshot.snapshotSha256).toMatch(
      new RegExp(`^[a-f0-9]{${SHA256_HEX_LENGTH}}$`)
    )
  })

  it('独立 Expected 的策略正文摘要与冻结合同中的规范 JSON 一致', () => {
    const canonicalExpected =
      '{"contractVersion":"identity-session-policy/v1","scopeCode":"identity_sessions","sessionTtlHours":24,"refreshWindowHours":0}'
    const expectedSha256 = createHash('sha256').update(canonicalExpected).digest('hex')

    expect(createRelease().contentSha256).toBe(expectedSha256)
  })
})
