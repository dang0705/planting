import Ajv from 'ajv'

import type { UserCapabilitySnapshotDto } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  FirstLoginUserPlantLimitPolicy,
  VersionedTrialEligibilityPolicy
} from '../application/resolve-first-login-capability-snapshot.js'

/** 首次能力判定所需的两个已发布策略读取端口。 */
export type PublishedFirstUsePolicyReader = {
  /** 从注册时刻选择当时有效的试用策略，包括后来退役的历史发布。 */
  readonly readTrialEligibilityPolicy: (
    createdAtMs: number
  ) => Promise<VersionedTrialEligibilityPolicy | null>
  /** 从当前活动指针读取对应用户层级的植物上限策略。 */
  readonly readUserPlantLimitPolicy: (
    tier: UserCapabilitySnapshotDto['tier']
  ) => Promise<FirstLoginUserPlantLimitPolicy | null>
}

/** 发布表及活动指针的窄投影；BIGINT 仍以文本接收。 */
type PolicyRow = {
  /** 高熵发布引用。 */ readonly release_ref: string
  /** 策略所属业务域。 */ readonly domain_code: string
  /** 类型化策略代码。 */ readonly policy_code: string
  /** 发布正文 Schema 版本。 */ readonly schema_version: string
  /** 不可变发布版本。 */ readonly release_version: string
  /** 规范 JSON 正文摘要。 */ readonly content_sha256: string
  /** mysql2 可能返回对象或 JSON 文本。 */ readonly policy_json: unknown
  /** 发布状态。 */ readonly status: string
  /** UTC 生效时刻。 */ readonly effective_at_ms: string
  /** UTC 失效时刻；无截止为 null。 */ readonly expires_at_ms: string | null
  /** UTC 验真时刻；未验真为 null。 */ readonly verified_at_ms: string | null
  /** 活动指针冗余版本；仅当前策略读取返回。 */ readonly active_release_version?: string
  /** 活动指针冗余摘要；仅当前策略读取返回。 */ readonly active_content_sha256?: string
}

/** 试用时长的类型化发布正文。 */
type TrialDocument = { readonly durationHours: number }

/** 活跃用户植物上限的类型化发布正文。 */
type PlantLimitDocument = {
  /** 适用的登录用户层级。 */ readonly appliesToTiers: readonly UserCapabilitySnapshotDto['tier'][]
  /** 当前最多活跃植物数。 */ readonly activeUserPlantLimit: number
}

const ajv = new Ajv()
const validateTrial = ajv.compile<TrialDocument>({
  type: 'object',
  additionalProperties: false,
  required: ['durationHours'],
  properties: { durationHours: { type: 'integer', minimum: 1 } }
})
const validatePlantLimit = ajv.compile<PlantLimitDocument>({
  type: 'object',
  additionalProperties: false,
  required: ['appliesToTiers', 'activeUserPlantLimit'],
  properties: {
    appliesToTiers: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string', enum: ['free', 'trial', 'member'] }
    },
    activeUserPlantLimit: { type: 'integer', minimum: 0 }
  }
})
const timestampPattern = /^(?:0|[1-9][0-9]*)$/u
const sha256Pattern = /^[a-f0-9]{64}$/u
const releaseRefPattern = /^bpr_[A-Za-z0-9_-]{8,}$/u
const releaseVersionPattern = /^[A-Za-z0-9._/-]{1,64}$/u

/** 安全解析 MySQL BIGINT 毫秒；格式损坏时不生成权益。 */
function parseTimestamp(value: string | null): number | null {
  if (value === null) {
    return null
  }
  if (!timestampPattern.test(value)) {
    return Number.NaN
  }
  const result = Number(value)
  return Number.isSafeInteger(result) ? result : Number.NaN
}

