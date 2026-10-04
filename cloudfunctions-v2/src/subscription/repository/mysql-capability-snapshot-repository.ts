import type { UserCapabilitySnapshotDto } from '../../contracts/types.js'
import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  ActiveCapabilityCatalogReleaseRecord,
  VerifiedCapabilityCatalog
} from '../domain/resolve-capability-catalog-policy.js'

/** 能力策略活动指针与不可变发布 JOIN 查询的单行数据库投影。 */
type ActiveCapabilityCatalogSqlRow = {
  /** 策略发布数据库内部键的十进制文本，只供 capability_snapshots 外键使用。 */
  readonly policy_internal_id: string
  /** 策略发布高熵引用。 */
  readonly release_ref: string
  /** 策略发布业务域。 */
  readonly domain_code: string
  /** 能力目录发布记录的策略代码。 */
  readonly policy_code: string
  /** 策略发布 Schema 版本。 */
  readonly schema_version: string
  /** 不可变策略发布版本。 */
  readonly release_version: string
  /** 规范化发布正文 SHA-256。 */
  readonly content_sha256: string
  /** MySQL JSON 列；mysql2 可能返回对象或 JSON 文本。 */
  readonly policy_json: unknown
  /** 能力目录发布记录的当前状态。 */
  readonly release_status: string
  /** 策略开始生效时刻的十进制文本。 */
  readonly effective_at_ms: string
  /** 策略失效时刻的十进制文本；无失效时刻为 null。 */
  readonly expires_at_ms: string | null
  /** 策略验真时刻的十进制文本；未验真为 null。 */
  readonly verified_at_ms: string | null
  /** 活动指针保存的发布版本。 */
  readonly active_release_version: string
  /** 活动指针保存的发布正文摘要。 */
  readonly active_content_sha256: string
}

/** Repository 写入失败的内部错误；调用边界不得把数据库细节公开。 */
export class CapabilitySnapshotPersistenceError extends Error {
  /** 稳定内部错误分类。 */
  readonly code: 'CAPABILITY_SNAPSHOT_INPUT_INVALID' | 'CAPABILITY_SNAPSHOT_USER_NOT_FOUND'

  constructor(code: CapabilitySnapshotPersistenceError['code'], message: string) {
    super(message)
    this.name = 'CapabilitySnapshotPersistenceError'
    this.code = code
  }
}

const zero = Number('0')
const one = Number('1')
const sha256HexLength = Number('64')
const safeIntegerFormat = /^(?:0|[1-9][0-9]*)$/u
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const snapshotRefFormat = /^cps_[A-Za-z0-9_-]{8,}$/u

/** 严格把 MySQL BIGINT 文本解析为 JavaScript 可安全表达的非负整数。 */
function parseDatabaseTimestamp(value: string | null): number | null {
  if (value === null) {
    return null
  }
  if (!safeIntegerFormat.test(value)) {
    throw new CapabilitySnapshotPersistenceError(
      'CAPABILITY_SNAPSHOT_INPUT_INVALID',
      '能力策略时间列格式不合法'
    )
  }
  const timestamp = Number(value)
  if (!Number.isSafeInteger(timestamp) || timestamp < zero) {
    throw new CapabilitySnapshotPersistenceError(
      'CAPABILITY_SNAPSHOT_INPUT_INVALID',
      '能力策略时间列超出安全范围'
    )
  }
  return timestamp
}

/** 把活动指针 JOIN 行转换成策略校验器使用的内部投影。 */
function mapCapabilityCatalogRow(
  row: ActiveCapabilityCatalogSqlRow
): ActiveCapabilityCatalogReleaseRecord {
  const effectiveAtMs = parseDatabaseTimestamp(row.effective_at_ms)
  const expiresAtMs = parseDatabaseTimestamp(row.expires_at_ms)
  const verifiedAtMs = parseDatabaseTimestamp(row.verified_at_ms)
  if (effectiveAtMs === null) {
    throw new CapabilitySnapshotPersistenceError(
      'CAPABILITY_SNAPSHOT_INPUT_INVALID',
      '能力策略生效时间缺失'
    )
  }
  return {
    internalId: row.policy_internal_id,
    releaseRef: row.release_ref,
    domainCode: row.domain_code,
    policyCode: row.policy_code,
    schemaVersion: row.schema_version,
    releaseVersion: row.release_version,
    contentSha256: row.content_sha256,
    policyJson: row.policy_json,
    status: row.release_status,
    effectiveAtMs,
    expiresAtMs,
    verifiedAtMs,
    activeReleaseVersion: row.active_release_version,
    activeContentSha256: row.active_content_sha256
  }
}

/** 校验可安全持久化的统一用户快照 DTO，避免数据库层接受任意对象。 */
function validateSnapshotForInsert(snapshot: UserCapabilitySnapshotDto): {
  readonly generatedAtMs: number
  readonly validUntilMs: number
} {
  const generatedAtMs = Date.parse(snapshot.generatedAt)
  const validUntilMs = Date.parse(snapshot.validUntil)
  if (
    !userRefFormat.test(snapshot.user_id) ||
    !snapshotRefFormat.test(snapshot.snapshotRef) ||
    snapshot.subjectType !== 'user' ||
    !Number.isSafeInteger(snapshot.activeUserPlantLimit) ||
    snapshot.activeUserPlantLimit < zero ||
    !Number.isSafeInteger(generatedAtMs) ||
    !Number.isSafeInteger(validUntilMs) ||
    generatedAtMs < zero ||
    validUntilMs <= generatedAtMs ||
    new Date(generatedAtMs).toISOString() !== snapshot.generatedAt ||
    new Date(validUntilMs).toISOString() !== snapshot.validUntil
  ) {
    throw new CapabilitySnapshotPersistenceError(
      'CAPABILITY_SNAPSHOT_INPUT_INVALID',
      '能力快照不满足 MySQL 持久化约束'
    )
  }
  return { generatedAtMs, validUntilMs }
}

