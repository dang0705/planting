import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { resolveMvpGlassPolicy } from '../../configuration/mvp-glass-policy.js'
import type { PublishedMvpGlassResolution, PublishedMvpGlassPolicyReader } from '../application/ports/published-mvp-glass-policy-reader.js'
export type { PublishedMvpGlassResolution } from '../application/ports/published-mvp-glass-policy-reader.js'

/** 非负BIGINT必须能无损转成有效Date；不将超大数截断成普通时间。 */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const ms = Number(value)
  if (!Number.isSafeInteger(ms)) { return null }
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/**
 * 从现有业务发布与活动指针读取玻璃策略；Repository是唯一SQL入口。
 * 不新增表，不写入发布或自动激活；调用方捕获一次时间并传入，供策略快照锁定。
 */
export function createMysqlMvpGlassPolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): PublishedMvpGlassPolicyReader {
  return {
    /** 读取唯一活动版本，数据库错误保留为错误，不转换成虚假成功。 */
    read: async (capturedAt: string): Promise<PublishedMvpGlassResolution> => {
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT r.release_ref, r.domain_code, r.policy_code, r.schema_version,
                r.release_version, r.content_sha256, r.policy_json, r.status,
                CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
                a.active_release_version, a.active_content_sha256
         FROM active_business_policy_releases AS a
         JOIN business_policy_releases AS r ON r.id = a.release_internal_id
         WHERE a.domain_code = ? AND a.policy_code = ?`, ['care', 'mvp_glass'],
      ))
      if (rows.length === 0) { return { status: 'unavailable' } }
      const row = rows[0]!
      if (rows.length !== 1 || row.domain_code !== 'care' || row.policy_code !== 'mvp_glass'
        || row.schema_version !== 'mvp-glass-policy/v1'
        || typeof row.release_ref !== 'string' || !/^bpr_[A-Za-z0-9_-]{8,}$/u.test(row.release_ref)
        || typeof row.release_version !== 'string' || !/^[A-Za-z0-9._/-]{1,64}$/u.test(row.release_version)
        || row.active_release_version !== row.release_version || row.active_content_sha256 !== row.content_sha256
        || timestamp(row.verified_at_ms) === null) { return { status: 'invalid' } }
      const effectiveAt = timestamp(row.effective_at_ms)
      const expiresAt = row.expires_at_ms === null ? undefined : timestamp(row.expires_at_ms)
      if (effectiveAt === null || expiresAt === null) { return { status: 'invalid' } }
      let document: unknown = row.policy_json
      if (typeof document === 'string') {
        try { document = JSON.parse(document) as unknown } catch { return { status: 'invalid' } }
      }
      if (!document || typeof document !== 'object' || Array.isArray(document)) { return { status: 'invalid' } }
      // 元数据不得藏进正文；否则覆盖它会让额外字段绕过严格AJV。
      const allowed = ['contractVersion', 'scopeCode', 'approximation', 'singleTransmission', 'doubleTransmission', 'sourceRef']
      if (Object.keys(document).some(key => !allowed.includes(key))) { return { status: 'invalid' } }
      const resolution = resolveMvpGlassPolicy({
        ...document, releaseVersion: row.release_version, contentSha256: row.content_sha256,
        releaseStatus: row.status, effectiveAt, ...(expiresAt === undefined ? {} : { expiresAt }),
      }, capturedAt)
      return resolution.status === 'available'
        ? { status: 'available', releaseRef: row.release_ref, snapshot: resolution.snapshot }
        : resolution
    },
  }
}