/** 统一核对发布元数据、AJV 正文与规范摘要。 */
function verifyPolicy<T extends CanonicalJsonValue>(
  row: PolicyRow,
  code: string,
  schema: string,
  validate: (value: unknown) => value is T
): {
  readonly document: T
  readonly effectiveAtMs: number
  readonly expiresAtMs: number | null
} | null {
  const effectiveAtMs = parseTimestamp(row.effective_at_ms)
  const expiresAtMs = parseTimestamp(row.expires_at_ms)
  const verifiedAtMs = parseTimestamp(row.verified_at_ms)
  if (
    row.domain_code !== 'subscription' ||
    row.policy_code !== code ||
    row.schema_version !== schema ||
    !releaseRefPattern.test(row.release_ref) ||
    !releaseVersionPattern.test(row.release_version) ||
    !sha256Pattern.test(row.content_sha256) ||
    effectiveAtMs === null ||
    !Number.isSafeInteger(effectiveAtMs) ||
    verifiedAtMs === null ||
    !Number.isSafeInteger(verifiedAtMs) ||
    (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= effectiveAtMs))
  ) {
    return null
  }
  let document: unknown = row.policy_json
  if (typeof document === 'string') {
    try {
      document = JSON.parse(document) as unknown
    } catch {
      return null
    }
  }
  if (!validate(document) || calculateCanonicalJsonSha256(document) !== row.content_sha256) {
    return null
  }
  return { document, effectiveAtMs, expiresAtMs }
}

/** 创建真实 MySQL 发布策略读取器；缺失、失效或完整性错误均失败关闭。 */
export function createMysqlPublishedFirstUsePolicyReader(
  connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  now: () => number
): PublishedFirstUsePolicyReader {
  return {
    readTrialEligibilityPolicy: async createdAtMs => {
      if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
        return null
      }
      const rows = (await withReadConnection(connectionSource, connection =>
        connection.query(
          `SELECT release_ref, domain_code, policy_code, schema_version, release_version,
                content_sha256, policy_json, status,
                CAST(effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(verified_at_ms AS CHAR) AS verified_at_ms
         FROM business_policy_releases
         WHERE domain_code = 'subscription' AND policy_code = 'trial_eligibility'
           AND status IN ('active', 'retired') AND verified_at_ms IS NOT NULL
           AND effective_at_ms <= ? AND (expires_at_ms IS NULL OR expires_at_ms > ?)
         ORDER BY effective_at_ms DESC, id DESC LIMIT 1`,
          [createdAtMs, createdAtMs]
        )
      )) as readonly PolicyRow[]
      const row = rows[0]
      if (row === undefined) {
        return null
      }
      const verified = verifyPolicy(
        row,
        'trial_eligibility',
        'subscription-trial-eligibility/v1',
        validateTrial
      )
      return verified === null
        ? null
        : {
            sourceRef: row.release_ref,
            releaseVersion: row.release_version,
            contentSha256: row.content_sha256,
            status: row.status,
            effectiveAtMs: verified.effectiveAtMs,
            expiresAtMs: verified.expiresAtMs,
            durationHours: verified.document.durationHours
          }
    },
    readUserPlantLimitPolicy: async tier => {
      const nowMs = now()
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
        return null
      }
      const rows = (await withReadConnection(connectionSource, connection =>
        connection.query(
          `SELECT release_row.release_ref, release_row.domain_code, release_row.policy_code,
                release_row.schema_version, release_row.release_version,
                release_row.content_sha256, release_row.policy_json, release_row.status,
                CAST(release_row.effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(release_row.expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(release_row.verified_at_ms AS CHAR) AS verified_at_ms,
                active_policy.active_release_version, active_policy.active_content_sha256
         FROM active_business_policy_releases AS active_policy
         JOIN business_policy_releases AS release_row
           ON release_row.id = active_policy.release_internal_id
         WHERE active_policy.domain_code = 'subscription'
           AND active_policy.policy_code = 'user_plant_limit'`,
          []
        )
      )) as readonly PolicyRow[]
      const row = rows[0]
      if (
        rows.length !== 1 ||
        row === undefined ||
        row.status !== 'active' ||
        row.active_release_version !== row.release_version ||
        row.active_content_sha256 !== row.content_sha256
      ) {
        return null
      }
      const verified = verifyPolicy(
        row,
        'user_plant_limit',
        'subscription-user-plant-limit/v1',
        validatePlantLimit
      )
      if (
        verified === null ||
        verified.effectiveAtMs > nowMs ||
        (verified.expiresAtMs !== null && verified.expiresAtMs <= nowMs) ||
        !verified.document.appliesToTiers.includes(tier)
      ) {
        return null
      }
      return {
        sourceRef: row.release_ref,
        releaseVersion: row.release_version,
        contentSha256: row.content_sha256,
        status: row.status,
        effectiveAtMs: verified.effectiveAtMs,
        expiresAtMs: verified.expiresAtMs,
        appliesToTiers: verified.document.appliesToTiers,
        activeUserPlantLimit: verified.document.activeUserPlantLimit
      }
    }
  }
}
