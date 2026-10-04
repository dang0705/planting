import Ajv2020 from 'ajv/dist/2020.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type {
  DiagnosisReviewCandidateQuery,
  DiagnosisReviewCandidateRead,
  DiagnosisReviewCandidateRepository
} from '../application/read-review-candidate.js'

/** SQL CHAR 时间须完整、非负且可精确表示，不允许 null、指数或截断数值。 */
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= 8_640_000_000_000_000 ? parsed : null
}
/**
 * 精确读取待审候选；结构版本由受控 Schema 校验，正文摘要重新计算。
 * 使用短事务当前共享读取，阻止在同一审核准备期间更换该行状态或正文。
 * 返回独立 JSON 副本；此 Repository 不写审核、不批准，也不发布。
 */
export function createMysqlDiagnosisReviewCandidateRepository(
  candidateSchema: object
): DiagnosisReviewCandidateRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(candidateSchema)
  return {
    async readSubmitted(
      tx,
      query: DiagnosisReviewCandidateQuery
    ): Promise<DiagnosisReviewCandidateRead> {
      if (tx.transactionContext !== true || !tx.connection) {
        throw new TypeError('待审读取需要显式事务')
      }
      const rows = await tx.connection.query(
        'SELECT candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,CAST(created_at_ms AS CHAR) AS created_at_ms,CAST(submitted_at_ms AS CHAR) AS submitted_at_ms,_openid FROM diagnosis_knowledge_candidates WHERE BINARY candidate_ref=BINARY ? FOR SHARE',
        [query.candidateRef]
      )
      if (rows.length !== 1) {
        return { status: 'unavailable' }
      }
      const row = rows[0]!,
        created = time(row.created_at_ms),
        submitted = time(row.submitted_at_ms)
      if (
        row._openid !== '' ||
        row.candidate_ref !== query.candidateRef ||
        row.candidate_state !== 'submitted' ||
        row.content_sha256 !== query.contentSha256 ||
        created === null ||
        submitted === null ||
        submitted < created
      ) {
        return { status: 'unavailable' }
      }
      try {
        const raw: unknown =
          typeof row.candidate_json === 'string'
            ? JSON.parse(row.candidate_json)
            : row.candidate_json
        const candidate = JSON.parse(
          serializeCanonicalJson(raw as CanonicalJsonValue)
        ) as CanonicalJsonObject
        if (
          !validate(candidate) ||
          candidate.bundleCode !== row.bundle_code ||
          candidate.revisionNo !== row.revision_no ||
          candidate.schemaVersion !== row.schema_version ||
          calculateCanonicalJsonSha256(candidate) !== query.contentSha256
        ) {
          return { status: 'unavailable' }
        }
        return { status: 'submitted_candidate', candidate, submittedAtMs: submitted }
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
  }
}
