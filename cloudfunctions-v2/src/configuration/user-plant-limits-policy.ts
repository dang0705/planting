import { createHash } from 'node:crypto'

import Ajv, { type JSONSchemaType } from 'ajv'

import { createConfigurationSnapshot } from './index.js'
import type { ConfigurationSnapshot } from './types.js'

/** 用户植物限额策略载荷的合同版本；字段语义变化必须另起版本。 */
const USER_PLANT_LIMITS_POLICY_VERSION = 'user-plant-limits-policy/v1' as const
/** 配置目录登记的用户植物限额策略范围编码（裁决组 userplant_limits）。 */
const USER_PLANT_LIMITS_SCOPE = 'userplant_limits' as const
/** 发布正文 SHA-256 必须为小写十六进制 64 字符。 */
const SHA256_PATTERN = '^[a-f0-9]{64}$'
/** 发布版本只允许稳定、可审计的 ASCII 版本字符。 */
const RELEASE_VERSION_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$'
/** 生效与失效时刻必须明确使用 UTC Z 标记。 */
const ISO_UTC_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'

/**
 * 用户植物限额策略的不可变发布记录（temporary-case/v1 §2 策略）。
 * 两项数值只来自已发布版本；源码不提供任何默认值。
 */
export interface UserPlantLimitsPolicyRelease {
  /** 策略载荷合同版本；不匹配时不得按当前结构解释发布内容。 */
  contractVersion: typeof USER_PLANT_LIMITS_POLICY_VERSION
  /** 配置目录中的 userplant_limits 策略范围，不是用户或植物标识。 */
  scopeCode: typeof USER_PLANT_LIMITS_SCOPE
  /** 不可变发布版本；调整数值必须创建新版本，不能覆盖旧记录。 */
  releaseVersion: string
  /** 单个游客会话最多同时持有的 active 且未过期临时案例数（user-plant.guest.max_cases_per_session），正整数。 */
  guestMaxCasesPerSession: number
  /** 临时案例有效小时数（user-plant.authenticated_ephemeral.case_ttl_hours），正整数；仅用于登录临时案例，游客案例随游客会话失效。 */
  authenticatedEphemeralCaseTtlHours: number
  /** 规范化策略正文 SHA-256 小写十六进制摘要；解析时按固定字段顺序重算。 */
  contentSha256: string
  /** 发布状态；只有 active 发布能被请求级解析采用。 */
  releaseStatus: 'draft' | 'verified' | 'active' | 'retired'
  /** 发布生效时刻，带 Z 的 UTC ISO 8601。 */
  effectiveAt: string
  /** 可选失效时刻；null 或缺省表示发布没有预先声明失效时刻。 */
  expiresAt?: string | null
}

/** 单个请求锁定的用户植物限额只读快照；不含用户、会话或数据库主键。 */
export interface UserPlantLimitsPolicySnapshot {
  /** 快照所依据的策略合同版本。 */
  readonly contractVersion: typeof USER_PLANT_LIMITS_POLICY_VERSION
  /** 被解析策略的配置范围，固定为 userplant_limits。 */
  readonly scopeCode: typeof USER_PLANT_LIMITS_SCOPE
  /** 本次请求锁定的不可变发布版本。 */
  readonly releaseVersion: string
  /** 本次请求锁定的规范化策略正文 SHA-256。 */
  readonly contentSha256: string
  /** 本次请求生效的游客会话临时案例上限。 */
  readonly guestMaxCasesPerSession: number
  /** 本次请求生效的临时案例有效小时数。 */
  readonly authenticatedEphemeralCaseTtlHours: number
  /** 被锁定策略的生效时刻。 */
  readonly effectiveAt: string
  /** 调用方明确提供的配置捕获时刻。 */
  readonly capturedAt: string
  /** 可选失效时刻；发布未声明时不出现。 */
  readonly expiresAt?: string
  /** 通用只读配置快照，记录版本与摘要引用以便审计回放。 */
  readonly configurationSnapshot: Readonly<ConfigurationSnapshot>
}

/** 策略不可用于当前请求时的稳定原因；不含发布正文或数据库错误。 */
export type UserPlantLimitsPolicyFailureReason =
  /** 没有可用的 active 发布或发布已失效，调用方必须拒绝新建临时案例。 */
  | 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE'
  /** 发布结构、时间或摘要不可信。 */
  | 'USER_PLANT_LIMITS_POLICY_INVALID'
  /** 发布可信但尚未到生效时刻。 */
  | 'USER_PLANT_LIMITS_POLICY_NOT_EFFECTIVE'

/** 用户植物限额策略解析结果；只有 valid 分支携带快照。 */
export type UserPlantLimitsPolicyResolution =
  | {
      /** 表示策略结构、摘要与有效期全部通过校验。 */
      valid: true
      /** 服务端解析出的只读策略快照。 */
      snapshot: Readonly<UserPlantLimitsPolicySnapshot>
    }
  | {
      /** 表示没有可安全用于当前请求的限额策略。 */
      valid: false
      /** 稳定失败原因；不得转换成源码默认值。 */
      reason: UserPlantLimitsPolicyFailureReason
    }

