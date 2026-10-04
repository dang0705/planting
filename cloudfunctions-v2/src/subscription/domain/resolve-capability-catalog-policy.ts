import type { ProductCapability, UserCapabilitySnapshotDto } from '../../contracts/types.js'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'

/** 已发布能力目录中的四种登录用户层级。 */
export type CapabilityCatalogTier = 'guest' | UserCapabilitySnapshotDto['tier']

/** 已发布能力目录单项；这里只保留裁决快照需要的字段。 */
export type CapabilityCatalogEntry = {
  /** 已冻结合同登记的产品能力代码。 */
  readonly code: ProductCapability
  /** 该能力目录项可适用的主体层级。 */
  readonly tiers: readonly CapabilityCatalogTier[]
  /** 该能力执行是否必须走 AI 点数额度。 */
  readonly consumesAiPoints: boolean
  /** 受控业务范围；仅接受当前目录已登记值。 */
  readonly scope: 'public' | 'user_plant' | 'user' | 'reward_grant'
}

/** 从活动指针 JOIN 回来的能力策略发布完整性投影。 */
export type ActiveCapabilityCatalogReleaseRecord = {
  /** 能力策略发布的数据库内部键，只用于快照外键写入。 */
  readonly internalId: string
  /** 可审计且不含数据库内部键的发布引用。 */
  readonly releaseRef: string
  /** 发布策略所属业务域。 */
  readonly domainCode: string
  /** 能力目录所采用的已发布策略代码。 */
  readonly policyCode: string
  /** 发布策略 Schema 版本。 */
  readonly schemaVersion: string
  /** 不可变发布版本。 */
  readonly releaseVersion: string
  /** 发布正文规范化 JSON SHA-256。 */
  readonly contentSha256: string
  /** 数据库 JSON 列原值，可能已由驱动解析。 */
  readonly policyJson: unknown
  /** 发布行当前状态。 */
  readonly status: string
  /** 发布生效时间，UTC 毫秒。 */
  readonly effectiveAtMs: number
  /** 发布失效时间，UTC 毫秒；null 表示无预设终止时刻。 */
  readonly expiresAtMs: number | null
  /** 发布验真时间，UTC 毫秒。 */
  readonly verifiedAtMs: number | null
  /** 活动指针冗余保存的发布版本。 */
  readonly activeReleaseVersion: string
  /** 活动指针冗余保存的发布正文 SHA-256。 */
  readonly activeContentSha256: string
}

/** 通过发布字段、活动指针、有效期和摘要检查后的能力目录。 */
export type VerifiedCapabilityCatalog = {
  /** 能力策略发布内部键，只供 Repository 建立外键。 */
  readonly internalId: string
  /** 可回放的发布引用。 */
  readonly releaseRef: string
  /** 不可变策略版本；也是 CapabilitySnapshot DTO.policyVersion。 */
  readonly releaseVersion: string
  /** 已校验的发布正文摘要。 */
  readonly contentSha256: string
  /** 发布时间策略失效时刻，null 表示无预设失效。 */
  readonly expiresAtMs: number | null
  /** 由发布正文顺序筛出的能力列表。 */
  readonly capabilities: readonly CapabilityCatalogEntry[]
}

/** 能力目录缺失、版本不匹配、正文损坏或当前不生效时的内部失败关闭错误。 */
export class CapabilityCatalogPolicyUnavailableError extends Error {
  /** 稳定内部原因，供调用边界脱敏映射；不包含 SQL、发布正文或用户值。 */
  readonly reason = 'CAPABILITY_CATALOG_UNAVAILABLE'

  constructor() {
    super('当前没有可验证且有效的能力目录策略')
    this.name = 'CapabilityCatalogPolicyUnavailableError'
  }
}

const expectedDomainCode = 'subscription'
const expectedPolicyCode = 'capability_catalog'
const expectedSchemaVersion = 'subscription-capability-catalog/v1'
const expectedCatalogVersion = 'subscription-capability-catalog/v1'
const expectedUnknownCapabilityPolicy = 'deny'
const minimumTimestampMs = 0
const zero = Number('0')
const sha256Format = /^[a-f0-9]{64}$/u
const releaseRefFormat = /^bpr_[A-Za-z0-9_-]{8,}$/u
const releaseVersionFormat = /^[A-Za-z0-9._/-]{1,64}$/u
const internalIdFormat = /^[1-9][0-9]*$/u
const registeredCapabilities = new Set<ProductCapability>([
  'PLANT_IDENTIFICATION',
  'FIXED_DIAGNOSIS',
  'INDEPENDENT_WATERING',
  'SOIL_VISUAL_EVIDENCE',
  'USER_PLANT_CREATE',
  'POINTS_LEVEL_QUERY',
  'REWARDED_AI',
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])
const registeredTiers = new Set<CapabilityCatalogTier>(['guest', 'free', 'trial', 'member'])
const registeredScopes = new Set(['public', 'user_plant', 'user', 'reward_grant'])

