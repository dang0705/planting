import { describe, expect, test } from 'vitest'

import { deriveTrialEligibility } from '../../src/subscription/domain/derive-trial-eligibility.js'

/** 当前已确认的试用有效期；独立于被测函数与任何代码默认值。 */
const approvedTrialDurationHours = 24
/** 一小时对应的毫秒数，用于从合同数值独立推算预期到期时刻。 */
const secondsPerMinute = 60
const minutesPerHour = 60
const millisecondsPerSecond = 1000
const millisecondsPerHour = secondsPerMinute * minutesPerHour * millisecondsPerSecond
/** 到期边界前一毫秒与注册后策略生效边界后一毫秒。 */
const oneMillisecond = 1
/** 测试夹具的服务端统一用户注册时刻，UTC 毫秒。 */
const registeredAtMs = Date.parse('2026-09-24T10:00:00.000Z')
/** 策略发布时刻早于注册，且版本有明确标识。 */
const trialPolicyVersion = 'trial/2026-09-24.1'
/** 试用窗口内的首次访问时刻，故意接近绝对到期点。 */
const firstAccessHour = 23
/** 注册后策略的窗口在首次访问前已结束。 */
const policyWindowHours = 1
/** 访问早于试用到期但晚于示例策略窗口的小时数。 */
const accessAfterPolicyExpiryHours = 2

/** 构造只含当前试用资格判定所需事实的输入；不模拟发布解析或持久化。 */
function createEligibilityInput() {
  return {
    user: { createdAtMs: registeredAtMs, status: 'active' },
    nowMs: registeredAtMs,
    policySnapshot: {
      releaseVersion: trialPolicyVersion,
      status: 'active',
      effectiveAtMs: registeredAtMs - millisecondsPerHour,
      expiresAtMs: registeredAtMs + policyWindowHours * millisecondsPerHour,
      durationHours: approvedTrialDurationHours
    }
  }
}

/**
 * 层次：L1 / unit_fake。Expected 来源：已提交的试用裁决、
 * configuration-variable-catalog.json 中 confirmed 的 24 小时与
 * business_policy_releases 的发布有效窗口。被测路径仅派生资格时间，不发 grant。
 * 本切片不验证 200 点正文：仓库尚无冻结的 trial policy Schema/发布解析器。
 * 明确未覆盖：身份只读 API、策略 JSON Schema/摘要/活动指针、物化行、额度账本、
 * 并发/幂等 Repository、HTTP、Provider 与 CloudBase。
 */
describe('deriveTrialEligibility', () => {
  test('注册时刻起立即生效，并按半开 24 小时窗口判定', () => {
    const expiresAtMs = registeredAtMs + approvedTrialDurationHours * millisecondsPerHour

    expect(deriveTrialEligibility(createEligibilityInput())).toEqual({
      eligibility: 'active',
      startsAtMs: registeredAtMs,
      expiresAtMs,
      policyVersion: trialPolicyVersion
    })
    expect(
      deriveTrialEligibility({
        ...createEligibilityInput(),
        nowMs: expiresAtMs - oneMillisecond
      })
    ).toEqual({
      eligibility: 'active',
      startsAtMs: registeredAtMs,
      expiresAtMs,
      policyVersion: trialPolicyVersion
    })
    expect(
      deriveTrialEligibility({
        ...createEligibilityInput(),
        nowMs: expiresAtMs
      })
    ).toEqual({
      eligibility: 'expired',
      startsAtMs: registeredAtMs,
      expiresAtMs,
      policyVersion: trialPolicyVersion
    })
  })

  test('首次访问时刻不重置注册锚点或绝对到期时刻', () => {
    const expiresAtMs = registeredAtMs + approvedTrialDurationHours * millisecondsPerHour
    const firstAccessAtMs = registeredAtMs + firstAccessHour * millisecondsPerHour

    expect(
      deriveTrialEligibility({
        ...createEligibilityInput(),
        nowMs: firstAccessAtMs
      })
    ).toEqual({
      eligibility: 'active',
      startsAtMs: registeredAtMs,
      expiresAtMs,
      policyVersion: trialPolicyVersion
    })
  })

  test('策略在注册时生效但之后已退役时，仍锁定该注册代策略与原始窗口', () => {
    const input = createEligibilityInput()
    const expiresAtMs = registeredAtMs + approvedTrialDurationHours * millisecondsPerHour

    expect(
      deriveTrialEligibility({
        ...input,
        nowMs: registeredAtMs + accessAfterPolicyExpiryHours * millisecondsPerHour,
        policySnapshot: { ...input.policySnapshot, status: 'retired' }
      })
    ).toEqual({
      eligibility: 'active',
      startsAtMs: registeredAtMs,
      expiresAtMs,
      policyVersion: trialPolicyVersion
    })
  })

  test('拒绝注册后才生效或注册前已到期的策略版本', () => {
    const input = createEligibilityInput()

    expect(
      deriveTrialEligibility({
        ...input,
        policySnapshot: {
          ...input.policySnapshot,
          effectiveAtMs: registeredAtMs + oneMillisecond
        }
      })
    ).toEqual({
      eligibility: 'denied',
      reason: 'TRIAL_POLICY_NOT_EFFECTIVE_AT_REGISTRATION'
    })
    expect(
      deriveTrialEligibility({
        ...input,
        policySnapshot: {
          ...input.policySnapshot,
          expiresAtMs: registeredAtMs
        }
      })
    ).toEqual({
      eligibility: 'denied',
      reason: 'TRIAL_POLICY_NOT_EFFECTIVE_AT_REGISTRATION'
    })
    expect(
      deriveTrialEligibility({
        ...input,
        policySnapshot: { ...input.policySnapshot, status: 'draft' }
      })
    ).toEqual({
      eligibility: 'denied',
      reason: 'TRIAL_POLICY_UNAVAILABLE'
    })
  })

  test('策略缺失或用户不是有效统一用户时失败关闭', () => {
    const input = createEligibilityInput()

    expect(deriveTrialEligibility({ ...input, policySnapshot: null })).toEqual({
      eligibility: 'denied',
      reason: 'TRIAL_POLICY_UNAVAILABLE'
    })
    expect(deriveTrialEligibility({ ...input, user: null })).toEqual({
      eligibility: 'denied',
      reason: 'USER_INVALID'
    })
    expect(
      deriveTrialEligibility({
        ...input,
        user: { ...input.user, status: 'suspended' }
      })
    ).toEqual({
      eligibility: 'denied',
      reason: 'USER_NOT_ACTIVE'
    })
  })

  test('非法时间、策略窗口或试用时长失败关闭', () => {
    const input = createEligibilityInput()

    expect(deriveTrialEligibility({ ...input, nowMs: Number.NaN })).toEqual({
      eligibility: 'denied',
      reason: 'INVALID_INPUT'
    })
    expect(
      deriveTrialEligibility({
        ...input,
        policySnapshot: { ...input.policySnapshot, durationHours: 0 }
      })
    ).toEqual({ eligibility: 'denied', reason: 'TRIAL_POLICY_INVALID' })
    expect(
      deriveTrialEligibility({
        ...input,
        policySnapshot: { ...input.policySnapshot, releaseVersion: '  ' }
      })
    ).toEqual({ eligibility: 'denied', reason: 'TRIAL_POLICY_INVALID' })
  })
})