/** 发布记录严格白名单 Schema；数值只约束为正整数，不内置运营上限。 */
const userPlantLimitsPolicyReleaseSchema: JSONSchemaType<UserPlantLimitsPolicyRelease> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion', 'scopeCode', 'releaseVersion', 'guestMaxCasesPerSession',
    'authenticatedEphemeralCaseTtlHours', 'contentSha256', 'releaseStatus', 'effectiveAt'
  ],
  properties: {
    contractVersion: { type: 'string', const: USER_PLANT_LIMITS_POLICY_VERSION },
    scopeCode: { type: 'string', const: USER_PLANT_LIMITS_SCOPE },
    releaseVersion: { type: 'string', pattern: RELEASE_VERSION_PATTERN },
    guestMaxCasesPerSession: { type: 'integer', minimum: 1 },
    authenticatedEphemeralCaseTtlHours: { type: 'integer', minimum: 1 },
    contentSha256: { type: 'string', pattern: SHA256_PATTERN },
    releaseStatus: { type: 'string', enum: ['draft', 'verified', 'active', 'retired'] },
    effectiveAt: { type: 'string', pattern: ISO_UTC_PATTERN },
    expiresAt: { type: 'string', pattern: ISO_UTC_PATTERN, nullable: true }
  }
}

/** 模块级严格校验器，避免每次请求重复编译。 */
const validateRelease = new Ajv({ allErrors: true, strict: true, strictNumbers: true }).compile(userPlantLimitsPolicyReleaseSchema)

/**
 * 按合同固定字段顺序计算策略正文摘要：contractVersion, scopeCode, guestMaxCasesPerSession,
 * authenticatedEphemeralCaseTtlHours。发布元数据（版本、状态、时间）不进入正文哈希。
 * @param policy 只读取上述四个正文字段。
 * @returns 规范化正文的 SHA-256 小写十六进制摘要。
 */
export function calculateUserPlantLimitsPolicyContentSha256(
  policy: Pick<UserPlantLimitsPolicyRelease, 'contractVersion' | 'scopeCode' | 'guestMaxCasesPerSession' | 'authenticatedEphemeralCaseTtlHours'>
): string {
  const canonical = JSON.stringify({
    contractVersion: policy.contractVersion,
    scopeCode: policy.scopeCode,
    guestMaxCasesPerSession: policy.guestMaxCasesPerSession,
    authenticatedEphemeralCaseTtlHours: policy.authenticatedEphemeralCaseTtlHours
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * 同时校验 UTC ISO 格式与日历合法性，拒绝 Date.parse 会自动修正的非法日期。
 * @returns 合法时返回 Unix 毫秒，否则 null。
 */
function parseIsoUtcTimestamp(value: string): number | null {
  if (!new RegExp(ISO_UTC_PATTERN).test(value)) { return null }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) { return null }
  const normalized = new Date(timestamp).toISOString()
  const expected = value.includes('.') ? normalized : normalized.replace(/\.000Z$/u, 'Z')
  return value === expected ? timestamp : null
}

/**
 * 把已选择的发布解析为请求级只读快照。
 * 不查询数据库、不读取环境变量、不回退源码常量。
 * @param release 读取器组装的发布记录；null/undefined 表示当前没有发布。
 * @param capturedAt 调用方明确提供的捕获时刻（UTC ISO）。
 */
export function resolveUserPlantLimitsPolicySnapshot(release: unknown, capturedAt: string): UserPlantLimitsPolicyResolution {
  const capturedAtMs = parseIsoUtcTimestamp(capturedAt)
  if (capturedAtMs === null) { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_INVALID' } }
  if (release === null || release === undefined) { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' } }
  if (!validateRelease(release)) { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_INVALID' } }
  const effectiveAtMs = parseIsoUtcTimestamp(release.effectiveAt)
  const hasExpiry = release.expiresAt !== null && release.expiresAt !== undefined
  const expiresAtMs = hasExpiry ? parseIsoUtcTimestamp(release.expiresAt as string) : null
  if (
    effectiveAtMs === null ||
    (hasExpiry && expiresAtMs === null) ||
    (expiresAtMs !== null && expiresAtMs <= effectiveAtMs) ||
    calculateUserPlantLimitsPolicyContentSha256(release) !== release.contentSha256
  ) {
    return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_INVALID' }
  }
  if (release.releaseStatus !== 'active') { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' } }
  if (capturedAtMs < effectiveAtMs) { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_NOT_EFFECTIVE' } }
  if (expiresAtMs !== null && capturedAtMs >= expiresAtMs) { return { valid: false, reason: 'USER_PLANT_LIMITS_POLICY_UNAVAILABLE' } }

  const configurationSnapshot = createConfigurationSnapshot({
    policyReleases: [{ scopeCode: release.scopeCode, releaseVersion: release.releaseVersion, sha256: release.contentSha256 }],
    providerReleases: [],
    capturedAt
  })
  const snapshot: Readonly<UserPlantLimitsPolicySnapshot> = Object.freeze({
    contractVersion: release.contractVersion,
    scopeCode: release.scopeCode,
    releaseVersion: release.releaseVersion,
    contentSha256: release.contentSha256,
    guestMaxCasesPerSession: release.guestMaxCasesPerSession,
    authenticatedEphemeralCaseTtlHours: release.authenticatedEphemeralCaseTtlHours,
    effectiveAt: release.effectiveAt,
    capturedAt,
    ...(hasExpiry ? { expiresAt: release.expiresAt as string } : {}),
    configurationSnapshot
  })
  return { valid: true, snapshot }
}
