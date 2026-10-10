import type { TypedPolicyDefinition } from '../../configuration/business-policies/typed-policy.js'
import type { MysqlConnectionPoolPort } from '../database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../json/canonical-json-sha256.js'

/** 一次请求（或一次定时任务运行）锁定的只读策略快照。 */
export interface TypedPolicySnapshot<T> {
  /** 已校验、深度冻结的策略正文。 */
  readonly rules: Readonly<T>
  /** 正文 Schema 版本。 */
  readonly schemaVersion: string
  /** 不可变发布公开引用（内部追溯，不进入公开响应）。 */
  readonly releaseRef: string
  /** 当前锁定的发布版本。 */
  readonly releaseVersion: string
  /** 正文规范 JSON 的 SHA-256。 */
  readonly contentSha256: string
}

/** MySQL 非负 BIGINT 文本转毫秒；不可无损表示返回 null。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * 通用类型化策略读取器（configuration-layers/v2 §3，照 profile_progress 读取器的校验口径）：
 * 只读 active 指针对应的唯一不可变发布；元数据、指针一致性、生效 / 过期 / 验证时间、正文摘要、Schema 与绝对边界全部可信才返回快照，
 * 任何一项不可信返回 null（HTTP 调用方转 503，定时任务本次不执行）。不发布、不激活、不建表、不回退源码默认值；SQL 异常向上抛。
 */
export function createMysqlTypedPolicyReader<T>(source: MysqlConnectionPoolPort<Mysql2QueryConnection>, definition: TypedPolicyDefinition<T>) {
  return {
    /** 以调用方时刻锁定一份策略；返回冻结快照或 null。 */
    read: async (nowMs: number): Promise<TypedPolicySnapshot<T> | null> => {
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) { return null }
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT r.release_ref, r.domain_code, r.policy_code, r.schema_version, r.release_version, r.content_sha256, r.policy_json, r.status,
                CAST(r.effective_at_ms AS CHAR) AS effective_at_ms, CAST(r.expires_at_ms AS CHAR) AS expires_at_ms, CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
                a.active_release_version, a.active_content_sha256
           FROM active_business_policy_releases AS a
           JOIN business_policy_releases AS r ON r.id = a.release_internal_id AND r.domain_code = a.domain_code AND r.policy_code = a.policy_code
          WHERE a.domain_code = ? AND a.policy_code = ?`, [definition.domainCode, definition.policyCode])) as unknown as readonly Record<string, unknown>[]
      if (rows.length !== 1) { return null }
      const row = rows[0]!
      const effective = milliseconds(row.effective_at_ms), verified = milliseconds(row.verified_at_ms)
      const expires = row.expires_at_ms === null ? null : milliseconds(row.expires_at_ms)
      if (typeof row.schema_version !== 'string' || !definition.schemaVersions.includes(row.schema_version) || row.status !== 'active'
        || row.domain_code !== definition.domainCode || row.policy_code !== definition.policyCode
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
      const rules = definition.resolve(document, row.schema_version)
      if (rules === null) { return null }
      return Object.freeze({ rules, schemaVersion: row.schema_version, releaseRef: row.release_ref, releaseVersion: row.release_version, contentSha256: row.content_sha256 })
    }
  }
}

/** 把读取器适配为服务依赖端口：入口闭包当前时钟，只暴露规则或 null。 */
export function policyRulesPort<T>(reader: { readonly read: (nowMs: number) => Promise<TypedPolicySnapshot<T> | null> }, now: () => number): () => Promise<Readonly<T> | null> {
  return async () => (await reader.read(now()))?.rules ?? null
}

/** 把读取器适配为带发布版本号的快照端口：入口闭包当前时钟，只暴露规则与公开发布版本。 */
export function policySnapshotPort<T>(reader: { readonly read: (nowMs: number) => Promise<TypedPolicySnapshot<T> | null> }, now: () => number): () => Promise<{ readonly rules: Readonly<T>; readonly releaseVersion: string } | null> {
  return async () => {
    const snapshot = await reader.read(now())
    return snapshot === null ? null : { rules: snapshot.rules, releaseVersion: snapshot.releaseVersion }
  }
}
