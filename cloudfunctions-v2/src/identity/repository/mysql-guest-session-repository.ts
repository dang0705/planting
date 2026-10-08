import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { GuestSessionInsert } from '../application/issue-guest-session.js'

/** 按令牌摘要找到的有效游客会话；不含内部主键或摘要。 */
export interface ActiveGuestSession {
  /** 游客会话公开引用。 */
  readonly guestSessionRef: string
  /** 签发 UTC 毫秒。 */
  readonly issuedAtMs: number
  /** 失效 UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** guest_sessions 存储（迁移 003＋023）；Repository 是唯一 SQL 入口。 */
export interface MysqlGuestSessionRepository {
  /** 写入新游客会话；唯一键或约束冲突时抛出，不覆盖已有行。 */
  readonly insert: (record: GuestSessionInsert) => Promise<void>
  /** 统计某限流键自 sinceMs 起的服务端令牌签发次数。 */
  readonly countIssuedSince: (issuanceSourceHash: string, sinceMs: number) => Promise<number>
  /** 按持有证明摘要查找状态 active 且尚未过期的会话。 */
  readonly findActiveByProofHash: (possessionProofHash: string, nowMs: number) => Promise<ActiveGuestSession | null>
}

/** BIGINT 文本或数字转安全整数；不可表示时返回 null。 */
function safeInteger(value: unknown): number | null {
  const parsed = typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) ? parsed : null
}

/** 创建游客会话存储；只读写 guest_sessions，不保存令牌原文。 */
export function createMysqlGuestSessionRepository(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): MysqlGuestSessionRepository {
  return {
    insert: record => withReadConnection(source, async connection => {
      await connection.execute(
        `INSERT INTO guest_sessions
          (guest_session_ref, identity_source, anonymous_subject_hash, issuance_source_hash, possession_proof_hash,
           possession_proof_version, status, issued_at_ms, expires_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.guestSessionRef, record.identitySource, record.anonymousSubjectHash, record.issuanceSourceHash,
          record.possessionProofHash, record.possessionProofVersion, record.status, record.issuedAtMs, record.expiresAtMs,
          record.issuedAtMs, record.issuedAtMs],
      )
    }),
    countIssuedSince: (issuanceSourceHash, sinceMs) => withReadConnection(source, async connection => {
      const rows = await connection.query(
        `SELECT CAST(COUNT(*) AS CHAR) AS issued FROM guest_sessions
         WHERE issuance_source_hash = ? AND identity_source = 'server_issued_guest_token' AND issued_at_ms >= ?`,
        [issuanceSourceHash, sinceMs],
      )
      const issued = safeInteger(rows[0]?.issued)
      if (issued === null) { throw new Error('游客签发计数结果非法') }
      return issued
    }),
    findActiveByProofHash: (possessionProofHash, nowMs) => withReadConnection(source, async connection => {
      const rows = await connection.query(
        `SELECT guest_session_ref, CAST(issued_at_ms AS CHAR) AS issued_at_ms, CAST(expires_at_ms AS CHAR) AS expires_at_ms
         FROM guest_sessions
         WHERE possession_proof_hash = ? AND identity_source = 'server_issued_guest_token' AND status = 'active' AND expires_at_ms > ?`,
        [possessionProofHash, nowMs],
      )
      if (rows.length !== 1) { return null }
      const row = rows[0]!
      const issuedAtMs = safeInteger(row.issued_at_ms)
      const expiresAtMs = safeInteger(row.expires_at_ms)
      if (typeof row.guest_session_ref !== 'string' || issuedAtMs === null || expiresAtMs === null) { return null }
      return { guestSessionRef: row.guest_session_ref, issuedAtMs, expiresAtMs }
    }),
  }
}
