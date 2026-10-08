import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { resolveIdentitySessionPolicySnapshot, type IdentitySessionPolicySnapshot } from '../../configuration/identity-session-policy.js'

/** 正文允许的字段；元数据不得藏进正文。 */
const allowedBodyKeys = ['contractVersion', 'scopeCode', 'sessionTtlHours', 'refreshWindowHours']

/** 非负 BIGINT 文本转 UTC ISO；不可表示时返回 null。 */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const ms = Number(value)
  if (!Number.isSafeInteger(ms)) { return null }
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** 登录会话策略读取器端口：无可信活动发布时返回 null，调用方必须拒签。 */
export interface IdentitySessionPolicyReader {
  /** 读取并解析唯一活动版本；数据库错误向上传播，不转换成成功。 */
  readonly read: (capturedAt: string) => Promise<Readonly<IdentitySessionPolicySnapshot> | null>
}

/**
 * 从既有业务策略发布与活动指针读取 identity/identity_sessions；Repository 是唯一 SQL 入口。
 * 不新增表、不写入、不回退源码默认 TTL。
 */
export function createMysqlIdentitySessionPolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): IdentitySessionPolicyReader {
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
         WHERE a.domain_code = ? AND a.policy_code = ?`, ['identity', 'identity_sessions'],
      ))
      if (rows.length !== 1) { return null }
      const row = rows[0]!
      if (row.domain_code !== 'identity' || row.policy_code !== 'identity_sessions' || row.schema_version !== 'identity-session-policy/v1'
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
      const resolution = resolveIdentitySessionPolicySnapshot({
        ...document, releaseVersion: row.release_version, contentSha256: row.content_sha256,
        releaseStatus: row.status, effectiveAt, expiresAt,
      }, capturedAt)
      return resolution.valid ? resolution.snapshot : null
    },
  }
}
