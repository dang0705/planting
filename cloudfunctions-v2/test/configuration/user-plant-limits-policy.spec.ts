import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  calculateUserPlantLimitsPolicyContentSha256,
  resolveUserPlantLimitsPolicySnapshot
} from '../../src/configuration/user-plant-limits-policy.js'

/**
 * unit_fake（L1 纯函数）。Expected：models/user-plant/temporary-case-contract.md §2 策略 +
 * temporary-case-test-matrix.md P1/P2；5/168 为配置目录 confirmed 值，仅出现在测试夹具。
 * 摘要在测试内按合同固定字段顺序独立计算，不调用被测函数生成 Expected。
 */
const body = {
  contractVersion: 'user-plant-limits-policy/v1' as const,
  scopeCode: 'userplant_limits' as const,
  guestMaxCasesPerSession: 5,
  authenticatedEphemeralCaseTtlHours: 168
}
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
const release = {
  ...body,
  releaseVersion: 'userplant-limits/v1',
  contentSha256: sha,
  releaseStatus: 'active',
  effectiveAt: '2026-10-01T00:00:00Z',
  expiresAt: null
}
const capturedAt = '2026-10-09T04:00:00Z'

describe('user-plant-limits-policy/v1 解析', () => {
  it('P1 摘要按固定字段顺序计算', () => {
    expect(calculateUserPlantLimitsPolicyContentSha256(body)).toBe(sha)
  })

  it('P1 活动发布 → 只读快照锁定两项限额、版本与摘要', () => {
    const resolution = resolveUserPlantLimitsPolicySnapshot(release, capturedAt)
    expect(resolution.valid).toBe(true)
    if (!resolution.valid) { return }
    expect(resolution.snapshot).toMatchObject({
      contractVersion: 'user-plant-limits-policy/v1',
      scopeCode: 'userplant_limits',
      releaseVersion: 'userplant-limits/v1',
      contentSha256: sha,
      guestMaxCasesPerSession: 5,
      authenticatedEphemeralCaseTtlHours: 168,
      capturedAt
    })
    expect(resolution.snapshot.configurationSnapshot.policyReleases).toEqual([
      { scopeCode: 'userplant_limits', releaseVersion: 'userplant-limits/v1', sha256: sha }
    ])
    expect(Object.isFrozen(resolution.snapshot)).toBe(true)
  })

  it('P2 无发布 → UNAVAILABLE，不回退源码默认值', () => {
    expect(resolveUserPlantLimitsPolicySnapshot(null, capturedAt)).toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' })
    expect(resolveUserPlantLimitsPolicySnapshot(undefined, capturedAt)).toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' })
  })

  it.each([
    ['多余字段', { ...release, guestMaxCasesPerUser: 5 }],
    ['上限为 0', { ...release, guestMaxCasesPerSession: 0 }],
    ['上限非整数', { ...release, guestMaxCasesPerSession: 2.5 }],
    ['有效期为负', { ...release, authenticatedEphemeralCaseTtlHours: -1 }],
    ['有效期字符串', { ...release, authenticatedEphemeralCaseTtlHours: '168' }],
    ['未知合同版本', { ...release, contractVersion: 'user-plant-limits-policy/v2' }],
    ['范围错误', { ...release, scopeCode: 'identity_sessions' }],
    ['摘要不符', { ...release, contentSha256: '0'.repeat(64) }],
    ['正文改值但沿用旧摘要', { ...release, guestMaxCasesPerSession: 6 }],
    ['缺少字段', (({ authenticatedEphemeralCaseTtlHours: _omit, ...rest }) => rest)(release)],
    ['非法日期', { ...release, effectiveAt: '2026-02-30T00:00:00Z' }]
  ])('P2 %s → INVALID', (_name, candidate) => {
    expect(resolveUserPlantLimitsPolicySnapshot(candidate, capturedAt)).toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_INVALID' })
  })

  it('P2 非 active、已过期 → UNAVAILABLE；未生效 → NOT_EFFECTIVE', () => {
    expect(resolveUserPlantLimitsPolicySnapshot({ ...release, releaseStatus: 'retired' }, capturedAt))
      .toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' })
    expect(resolveUserPlantLimitsPolicySnapshot({ ...release, expiresAt: capturedAt }, capturedAt))
      .toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' })
    expect(resolveUserPlantLimitsPolicySnapshot({ ...release, effectiveAt: '2026-10-10T00:00:00Z' }, capturedAt))
      .toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_NOT_EFFECTIVE' })
  })

  it('P2 捕获时刻非法 → INVALID', () => {
    expect(resolveUserPlantLimitsPolicySnapshot(release, 'not-a-time')).toEqual({ valid: false, reason: 'USER_PLANT_LIMITS_POLICY_INVALID' })
  })
})
