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
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import { createMysqlReviewedDiagnosisCandidateReader } from './mysql-reviewed-diagnosis-candidate-reader.js'
import {
  createDiagnosisKnowledgeReleaseLocker,
  DiagnosisKnowledgePublicationConflictError,
  type DiagnosisKnowledgePublicationCommand,
  type LockedDiagnosisKnowledgeRelease
} from '../domain/diagnosis-knowledge-release.js'
import type {
  DiagnosisKnowledgePublicationRepository,
  DiagnosisKnowledgePublicationResult
} from '../application/publish-diagnosis-knowledge.js'
/** 显式事务保证审核锁及活动指针锁持续到调用方提交，不另开写连接。 */
function connection(tx: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (tx.transactionContext !== true || !tx.connection) {
    throw new TypeError('知识发布需要显式事务')
  }
  return tx.connection
}
/**
 * 使用既有009发布/指针/审计与010撤销表，新增发布不更新历史包。
 * 来源许可和CMS身份仍须由应用受控端口核验；本适配器不能自行授予依赖资格。
 * 指针冲突和唯一键并发失败向上抛专属冲突，使共享事务驱动回滚全部新写入。
 */
export function createMysqlDiagnosisKnowledgePublicationRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  candidateSchema: object
): DiagnosisKnowledgePublicationRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const reviewed = createMysqlReviewedDiagnosisCandidateReader(candidateSchema),
    lock = createDiagnosisKnowledgeReleaseLocker(candidateSchema)
  /** 历史审计+原发布包比对命令；不根据当前指针或当前审核状态重新激活。 */
  async function receipt(
    c: Mysql2QueryConnection,
    command: DiagnosisKnowledgePublicationCommand
  ): Promise<DiagnosisKnowledgePublicationResult | { status: 'not_found' }> {
    const rows = await c.query(
      `SELECT a._openid AS audit_openid,a.operator_ref_hash,a.bundle_code AS audit_bundle,a.expected_pointer_version,a.action_kind,a.reason_zh,r._openid AS release_openid,r.release_ref,r.bundle_code,r.version,r.schema_version,r.package_json,r.package_sha256,r.candidate_content_sha256,r.release_state,CAST(r.published_at_ms AS CHAR) AS published_at_ms FROM diagnosis_release_activation_audit a JOIN diagnosis_knowledge_releases r ON r.id=a.new_release_internal_id WHERE BINARY a.command_ref=BINARY ?`,
      [command.commandRef]
    )
    if (rows.length === 0) {
      return { status: 'not_found' }
    }
    if (rows.length !== 1) {
      return { status: 'unavailable' }
    }
    const r = rows[0]!
    try {
      const locked = lock(
          typeof r.package_json === 'string' ? JSON.parse(r.package_json) : r.package_json
        ),
        p = locked.package
      if (
        r.audit_openid !== '' ||
        r.release_openid !== '' ||
        r.schema_version !== p.schemaVersion ||
        r.package_sha256 !== locked.packageSha256 ||
        r.candidate_content_sha256 !== p.candidateContentSha256 ||
        r.release_ref !== p.releaseRef ||
        r.bundle_code !== p.bundleCode ||
        r.version !== p.version ||
        String(p.publishedAtMs) !== r.published_at_ms ||
        !['published', 'withdrawn'].includes(String(r.release_state))
      ) {
        return { status: 'unavailable' }
      }
      if (
        r.operator_ref_hash !== command.operatorRefHash ||
        r.audit_bundle !== command.bundleCode ||
        r.expected_pointer_version !== command.expectedPointerVersion ||
        r.reason_zh !== command.reasonZh ||
        r.action_kind !== 'activate' ||
        (
          [
            'releaseRef',
            'bundleCode',
            'version',
            'candidateRef',
            'candidateContentSha256',
            'reviewRef',
            'reviewProtocolVersion'
          ] as const
        ).some(k => p[k] !== command[k])
      ) {
        return { status: 'conflict' }
      }
      return {
        status: 'published',
        releaseRef: p.releaseRef,
        packageSha256: locked.packageSha256,
        pointerVersion: command.expectedPointerVersion + 1
      }
    } catch (e) {
      if (e instanceof TypeError || e instanceof SyntaxError || e instanceof RangeError) {
        return { status: 'unavailable' }
      }
      throw e
    }
  }
  return {
    readReceipt: (tx, command) => receipt(connection(tx), command),
    readReviewed: (tx, command) =>
      reviewed.read(tx, command.candidateRef, command.reviewRef, command.reviewProtocolVersion),
    reconcile: command =>
      withReadConnection(source, async c => {
        const r = await receipt(c, command)
        return r.status === 'not_found' ? { status: 'unknown_commit' } : r
      }),
    activate: async (tx, command, release: LockedDiagnosisKnowledgeRelease) => {
      const c = connection(tx),
        locked = lock(release.package)
      if (locked.packageSha256 !== release.packageSha256) {
        throw new TypeError('知识发布摘要错配')
      }
      try {
        const pointers = await c.query(
          'SELECT CAST(id AS CHAR) AS id,CAST(release_internal_id AS CHAR) AS release_id,version,_openid FROM active_diagnosis_knowledge_releases WHERE BINARY bundle_code=BINARY ? FOR UPDATE',
          [command.bundleCode]
        )
        if (pointers.length > 1 || (pointers[0] && pointers[0]._openid !== '')) {
          throw new TypeError('活动指针损坏')
        }
        const old = pointers[0],
          version = old ? old.version : 0
        if (
          version !== command.expectedPointerVersion ||
          command.expectedPointerVersion === 4294967295
        ) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        const latest = await c.query(
          'SELECT version FROM diagnosis_knowledge_releases WHERE BINARY bundle_code=BINARY ? ORDER BY version DESC LIMIT 1 FOR UPDATE',
          [command.bundleCode]
        )
        if (latest.length && Number(latest[0]!.version) >= command.version) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        const published = await c.execute(
          `INSERT INTO diagnosis_knowledge_releases(release_ref,bundle_code,version,candidate_internal_id,candidate_content_sha256,review_attestation_internal_id,schema_version,package_json,package_sha256,release_state,published_at_ms) SELECT ?,?,?,k.id,k.content_sha256,a.id,?,CAST(? AS JSON),?,'published',? FROM diagnosis_knowledge_candidates k JOIN diagnosis_review_attestations a ON a.candidate_internal_id=k.id AND a.content_sha256=k.content_sha256 WHERE BINARY k.candidate_ref=BINARY ? AND BINARY a.review_ref=BINARY ? AND k.content_sha256=? AND a.decision='approved'`,
          [
            command.releaseRef,
            command.bundleCode,
            command.version,
            locked.package.schemaVersion,
            serializeCanonicalJson(locked.package as unknown as CanonicalJsonValue),
            locked.packageSha256,
            locked.package.publishedAtMs,
            command.candidateRef,
            command.reviewRef,
            command.candidateContentSha256
          ]
        )
        if (published.affectedRows !== 1) {
          throw new Error('知识发布未保存')
        }
        const ids = await c.query(
          'SELECT CAST(id AS CHAR) AS id FROM diagnosis_knowledge_releases WHERE BINARY release_ref=BINARY ?',
          [command.releaseRef]
        )
        if (ids.length !== 1) {
          throw new Error('知识发布引用未读回')
        }
        const newId = String(ids[0]!.id),
          at = locked.package.publishedAtMs
        const pointer = old
          ? await c.execute(
              'UPDATE active_diagnosis_knowledge_releases SET release_internal_id=?,version=?,activated_at_ms=? WHERE id=? AND version=?',
              [
                newId,
                command.expectedPointerVersion + 1,
                at,
                String(old.id),
                command.expectedPointerVersion
              ]
            )
          : await c.execute(
              'INSERT INTO active_diagnosis_knowledge_releases(bundle_code,release_internal_id,version,activated_at_ms) VALUES(?,?,1,?)',
              [command.bundleCode, newId, at]
            )
        if (pointer.affectedRows !== 1) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        const audit = await c.execute(
          "INSERT INTO diagnosis_release_activation_audit(command_ref,operator_ref_hash,bundle_code,previous_release_internal_id,new_release_internal_id,expected_pointer_version,action_kind,reason_zh,created_at_ms) VALUES(?,?,?,?,?,?,'activate',?,?)",
          [
            command.commandRef,
            command.operatorRefHash,
            command.bundleCode,
            old ? String(old.release_id) : null,
            newId,
            command.expectedPointerVersion,
            command.reasonZh,
            at
          ]
        )
        if (audit.affectedRows !== 1) {
          throw new Error('知识发布审计未保存')
        }
        const result = await receipt(c, command)
        if (result.status !== 'published') {
          throw new Error('知识发布收据读回失败')
        }
        return result
      } catch (e) {
        if (
          e !== null &&
          typeof e === 'object' &&
          'code' in e &&
          ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(String(e.code))
        ) {
          throw new DiagnosisKnowledgePublicationConflictError()
        }
        throw e
      }
    }
  }
}
