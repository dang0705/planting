import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createUserSessionIssuanceMaterial } from '../../src/identity/domain/user-session-issuance-material.js'
import {
  resolveIdentitySessionPolicySnapshot,
  type IdentitySessionPolicyRelease
} from '../../src/configuration/identity-session-policy.js'

/** 经批准的当前策略 TTL；来自配置目录，不是实现默认值。 */
const approvedCurrentSessionTtlHours = 24
/** 另一有效策略版本的测试 TTL，用于证明实现不写死当前发布值。 */
const alternateSessionTtlHours = 31
/** 已批准身份策略 v1 的静默续期窗口。 */
const approvedRefreshWindowHours = 0
/** 256-bit CSPRNG 输出经无填充 Base64URL 编码后的字符数。 */
const encodedBearerCharacterCount = 43
/** UTC 毫秒换算为小时的固定物理单位。 */
const millisecondsPerHour = 3_600_000
/** 合法 SHA-256 十六进制文本的长度。 */
const sha256CharacterCount = 64

/** 测试层：unit_fake。
 * Expected 来源：`principal-and-capability.md` §1 的 Bearer 只存 SHA-256、绝对失效与不静默续期；
 * `identity-session-policy.md` §1-4 的请求锁定策略快照与无源码默认；`schema/001_identity.sql`
 * 的 session hash/time 约束；父代理批准的方案 D（Bearer 只交付首次成功调用）。
 * 真实经过路径：显式的有效策略快照与 UTC 毫秒 → Identity 会话签发材料函数 → 独立 SHA-256 读回。
 * 替换边界：未连接配置 MySQL、身份 Repository、事务、幂等表、Provider、HTTP 和 CloudBase；
 * 随机数使用真实 Node CSPRNG，不替换为固定测试令牌。
 * 覆盖：高熵 opaque Bearer 的编码形状、存储仅含摘要、策略 TTL 派生失效时刻、刷新窗口拒签、
 * UTC 时间边界和整数溢出拒签。
 * 明确未覆盖：首次用户/绑定事务、重试/并发、Identity outbox、Subscription 试用、公开 DTO/API、
 * 真实 MySQL、CloudBase Provider 和端到端登录闭环。
 */
describe('user session issuance material', () => {
  /** 构造与身份会话策略合同一致的独立 active 发布。 */
  function createApprovedRelease(
    ttlHours = approvedCurrentSessionTtlHours
  ): IdentitySessionPolicyRelease {
    const canonicalPolicy = JSON.stringify({
      contractVersion: 'identity-session-policy/v1',
      scopeCode: 'identity_sessions',
      sessionTtlHours: ttlHours,
      refreshWindowHours: approvedRefreshWindowHours
    })
    return {
      contractVersion: 'identity-session-policy/v1',
      scopeCode: 'identity_sessions',
      releaseVersion: `test-v${ttlHours}`,
      sessionTtlHours: ttlHours,
      refreshWindowHours: approvedRefreshWindowHours,
      contentSha256: createHash('sha256').update(canonicalPolicy).digest('hex'),
      releaseStatus: 'active',
      effectiveAt: '2026-09-24T00:00:00.000Z'
    }
  }

  /** 只允许把合同有效的发布解析成测试所需的请求快照。 */
  function resolveSnapshot(ttlHours = approvedCurrentSessionTtlHours) {
    const result = resolveIdentitySessionPolicySnapshot(
      createApprovedRelease(ttlHours),
      '2026-09-24T12:00:00.000Z'
    )
    if (!result.valid) {
      throw new Error(`测试 Expected 无法形成会话策略快照：${result.reason}`)
    }
    return result.snapshot
  }

  it('生成 256-bit opaque Bearer，并把唯一可持久化字段限制为摘要和锁定时限', () => {
    const policySnapshot = resolveSnapshot()
    const issuedAtMs = Date.parse('2026-09-24T12:00:00.000Z')
    const material = createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs })
    const expectedExpiresAtMs = issuedAtMs + approvedCurrentSessionTtlHours * millisecondsPerHour

    expect(material.bearerForImmediateDelivery).toMatch(
      new RegExp(`^[A-Za-z0-9_-]{${encodedBearerCharacterCount}}$`)
    )
    expect(material.record.sessionRefHash).toBe(
      createHash('sha256').update(material.bearerForImmediateDelivery, 'utf8').digest('hex')
    )
    expect(material.record.sessionRefHash).toMatch(
      new RegExp(`^[a-f0-9]{${sha256CharacterCount}}$`)
    )
    expect(material.record).toEqual({
      sessionRefHash: material.record.sessionRefHash,
      issuedAtMs,
      expiresAtMs: expectedExpiresAtMs,
      policyReleaseVersion: policySnapshot.releaseVersion,
      policySnapshotSha256: policySnapshot.configurationSnapshot.snapshotSha256
    })
    expect(JSON.stringify(material.record)).not.toContain(material.bearerForImmediateDelivery)
  })

  it('每次生成都使用新的随机 Bearer，不能从会话摘要反向重建原文', () => {
    const policySnapshot = resolveSnapshot()
    const issuedAtMs = Date.parse('2026-09-24T12:00:00.000Z')
    const first = createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs })
    const second = createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs })

    expect(first.bearerForImmediateDelivery).not.toBe(second.bearerForImmediateDelivery)
    expect(first.record.sessionRefHash).not.toBe(second.record.sessionRefHash)
  })

  it('使用本次不可变策略快照而非源码常量计算失效时刻', () => {
    const policySnapshot = resolveSnapshot(alternateSessionTtlHours)
    const issuedAtMs = Date.parse('2026-09-24T12:00:00.000Z')
    const material = createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs })

    expect(material.record.expiresAtMs).toBe(
      issuedAtMs + alternateSessionTtlHours * millisecondsPerHour
    )
    expect(material.record.policySnapshotSha256).toBe(
      policySnapshot.configurationSnapshot.snapshotSha256
    )
    expect(material.record.policyReleaseVersion).toBe(policySnapshot.releaseVersion)
  })

  it('v1 刷新窗口不是零时不生成会话材料', () => {
    const policySnapshot = {
      ...resolveSnapshot(),
      refreshWindowHours: 1
    } as unknown as ReturnType<typeof resolveSnapshot>

    expect(() =>
      createUserSessionIssuanceMaterial({
        policySnapshot,
        issuedAtMs: Date.parse('2026-09-24T12:00:00.000Z')
      })
    ).toThrowError('身份会话策略快照不适用于签发')
  })

  it('没有有效的 active 策略快照时失败关闭，不生成 Bearer', () => {
    expect(() =>
      createUserSessionIssuanceMaterial({
        policySnapshot: null,
        issuedAtMs: Date.parse('2026-09-24T12:00:00.000Z')
      })
    ).toThrowError('当前没有可用于签发登录会话的有效策略')
  })

  it('拒绝负时间、非整数时间及失效时刻超出安全整数范围', () => {
    const policySnapshot = resolveSnapshot()

    expect(() =>
      createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs: -1 })
    ).toThrowError('会话签发时间不合法')
    expect(() =>
      createUserSessionIssuanceMaterial({ policySnapshot, issuedAtMs: 1.5 })
    ).toThrowError('会话签发时间不合法')
    expect(() =>
      createUserSessionIssuanceMaterial({
        policySnapshot,
        issuedAtMs: Number.MAX_SAFE_INTEGER - millisecondsPerHour
      })
    ).toThrowError('会话失效时间超出安全范围')
  })
})
