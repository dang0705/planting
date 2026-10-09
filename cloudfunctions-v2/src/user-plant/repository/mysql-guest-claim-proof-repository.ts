import { createHash } from 'node:crypto'

import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { verifyGuestClaimProof, type GuestClaimProofInput, type GuestClaimProofResult } from '../domain/verify-guest-claim-proof.js'

/** 认领事务锁定游客会话的窄输入；不接受登录身份或存储版本冒充。 */
export interface GuestClaimProofLockInput extends GuestClaimProofInput {
  /** 冻结DTO中的游客会话公开引用。 */ readonly guestSessionRef: string
}
/** 在等待SQL前固定受控输入，错误不携带原始值。 */
function lock(input: GuestClaimProofLockInput): GuestClaimProofLockInput {
  const keys = ['guestSessionRef', 'possessionProof', 'nowMs', 'proofRotationGraceSeconds']
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))
    || typeof input.guestSessionRef !== 'string' || input.guestSessionRef.length > 64 || !/^gst_[A-Za-z0-9_-]{8,}$/u.test(input.guestSessionRef)
    || typeof input.possessionProof !== 'string' || !Number.isSafeInteger(input.nowMs) || input.nowMs < 0 || !Number.isFinite(new Date(input.nowMs).getTime())
    || (input.proofRotationGraceSeconds !== null && (!Number.isInteger(input.proofRotationGraceSeconds) || input.proofRotationGraceSeconds < 0 || input.proofRotationGraceSeconds > 300))) { throw new TypeError('游客证明可信输入不合法') }
  return Object.freeze({ ...input })
}
/** MySQL大整数字符串仅严格转换为安全UTC毫秒，禁止null变零或前缀解析。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const result = Number(value)
  return Number.isSafeInteger(result) && result >= 0 && Number.isFinite(new Date(result).getTime()) ? result : null
}
/** 认领应用拥有事务生命周期；此Repository仅锁定会话并检查持有权。 */
export function createMysqlGuestClaimProofRepository() {
  return {
    /** 一次精确查询，锁持续到外层提交/回滚；任何数据库失败交给外层回滚。 */
    lockAndVerify: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, raw: GuestClaimProofLockInput): Promise<GuestClaimProofResult> => {
      const input = lock(raw)
      if (!tx || tx.transactionContext !== true || !tx.connection) { throw new TypeError('游客认领证明需要显式事务') }
      // 按令牌摘要定位（当前或上一版），并要求会话引用一致；令牌原文不进入 SQL。
      const proofHash = createHash('sha256').update(input.possessionProof, 'utf8').digest('hex')
      const rows = await tx.connection.query(`SELECT identity_source,possession_proof_hash,possession_proof_version,
        previous_possession_proof_hash,CAST(previous_proof_valid_until_ms AS CHAR) AS previous_proof_valid_until_ms,status,
        CAST(issued_at_ms AS CHAR) AS issued_at_ms,CAST(expires_at_ms AS CHAR) AS expires_at_ms
        FROM guest_sessions WHERE BINARY guest_session_ref=BINARY ? AND (possession_proof_hash=? OR previous_possession_proof_hash=?)
          AND _openid='' FOR UPDATE`, [input.guestSessionRef, proofHash, proofHash])
      if (rows.length === 0) { return { status: 'not_claimable' } }
      if (rows.length !== 1) { return { status: 'unavailable' } }
      const row = rows[0]!, issuedAtMs = milliseconds(row.issued_at_ms), expiresAtMs = milliseconds(row.expires_at_ms)
      const previousProofValidUntilMs = row.previous_proof_valid_until_ms === null ? null : milliseconds(row.previous_proof_valid_until_ms)
      if (typeof row.identity_source !== 'string' || typeof row.possession_proof_hash !== 'string'
        || typeof row.possession_proof_version !== 'number' || (row.previous_possession_proof_hash !== null && typeof row.previous_possession_proof_hash !== 'string')
        || typeof row.status !== 'string' || issuedAtMs === null || expiresAtMs === null
        || (row.previous_proof_valid_until_ms !== null && previousProofValidUntilMs === null)) { return { status: 'unavailable' } }
      return verifyGuestClaimProof({ identitySource: row.identity_source, proofHash: row.possession_proof_hash,
        proofVersion: row.possession_proof_version, previousProofHash: row.previous_possession_proof_hash,
        previousProofValidUntilMs, issuedAtMs, expiresAtMs, status: row.status }, input)
    }
  }
}
