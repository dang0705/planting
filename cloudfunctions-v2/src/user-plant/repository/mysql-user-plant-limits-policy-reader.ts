import {
  resolveUserPlantLimitsPolicySnapshot,
  type UserPlantLimitsPolicySnapshot
} from '../../configuration/user-plant-limits-policy.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 策略所属业务域代码。 */
const domainCode = 'user-plant'
/** 策略代码，与配置目录裁决组 userplant_limits 一致。 */
const policyCode = 'userplant_limits'
/** 当前唯一支持的正文 Schema 版本。 */
const schemaVersion = 'user-plant-limits-policy/v1'
/** 正文允许的字段；发布元数据不得藏进正文覆盖读回值。 */
const allowedBodyKeys = ['contractVersion', 'scopeCode', 'guestMaxCasesPerSession', 'authenticatedEphemeralCaseTtlHours']

/** 非负 BIGINT 文本转 UTC ISO；不可无损表示时返回 null。 */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const ms = Number(value)
  if (!Number.isSafeInteger(ms)) { return null }
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** 用户植物限额策略读取端口：无可信活动发布时返回 null，调用方必须拒绝新建临时案例。 */
export interface UserPlantLimitsPolicyReader {
  /** 读取并解析唯一活动发布；数据库错误向上传播，不转换成成功。 */
  readonly read: (capturedAt: string) => Promise<Readonly<UserPlantLimitsPolicySnapshot> | null>
}

/**
 * 从既有业务策略发布表与活动指针读取 user-plant/userplant_limits；Repository 是唯一 SQL 入口。
 * 不新增表、不写入、不回退源码默认值。
 */
export function createMysqlUserPlantLimitsPolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): UserPlantLimitsPolicyReader {
  return {
    read: async capturedAt => {
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT r.release_ref, r.domain_code, r.policy_code, r.schema_version,
                r.release_version, r.content_sha256, r.policy_json, r.status,
                CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
                a.active_release_version, a.active_content_sha256
         FROM active_business_policy_releases AS a
         JOIN business_policy_releases AS r ON r.id = a.release_internal_id
         WHERE a.domain_code = ? AND a.policy_code = ?`, [domainCode, policyCode]
      ))
      if (rows.length !== 1) { return null }
      const row = rows[0]!
      if (row.domain_code !== domainCode || row.policy_code !== policyCode || row.schema_version !== schemaVersion
        || typeof row.release_version !== 'string' || row.active_release_version !== row.release_version
        || row.active_content_sha256 !== row.content_sha256 || timestamp(row.verified_at_ms) === null) { return null }
      const effectiveAt = timestamp(row.effective_at_ms)
      const expiresAt = row.expires_at_ms === null ? null : timestamp(row.expires_at_ms)
      if (effectiveAt === null || (row.expires_at_ms !== null && expiresAt === null)) { return null }
      let document: unknown = row.policy_json
      if (typeof document === 'string') {
        try { document = JSON.parse(document) as unknown } catch { return null }
      }
      if (!document || typeof document !== 'object' || Array.isArray(document)
        || Object.keys(document).some(key => !allowedBodyKeys.includes(key))) { return null }
      const resolution = resolveUserPlantLimitsPolicySnapshot({
        ...document, releaseVersion: row.release_version, contentSha256: row.content_sha256,
        releaseStatus: row.status, effectiveAt, expiresAt
      }, capturedAt)
      return resolution.valid ? resolution.snapshot : null
    }
  }
}