/** Subscription 能力快照 Repository；只负责已发布能力目录读取和快照持久化。 */
export type MysqlCapabilitySnapshotRepository = {
  /** 从活动指针与不可变发布表读取能力目录；缺失时返回 null 供应用层失败关闭。 */
  readonly readActiveCapabilityCatalog: () => Promise<ActiveCapabilityCatalogReleaseRecord | null>
  /** 在调用方提供的 MySQL 事务中写入经校验的用户快照及其策略外键。 */
  readonly insertCapabilitySnapshot: (
    transaction: MysqlTransactionContext<Mysql2QueryConnection>,
    snapshot: UserCapabilitySnapshotDto,
    capabilityCatalog: VerifiedCapabilityCatalog
  ) => Promise<void>
}

/** 创建实际走 v2 DDL 的 MySQL 能力快照 Repository。 */
export function createMysqlCapabilitySnapshotRepository(
  connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
): MysqlCapabilitySnapshotRepository {
  const readActiveCapabilityCatalog =
    async (): Promise<ActiveCapabilityCatalogReleaseRecord | null> => {
      const rows = (await withReadConnection(connectionSource, connection =>
        connection.query(
          `SELECT CAST(policy_release.id AS CHAR) AS policy_internal_id,
                policy_release.release_ref, policy_release.domain_code,
                policy_release.policy_code, policy_release.schema_version,
                policy_release.release_version, policy_release.content_sha256,
                policy_release.policy_json, policy_release.status AS release_status,
                CAST(policy_release.effective_at_ms AS CHAR) AS effective_at_ms,
                CAST(policy_release.expires_at_ms AS CHAR) AS expires_at_ms,
                CAST(policy_release.verified_at_ms AS CHAR) AS verified_at_ms,
                active_policy.active_release_version, active_policy.active_content_sha256
         FROM active_business_policy_releases AS active_policy
         JOIN business_policy_releases AS policy_release
           ON policy_release.id = active_policy.release_internal_id
         WHERE active_policy.domain_code = 'subscription'
           AND active_policy.policy_code = 'capability_catalog'`,
          []
        )
      )) as readonly ActiveCapabilityCatalogSqlRow[]
      if (rows.length === zero) {
        return null
      }
      if (rows.length !== one) {
        throw new CapabilitySnapshotPersistenceError(
          'CAPABILITY_SNAPSHOT_INPUT_INVALID',
          '能力策略活动指针不唯一'
        )
      }
      const row = rows[zero]
      if (row === undefined) {
        return null
      }
      return mapCapabilityCatalogRow(row)
    }

  const insertCapabilitySnapshot: MysqlCapabilitySnapshotRepository['insertCapabilitySnapshot'] =
    async (transaction, snapshot, capabilityCatalog) => {
      const { generatedAtMs, validUntilMs } = validateSnapshotForInsert(snapshot)
      if (
        snapshot.policyVersion !== capabilityCatalog.releaseVersion ||
        capabilityCatalog.internalId.length === zero ||
        capabilityCatalog.contentSha256.length !== sha256HexLength
      ) {
        throw new CapabilitySnapshotPersistenceError(
          'CAPABILITY_SNAPSHOT_INPUT_INVALID',
          '能力快照策略外键与 DTO.policyVersion 不一致'
        )
      }
      const snapshotSha256 = calculateCanonicalJsonSha256(snapshot as unknown as CanonicalJsonValue)
      const result = await transaction.connection.execute(
        `INSERT INTO capability_snapshots
           (_openid, snapshot_ref, subject_type, user_internal_id, tier,
            allowed_capabilities_json, rewarded_ai_scopes_json, active_user_plant_limit,
            capability_policy_release_internal_id, capability_policy_domain_code,
            capability_policy_code, capability_policy_release_ref,
            capability_policy_release_version, capability_policy_content_sha256,
            snapshot_sha256, generated_at_ms, valid_until_ms, created_at_ms, updated_at_ms)
         SELECT '', ?, 'user', user_row.id, ?, CAST(? AS JSON), CAST(? AS JSON), ?,
                ?, 'subscription', 'capability_catalog', ?, ?, ?, ?, ?, ?, ?, ?
         FROM users AS user_row
         WHERE user_row.public_user_id = ?`,
        toSqlParameters([
          snapshot.snapshotRef,
          snapshot.tier,
          JSON.stringify(snapshot.allowedCapabilities),
          JSON.stringify(snapshot.rewardedAiScopes),
          snapshot.activeUserPlantLimit,
          capabilityCatalog.internalId,
          capabilityCatalog.releaseRef,
          capabilityCatalog.releaseVersion,
          capabilityCatalog.contentSha256,
          snapshotSha256,
          generatedAtMs,
          validUntilMs,
          generatedAtMs,
          generatedAtMs,
          snapshot.user_id
        ])
      )
      if (result.affectedRows !== one) {
        throw new CapabilitySnapshotPersistenceError(
          'CAPABILITY_SNAPSHOT_USER_NOT_FOUND',
          '能力快照无法关联统一用户'
        )
      }
    }

  return { readActiveCapabilityCatalog, insertCapabilitySnapshot }
}
