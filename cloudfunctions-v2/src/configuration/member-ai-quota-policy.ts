import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv'

import { calculateCanonicalJsonSha256 } from '../foundation/json/canonical-json-sha256.js'

/** 会员周期额度发布正文；具体点数只能来自已核验的策略发布。 */
export type MemberAiQuotaPolicy = {
  /** 每个已核验订阅周期发放的正整数 AI 点数，不由客户端指定。 */
  readonly aiPointsPerCycle: number
}

/** Repository 从策略发布与活动指针读回的最小受控数据，不可由公开请求构造。 */
export type MemberAiQuotaPolicyRelease = {
  /** 策略所属业务域，必须是 subscription。 */
  readonly domainCode: string
  /** 类型化策略代码，固定指向会员周期额度而非任意键值。 */
  readonly policyCode: string
  /** 策略正文的结构版本，当前为 member-ai-quota-policy/v1。 */
  readonly schemaVersion: string
  /** 不可变发布版本；既有 grant 永远引用发放当时的版本。 */
  readonly releaseVersion: string
  /** 发布正文规范化 JSON 的 SHA-256，用于防止版本与内容错配。 */
  readonly contentSha256: string
  /** 从 MySQL JSON 字段读回、尚未通过 Schema 的未知正文。 */
  readonly policyJson: unknown
  /** 发布状态；只有 active 可用于新额度发放。 */
  readonly status: string
  /** 策略最早可生效的 UTC 毫秒。 */
  readonly effectiveAtMs: number
  /** 策略失效 UTC 毫秒；空值表示没有预定失效时间。 */
  readonly expiresAtMs: number | null
  /** 当前活动指针记录的发布版本，必须与发布行一致。 */
  readonly activeReleaseVersion: string
  /** 当前活动指针记录的正文摘要，必须与发布行一致。 */
  readonly activeContentSha256: string
}

/** 通过全部结构、摘要和活动指针校验后的只读额度策略。 */
export type MemberAiQuotaPolicySnapshot = {
  /** 本次新周期发放的额度点数。 */
  readonly aiPointsPerCycle: number
  /** 本次发放必须写入 grant.policy_version 的不可变版本。 */
  readonly releaseVersion: string
  /** 该发布正文的规范化 SHA-256，供内部读回与审计。 */
  readonly contentSha256: string
}

/** 策略解析的封闭结果；失败时不提供默认额度。 */
export type MemberAiQuotaPolicyResolution =
  | {
      /** 已通过发布身份、正文、摘要、指针和生效时间的完整校验。 */
      readonly valid: true
      /** 本请求可以用于会员周期发放的不可变策略快照。 */
      readonly snapshot: Readonly<MemberAiQuotaPolicySnapshot>
    }
  | {
      /** 任一发布校验失败，不允许由目录或代码默认值补足额度。 */
      readonly valid: false
      /** 内部失败分类，不得直接暴露发布内容或凭证。 */
      readonly reason:
        | 'MEMBER_AI_QUOTA_POLICY_UNAVAILABLE'
        | 'MEMBER_AI_QUOTA_POLICY_INVALID'
        | 'MEMBER_AI_QUOTA_POLICY_NOT_EFFECTIVE'
    }

/** 与版本化 JSON Schema 同步的运行时正文白名单；禁止额外字段潜入策略。 */
const memberPolicySchema: JSONSchemaType<MemberAiQuotaPolicy> = {
  type: 'object',
  additionalProperties: false,
  required: ['aiPointsPerCycle'],
  properties: {
    aiPointsPerCycle: { type: 'integer', minimum: 1 }
  }
}

/** 发布版本遵守合同通用 `{policy-domain}/YYYY-MM-DD.revision`，策略身份由独立字段校验。 */
const releaseVersionPattern = /^[a-z][a-z0-9.-]*\/\d{4}-\d{2}-\d{2}\.\d+$/u
/** SHA-256 规范小写十六进制格式。 */
const sha256Pattern = /^[a-f0-9]{64}$/u
/** 策略发布版本字段的 DDL 最大长度。 */
const maxReleaseVersionLength = 64

/** 创建严格的 AJV 正文校验器；发布者与消费者使用相同结构边界。 */
export function createMemberAiQuotaPolicyValidator(): ValidateFunction<MemberAiQuotaPolicy> {
  return new Ajv({ allErrors: false, strict: true }).compile(memberPolicySchema)
}

const validateMemberPolicy = createMemberAiQuotaPolicyValidator()

/**
 * 从已读取的发布行与活动指针形成请求级只读快照。
 * 这只证明策略结构和版本可信；周期支付真实性由订阅 Repository 独立核验。
 */
export function resolveMemberAiQuotaPolicySnapshot(
  release: MemberAiQuotaPolicyRelease | null,
  nowMs: number
): MemberAiQuotaPolicyResolution {
  if (release === null) {
    return { valid: false, reason: 'MEMBER_AI_QUOTA_POLICY_UNAVAILABLE' }
  }
  if (
    release.domainCode !== 'subscription' ||
    release.policyCode !== 'subscription.member.ai_points_per_cycle' ||
    release.schemaVersion !== 'member-ai-quota-policy/v1' ||
    !releaseVersionPattern.test(release.releaseVersion) ||
    release.releaseVersion.length > maxReleaseVersionLength ||
    !sha256Pattern.test(release.contentSha256) ||
    release.activeReleaseVersion !== release.releaseVersion ||
    release.activeContentSha256 !== release.contentSha256 ||
    !validateMemberPolicy(release.policyJson) ||
    calculateCanonicalJsonSha256(release.policyJson) !== release.contentSha256 ||
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(release.effectiveAtMs) ||
    (release.expiresAtMs !== null && !Number.isSafeInteger(release.expiresAtMs))
  ) {
    return { valid: false, reason: 'MEMBER_AI_QUOTA_POLICY_INVALID' }
  }
  if (release.status !== 'active') {
    return { valid: false, reason: 'MEMBER_AI_QUOTA_POLICY_UNAVAILABLE' }
  }
  if (
    nowMs < release.effectiveAtMs ||
    (release.expiresAtMs !== null && nowMs >= release.expiresAtMs)
  ) {
    return { valid: false, reason: 'MEMBER_AI_QUOTA_POLICY_NOT_EFFECTIVE' }
  }
  return {
    valid: true,
    snapshot: Object.freeze({
      aiPointsPerCycle: release.policyJson.aiPointsPerCycle,
      releaseVersion: release.releaseVersion,
      contentSha256: release.contentSha256
    })
  }
}
