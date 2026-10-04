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
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import {
  lockDiagnosisResultRecord,
  type LockedDiagnosisResultRecord
} from '../domain/diagnosis-result-record.js'
/** 内部保存命令；所有身份和时间来自受控服务端，不接受客户端自报审核。 */
export interface PersistentDiagnosisResultRecord {
  /** 统一用户公开引用。 */ readonly userRef: string
  /** 所属长期植物引用。 */ readonly userPlantRef: string
  /** 已存在且归属一致的会话引用。 */ readonly diagnosisRef: string
  /** 服务器产生的高熵结果引用。 */ readonly resultRef: string
  /** 已结构锁定的完整结果，不能视为审核准入凭据。 */ readonly record: LockedDiagnosisResultRecord
  /** 服务端UTC毫秒。 */ readonly generatedAtMs: number
}
/** 校验参数边界，公开引用原样绑定而不按数据库大小写排序猜测。 */
function reference(value: string): void {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !value.length ||
    [...value].length > 64
  ) {
    throw new TypeError('诊断结果归属引用非法')
  }
}
/** 旧三列只承接对应公开字段；完整结果以新列和完整摘要为唯一读回对象。 */
function legacyParts(publicResult: CanonicalJsonObject) {
  const evidence: Record<string, CanonicalJsonValue> = {},
    conclusion: Record<string, CanonicalJsonValue> = {},
    proposal: Record<string, CanonicalJsonValue> = {}
  for (const [key, value] of Object.entries(publicResult)) {
    if (['evidenceFindings', 'evidenceLimitations', 'missingEvidence'].includes(key)) {
      evidence[key] = value
    } else if (['recommendedActions', 'followUp'].includes(key)) {
      proposal[key] = value
    } else {
      conclusion[key] = value
    }
  }
  return [evidence, conclusion, proposal].map(serializeCanonicalJson)
}
/** 复用原样结果记录校验，不由当前知识重算历史内容。 */
function decodeRows(rows: readonly Record<string, unknown>[]) {
  if (rows.length === 0) {
    return { status: 'not_found' as const }
  }
  if (rows.length !== 1) {
    return { status: 'invalid_record' as const }
  }
  const r = rows[0]!
  if (
    r.record_schema_version === null &&
    r.public_result_json === null &&
    r.replay_snapshot_json === null &&
    r.record_sha256 === null &&
    r.knowledge_release_ref === null
  ) {
    return { status: 'missing_record' as const }
  }
  try {
    const parse = (v: unknown) => (typeof v === 'string' ? (JSON.parse(v) as unknown) : v)
    const record = lockDiagnosisResultRecord({
      contractVersion: r.record_schema_version,
      publicResult: parse(r.public_result_json),
      replay: parse(r.replay_snapshot_json)
    })
    if (
      r._openid !== '' ||
      record.recordSha256 !== r.record_sha256 ||
      record.record.replay.knowledgeReleaseRef !== r.knowledge_release_ref ||
      record.record.publicResult.contractVersion !== r.result_version
    ) {
      return { status: 'invalid_record' as const }
    }
    return { status: 'found' as const, record }
  } catch (e) {
    if (e instanceof TypeError || e instanceof SyntaxError || e instanceof RangeError) {
      return { status: 'invalid_record' as const }
    }
    throw e
  }
}
/** 单连接/显式事务保存；公开HTTP与知识语义准入由上游负责，当前不开放结果写HTTP。 */
export function createMysqlDiagnosisResultRecordRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>
) {
  return {
    /** 唯一会话结果约束拒绝重复；不覆盖历史，也不自动重试未知提交。 */
    append: async (
      tx: MysqlTransactionContext<Mysql2QueryConnection>,
      input: PersistentDiagnosisResultRecord
    ): Promise<'created' | 'not_found'> => {
      if (tx.transactionContext !== true || !tx.connection) {
        throw new TypeError('结果写入需要显式事务')
      }
      for (const ref of [input.userRef, input.userPlantRef, input.diagnosisRef, input.resultRef]) {
        reference(ref)
      }
      if (
        !Number.isSafeInteger(input.generatedAtMs) ||
        input.generatedAtMs < 0 ||
        input.generatedAtMs > 8_640_000_000_000_000
      ) {
        throw new TypeError('结果时间非法')
      }
      const locked = lockDiagnosisResultRecord(input.record.record)
      if (locked.recordSha256 !== input.record.recordSha256) {
        throw new TypeError('结果摘要不匹配')
      }
      const replay = locked.record.replay
      const owned = await tx.connection.query(
        `SELECT s.id,s.question_package_release_ref,s.symptom_type,s._openid,s.question_package_snapshot_json,s.question_package_snapshot_sha256 FROM diagnosis_sessions s JOIN users u ON u.id=s.user_internal_id JOIN user_plants p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ? AND BINARY s.diagnosis_ref=BINARY ? AND u.status='active' AND p.lifecycle_status='active' AND s.status IN ('active','completed') FOR UPDATE`,
        [input.userRef, input.userPlantRef, input.diagnosisRef]
      )
      if (owned.length === 0) {
        return 'not_found'
      }
      const question = replay.questionPackage as unknown as CanonicalJsonObject,
        snapshot = question.snapshot as CanonicalJsonObject
      if (
        owned.length !== 1 ||
        owned[0]!._openid !== '' ||
        owned[0]!.question_package_release_ref !== snapshot.questionPackageReleaseRef ||
        owned[0]!.symptom_type !== snapshot.mode
      ) {
        throw new TypeError('结果题包与归属会话不匹配')
      }
      const storedQuestion =
        typeof owned[0]!.question_package_snapshot_json === 'string'
          ? (JSON.parse(owned[0]!.question_package_snapshot_json) as CanonicalJsonValue)
          : (owned[0]!.question_package_snapshot_json as CanonicalJsonValue)
      if (
        question.snapshotSha256 !== owned[0]!.question_package_snapshot_sha256 ||
        serializeCanonicalJson(storedQuestion) !== serializeCanonicalJson(snapshot)
      ) {
        throw new TypeError('结果题包正文与会话不一致')
      }
      const releases = await tx.connection.query(
        'SELECT package_sha256,release_state FROM diagnosis_knowledge_releases WHERE BINARY release_ref=BINARY ? FOR SHARE',
        [replay.knowledgeReleaseRef as string]
      )
      if (
        releases.length !== 1 ||
        releases[0]!.release_state !== 'published' ||
        releases[0]!.package_sha256 !== replay.knowledgePackageSha256
      ) {
        throw new TypeError('结果知识发布不可用或摘要不匹配')
      }
      const parts = legacyParts(locked.record.publicResult)
      const r = await tx.connection.execute(
        `INSERT INTO diagnosis_results(result_ref,diagnosis_session_internal_id,result_version,evidence_summary_json,conclusion_json,proposal_json,generated_at_ms,created_at_ms,updated_at_ms,record_schema_version,public_result_json,replay_snapshot_json,record_sha256,knowledge_release_ref) VALUES(?,?,?,CAST(? AS JSON),CAST(? AS JSON),CAST(? AS JSON),?,?,?,?,CAST(? AS JSON),CAST(? AS JSON),?,?)`,
        [
          input.resultRef,
          String(owned[0]!.id),
          locked.record.publicResult.contractVersion as string,
          ...parts,
          input.generatedAtMs,
          input.generatedAtMs,
          input.generatedAtMs,
          locked.record.contractVersion,
          serializeCanonicalJson(locked.record.publicResult),
          serializeCanonicalJson(replay as unknown as CanonicalJsonValue),
          locked.recordSha256,
          replay.knowledgeReleaseRef as string
        ]
      )
      if (r.affectedRows !== 1) {
        throw new Error('诊断结果保存未成功')
      }
      return 'created'
    },
    /** 仅凭用户与会话公开引用按归属读取；旧记录及原知识失效明确不可用。 */
    readForUser: async (userRef: string, diagnosisRef: string) => {
      reference(userRef)
      if (
        typeof diagnosisRef !== 'string' ||
        [...diagnosisRef].length < 8 ||
        [...diagnosisRef].length > 100
      ) {
        throw new TypeError('会话路径引用非法')
      }
      return withReadConnection(source, async c => {
        const rows = await c.query(
          `SELECT r.record_schema_version,r.public_result_json,r.replay_snapshot_json,r.record_sha256,r.knowledge_release_ref,r.result_version,r._openid,k.package_sha256 AS knowledge_sha,k.release_state AS knowledge_state FROM diagnosis_results r JOIN diagnosis_sessions s ON s.id=r.diagnosis_session_internal_id JOIN users u ON u.id=s.user_internal_id JOIN user_plants p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id LEFT JOIN diagnosis_knowledge_releases k ON BINARY k.release_ref=BINARY r.knowledge_release_ref WHERE BINARY u.public_user_id=BINARY ? AND BINARY s.diagnosis_ref=BINARY ? AND u.status='active' AND p.lifecycle_status IN ('active','archived')`,
          [userRef, diagnosisRef]
        )
        const result = decodeRows(rows)
        if (
          result.status === 'found' &&
          (rows[0]!.knowledge_state !== 'published' ||
            rows[0]!.knowledge_sha !== result.record.record.replay.knowledgePackageSha256)
        ) {
          return { status: 'unavailable' as const }
        }
        return result
      })
    },
    /** 归属读取后重算整个快照；不跟随活动发布重写历史。 */
    read: async (userRef: string, userPlantRef: string, diagnosisRef: string) => {
      for (const ref of [userRef, userPlantRef, diagnosisRef]) {
        reference(ref)
      }
      return withReadConnection(source, async c => {
        const rows = await c.query(
          `SELECT r.record_schema_version,r.public_result_json,r.replay_snapshot_json,r.record_sha256,r.knowledge_release_ref,r.result_version,r._openid FROM diagnosis_results r JOIN diagnosis_sessions s ON s.id=r.diagnosis_session_internal_id JOIN users u ON u.id=s.user_internal_id JOIN user_plants p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ? AND BINARY s.diagnosis_ref=BINARY ? AND u.status='active' AND p.lifecycle_status IN ('active','archived')`,
          [userRef, userPlantRef, diagnosisRef]
        )
        return decodeRows(rows)
      })
    }
  }
}
