import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import { resolveCapabilityCatalogPolicy } from '../../subscription/domain/resolve-capability-catalog-policy.js'
import type { TypedPolicyDefinition } from './typed-policy.js'

/**
 * 能力目录（subscription / capability_catalog，正文 `subscription-capability-catalog/v1`）的发布校验入口。
 *
 * 通俗说明：能力目录原本只有运行时读取校验（resolveCapabilityCatalogPolicy），这里把同一套校验接到策略发布 CLI 上，
 * 让新版本（例如 2026-10-11 视觉诊断范围扩展到登录临时案例）也能走 validate → publish → activate，不另写一套规则。
 */
export type SubscriptionCapabilityCatalogDocument = Readonly<Record<string, unknown>>

/** 用运行时同一套目录校验检查正文（构造一条与正文一致的已激活发布记录）。 */
function resolveDocument(document: unknown): SubscriptionCapabilityCatalogDocument | null {
  let contentSha256: string
  try {
    contentSha256 = calculateCanonicalJsonSha256(document as CanonicalJsonValue)
    resolveCapabilityCatalogPolicy(
      {
        internalId: '1',
        releaseRef: 'bpr_cli_validation',
        domainCode: 'subscription',
        policyCode: 'capability_catalog',
        schemaVersion: 'subscription-capability-catalog/v1',
        releaseVersion: 'cli-validation',
        contentSha256,
        policyJson: document,
        status: 'active',
        effectiveAtMs: 0,
        expiresAtMs: null,
        verifiedAtMs: 0,
        activeReleaseVersion: 'cli-validation',
        activeContentSha256: contentSha256
      } as never,
      1
    )
  } catch {
    // 结构、枚举、摘要任一不合法（CapabilityCatalogPolicyUnavailableError）都按「不可发布」处理；非预期异常同样失败关闭。
    return null
  }
  return Object.freeze(structuredClone(document as Record<string, unknown>))
}

/** 策略定义：只接受 subscription-capability-catalog/v1 正文，校验规则与运行时完全一致。 */
export const SUBSCRIPTION_CAPABILITY_CATALOG_POLICY: TypedPolicyDefinition<SubscriptionCapabilityCatalogDocument> =
  Object.freeze({
    domainCode: 'subscription',
    policyCode: 'capability_catalog',
    schemaVersions: Object.freeze(['subscription-capability-catalog/v1']),
    resolve: (document: unknown, schemaVersion: string) =>
      schemaVersion === 'subscription-capability-catalog/v1' ? resolveDocument(document) : null
  })
