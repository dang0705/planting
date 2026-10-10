import { HTTP_REQUEST_WRITE_POLICY, type HttpRequestWriteRules } from '../../configuration/business-policies/index.js'
import Ajv from 'ajv'
import profileSchema from '../../../models/user-plant/profile-completeness-policy.v1.schema.json'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import type { UserPlantProfileCompletenessPolicy } from '../domain/evaluate-profile-completeness.js'

/** 单次请求锁定的写入策略；来源仅供内部追溯，不进入公开响应。 */
export interface PublishedProfileWriteSnapshot {
  /** 普通JSON原始字节上限，读取自HTTP发布。 */
  readonly maxBodyBytes: number
  /** 实际档案写入使用的已验真版本。 */
  readonly profileVersion: string
  /** 通用保留小时数转换出的毫秒；无默认值。 */
  readonly idempotencyRetentionMs: number
  /** 完整度策略原文；局部PATCH不得据此伪造完成或奖励。 */
  readonly profilePolicy: Readonly<UserPlantProfileCompletenessPolicy>
  /** 两份发布的稳定引用、版本与摘要，固定档案在前、HTTP在后。 */
  readonly releases: readonly Readonly<{
    /** 已验真的不可变发布公开引用，只用于内部追溯。 */
    releaseRef: string
    /** 当前锁定的发布版本，不随活动指针变化。 */
    releaseVersion: string
    /** 发布正文规范JSON摘要。 */
    contentSha256: string
  }>[]
}
/** 独立HTTP写发布；绑定已有目标不依赖档案完整度发布或创建额度。 */
export interface PublishedHttpWriteSnapshot {
  /** 已发布JSON字节上限。 */ readonly maxBodyBytes: number
  /** 内部来源追溯，不进入公开DTO。 */ readonly release: Readonly<{
    /** 不可变发布引用。 */ releaseRef: string
    /** 已验真活动版本。 */ releaseVersion: string
    /** 已核对发布正文的规范JSON摘要，仅供内部来源追溯。 */ contentSha256: string
  }>
}
const ajv = new Ajv({ strict: true, allErrors: true })
const validateProfile = ajv.compile<UserPlantProfileCompletenessPolicy>(profileSchema)
/** HTTP 写入策略校验：v1（两字段常量）与 v2（用户 2026-10-10 裁定，保留期 24–720 小时）均可读，统一由类型定义校验。 */
const validateHttp = (document: unknown, schemaVersion: string): document is HttpRequestWriteRules => HTTP_REQUEST_WRITE_POLICY.resolve(document, schemaVersion) !== null
/** MySQL非负BIGINT须无损接收；null仅在无截止处由调用者允许。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && Number.isFinite(new Date(parsed).getTime()) ? parsed : null
}
/** 完整元数据和正文联合验证；任何损坏都不能通过最新活动指针掩盖。 */
function verify(row: Record<string, unknown>, domain: string, code: string, schemas: readonly string[], now: number): unknown | null {
  const effective = milliseconds(row.effective_at_ms), verified = milliseconds(row.verified_at_ms)
  const expires = row.expires_at_ms === null ? null : milliseconds(row.expires_at_ms)
  if (row.domain_code !== domain || row.policy_code !== code || typeof row.schema_version !== 'string' || !schemas.includes(row.schema_version) || row.status !== 'active'
    || typeof row.release_ref !== 'string' || !/^bpr_[A-Za-z0-9_-]{8,}$/u.test(row.release_ref)
    || typeof row.release_version !== 'string' || !/^[A-Za-z0-9._/-]{1,64}$/u.test(row.release_version)
    || typeof row.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.content_sha256)
    || row.active_release_version !== row.release_version || row.active_content_sha256 !== row.content_sha256
    || effective === null || verified === null || effective > now || verified > now
    || (row.expires_at_ms !== null && (expires === null || expires <= effective || expires <= now))) { return null }
  let document: unknown = row.policy_json
  if (typeof document === 'string') { try { document = JSON.parse(document) as unknown } catch { return null } }
  if (!(domain === 'user-plant' ? validateProfile(document) : validateHttp(document, row.schema_version as string))) { return null }
  if (calculateCanonicalJsonSha256(document as CanonicalJsonValue) !== row.content_sha256) { return null }
  return document
}
/**
 * 复用不可变业务策略表及活动指针，一条SQL读取两份策略的同一数据库快照。
 * 仅读取，不发布、不激活、不建表；SQL异常由上层统一转为服务不可用。
 */
export function createMysqlPublishedProfileWritePolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 请求边界捕获UTC时刻；缺失、非法或不完整策略组返回null。 */
    read: async (capturedAtMs: number): Promise<PublishedProfileWriteSnapshot | null> => {
      if (!Number.isSafeInteger(capturedAtMs) || capturedAtMs < 0 || !Number.isFinite(new Date(capturedAtMs).getTime())) { return null }
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT r.release_ref, r.domain_code, r.policy_code, r.schema_version, r.release_version,
                r.content_sha256, r.policy_json, r.status,
                CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
                a.active_release_version, a.active_content_sha256
         FROM active_business_policy_releases AS a
         JOIN business_policy_releases AS r ON r.id = a.release_internal_id
           AND r.domain_code = a.domain_code AND r.policy_code = a.policy_code
         WHERE (a.domain_code = ? AND a.policy_code = ?) OR (a.domain_code = ? AND a.policy_code = ?)`,
        ['user-plant', 'profile_minimum_completeness', 'http', 'request_write']
      ))
      if (rows.length !== 2) { return null }
      const profile = rows.find(row => row.domain_code === 'user-plant'), http = rows.find(row => row.domain_code === 'http')
      if (!profile || !http) { return null }
      const profileDocument = verify(profile, 'user-plant', 'profile_minimum_completeness', ['user-plant-profile/v1'], capturedAtMs)
      const httpDocument = verify(http, 'http', 'request_write', HTTP_REQUEST_WRITE_POLICY.schemaVersions, capturedAtMs)
      if (!validateProfile(profileDocument) || !validateHttp(httpDocument, http.schema_version as string)) { return null }
      const lockedProfile = Object.freeze({ ...profileDocument,
        requiredFields: Object.freeze([...profileDocument.requiredFields]),
        acceptedIdentityStates: Object.freeze([...profileDocument.acceptedIdentityStates]) })
      return Object.freeze({ maxBodyBytes: httpDocument.jsonBodyLimitBytes, profileVersion: lockedProfile.profileVersion,
        idempotencyRetentionMs: httpDocument.idempotencyRetentionHours * 60 * 60 * 1000, profilePolicy: lockedProfile,
        releases: Object.freeze([profile, http].map(row => Object.freeze({ releaseRef: row.release_ref as string,
          releaseVersion: row.release_version as string, contentSha256: row.content_sha256 as string }))) })
    }
  }
}

/** 只读取同一HTTP发布并复用严格元数据、正文和摘要校验，不私设字节默认。 */
export function createMysqlPublishedHttpWritePolicyReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 单请求固定策略；SQL异常交由HTTP边界转为503。 */
    read: async (capturedAtMs: number): Promise<PublishedHttpWriteSnapshot | null> => {
      if (!Number.isSafeInteger(capturedAtMs) || capturedAtMs < 0 || !Number.isFinite(new Date(capturedAtMs).getTime())) { return null }
      const rows = await withReadConnection(source, c => c.query(`SELECT r.release_ref,r.domain_code,r.policy_code,r.schema_version,r.release_version,
        r.content_sha256,r.policy_json,r.status,CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,
        CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,
        a.active_release_version,a.active_content_sha256
        FROM active_business_policy_releases a JOIN business_policy_releases r
          ON r.id=a.release_internal_id AND r.domain_code=a.domain_code AND r.policy_code=a.policy_code
        WHERE a.domain_code=? AND a.policy_code=?`, ['http', 'request_write']))
      if (rows.length !== 1) { return null }
      const row = rows[0]!, document = verify(row, 'http', 'request_write', HTTP_REQUEST_WRITE_POLICY.schemaVersions, capturedAtMs)
      if (!validateHttp(document, row.schema_version as string)) { return null }
      return Object.freeze({ maxBodyBytes: document.jsonBodyLimitBytes, release: Object.freeze({ releaseRef: row.release_ref as string, releaseVersion: row.release_version as string, contentSha256: row.content_sha256 as string }) })
    }
  }
}
