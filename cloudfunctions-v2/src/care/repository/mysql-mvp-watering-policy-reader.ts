import { resolveMvpWateringPolicy, type MvpWateringPolicySnapshot } from '../../configuration/mvp-watering-policy.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 读取结果：可用时附带发布引用以写入算法清单；其余为稳定分类。 */
export type PublishedMvpWateringResolution =
  | {
      /** 活动发布结构、摘要与时间全部可信。 */
      readonly status: 'available'
      /** 不可变发布公开引用，只进入内部算法清单。 */
      readonly releaseRef: string
      /** 请求级只读策略快照。 */
      readonly snapshot: Readonly<MvpWateringPolicySnapshot>
    }
  | {
      /** 无活动发布、记录不可信或尚未生效。 */
      readonly status: 'unavailable' | 'invalid' | 'not_effective'
    }

/** MVP 浇水策略读取端口。 */
export interface PublishedMvpWateringPolicyReader {
  /** 读取唯一活动发布；数据库错误向上传播，不转换为可用。 */
  readonly read: (capturedAt: string) => Promise<PublishedMvpWateringResolution>
}

/** 发布元数据字段不得藏在正文中覆盖读回值。 */
const metadataKeys = ['releaseVersion', 'contentSha256', 'releaseStatus', 'effectiveAt', 'expiresAt']

/** 非负 BIGINT 文本转 UTC ISO；不可无损表示时返回 null。 */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const ms = Number(value)
  if (!Number.isSafeInteger(ms)) { return null }
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/**
 * 从既有业务策略发布与活动指针读取 care/mvp_watering（照 mysql-mvp-glass-policy-reader 模式）。
 * Repository 是唯一 SQL 入口；不新增表、不写入、不回退源码默认值。
 */
export function createMysqlMvpWateringPolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): PublishedMvpWateringPolicyReader {
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
         WHERE a.domain_code = ? AND a.policy_code = ?`, ['care', 'mvp_watering']
      ))
      if (rows.length === 0) { return { status: 'unavailable' } }
      const row = rows[0]!
      if (rows.length !== 1 || row.domain_code !== 'care' || row.policy_code !== 'mvp_watering'
        || row.schema_version !== 'care-watering-mvp/v1'
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
      if (!document || typeof document !== 'object' || Array.isArray(document)
        || Object.keys(document).some(key => metadataKeys.includes(key))) { return { status: 'invalid' } }
      const resolution = resolveMvpWateringPolicy({
        ...document, releaseVersion: row.release_version, contentSha256: row.content_sha256,
        releaseStatus: row.status, effectiveAt, ...(expiresAt === undefined ? {} : { expiresAt })
      }, capturedAt)
      return resolution.status === 'available'
        ? { status: 'available', releaseRef: row.release_ref, snapshot: resolution.snapshot }
        : resolution
    }
  }
}
