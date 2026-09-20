import { describe, expect, test } from 'vitest'

import {
  evaluateUserPlantProfileCompleteness,
  type UserPlantProfileCompletenessPolicy
} from '../../src/user-plant/domain/evaluate-profile-completeness.js'

const completionTimeMs = Number('1758369600000')

/** 已冻结 `user-plant-profile/v1` 策略；测试 Expected 独立来自配置目录。 */
const policy: UserPlantProfileCompletenessPolicy = {
  profileVersion: 'user-plant-profile/v1',
  requiredFields: ['identityStatus', 'pot', 'location', 'lightingEnvironment', 'ventilationEnvironment'],
  acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'],
  rewardOncePerUser: true
}

/** 构造五项证据齐全、尚未完成的输入。 */
function completeInput() {
  return {
    identityStatus: 'unidentified' as const,
    hasPot: true,
    hasLocation: true,
    hasLightingEnvironment: true,
    hasVentilationEnvironment: true,
    profileCompletedAtMs: null,
    userPreviouslyCompletedProfile: false,
    occurredAtMs: completionTimeMs,
    policy
  }
}

/**
 * Expected 来源：`user-plant/v1` 最低档案和配置项
 * `user-plant.profile.minimum_completeness`。
 * 测试层次：L1 / `unit_fake`；直接执行纯领域规则，不替换任何依赖。
 * 明确未覆盖：各 JSON 字段 Schema、Repository 锁、outbox、HTTP 幂等和 MySQL 事务。
 */
describe('用户植物最低档案完整度', () => {
  test('五项证据齐全时首次记录完成时间和策略版本', () => {
    expect(evaluateUserPlantProfileCompleteness(completeInput())).toEqual({
      kind: 'completed_now',
      profileVersion: 'user-plant-profile/v1',
      completedAtMs: completionTimeMs,
      rewardEligible: true
    })
  })

  test.each([
    ['pot', { hasPot: false }],
    ['location', { hasLocation: false }],
    ['lightingEnvironment', { hasLightingEnvironment: false }],
    ['ventilationEnvironment', { hasVentilationEnvironment: false }]
  ] as const)('缺少 %s 时保持未完成且明确返回缺项', (missingField, patch) => {
    expect(evaluateUserPlantProfileCompleteness({ ...completeInput(), ...patch })).toEqual({
      kind: 'incomplete',
      missingFields: [missingField]
    })
  })

  test('三种合法身份状态均可完成，暂未识别不构成阻断', () => {
    for (const identityStatus of ['unidentified', 'candidate_pending', 'confirmed'] as const) {
      expect(evaluateUserPlantProfileCompleteness({ ...completeInput(), identityStatus }).kind).toBe('completed_now')
    }
  })

  test('已经完成的档案只返回首次完成时间，不再次产生完成决定', () => {
    const firstCompletedAtMs = completionTimeMs - Number('1000')
    expect(
      evaluateUserPlantProfileCompleteness({ ...completeInput(), profileCompletedAtMs: firstCompletedAtMs })
    ).toEqual({
      kind: 'already_completed',
      profileVersion: 'user-plant-profile/v1',
      completedAtMs: firstCompletedAtMs
    })
  })

  test('同一用户已有其他完整档案时仍完成当前档案，但不再次产生奖励资格', () => {
    expect(
      evaluateUserPlantProfileCompleteness({ ...completeInput(), userPreviouslyCompletedProfile: true })
    ).toEqual({
      kind: 'completed_now',
      profileVersion: 'user-plant-profile/v1',
      completedAtMs: completionTimeMs,
      rewardEligible: false
    })
  })

  test('策略缺少冻结字段或关闭每用户一次时失败关闭', () => {
    expect(() =>
      evaluateUserPlantProfileCompleteness({
        ...completeInput(),
        policy: { ...policy, requiredFields: ['identityStatus', 'pot'] }
      })
    ).toThrow('档案完整度策略不合法')
    expect(() =>
      evaluateUserPlantProfileCompleteness({ ...completeInput(), policy: { ...policy, rewardOncePerUser: false } })
    ).toThrow('档案完整度策略不合法')
  })
})
