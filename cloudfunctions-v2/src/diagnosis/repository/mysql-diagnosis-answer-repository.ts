import { randomUUID } from 'node:crypto'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import { lockQuestionPackageSnapshot } from '../domain/question-package-snapshot.js'
import type { DiagnosisAnswerRepository } from '../application/submit-diagnosis-answers.js'

/** 公共引用原样比较，防止数据库不区分大小写而扩大归属。 */
function reference(value: string): void {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !value.length ||
    [...value].length > 64
  ) {
    throw new TypeError('答案会话归属引用非法')
  }
}
/** 内部连接键必须为数据库返回的精确正整数，不接收客户端值。 */
function internalId(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new TypeError('内部会话键不精确')
  }
  const result = String(value)
  if (!/^[1-9]\d*$/u.test(result)) {
    throw new TypeError('内部会话键非法')
  }
  return result
}
/** 每次操作都必须持有调用方事务，不隐式开启或提交。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('答案存储需要显式事务')
  }
  return tx.connection
}
/** 复用已有答案表；唯一键与会话行锁保证整包追加互斥，不提供UPDATE。 */
export function createMysqlDiagnosisAnswerRepository(): DiagnosisAnswerRepository<
  MysqlTransactionContext<Mysql2QueryConnection>
> {
  return {
    lockOwned: async (tx, userRef, userPlantRef, diagnosisRef) => {
      reference(userRef)
      reference(userPlantRef)
      reference(diagnosisRef)
      const rows = await connection(tx).query(
        `SELECT s.id,s.status,s._openid,s.symptom_type,s.question_package_release_ref,
        s.question_package_snapshot_json,s.question_package_snapshot_sha256 FROM diagnosis_sessions AS s
        JOIN users AS u ON u.id=s.user_internal_id
        JOIN user_plants AS p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id
        WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ?
          AND BINARY s.diagnosis_ref=BINARY ? AND u.status='active' AND p.lifecycle_status='active' FOR UPDATE`,
        [userRef, userPlantRef, diagnosisRef]
      )
      if (!rows.length) {
        return { status: 'not_found' }
      }
      if (rows.length !== 1 || rows[0]!._openid !== '') {
        return { status: 'invalid_snapshot' }
      }
      const row = rows[0]!
      if (
        row.question_package_snapshot_json === null &&
        row.question_package_snapshot_sha256 === null
      ) {
        return { status: 'missing_snapshot' }
      }
      try {
        const raw =
          typeof row.question_package_snapshot_json === 'string'
            ? (JSON.parse(row.question_package_snapshot_json) as unknown)
            : row.question_package_snapshot_json
        const snapshot = lockQuestionPackageSnapshot(raw)
        if (
          snapshot.snapshotSha256 !== row.question_package_snapshot_sha256 ||
          snapshot.snapshot.mode !== row.symptom_type ||
          snapshot.snapshot.questionPackageReleaseRef !== row.question_package_release_ref
        ) {
          return { status: 'invalid_snapshot' }
        }
        return {
          status: 'found',
          session: { internalId: internalId(row.id), status: String(row.status), snapshot }
        }
      } catch (error) {
        if (
          error instanceof TypeError ||
          error instanceof RangeError ||
          error instanceof SyntaxError
        ) {
          return { status: 'invalid_snapshot' }
        }
        throw error
      }
    },
    readAnswers: async (tx, session) => {
      const rows = await connection(tx).query(
        'SELECT question_key,answer_json,_openid FROM diagnosis_answers WHERE diagnosis_session_internal_id=? ORDER BY id',
        [internalId(session.internalId)]
      )
      return rows.map(row => {
        if (row._openid !== '' || typeof row.question_key !== 'string') {
          throw new TypeError('答案读回字段损坏')
        }
        return {
          questionKey: row.question_key,
          body:
            typeof row.answer_json === 'string'
              ? (JSON.parse(row.answer_json) as unknown)
              : row.answer_json
        }
      })
    },
    appendAnswers: async (tx, session, answers, occurredAtMs) => {
      if (
        !answers.length ||
        !Number.isSafeInteger(occurredAtMs) ||
        occurredAtMs < 0 ||
        occurredAtMs > 8_640_000_000_000_000
      ) {
        throw new TypeError('答案写入内容或时刻非法')
      }
      const id = internalId(session.internalId)
      const parameters: (string | number)[] = []
      for (const answer of answers) {
        if (
          typeof answer.questionKey !== 'string' ||
          !answer.questionKey.length ||
          [...answer.questionKey].length > 128
        ) {
          throw new TypeError('答案题目代码非法')
        }
        parameters.push(
          randomUUID(),
          id,
          answer.questionKey,
          serializeCanonicalJson(answer.body as CanonicalJsonValue),
          occurredAtMs,
          occurredAtMs,
          occurredAtMs
        )
      }
      const result = await connection(tx).execute(
        `INSERT INTO diagnosis_answers
        (_openid,answer_ref,diagnosis_session_internal_id,question_key,answer_json,answered_at_ms,created_at_ms,updated_at_ms)
        VALUES ${answers.map(() => "('',?,?,?,CAST(? AS JSON),?,?,?)").join(',')}`,
        parameters
      )
      if (result.affectedRows !== answers.length) {
        throw new Error('整包答案写入行数不一致')
      }
    }
  }
}
