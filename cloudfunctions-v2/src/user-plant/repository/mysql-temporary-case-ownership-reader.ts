import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 临时案例归属查询输入；主体已由 identity 域验真。 */
export type TemporaryCaseOwnershipQuery = {
  /** 游客：会话公开引用 + gpc_ 案例引用。 */
  readonly kind: 'guest'
  /** 已验真游客会话公开引用。 */
  readonly guestSessionRef: string
  /** 待校验的游客案例公开引用。 */
  readonly caseRef: string
  /** 服务端当前 UTC 毫秒，用于排除已过期案例与会话。 */
  readonly nowMs: number
} | {
  /** 登录用户：统一用户公开引用 + epc_ 案例引用。 */
  readonly kind: 'authenticated'
  /** 已验真统一用户公开引用。 */
  readonly userRef: string
  /** 待校验的登录临时案例公开引用。 */
  readonly caseRef: string
  /** 服务端当前 UTC 毫秒，用于排除已过期案例。 */
  readonly nowMs: number
}

/** 归属读取端口：只回答是否为本人 active 未过期案例，不泄露存在性差异。 */
export interface TemporaryCaseOwnershipReader {
  /** 本人 active 未过期 → owned；其他（他人、不存在、已过期、非 active）→ not_found。 */
  readonly readOwned: (query: TemporaryCaseOwnershipQuery) => Promise<'owned' | 'not_found'>
}

/**
 * user-plant 域对外的只读归属端口（供 care 等能力域在网络调用前做 404 前置）。
 * 事务内的最终归属仍由写入方在同一事务里加锁复核。
 */
export function createMysqlTemporaryCaseOwnershipReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>): TemporaryCaseOwnershipReader {
  return {
    readOwned: async query => {
      const rows = await withReadConnection(source, connection => (query.kind === 'guest'
        ? connection.query(
          `SELECT 1 AS owned FROM guest_plant_cases e JOIN guest_sessions g ON g.id = e.guest_session_internal_id AND g._openid = ''
           WHERE BINARY g.guest_session_ref = BINARY ? AND BINARY e.guest_plant_case_ref = BINARY ?
             AND g.status = 'active' AND g.expires_at_ms > ? AND e.status = 'active' AND e.expires_at_ms > ? AND e._openid = ''`,
          [query.guestSessionRef, query.caseRef, query.nowMs, query.nowMs])
        : connection.query(
          `SELECT 1 AS owned FROM authenticated_ephemeral_plant_cases e JOIN users u ON u.id = e.user_internal_id AND u.status = 'active' AND u._openid = ''
           WHERE BINARY u.public_user_id = BINARY ? AND BINARY e.ephemeral_plant_case_ref = BINARY ?
             AND e.status = 'active' AND e.expires_at_ms > ? AND e._openid = ''`,
          [query.userRef, query.caseRef, query.nowMs])))
      return rows.length === 1 ? 'owned' : 'not_found'
    }
  }
}
