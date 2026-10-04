import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { DiagnosisAnswerEvidenceRepository } from '../application/read-answer-evidence.js'
import { createMysqlDiagnosisAnswerRepository } from './mysql-diagnosis-answer-repository.js'

/** 只读真实答案证据，三项归属及题包锁定复用原 Repository。 */
export function createMysqlDiagnosisAnswerEvidenceRepository(): DiagnosisAnswerEvidenceRepository<
  MysqlTransactionContext<Mysql2QueryConnection>
> {
  return {
    lockOwned: createMysqlDiagnosisAnswerRepository().lockOwned,
    readEvidence: async (tx, session) => {
      if (
        tx.transactionContext !== true ||
        !tx.connection ||
        !/^[1-9]\d*$/u.test(session.internalId)
      ) {
        throw new TypeError('答案证据需要已锁定真实事务与会话')
      }
      const rows = await tx.connection.query(
        'SELECT answer_ref,question_key,answer_json,answered_at_ms,_openid FROM diagnosis_answers WHERE diagnosis_session_internal_id=? ORDER BY id',
        [session.internalId]
      )
      return rows.map(row => {
        if (
          row._openid !== '' ||
          typeof row.answer_ref !== 'string' ||
          typeof row.question_key !== 'string'
        ) {
          throw new TypeError('答案证据归属字段损坏')
        }
        const rawTime = row.answered_at_ms
        const answeredAtMs =
          typeof rawTime === 'number'
            ? rawTime
            : typeof rawTime === 'string' && /^\d+$/u.test(rawTime)
              ? Number(rawTime)
              : NaN
        return {
          evidenceRef: row.answer_ref,
          questionKey: row.question_key,
          answeredAtMs,
          body:
            typeof row.answer_json === 'string'
              ? (JSON.parse(row.answer_json) as unknown)
              : row.answer_json
        }
      })
    }
  }
}
