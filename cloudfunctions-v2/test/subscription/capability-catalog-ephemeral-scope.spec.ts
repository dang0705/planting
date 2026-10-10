import { describe, expect, test } from 'vitest'

import {
  CapabilityCatalogPolicyUnavailableError,
  resolveCapabilityCatalogPolicy,
  type ActiveCapabilityCatalogReleaseRecord
} from '../../src/subscription/domain/resolve-capability-catalog-policy.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'

/**
 * Expected 来源：主代理 2026-10-11 依据 README 业务流与 business-domain.md §9/§11 裁定——
 * 已登录用户可以主动选择临时植物做问诊；USER_DIAGNOSIS_VISUAL 的范围改为
 * 「本人用户植物，或本人登录临时案例」（authenticated-ephemeral-plant-case/v1），游客仍不可用。
 * 测试层次：unit_fake（纯函数，构造发布记录，不访问数据库）。
 */
function record(scope: string): ActiveCapabilityCatalogReleaseRecord {
  const policy = {
    catalogVersion: 'subscription-capability-catalog/v1',
    capabilities: [
      { code: 'USER_DIAGNOSIS_VISUAL', tiers: ['trial', 'member'], consumesAiPoints: true, scope }
    ],
    unknownCapabilityPolicy: 'deny'
  }
  const sha = calculateCanonicalJsonSha256(policy)
  return {
    internalId: '1',
    releaseRef: 'bpr_abcdefgh12',
    domainCode: 'subscription',
    policyCode: 'capability_catalog',
    schemaVersion: 'subscription-capability-catalog/v1',
    releaseVersion: 'v2.0.0',
    contentSha256: sha,
    policyJson: policy,
    status: 'active',
    effectiveAtMs: 1_000,
    expiresAtMs: null,
    verifiedAtMs: 1_000,
    activeReleaseVersion: 'v2.0.0',
    activeContentSha256: sha
  } as ActiveCapabilityCatalogReleaseRecord
}

describe('能力目录：视觉诊断可用于本人用户植物或本人登录临时案例', () => {
  test('接受 user_plant_or_authenticated_ephemeral 范围', () => {
    const catalog = resolveCapabilityCatalogPolicy(
      record('user_plant_or_authenticated_ephemeral'),
      2_000
    )
    expect(catalog.capabilities[0]?.scope).toBe('user_plant_or_authenticated_ephemeral')
  })

  test('仍拒绝未登记的范围（例如游客临时案例）', () => {
    expect(() => resolveCapabilityCatalogPolicy(record('guest_ephemeral'), 2_000)).toThrow(
      CapabilityCatalogPolicyUnavailableError
    )
  })
})
