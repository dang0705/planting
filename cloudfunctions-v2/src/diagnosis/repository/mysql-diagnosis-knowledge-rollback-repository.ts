import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  createDiagnosisKnowledgeReleaseLocker,
  DiagnosisKnowledgePublicationConflictError,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
import type { DiagnosisKnowledgeRollbackCommand } from '../domain/diagnosis-knowledge-rollback.js'
import type {
  DiagnosisKnowledgeRollbackRepository,
  DiagnosisKnowledgeRollbackResult,
  MissingDiagnosisRollbackReceipt
} from '../application/rollback-diagnosis-knowledge.js'
import { createMysqlReviewedDiagnosisCandidateReader } from './mysql-reviewed-diagnosis-candidate-reader.js'
/** 共享驱动的显式事务连接，拒绝普通对象模拟事务。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>) {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('知识回滚需要显式事务')
  }
  return tx.connection
}
/** 已核验009发布行的原样列；查询始终通过参数绑定。 */
const releaseColumns =
  'CAST(r.id AS CHAR) AS id,r._openid,r.release_ref,r.bundle_code,r.version,r.schema_version,r.package_json,r.package_sha256,r.candidate_content_sha256,r.release_state,CAST(r.published_at_ms AS CHAR) AS published_at_ms'
/** 回滚只写活动指针和追加审计；旧发布包、审核和诊断结果不更新。 */
export function createMysqlDiagnosisKnowledgeRollbackRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  candidateSchema: object
): DiagnosisKnowledgeRollbackRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const lock = createDiagnosisKnowledgeReleaseLocker(candidateSchema),
    reviewed = createMysqlReviewedDiagnosisCandidateReader(candidateSchema)
  /** 验证原样包全文及行元数据，不能仅凭release引用或存储摘要认定有效。 */
  function decode(row: Record<string, unknown>): LockedDiagnosisKnowledgeRelease | null {
    try {
      const v = lock(
          typeof row.package_json === 'string' ? JSON.parse(row.package_json) : row.package_json
        ),
        p = v.package
      if (
        row._openid !== '' ||
        row.release_ref !== p.releaseRef ||
        row.bundle_code !== p.bundleCode ||
        row.version !== p.version ||
        row.schema_version !== p.schemaVersion ||
        row.package_sha256 !== v.packageSha256 ||
        row.candidate_content_sha256 !== p.candidateContentSha256 ||
        String(p.publishedAtMs) !== row.published_at_ms ||
        !['published', 'withdrawn'].includes(String(row.release_state))
      ) {
        return null
      }
      return v
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof RangeError ||
        error instanceof SyntaxError
      ) {
        return null
      }
      throw error
    }
  }
  /** 只读历史回滚审计；当前指针改变或包撤回不改当时收据。 */
  async function receipt(
    c: Mysql2QueryConnection,
    command: DiagnosisKnowledgeRollbackCommand
  ): Promise<DiagnosisKnowledgeRollbackResult | MissingDiagnosisRollbackReceipt> {
    const rows = await c.query(
      `SELECT ${releaseColumns},a._openid AS audit_openid,a.operator_ref_hash,a.bundle_code AS audit_bundle,a.expected_pointer_version,a.action_kind,a.reason_zh FROM diagnosis_release_activation_audit a JOIN diagnosis_knowledge_releases r ON r.id=a.new_release_internal_id WHERE BINARY a.command_ref=BINARY ?`,
      [command.commandRef]
    )
    if (!rows.length) {
      return { status: 'not_found' }
    }
    if (rows.length !== 1) {
      return { status: 'unavailable' }
    }
    const r = rows[0]!,
      v = decode(r)
    if (!v || r.audit_openid !== '') {
      return { status: 'unavailable' }
    }
    if (
      r.operator_ref_hash !== command.operatorRefHash ||
      r.audit_bundle !== command.bundleCode ||
      r.expected_pointer_version !== command.expectedPointerVersion ||
      r.action_kind !== 'rollback' ||
      r.reason_zh !== command.reasonZh ||
      v.package.releaseRef !== command.targetReleaseRef ||
      v.packageSha256 !== command.targetPackageSha256 ||
      v.package.bundleCode !== command.bundleCode ||
      v.package.reviewProtocolVersion !== command.reviewProtocolVersion
    ) {
      return { status: 'conflict' }
    }
    return {
      status: 'rolled_back',
      releaseRef: command.targetReleaseRef,
      packageSha256: command.targetPackageSha256,
      pointerVersion: command.expectedPointerVersion + 1
    }
  }
  return {
    readReceipt: (tx, command) => receipt(connection(tx), command),
    reconcile: command =>
      withReadConnection(source, async c => {
        const r = await receipt(c, command)
        return r.status === 'not_found' ? { status: 'unknown_commit' } : r
      }),
    readTarget: async (tx, command) => {
      const c = connection(tx),
        rows = await c.query(
          `SELECT ${releaseColumns} FROM diagnosis_knowledge_releases r WHERE BINARY r.release_ref=BINARY ?`,
          [command.targetReleaseRef]
        )
      if (rows.length !== 1) {
        return { status: 'unavailable' }
      }
      const row = rows[0]!,
        v = decode(row)
      if (
        !v ||
        row.release_state !== 'published' ||
        v.packageSha256 !== command.targetPackageSha256 ||
        v.package.bundleCode !== command.bundleCode ||
        v.package.reviewProtocolVersion !== command.reviewProtocolVersion
      ) {
        return { status: 'unavailable' }
      }
      const p = v.package,
        a = await reviewed.read(tx, p.candidateRef, p.reviewRef, command.reviewProtocolVersion)
      if (
        a.status !== 'reviewed_candidate' ||
        a.contentSha256 !== p.candidateContentSha256 ||
        a.decidedAtMs > p.publishedAtMs
      ) {
        return { status: 'unavailable' }
      }
      // 审核外键必须指向包内原批准；不能用另一条同摘要批准替代。
      const bindings = await c.query(
        'SELECT r.release_ref FROM diagnosis_knowledge_releases r JOIN diagnosis_review_attestations a ON a.id=r.review_attestation_internal_id JOIN diagnosis_knowledge_candidates k ON k.id=r.candidate_internal_id WHERE BINARY r.release_ref=BINARY ? AND BINARY a.review_ref=BINARY ? AND BINARY k.candidate_ref=BINARY ? AND a.candidate_internal_id=k.id',
        [command.targetReleaseRef, p.reviewRef, p.candidateRef]
      )
      if (bindings.length !== 1) {
        return { status: 'unavailable' }
      }
      return { status: 'ready', release: v }
    },
    rollback: async (tx, command, release, at) => {
      const c = connection(tx)
      try {
        const pointers = await c.query(
          'SELECT CAST(p.id AS CHAR) AS id,CAST(p.release_internal_id AS CHAR) AS release_id,p.version,CAST(p.activated_at_ms AS CHAR) AS activated_at_ms,p._openid,r.bundle_code AS current_bundle,r.version AS release_version FROM active_diagnosis_knowledge_releases p JOIN diagnosis_knowledge_releases r ON r.id=p.release_internal_id WHERE BINARY p.bundle_code=BINARY ? FOR UPDATE',
          [command.bundleCode]
        )
        if (
          pointers.length !== 1 ||
          pointers[0]!._openid !== '' ||
          pointers[0]!.current_bundle !== command.bundleCode
        ) {
          return { status: 'unavailable' }
        }
        const old = pointers[0]!
        if (old.version !== command.expectedPointerVersion) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        const oldAt = Number(old.activated_at_ms)
        if (
          !Number.isSafeInteger(oldAt) ||
          at < oldAt ||
          release.package.version >= Number(old.release_version)
        ) {
          return { status: 'unavailable' }
        }
        // 当前读在指针锁后核验目标，旧快照里的published状态不授予回滚资格。
        const targets = await c.query(
          `SELECT ${releaseColumns},a.review_ref AS bound_review_ref,k.candidate_ref AS bound_candidate_ref FROM diagnosis_knowledge_releases r JOIN diagnosis_review_attestations a ON a.id=r.review_attestation_internal_id JOIN diagnosis_knowledge_candidates k ON k.id=r.candidate_internal_id AND a.candidate_internal_id=k.id WHERE BINARY r.release_ref=BINARY ? FOR SHARE`,
          [command.targetReleaseRef]
        )
        if (targets.length !== 1) {
          return { status: 'unavailable' }
        }
        const target = targets[0]!,
          locked = decode(target)
        if (
          !locked ||
          target.release_state !== 'published' ||
          locked.packageSha256 !== command.targetPackageSha256 ||
          locked.packageSha256 !== release.packageSha256 ||
          locked.package.bundleCode !== command.bundleCode ||
          target.bound_review_ref !== locked.package.reviewRef ||
          target.bound_candidate_ref !== locked.package.candidateRef
        ) {
          return { status: 'unavailable' }
        }
        const newId = String(target.id)
        const changed = await c.execute(
          'UPDATE active_diagnosis_knowledge_releases SET release_internal_id=?,version=?,activated_at_ms=? WHERE id=? AND version=?',
          [
            newId,
            command.expectedPointerVersion + 1,
            at,
            String(old.id),
            command.expectedPointerVersion
          ]
        )
        if (changed.affectedRows !== 1) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        const audit = await c.execute(
          "INSERT INTO diagnosis_release_activation_audit(command_ref,operator_ref_hash,bundle_code,previous_release_internal_id,new_release_internal_id,expected_pointer_version,action_kind,reason_zh,created_at_ms) VALUES(?,?,?,?,?,?,'rollback',?,?)",
          [
            command.commandRef,
            command.operatorRefHash,
            command.bundleCode,
            String(old.release_id),
            newId,
            command.expectedPointerVersion,
            command.reasonZh,
            at
          ]
        )
        if (audit.affectedRows !== 1) {
          throw new Error('知识回滚审计未保存')
        }
        const result = await receipt(c, command)
        if (result.status !== 'rolled_back') {
          throw new Error('知识回滚收据未读回')
        }
        return result
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(error.code))
        ) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        throw error
      }
    }
  }
}
