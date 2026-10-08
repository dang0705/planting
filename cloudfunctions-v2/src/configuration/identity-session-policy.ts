import { createHash } from 'node:crypto'

import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv'

import { createConfigurationSnapshot } from './index.js'
import type { ConfigurationSnapshot } from './types.js'

/** 当前身份会话策略载荷的版本标识；改变字段语义时须另起合同版本。 */
const IDENTITY_SESSION_POLICY_VERSION = 'identity-session-policy/v1' as const
/** v2 在 v1 基础上追加游客签发字段（guest-token/v1，主代理 2026-10-09 裁决）；v1 摘要算法不变。 */
const IDENTITY_SESSION_POLICY_V2_VERSION = 'identity-session-policy/v2' as const
/** 配置目录已登记的统一身份策略范围编码，用于快照和审计归属。 */
const IDENTITY_SESSION_SCOPE = 'identity_sessions' as const
/** 当前合同中不允许自动静默续期。 */
// oxlint-disable-next-line no-magic-numbers -- 配置目录已确认当前续期窗口为 0，v1 禁止静默续期。
const NO_SESSION_REFRESH_HOURS = 0 as const
/** 发布正文 SHA-256 必须为小写十六进制的 64 个字符。 */
const SHA256_PATTERN = '^[a-f0-9]{64}$'
/** 发布版本只允许稳定、可审计的 ASCII 版本字符，不接受空白和控制字符。 */
const RELEASE_VERSION_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$'
/** 生效与失效时刻必须明确使用 UTC Z 标记，不接受本地时区歧义。 */
const ISO_UTC_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'

/**
 * 登录会话策略的不可变发布记录。
 * 结构只表达已经发布的策略和其版本元数据；是否有效还要通过时间窗与内容摘要校验。
 */
export interface IdentitySessionPolicyRelease {
  /** 登录用户会话策略 Schema 版本；不匹配时不得按当前结构解释发布内容。 */
  contractVersion: typeof IDENTITY_SESSION_POLICY_VERSION
  /** 对应配置目录中的 identity_sessions 策略范围，不是平台身份或用户标识。 */
  scopeCode: typeof IDENTITY_SESSION_SCOPE
  /** 不可变发布版本；后续策略调整必须创建新版本，不能覆盖旧记录。 */
  releaseVersion: string
  /** 新签发登录会话的有效小时数；必须为正整数，不设源码上限，值来自已发布版本。 */
  sessionTtlHours: number
  /** 登录会话的静默续期窗口；v1 固定为 0，启用续期必须发布新合同版本。 */
  refreshWindowHours: typeof NO_SESSION_REFRESH_HOURS
  /** 规范化策略正文的 SHA-256 小写十六进制摘要；解析时必须按固定算法重算。 */
  contentSha256: string
  /** 发布状态；只有 active 发布能被请求级策略解析器采用。 */
  releaseStatus: 'draft' | 'verified' | 'active' | 'retired'
  /** 发布生效时刻，必须为有效的 UTC ISO 8601 时间。 */
  effectiveAt: string
  /** 可选失效时刻；null 或未提供表示发布没有预先声明失效时刻。 */
  expiresAt?: string | null
}

/** v2 发布：v1 全部字段加游客签发策略；三项均来自配置目录已冻结值，无源码默认。 */
export interface IdentitySessionPolicyV2Release extends Omit<IdentitySessionPolicyRelease, 'contractVersion'> {
  /** v2 合同版本。 */
  contractVersion: typeof IDENTITY_SESSION_POLICY_V2_VERSION
  /** 游客令牌有效小时数（identity.guest.session_ttl_hours）；正整数。 */
  guestSessionTtlHours: number
  /** 每个签发来源每小时游客令牌上限（identity.guest.issuance_rate_per_hour）；正整数。 */
  guestIssuanceRatePerHour: number
  /** 是否用抖音匿名信号作为防刷键（identity.guest.douyin_anonymous_signal_enabled）。 */
  douyinAnonymousSignalEnabled: boolean
}

