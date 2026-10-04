import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  createDiagnosisKnowledgeReleaseLocker,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
import type { ActiveDiagnosisKnowledgeRepository } from '../application/read-active-diagnosis-knowledge.js'
import { createMysqlReviewedDiagnosisCandidateReader } from './mysql-reviewed-diagnosis-candidate-reader.js'
/** 单次活动知识快照；读回原审核后当前读核验，不追最新、不执行SQL写入。 */
export function createMysqlActiveDiagnosisKnowledgeReader(
  candidateSchema: object
): ActiveDiagnosisKnowledgeRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const lock = createDiagnosisKnowledgeReleaseLocker(candidateSchema),
    reviewed = createMysqlReviewedDiagnosisCandidateReader(candidateSchema)
  /** 原包、行元数据与活动指针均须一致，损坏不能变成模型自由生成依据。 */
  function decode(row: Record<string, unknown>): LockedDiagnosisKnowledgeRelease | null {
    try {
      const v = lock(
          typeof row.package_json === 'string' ? JSON.parse(row.package_json) : row.package_json
        ),
        p = v.package
      if (
        row.pointer_openid !== '' ||
        row.release_openid !== '' ||
        row.release_state !== 'published' ||
        row.release_ref !== p.releaseRef ||
        row.bundle_code !== p.bundleCode ||
        row.schema_version !== p.schemaVersion ||
        row.release_version !== p.version ||
        row.package_sha256 !== v.packageSha256 ||
        row.candidate_content_sha256 !== p.candidateContentSha256 ||
        String(p.publishedAtMs) !== row.published_at_ms ||
        !Number.isInteger(row.pointer_version) ||
        Number(row.pointer_version) < 1 ||
        Number(row.pointer_version) > 4294967295
      ) {
        return null
      }
      return v
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof SyntaxError ||
        error instanceof RangeError
      ) {
        return null
      }
      throw error
    }
  }
  const columns =
    'p._openid AS pointer_openid,p.version AS pointer_version,CAST(p.release_internal_id AS CHAR) AS release_id,r._openid AS release_openid,r.release_ref,r.bundle_code,r.version AS release_version,r.schema_version,r.package_json,r.package_sha256,r.candidate_content_sha256,r.release_state,CAST(r.published_at_ms AS CHAR) AS published_at_ms'
  return {
    readActive: async (tx, input) => {
      if (tx.transactionContext !== true || !tx.connection) {
        throw new TypeError('活动知识读取需要显式事务')
      }
      const c = tx.connection,
        rows = await c.query(
          `SELECT ${columns} FROM active_diagnosis_knowledge_releases p JOIN diagnosis_knowledge_releases r ON r.id=p.release_internal_id WHERE BINARY p.bundle_code=BINARY ?`,
          [input.bundleCode]
        )
      if (rows.length !== 1) {
        return { status: 'unavailable' }
      }
      const old = rows[0]!,
        release = decode(old)
      if (
        !release ||
        release.package.bundleCode !== input.bundleCode ||
        release.package.reviewProtocolVersion !== input.reviewProtocolVersion
      ) {
        return { status: 'unavailable' }
      }
      const p = release.package,
        a = await reviewed.read(tx, p.candidateRef, p.reviewRef, input.reviewProtocolVersion)
      if (
        a.status !== 'reviewed_candidate' ||
        a.contentSha256 !== p.candidateContentSha256 ||
        a.decidedAtMs > p.publishedAtMs
      ) {
        return { status: 'unavailable' }
      }
      // 与发布/撤销先锁审核再锁指针的顺序一致；当前读防止旧快照掩盖切换或撤回。
      const current = await c.query(
        `SELECT ${columns},a.review_ref AS bound_review_ref,k.candidate_ref AS bound_candidate_ref FROM active_diagnosis_knowledge_releases p JOIN diagnosis_knowledge_releases r ON r.id=p.release_internal_id JOIN diagnosis_review_attestations a ON a.id=r.review_attestation_internal_id JOIN diagnosis_knowledge_candidates k ON k.id=r.candidate_internal_id AND a.candidate_internal_id=k.id WHERE BINARY p.bundle_code=BINARY ? FOR SHARE`,
        [input.bundleCode]
      )
      if (current.length !== 1) {
        return { status: 'unavailable' }
      }
      const row = current[0]!,
        final = decode(row)
      if (
        !final ||
        row.pointer_version !== old.pointer_version ||
        row.release_id !== old.release_id ||
        final.packageSha256 !== release.packageSha256 ||
        row.bound_review_ref !== p.reviewRef ||
        row.bound_candidate_ref !== p.candidateRef
      ) {
        return { status: 'unavailable' }
      }
      return { status: 'active', release: final, pointerVersion: Number(row.pointer_version) }
    }
  }
}
