import { describe, expect, test } from 'vitest'

import {
  createMemberAiQuotaPolicyValidator,
  resolveMemberAiQuotaPolicySnapshot,
  type MemberAiQuotaPolicyRelease
} from '../../src/configuration/member-ai-quota-policy.js'

/** 合同中当前批准的会员周期额度；不是从被测解析器读取的默认值。 */
const approvedPointsPerCycle = 2000
/** 对字面 JSON `{"aiPointsPerCycle":2000}` 独立计算并冻结的 SHA-256 黄金向量。 */
const approvedContentSha256 = 'db2b796591e1132665d7c39aa9b5504a0f3d524f5c3b28c0018708a5559c126a'
/** 测试夹具版本仅用于证明版本透传，不代表生产已发布版本。 */
const fixtureReleaseVersion = 'subscription.member.ai_points_per_cycle/2026-09-24.1'
/** 生效窗口内的固定测试时间，UTC 毫秒。 */
const validNowMs = Date.parse('2026-09-24T12:00:00.000Z')
/** SHA-256 十六进制摘要的固定字符数。 */
const sha256HexLength = 64
/** 时间窗边界前一毫秒，用于验证闭区间起点。 */
const oneMillisecond = 1

/** 构造明确的策略发布及活动指针读回，测试不依赖实现生成 Expected。 */
function createRelease(): MemberAiQuotaPolicyRelease {
  return {
    domainCode: 'subscription',
    policyCode: 'subscription.member.ai_points_per_cycle',
    schemaVersion: 'member-ai-quota-policy/v1',
    releaseVersion: fixtureReleaseVersion,
    contentSha256: approvedContentSha256,
    policyJson: { aiPointsPerCycle: approvedPointsPerCycle },
    status: 'active',
    effectiveAtMs: Date.parse('2026-09-24T00:00:00.000Z'),
    expiresAtMs: Date.parse('2026-09-25T00:00:00.000Z'),
    activeReleaseVersion: fixtureReleaseVersion,
    activeContentSha256: approvedContentSha256
  }
}

/**
 * 层次：L1 / unit_fake。Expected 来源：care-points-and-ai-quota.md 的会员策略发布边界、
 * configuration-variable-catalog.json 的当前 2000 点与失败关闭，以及独立摘要黄金向量。
 * 真实路径：未知发布对象 → 严格 Schema → 发布身份、指针、摘要和时间窗校验 → 冻结快照。
 * 替换边界：仅缺 MySQL 发布读取和支付回调；没有 mock 被测解析器。
 * 未覆盖：真实发布事务、订阅周期归属、grant/账本、支付验签、HTTP/CloudBase。
 */
describe('会员周期 AI 额度策略发布', () => {
  test('只接受当前有效发布，并把 2000 点及不可变版本透传到只读快照', () => {
    const result = resolveMemberAiQuotaPolicySnapshot(createRelease(), validNowMs)
    expect(result).toEqual({
      valid: true,
      snapshot: {
        aiPointsPerCycle: approvedPointsPerCycle,
        releaseVersion: fixtureReleaseVersion,
        contentSha256: approvedContentSha256
      }
    })
    if (result.valid) {
      expect(Object.isFrozen(result.snapshot)).toBe(true)
    }
  })

  test('策略缺失时失败关闭，不从配置目录偷偷回填 2000 点', () => {
    expect(resolveMemberAiQuotaPolicySnapshot(null, validNowMs)).toEqual({
      valid: false,
      reason: 'MEMBER_AI_QUOTA_POLICY_UNAVAILABLE'
    })
  })

  test('严格 Schema 拒绝零点、非整数、额外字段和缺失金额', () => {
    const validate = createMemberAiQuotaPolicyValidator()
    expect(validate({ aiPointsPerCycle: approvedPointsPerCycle })).toBe(true)
    expect(validate({ aiPointsPerCycle: 0 })).toBe(false)
    expect(validate({ aiPointsPerCycle: 2000.5 })).toBe(false)
    expect(validate({ aiPointsPerCycle: 2000, apiKey: 'forbidden' })).toBe(false)
    expect(validate({})).toBe(false)
  })

  test('拒绝错策略身份、错误摘要、指针不一致及无效时间窗', () => {
    const release = createRelease()
    for (const invalid of [
      { ...release, policyCode: 'subscription.other' },
      { ...release, schemaVersion: 'member-ai-quota-policy/v2' },
      { ...release, contentSha256: 'a'.repeat(sha256HexLength) },
      { ...release, activeReleaseVersion: 'other/2026-09-24.1' },
      { ...release, activeContentSha256: 'b'.repeat(sha256HexLength) },
      { ...release, status: 'retired' },
      { ...release, policyJson: { aiPointsPerCycle: 2000, hidden: true } }
    ]) {
      expect(resolveMemberAiQuotaPolicySnapshot(invalid, validNowMs).valid).toBe(false)
    }
    expect(resolveMemberAiQuotaPolicySnapshot(release, release.effectiveAtMs).valid).toBe(true)
    const expiryMs = release.expiresAtMs
    if (expiryMs === null) {
      throw new Error('测试夹具必须指定策略失效时间')
    }
    expect(resolveMemberAiQuotaPolicySnapshot(release, expiryMs).valid).toBe(false)
    expect(
      resolveMemberAiQuotaPolicySnapshot(release, release.effectiveAtMs - oneMillisecond).valid
    ).toBe(false)
  })
})
