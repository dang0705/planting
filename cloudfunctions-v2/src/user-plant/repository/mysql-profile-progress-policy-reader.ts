import { resolveProfileProgressPolicy, type ProfileProgressPolicy } from '../../configuration/profile-progress-policy.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'

/** 读取的发布键：domain_code 沿用既有 user-plant 发布的连字符写法。 */
const releaseKey = { domain: 'user-plant', code: 'profile_progress', schema: 'user-plant-profile-progress/v1' } as const

/** MySQL 非负 BIGINT 文本转毫秒；不可无损表示返回 null。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * 档案完整度规则发布读取（类型化策略发布 user-plant/profile_progress，照 mysql-published-profile-write-policy-reader 的校验口径）。
 * 只读一条活动指针对应的不可变发布：元数据、活动指针一致性、生效/过期/验证时间、正文摘要与正文结构全部可信才返回规则；
 * 任何一项不可信返回 null（调用方省略完整度字段）。不发布、不激活、不建表、不回退源码默认值；SQL 异常向上抛由调用方吞掉。
 */
export function createMysqlProfileProgressPolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 以请求时刻锁定一份规则；返回冻结正文或 null。 */
    read: async (nowMs: number): Promise<Readonly<ProfileProgressPolicy> | null> => {
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) { return null }
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT r.release_ref, r.domain_code, r.policy_code, r.schema_version, r.release_version, r.content_sha256, r.policy_json, r.status,
                CAST(r.effective_at_ms AS CHAR) AS effective_at_ms, CAST(r.expires_at_ms AS CHAR) AS expires_at_ms, CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
                a.active_release_version, a.active_content_sha256
           FROM active_business_policy_releases AS a
           JOIN business_policy_releases AS r ON r.id = a.release_internal_id AND r.domain_code = a.domain_code AND r.policy_code = a.policy_code
          WHERE a.domain_code = ? AND a.policy_code = ?`, [releaseKey.domain, releaseKey.code]))
      if (rows.length !== 1) { return null }
      const row = rows[0]!
      const effective = milliseconds(row.effective_at_ms), verified = milliseconds(row.verified_at_ms)
      const expires = row.expires_at_ms === null ? null : milliseconds(row.expires_at_ms)
      if (row.schema_version !== releaseKey.schema || row.status !== 'active'
        || typeof row.release_ref !== 'string' || !/^bpr_[A-Za-z0-9_-]{8,}$/u.test(row.release_ref)
        || typeof row.release_version !== 'string' || !/^[A-Za-z0-9._/-]{1,64}$/u.test(row.release_version)
        || typeof row.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.content_sha256)
        || row.active_release_version !== row.release_version || row.active_content_sha256 !== row.content_sha256
        || effective === null || verified === null || effective > nowMs || verified > nowMs
        || (row.expires_at_ms !== null && (expires === null || expires <= effective || expires <= nowMs))) { return null }
      let document: unknown = row.policy_json
      if (typeof document === 'string') { try { document = JSON.parse(document) as unknown } catch { return null } }
      if (document === null || typeof document !== 'object') { return null }
      if (calculateCanonicalJsonSha256(document as CanonicalJsonValue) !== row.content_sha256) { return null }
      return resolveProfileProgressPolicy(document)
    }
  }
}
