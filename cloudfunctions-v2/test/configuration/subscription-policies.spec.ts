import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findBusinessPolicyDefinition } from '../../src/configuration/business-policies/index.js'
import { loadPolicyReleaseDocument } from '../../src/configuration/policy-release/release-document.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-11 裁决（subscription.ai_reservation.ttl_seconds = 300，confirmed）；
 * 配置目录 subscription.capability.catalog（2026-10-11 主代理裁定 USER_DIAGNOSIS_VISUAL 范围为 user_plant_or_authenticated_ephemeral，
 * 「已发布的测试环境策略仍为旧值，需另行发布新版本」）；care-points-and-ai-quota.md（过期预占只能经对账结算或释放）。
 * 测试层次：unit_real_data（读取真实发布文档与配置目录）。
 */
const root = findProjectRoot()
const readRepoFile = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')
const catalog = JSON.parse(
  readRepoFile('docs/backend-v2/architecture/configuration-variable-catalog.json')
) as {
  variables: { id: string; currentValue: unknown }[]
}
const load = (file: string) => {
  const loaded = loadPolicyReleaseDocument(JSON.parse(readRepoFile(file)), readRepoFile)
  if (!loaded.ok) {
    throw new Error(`${file}：${loaded.reason}`)
  }
  return loaded
}

describe('subscription/ai_reservation（预占有效期）', () => {
  it('发布文档可解析，ttlSeconds = 300；越界失败', () => {
    const loaded = load(
      'cloudfunctions-v2/models/policy-releases/subscription.ai_reservation.v1.release.json'
    )
    const definition = findBusinessPolicyDefinition('subscription', 'ai_reservation')!
    expect(definition.resolve(loaded.policy, 'subscription-ai-reservation/v1')).toEqual({
      contractVersion: 'subscription-ai-reservation/v1',
      ttlSeconds: 300
    })
    expect(
      definition.resolve(
        { contractVersion: 'subscription-ai-reservation/v1', ttlSeconds: 59 },
        'subscription-ai-reservation/v1'
      )
    ).toBeNull()
    expect(
      definition.resolve(
        { contractVersion: 'subscription-ai-reservation/v1', ttlSeconds: 3601 },
        'subscription-ai-reservation/v1'
      )
    ).toBeNull()
  })
})

describe('subscription/capability_catalog（能力目录 v1.1.0 发布）', () => {
  it('发布正文等于配置目录 currentValue（视觉诊断范围含登录临时案例），可经 CLI 类型校验', () => {
    const loaded = load(
      'cloudfunctions-v2/models/policy-releases/subscription.capability_catalog.v1-1.release.json'
    )
    expect(loaded.document.releaseVersion).toBe('subscription-capability-catalog/v1.1.0')
    expect(loaded.policy).toEqual(
      catalog.variables.find(item => item.id === 'subscription.capability.catalog')?.currentValue
    )
    const definition = findBusinessPolicyDefinition('subscription', 'capability_catalog')!
    expect(definition.resolve(loaded.policy, 'subscription-capability-catalog/v1')).not.toBeNull()
    const visual = (
      loaded.policy as { capabilities: { code: string; scope: string; tiers: string[] }[] }
    ).capabilities.find(item => item.code === 'USER_DIAGNOSIS_VISUAL')
    expect(visual).toEqual({
      code: 'USER_DIAGNOSIS_VISUAL',
      tiers: ['trial', 'member'],
      consumesAiPoints: true,
      scope: 'user_plant_or_authenticated_ephemeral'
    })
    expect(
      definition.resolve(
        { ...(loaded.policy as object), unknownCapabilityPolicy: 'allow' },
        'subscription-capability-catalog/v1'
      )
    ).toBeNull()
  })
})
