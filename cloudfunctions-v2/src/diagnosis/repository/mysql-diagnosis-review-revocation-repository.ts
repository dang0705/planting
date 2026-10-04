import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  DiagnosisReviewRevocationConflictError,
  type LockedDiagnosisReviewRevocation
} from '../domain/diagnosis-review-revocation.js'
import type {
  DiagnosisReviewRevocationRepository,
  DiagnosisReviewRevocationResult,
  MissingDiagnosisRevocationReceipt
} from '../application/revoke-diagnosis-review.js'
/** 只允许共享驱动提供的显式事务，防止独立连接破坏发布串行化。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>) {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('审核撤销需要显式事务')
  }
  return tx.connection
}
/** 真实010撤销事实写入；原批准、候选、发布、指针和诊断结果均不更新。 */
export function createMysqlDiagnosisReviewRevocationRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>
): DiagnosisReviewRevocationRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  /** 原历史收据关联精确批准，比对完整摘要及列语义，不能只相信引用存在。 */
  async function receipt(
    c: Mysql2QueryConnection,
    locked: LockedDiagnosisReviewRevocation,
    currentRead = false
  ): Promise<DiagnosisReviewRevocationResult | MissingDiagnosisRevocationReceipt> {
    const rows = await c.query(
      'SELECT v._openid AS revocation_openid,v.revocation_ref,v.request_sha256,v.revoked_by_ref_hash,v.reason_zh,v.review_evidence_ref,CAST(v.revoked_at_ms AS CHAR) AS revoked_at_ms,v.target_decision,a._openid AS review_openid,a.review_ref,a.content_sha256,a.protocol_version,a.decision,CAST(a.decided_at_ms AS CHAR) AS decided_at_ms FROM diagnosis_review_revocations v JOIN diagnosis_review_attestations a ON a.id=v.target_review_internal_id WHERE BINARY v.revocation_ref=BINARY ?' +
        (currentRead ? ' FOR SHARE' : ''),
      [locked.command.revocationRef]
    )
    if (!rows.length) {
      return { status: 'not_found' }
    }
    if (rows.length !== 1) {
      return { status: 'unavailable' }
    }
    const r = rows[0]!,
      x = locked.command,
      at = Number(r.revoked_at_ms),
      decided = Number(r.decided_at_ms)
    if (
      r.revocation_openid !== '' ||
      r.review_openid !== '' ||
      r.target_decision !== 'approved' ||
      r.decision !== 'approved' ||
      !Number.isSafeInteger(at) ||
      at < 0 ||
      at > 8640000000000000 ||
      !Number.isSafeInteger(decided) ||
      decided < 0 ||
      at < decided
    ) {
      return { status: 'unavailable' }
    }
    if (
      r.request_sha256 !== locked.requestSha256 ||
      r.review_ref !== x.reviewRef ||
      r.content_sha256 !== x.contentSha256 ||
      r.protocol_version !== x.reviewProtocolVersion ||
      r.revoked_by_ref_hash !== x.operatorRefHash ||
      r.reason_zh !== x.reasonZh ||
      r.review_evidence_ref !== x.reviewEvidenceRef
    ) {
      return { status: 'conflict' }
    }
    return { status: 'revoked', revocationRef: x.revocationRef, revokedAtMs: at }
  }
  return {
    readReceipt: (tx, locked) => receipt(connection(tx), locked),
    reconcile: locked =>
      withReadConnection(source, async c => {
        const r = await receipt(c, locked)
        return r.status === 'not_found' ? { status: 'unknown_commit' } : r
      }),
    append: async (tx, locked, at) => {
      const c = connection(tx),
        x = locked.command
      try {
        // 与发布Reader使用相同精确审核目标锁，后续撤销查询为当前读，避免旧快照漏事实。
        const reviews = await c.query(
          'SELECT CAST(id AS CHAR) AS id,_openid,content_sha256,protocol_version,decision,CAST(decided_at_ms AS CHAR) AS decided_at_ms FROM diagnosis_review_attestations WHERE BINARY review_ref=BINARY ? FOR UPDATE',
          [x.reviewRef]
        )
        if (reviews.length !== 1) {
          return { status: 'unavailable' }
        }
        const r = reviews[0]!,
          decided = Number(r.decided_at_ms)
        if (
          r._openid !== '' ||
          r.decision !== 'approved' ||
          r.content_sha256 !== x.contentSha256 ||
          r.protocol_version !== x.reviewProtocolVersion ||
          !Number.isSafeInteger(decided) ||
          decided < 0 ||
          at < decided
        ) {
          return { status: 'unavailable' }
        }
        const existing = await c.query(
          'SELECT revocation_ref FROM diagnosis_review_revocations WHERE target_review_internal_id=? FOR UPDATE',
          [String(r.id)]
        )
        if (existing.length) {
          if (existing.length !== 1 || existing[0]!.revocation_ref !== x.revocationRef) {
            throw new DiagnosisReviewRevocationConflictError()
          }
          const same = await receipt(c, locked, true)
          if (same.status !== 'revoked') {
            throw new DiagnosisReviewRevocationConflictError()
          }
          return same
        }
        const saved = await c.execute(
          'INSERT INTO diagnosis_review_revocations(revocation_ref,target_review_internal_id,request_sha256,revoked_by_ref_hash,reason_zh,review_evidence_ref,revoked_at_ms) VALUES(?,?,?,?,?,?,?)',
          [
            x.revocationRef,
            String(r.id),
            locked.requestSha256,
            x.operatorRefHash,
            x.reasonZh,
            x.reviewEvidenceRef,
            at
          ]
        )
        if (saved.affectedRows !== 1) {
          throw new Error('审核撤销未保存')
        }
        const result = await receipt(c, locked)
        if (result.status !== 'revoked') {
          throw new Error('审核撤销收据未读回')
        }
        return result
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(error.code))
        ) {
          throw new DiagnosisReviewRevocationConflictError()
        }
        throw error
      }
    }
  }
}