/** 请求级锁定的游客签发策略；只有 v2 发布才有，v1 时为 null（签发入口失败关闭）。 */
export interface GuestIssuancePolicy {
  /** 游客令牌有效小时数。 */
  readonly ttlHours: number
  /** 每来源每小时签发上限。 */
  readonly ratePerHour: number
  /** 是否启用抖音匿名信号作为限流键。 */
  readonly douyinAnonymousSignalEnabled: boolean
}

/**
 * 登录会话策略在单个请求中的不可变解析结果。
 * 保存必要策略值和通用版本快照，不包含 bearer、用户、平台主体或数据库主键。
 */
export interface IdentitySessionPolicySnapshot {
  /** 策略快照所依据的合同版本（v1 或 v2）。 */
  contractVersion: typeof IDENTITY_SESSION_POLICY_VERSION | typeof IDENTITY_SESSION_POLICY_V2_VERSION
  /** 被解析策略的配置范围；固定为身份策略目录范围。 */
  scopeCode: typeof IDENTITY_SESSION_SCOPE
  /** 本次请求锁定的不可变发布版本。 */
  releaseVersion: string
  /** 本次请求锁定的规范化策略正文 SHA-256。 */
  contentSha256: string
  /** 当前发布指定的新签发会话有效小时数。 */
  sessionTtlHours: number
  /** 当前合同允许的静默续期窗口，固定为 0。 */
  refreshWindowHours: typeof NO_SESSION_REFRESH_HOURS
  /** 被锁定策略的生效时刻。 */
  effectiveAt: string
  /** 本次请求明确提供的配置捕获时刻。 */
  capturedAt: string
  /** 可选失效时刻；未提供时快照不声明失效时刻。 */
  expiresAt?: string
  /** 通用只读配置快照；其中的版本与摘要引用参与 snapshotSha256。 */
  configurationSnapshot: Readonly<ConfigurationSnapshot>
  /** 游客签发策略；v1 发布为 null。 */
  guest: Readonly<GuestIssuancePolicy> | null
}

/** 策略未能用于签发时返回的稳定原因，不包含发布正文或数据库错误。 */
export type IdentitySessionPolicyFailureReason =
  /** 当前没有有效的 active 策略发布，必须拒绝新会话签发。 */
  | 'IDENTITY_SESSION_POLICY_UNAVAILABLE'
  /** 发布结构、时间或内容摘要有误，不能形成可信策略快照。 */
  | 'IDENTITY_SESSION_POLICY_INVALID'
  /** 发布结构可信，但捕获时刻早于其生效时刻。 */
  | 'IDENTITY_SESSION_POLICY_NOT_EFFECTIVE'

/** 登录会话策略解析结果；只有 valid 分支携带只读快照。 */
export type IdentitySessionPolicyResolution =
  | {
      /** 表示当前请求捕获到一个结构、摘要及有效期均通过校验的 active 策略。 */
      valid: true
      /** 由服务端解析出的策略快照；调用方不可修改或延长。 */
      snapshot: Readonly<IdentitySessionPolicySnapshot>
    }
  | {
      /** 表示没有可安全用于当前请求的登录会话策略。 */
      valid: false
      /** 稳定失败原因；不得把失败转成源码默认 TTL。 */
      reason: IdentitySessionPolicyFailureReason
    }

