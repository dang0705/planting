import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  serializeCanonicalJson,
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import {
  DiagnosisCandidateSubmissionConflictError,
  type LockedDiagnosisCandidateSubmission
} from '../domain/candidate-submission.js'
import type {
  DiagnosisCandidateSubmissionRepository,
  DiagnosisCandidateSubmissionResult,
  MissingCandidateSubmissionReceipt
} from '../application/submit-candidate.js'
/** 事务连接只能来自共享驱动，不另开写连接。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('候选提交需要显式事务')
  }
  return tx.connection
}
/** UTC 毫秒必须是能无损转换的完整非负 SQL CHAR 数值。 */
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= 8_640_000_000_000_000 ? n : null
}
/** 只写既有009候选表，不覆写草稿、审核、发布或当前指针。 */
export function createMysqlDiagnosisCandidateSubmissionRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>
): DiagnosisCandidateSubmissionRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  async function receipt(
    c: Mysql2QueryConnection,
    command: LockedDiagnosisCandidateSubmission,
    locked: boolean
  ): Promise<DiagnosisCandidateSubmissionResult | MissingCandidateSubmissionReceipt> {
    const rows = await c.query(
      'SELECT candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,CAST(created_at_ms AS CHAR) AS created_at_ms,CAST(submitted_at_ms AS CHAR) AS submitted_at_ms,_openid FROM diagnosis_knowledge_candidates WHERE BINARY candidate_ref=BINARY ?' +
        (locked ? ' FOR UPDATE' : ''),
      [command.candidateRef]
    )
    if (rows.length === 0) {
      return { status: 'not_found' }
    }
    if (rows.length !== 1) {
      return { status: 'unavailable' }
    }
    const row = rows[0]!,
      created = time(row.created_at_ms),
      submitted = time(row.submitted_at_ms)
    if (
      row._openid !== '' ||
      created === null ||
      submitted === null ||
      submitted < created ||
      !['submitted', 'reviewed', 'rejected'].includes(String(row.candidate_state))
    ) {
      return { status: 'unavailable' }
    }
    try {
      const body: CanonicalJsonValue =
        typeof row.candidate_json === 'string'
          ? JSON.parse(row.candidate_json)
          : (row.candidate_json as CanonicalJsonValue)
      if (calculateCanonicalJsonSha256(body) !== row.content_sha256) {
        return { status: 'unavailable' }
      }
      if (
        row.content_sha256 !== command.contentSha256 ||
        serializeCanonicalJson(body) !== serializeCanonicalJson(command.candidate) ||
        row.bundle_code !== command.candidate.bundleCode ||
        row.revision_no !== command.candidate.revisionNo ||
        row.schema_version !== command.candidate.schemaVersion ||
        row.candidate_ref !== command.candidateRef
      ) {
        return { status: 'conflict' }
      }
      return {
        status: 'submitted',
        candidateRef: command.candidateRef,
        contentSha256: command.contentSha256,
        submittedAtMs: submitted
      }
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        error instanceof TypeError ||
        error instanceof RangeError
      ) {
        return { status: 'unavailable' }
      }
      throw error
    }
  }
  return {
    readReceipt: (tx, command) => receipt(connection(tx), command, true),
    reconcile: command => withReadConnection(source, c => receipt(c, command, false)),
    insert: async (tx, command, at) => {
      const c = connection(tx),
        body = command.candidate
      try {
        const saved = await c.execute(
          "INSERT INTO diagnosis_knowledge_candidates(candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,created_at_ms,submitted_at_ms) VALUES(?,?,?,?,?,CAST(? AS JSON),'submitted',?,?)",
          [
            command.candidateRef,
            String(body.bundleCode),
            Number(body.revisionNo),
            String(body.schemaVersion),
            command.contentSha256,
            serializeCanonicalJson(body),
            at,
            at
          ]
        )
        if (saved.affectedRows !== 1) {
          throw new Error('候选提交没有保存')
        }
        const result = await receipt(c, command, true)
        if (result.status !== 'submitted') {
          throw new Error('候选提交收据没有读回')
        }
        return result
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(error.code))
        ) {
          throw new DiagnosisCandidateSubmissionConflictError()
        }
        throw error
      }
    }
  }
}
