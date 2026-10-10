import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { decideGuestClaimLease } from '../domain/guest-claim-lease.js'

/** 取得处理租约的可信输入；全部来自已验真主体、登记结果与服务端生成值。 */
export interface GuestClaimLeaseInput {
  /** identity 已验真的统一用户公开引用。 */
  readonly userRef: string
  /** 原游客会话公开引用。 */
  readonly guestSessionRef: string
  /** 原游客案例公开引用。 */
  readonly guestPlantCaseRef: string
  /** 原请求幂等键的 SHA-256 摘要。 */
  readonly idempotencyKeyHash: string
  /** 登记返回的原命令认领引用；必须与存储一致。 */
  readonly claimRef: string
  /** 服务端高熵随机后 SHA-256 的持有者摘要；原文不落库。 */
  readonly leaseOwnerHash: string
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 取得租约的内部结果；不含内部主键或持有者信息。 */
export type GuestClaimLeaseResult =
  | {
      /** 本次请求持有有效租约，可进入完成事务。 */
      readonly status: 'acquired'
      /** 租约截止时刻 UTC 毫秒。 */
      readonly leaseExpiresAtMs: number
      /** 当前处理次数（首次取得为 1，每次接管加 1）。 */
      readonly attemptCount: number
      /** 是否接管了已过期租约。 */
      readonly takeover: boolean
    }
  | {
      /** 他人未过期租约（held）、命令已完成/失败、命令不存在或存储不可用。 */
      readonly status: 'held' | 'completed' | 'failed' | 'not_found' | 'unavailable'
    }

/** 公开引用命名空间与 SQL 容量。 */
function ref(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(value) }
/** 严格读取安全毫秒；缺失返回 null。 */
function ms(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const n = Number(value)
  return Number.isSafeInteger(n) && Number.isFinite(new Date(n).getTime()) ? n : null
}
/** 第一次等待前固定可信输入。 */
function lock(raw: GuestClaimLeaseInput): GuestClaimLeaseInput {
  const keys = ['userRef', 'guestSessionRef', 'guestPlantCaseRef', 'idempotencyKeyHash', 'claimRef', 'leaseOwnerHash', 'nowMs']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== keys.length || Object.keys(raw).some(k => !keys.includes(k))
    || !ref(raw.userRef, 'usr') || !ref(raw.guestSessionRef, 'gst') || !ref(raw.guestPlantCaseRef, 'gpc') || !ref(raw.claimRef, 'gcl')
    || typeof raw.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.idempotencyKeyHash)
    || typeof raw.leaseOwnerHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.leaseOwnerHash)
    || !Number.isSafeInteger(raw.nowMs) || raw.nowMs < 0 || !Number.isFinite(new Date(raw.nowMs).getTime())) { throw new TypeError('认领租约可信输入不合法') }
  return Object.freeze({ ...raw })
}

/** 处理租约 Repository：只在调用方事务内加锁读取并条件更新原命令，不登记、不完成认领；leaseMs 由入口经环境变量层注入（默认 30 000）。 */
export function createMysqlGuestClaimLeaseRepository(leaseMs: number) {
  return {
    /** 取得或接管租约；条件更新影响行数不为 1 时抛错由外层回滚。 */
    acquire: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, raw: GuestClaimLeaseInput): Promise<GuestClaimLeaseResult> => {
      const input = lock(raw)
      if (!tx || tx.transactionContext !== true || !tx.connection) { throw new TypeError('认领租约需要显式事务') }
      const c = tx.connection
      const rows = await c.query(`SELECT CAST(m.id AS CHAR) AS command_id,m.claim_ref,m.status,m.processing_lease_owner_hash AS lease_owner_hash,
        CAST(m.processing_lease_expires_at_ms AS CHAR) AS lease_expires_at_ms,m.attempt_count,CAST(m.updated_at_ms AS CHAR) AS updated_at_ms
        FROM guest_claim_commands m
        JOIN users u ON u.id=m.user_internal_id AND u.status='active' AND u._openid=''
        JOIN guest_plant_cases p ON p.id=m.guest_plant_case_internal_id AND p._openid=''
        JOIN guest_sessions s ON s.id=p.guest_session_internal_id AND s._openid=''
        WHERE BINARY u.public_user_id=BINARY ? AND BINARY s.guest_session_ref=BINARY ? AND BINARY p.guest_plant_case_ref=BINARY ?
          AND m.idempotency_key=? AND m._openid='' FOR UPDATE`, [input.userRef, input.guestSessionRef, input.guestPlantCaseRef, input.idempotencyKeyHash])
      if (rows.length === 0) { return { status: 'not_found' } }
      const m = rows[0]!
      if (rows.length !== 1 || typeof m.command_id !== 'string' || !/^[1-9][0-9]*$/u.test(m.command_id)) { return { status: 'unavailable' } }
      if (m.claim_ref !== input.claimRef) { return { status: 'not_found' } }
      const updatedAtMs = ms(m.updated_at_ms)
      const leaseExpiresAtMs = m.lease_expires_at_ms === null ? null : ms(m.lease_expires_at_ms)
      if (updatedAtMs === null || typeof m.status !== 'string' || typeof m.attempt_count !== 'number'
        || (m.lease_owner_hash !== null && typeof m.lease_owner_hash !== 'string') || (m.lease_expires_at_ms !== null && leaseExpiresAtMs === null)) { return { status: 'unavailable' } }
      const decision = decideGuestClaimLease({
        status: m.status, leaseOwnerHash: m.lease_owner_hash as string | null, leaseExpiresAtMs, attemptCount: m.attempt_count,
        updatedAtMs, nowMs: input.nowMs, candidateOwnerHash: input.leaseOwnerHash, leaseMs
      })
      switch (decision.kind) {
        case 'invalid': return { status: 'unavailable' }
        case 'held': case 'completed': case 'failed': return { status: decision.kind }
        case 'already_owned': return { status: 'acquired', leaseExpiresAtMs: decision.leaseExpiresAtMs, attemptCount: m.attempt_count, takeover: false }
        case 'acquire': {
          const written = await c.execute(`UPDATE guest_claim_commands SET status='processing',processing_lease_owner_hash=?,processing_lease_expires_at_ms=?,
            attempt_count=?,updated_at_ms=? WHERE id=? AND status=? AND attempt_count=? AND _openid=''`,
          [input.leaseOwnerHash, decision.leaseExpiresAtMs, decision.attemptCount, input.nowMs, m.command_id, m.status, m.attempt_count])
          if (written.affectedRows !== 1) { throw new Error('认领租约条件写入未确定') }
          return { status: 'acquired', leaseExpiresAtMs: decision.leaseExpiresAtMs, attemptCount: decision.attemptCount, takeover: decision.takeover }
        }
      }
    }
  }
}
