import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import { createLockDiagnosisCandidateSubmission } from '../domain/candidate-submission.js'
import {
  DiagnosisReviewRecordConflictError,
  type DiagnosisReviewRecordCommand
} from '../domain/review-record.js'
import type {
  DiagnosisReviewRecordRepository,
  DiagnosisReviewRecordResult,
  MissingDiagnosisReviewRecord
} from '../application/record-review.js'
import { createMysqlDiagnosisReviewCandidateRepository } from './mysql-review-candidate-repository.js'
/** 写入只能使用调用方受控事务的连接。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('人工审核记录需要显式事务')
  }
  return tx.connection
}
/** UTC 毫秒只接受可无损表示的完整 SQL CHAR 数值。 */
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= 8_640_000_000_000_000 ? n : null
}
/** 锁阶段与写阶段的并发失败使用相同领域分类，调用方回滚后只读对账。 */
async function withConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(error.code))
    ) {
      throw new DiagnosisReviewRecordConflictError()
    }
    throw error
  }
}
/** 既有009审核表及候选状态的原子写入，不更改历史审核或发布。 */
export function createMysqlDiagnosisReviewRecordRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  candidateSchema: object
): DiagnosisReviewRecordRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const submitted = createMysqlDiagnosisReviewCandidateRepository(candidateSchema),
    lock = createLockDiagnosisCandidateSubmission(candidateSchema)
  async function receipt(
    c: Mysql2QueryConnection,
    command: DiagnosisReviewRecordCommand,
    shared: boolean
  ): Promise<DiagnosisReviewRecordResult | MissingDiagnosisReviewRecord> {
    const rows = await c.query(
      'SELECT a._openid AS review_openid,a.review_ref,a.reviewer_ref_hash,a.content_sha256 AS review_sha,a.decision,a.protocol_version,CAST(a.decided_at_ms AS CHAR) AS decided_at_ms,k._openid AS candidate_openid,k.candidate_ref,k.bundle_code,k.revision_no,k.schema_version,k.content_sha256,k.candidate_json,CAST(k.submitted_at_ms AS CHAR) AS submitted_at_ms FROM diagnosis_review_attestations a JOIN diagnosis_knowledge_candidates k ON k.id=a.candidate_internal_id WHERE BINARY a.review_ref=BINARY ?' +
        (shared ? ' FOR SHARE' : ''),
      [command.reviewRef]
    )
    if (rows.length === 0) {
      return { status: 'not_found' }
    }
    if (rows.length !== 1) {
      return { status: 'unavailable' }
    }
    const r = rows[0]!,
      decided = time(r.decided_at_ms),
      submittedAt = time(r.submitted_at_ms)
    if (
      r.review_openid !== '' ||
      r.candidate_openid !== '' ||
      decided === null ||
      submittedAt === null ||
      decided < submittedAt ||
      !['approved', 'rejected'].includes(String(r.decision))
    ) {
      return { status: 'unavailable' }
    }
    try {
      const body: unknown =
        typeof r.candidate_json === 'string' ? JSON.parse(r.candidate_json) : r.candidate_json
      const candidate = lock({ candidateRef: r.candidate_ref, candidate: body })
      if (
        candidate.contentSha256 !== r.content_sha256 ||
        candidate.contentSha256 !== r.review_sha ||
        candidate.candidate.bundleCode !== r.bundle_code ||
        candidate.candidate.revisionNo !== r.revision_no ||
        candidate.candidate.schemaVersion !== r.schema_version
      ) {
        return { status: 'unavailable' }
      }
      if (
        r.review_ref !== command.reviewRef ||
        r.candidate_ref !== command.candidateRef ||
        r.review_sha !== command.contentSha256 ||
        r.decision !== command.decision ||
        r.protocol_version !== command.reviewProtocolVersion ||
        r.reviewer_ref_hash !== command.reviewerRefHash
      ) {
        return { status: 'conflict' }
      }
      return {
        status: 'recorded',
        reviewRef: command.reviewRef,
        decision: command.decision,
        decidedAtMs: decided
      }
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof SyntaxError ||
        error instanceof RangeError
      ) {
        return { status: 'unavailable' }
      }
      throw error
    }
  }
  return {
    readReceipt: (tx, cmd) => withConflict(() => receipt(connection(tx), cmd, true)),
    reconcile: cmd => withReadConnection(source, c => receipt(c, cmd, false)),
    lockSubmitted: (tx, cmd) =>
      withConflict(async () => {
        const c = connection(tx)
        const rows = await c.query(
          'SELECT candidate_ref FROM diagnosis_knowledge_candidates WHERE BINARY candidate_ref=BINARY ? FOR UPDATE',
          [cmd.candidateRef]
        )
        if (rows.length !== 1) {
          return { status: 'unavailable' }
        }
        return submitted.readSubmitted(tx, {
          candidateRef: cmd.candidateRef,
          contentSha256: cmd.contentSha256
        })
      }),
    append: async (tx, cmd, at) => {
      const c = connection(tx)
      try {
        const saved = await c.execute(
          "INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) SELECT ?,?,id,content_sha256,?,?,? FROM diagnosis_knowledge_candidates WHERE BINARY candidate_ref=BINARY ? AND content_sha256=? AND candidate_state='submitted'",
          [
            cmd.reviewRef,
            cmd.reviewerRefHash,
            cmd.decision,
            cmd.reviewProtocolVersion,
            at,
            cmd.candidateRef,
            cmd.contentSha256
          ]
        )
        if (saved.affectedRows !== 1) {
          throw new DiagnosisReviewRecordConflictError()
        }
        const changed = await c.execute(
          "UPDATE diagnosis_knowledge_candidates SET candidate_state=? WHERE BINARY candidate_ref=BINARY ? AND content_sha256=? AND candidate_state='submitted'",
          [
            cmd.decision === 'approved' ? 'reviewed' : 'rejected',
            cmd.candidateRef,
            cmd.contentSha256
          ]
        )
        if (changed.affectedRows !== 1) {
          throw new DiagnosisReviewRecordConflictError()
        }
        const result = await receipt(c, cmd, true)
        if (result.status !== 'recorded' || result.decidedAtMs !== at) {
          throw new Error('审核收据没有原样读回')
        }
        return result
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(error.code))
        ) {
          throw new DiagnosisReviewRecordConflictError()
        }
        throw error
      }
    }
  }
}