/** 登录会话策略发布的严格白名单 Schema；TTL 不设置未获批准的最大值。 */
export const identitySessionPolicyReleaseSchema: JSONSchemaType<IdentitySessionPolicyRelease> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion',
    'scopeCode',
    'releaseVersion',
    'sessionTtlHours',
    'refreshWindowHours',
    'contentSha256',
    'releaseStatus',
    'effectiveAt'
  ],
  properties: {
    contractVersion: { type: 'string', const: IDENTITY_SESSION_POLICY_VERSION },
    scopeCode: { type: 'string', const: IDENTITY_SESSION_SCOPE },
    releaseVersion: { type: 'string', pattern: RELEASE_VERSION_PATTERN },
    sessionTtlHours: { type: 'integer', minimum: 1 },
    refreshWindowHours: { type: 'integer', const: NO_SESSION_REFRESH_HOURS },
    contentSha256: { type: 'string', pattern: SHA256_PATTERN },
    releaseStatus: {
      type: 'string',
      enum: ['draft', 'verified', 'active', 'retired']
    },
    effectiveAt: { type: 'string', pattern: ISO_UTC_PATTERN },
    expiresAt: { type: 'string', pattern: ISO_UTC_PATTERN, nullable: true }
  }
}

/** v2 发布严格白名单 Schema：v1 字段加三项游客字段，任何其他字段拒绝。 */
const identitySessionPolicyV2ReleaseSchema: JSONSchemaType<IdentitySessionPolicyV2Release> = {
  ...identitySessionPolicyReleaseSchema,
  required: [...identitySessionPolicyReleaseSchema.required, 'guestSessionTtlHours', 'guestIssuanceRatePerHour', 'douyinAnonymousSignalEnabled'],
  properties: {
    ...identitySessionPolicyReleaseSchema.properties,
    contractVersion: { type: 'string', const: IDENTITY_SESSION_POLICY_V2_VERSION },
    guestSessionTtlHours: { type: 'integer', minimum: 1 },
    guestIssuanceRatePerHour: { type: 'integer', minimum: 1 },
    douyinAnonymousSignalEnabled: { type: 'boolean' }
  }
} as JSONSchemaType<IdentitySessionPolicyV2Release>

/** 创建可复用的严格发布校验器；外部未知数据必须先通过此 Schema。
 * @returns 配置 AJV 严格模式的身份策略发布校验函数。
 */
export function createIdentitySessionPolicyValidator(): ValidateFunction<IdentitySessionPolicyRelease> {
  const ajv = new Ajv({ allErrors: true, strict: true })
  return ajv.compile(identitySessionPolicyReleaseSchema)
}

/** 已编译的模块级校验器，避免每次解析都重复创建 AJV 实例。 */
const identitySessionPolicyValidator = createIdentitySessionPolicyValidator()
/** v2 模块级校验器。 */
const identitySessionPolicyV2Validator = new Ajv({ allErrors: true, strict: true }).compile(identitySessionPolicyV2ReleaseSchema)

/**
 * 按合同中固定字段顺序计算策略正文摘要。
 * 发布状态、生效时间、失效时间和版本号是发布元数据，不进入策略正文哈希。
 * @param policy 通过结构校验的身份策略字段；本函数只读取合同规定的四个字段。
 * @returns 规范化策略正文的 SHA-256 小写十六进制摘要。
 */
export function calculateIdentitySessionPolicyContentSha256(
  policy: Pick<
    IdentitySessionPolicyRelease,
    'contractVersion' | 'scopeCode' | 'sessionTtlHours' | 'refreshWindowHours'
  > | IdentitySessionPolicyV2Release
): string {
  const v1Fields = {
    contractVersion: policy.contractVersion,
    scopeCode: policy.scopeCode,
    sessionTtlHours: policy.sessionTtlHours,
    refreshWindowHours: policy.refreshWindowHours
  }
  // v2 在 v1 字段之后按固定顺序追加三项游客字段；v1 规范化正文保持不变，已发布摘要继续有效。
  const canonicalPolicy = JSON.stringify(policy.contractVersion === IDENTITY_SESSION_POLICY_V2_VERSION
    ? {
        ...v1Fields,
        guestSessionTtlHours: policy.guestSessionTtlHours,
        guestIssuanceRatePerHour: policy.guestIssuanceRatePerHour,
        douyinAnonymousSignalEnabled: policy.douyinAnonymousSignalEnabled
      }
    : v1Fields)

  return createHash('sha256').update(canonicalPolicy).digest('hex')
}