/** 判断未知 JSON 是否为可计算规范摘要的完整 JSON 值。 */
function isCanonicalJsonValue(value: unknown): value is CanonicalJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(isCanonicalJsonValue)
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isCanonicalJsonValue)
  }
  return false
}

/** 将 mysql2 JSON 投影收窄为对象；正文格式错误时统一失败关闭。 */
function parsePolicyDocument(value: unknown): Record<string, unknown> {
  let parsed: unknown = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      throw new CapabilityCatalogPolicyUnavailableError()
    }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !isCanonicalJsonValue(parsed)
  ) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }
  return parsed as Record<string, unknown>
}

/** 校验单项目录结构、枚举和重复值，不接受未登记能力或任意 scope。 */
function parseCapabilityEntry(value: unknown): CapabilityCatalogEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }
  const entry = value as Record<string, unknown>
  const expectedKeys = ['code', 'consumesAiPoints', 'scope', 'tiers']
  if (
    Object.keys(entry).sort().join('|') !== expectedKeys.join('|') ||
    typeof entry.code !== 'string' ||
    !registeredCapabilities.has(entry.code as ProductCapability) ||
    typeof entry.consumesAiPoints !== 'boolean' ||
    typeof entry.scope !== 'string' ||
    !registeredScopes.has(entry.scope) ||
    !Array.isArray(entry.tiers) ||
    entry.tiers.length === zero ||
    !entry.tiers.every(
      tier => typeof tier === 'string' && registeredTiers.has(tier as CapabilityCatalogTier)
    ) ||
    new Set(entry.tiers).size !== entry.tiers.length
  ) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }
  return {
    code: entry.code as ProductCapability,
    tiers: entry.tiers as CapabilityCatalogTier[],
    consumesAiPoints: entry.consumesAiPoints,
    scope: entry.scope as CapabilityCatalogEntry['scope']
  }
}

/** 验证活动能力目录的来源、内容摘要、适用时间和目录正文后返回最小可信投影。 */
export function resolveCapabilityCatalogPolicy(
  record: ActiveCapabilityCatalogReleaseRecord | null,
  nowMs: number
): VerifiedCapabilityCatalog {
  if (
    record === null ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < minimumTimestampMs ||
    !internalIdFormat.test(record.internalId) ||
    !releaseRefFormat.test(record.releaseRef) ||
    record.domainCode !== expectedDomainCode ||
    record.policyCode !== expectedPolicyCode ||
    record.schemaVersion !== expectedSchemaVersion ||
    !releaseVersionFormat.test(record.releaseVersion) ||
    !sha256Format.test(record.contentSha256) ||
    record.status !== 'active' ||
    !Number.isSafeInteger(record.effectiveAtMs) ||
    record.effectiveAtMs < minimumTimestampMs ||
    record.effectiveAtMs > nowMs ||
    (record.expiresAtMs !== null &&
      (!Number.isSafeInteger(record.expiresAtMs) ||
        record.expiresAtMs <= nowMs ||
        record.expiresAtMs <= record.effectiveAtMs)) ||
    record.verifiedAtMs === null ||
    !Number.isSafeInteger(record.verifiedAtMs) ||
    record.verifiedAtMs > nowMs ||
    record.activeReleaseVersion !== record.releaseVersion ||
    record.activeContentSha256 !== record.contentSha256
  ) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }

  const policy = parsePolicyDocument(record.policyJson)
  if (
    Object.keys(policy).sort().join('|') !==
      'capabilities|catalogVersion|unknownCapabilityPolicy' ||
    policy.catalogVersion !== expectedCatalogVersion ||
    policy.unknownCapabilityPolicy !== expectedUnknownCapabilityPolicy ||
    !Array.isArray(policy.capabilities)
  ) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }
  let contentSha256: string
  try {
    contentSha256 = calculateCanonicalJsonSha256(policy as CanonicalJsonValue)
  } catch {
    throw new CapabilityCatalogPolicyUnavailableError()
  }
  if (contentSha256 !== record.contentSha256) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }

  const capabilities = policy.capabilities.map(parseCapabilityEntry)
  const capabilityCodes = new Set(capabilities.map(capability => capability.code))
  if (capabilities.length === zero || capabilityCodes.size !== capabilities.length) {
    throw new CapabilityCatalogPolicyUnavailableError()
  }

  return {
    internalId: record.internalId,
    releaseRef: record.releaseRef,
    releaseVersion: record.releaseVersion,
    contentSha256,
    expiresAtMs: record.expiresAtMs,
    capabilities
  }
}