/**
 * 将日历合法性与 ISO 8601 UTC 格式同时校验，避免接受 Date.parse 会归一化的非法日期。
 * @param value 待校验的 UTC ISO 8601 时间文本。
 * @returns 有效时间对应的 Unix 毫秒数；不合法时返回 null。
 */
function parseIsoUtcTimestamp(value: string): number | null {
  if (!new RegExp(ISO_UTC_PATTERN).test(value)) {
    return null
  }

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const normalized = new Date(timestamp).toISOString()
  const expected = value.includes('.') ? normalized : normalized.replace(/\.000Z$/, 'Z')
  return value === expected ? timestamp : null
}

/**
 * 将已选择的策略发布解析成请求级只读快照。
 * 本函数不从环境变量或源码常量补策略，也不负责查询发布指针或签发会话。
 * @param release 配置仓库已选择的发布记录；null/undefined 表示当前没有可用发布。
 * @param capturedAt 调用方明确提供的快照捕获时刻，必须是有效 UTC ISO 8601 时间。
 * @returns 通过验证的不可变策略快照，或不包含发布正文的稳定失败原因。
 */
export function resolveIdentitySessionPolicySnapshot(
  release: unknown,
  capturedAt: string
): IdentitySessionPolicyResolution {
  const capturedAtMs = parseIsoUtcTimestamp(capturedAt)
  if (capturedAtMs === null) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_INVALID' }
  }

  if (release === null || release === undefined) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_UNAVAILABLE' }
  }

  if (!identitySessionPolicyValidator(release) && !identitySessionPolicyV2Validator(release)) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_INVALID' }
  }

  const effectiveAtMs = parseIsoUtcTimestamp(release.effectiveAt)
  const expiresAtMs = release.expiresAt ? parseIsoUtcTimestamp(release.expiresAt) : null
  if (
    effectiveAtMs === null ||
    (release.expiresAt !== null && release.expiresAt !== undefined && expiresAtMs === null) ||
    (expiresAtMs !== null && expiresAtMs <= effectiveAtMs) ||
    calculateIdentitySessionPolicyContentSha256(release) !== release.contentSha256
  ) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_INVALID' }
  }

  if (release.releaseStatus !== 'active') {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_UNAVAILABLE' }
  }

  if (capturedAtMs < effectiveAtMs) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_NOT_EFFECTIVE' }
  }

  if (expiresAtMs !== null && capturedAtMs >= expiresAtMs) {
    return { valid: false, reason: 'IDENTITY_SESSION_POLICY_UNAVAILABLE' }
  }

  const configurationSnapshot = createConfigurationSnapshot({
    policyReleases: [
      {
        scopeCode: release.scopeCode,
        releaseVersion: release.releaseVersion,
        sha256: release.contentSha256
      }
    ],
    providerReleases: [],
    capturedAt
  })
  const snapshot = Object.freeze({
    contractVersion: release.contractVersion,
    scopeCode: release.scopeCode,
    releaseVersion: release.releaseVersion,
    contentSha256: release.contentSha256,
    sessionTtlHours: release.sessionTtlHours,
    refreshWindowHours: release.refreshWindowHours,
    effectiveAt: release.effectiveAt,
    capturedAt,
    ...(release.expiresAt ? { expiresAt: release.expiresAt } : {}),
    configurationSnapshot,
    guest: release.contractVersion === IDENTITY_SESSION_POLICY_V2_VERSION
      ? Object.freeze({
          ttlHours: release.guestSessionTtlHours,
          ratePerHour: release.guestIssuanceRatePerHour,
          douyinAnonymousSignalEnabled: release.douyinAnonymousSignalEnabled
        })
      : null
  })

  return { valid: true, snapshot }
}
