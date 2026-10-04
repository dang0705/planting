import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { lockQuestionPackageSnapshot, type LockedQuestionPackageSnapshot } from '../domain/question-package-snapshot.js'

/** 已由上层核验来源的长期诊断会话创建数据；不能从HTTP正文直接授予可信发布状态。 */
export interface PersistentQuestionSession {
  /** 本次服务端生成的高熵诊断引用。 */
  readonly diagnosisRef: string
  /** 认证后统一用户公开引用，不是平台主体标识。 */
  readonly userRef: string
  /** 当前用户植物公开引用，不是数据库主键。 */
  readonly userPlantRef: string
  /** 该次锁定内容；Repository独立重算摘要，拒绝错误配对。 */
  readonly snapshot: LockedQuestionPackageSnapshot
  /** 本次会话发生时间，UTC毫秒。 */
  readonly startedAtMs: number
}

/** 内部只读结果；缺快照与内容损坏都不得进入题包作答。 */
export type QuestionSnapshotRead =
  | {
      /** 归属不匹配、历史缺快照或快照损坏。 */
      readonly status: 'not_found' | 'missing_snapshot' | 'invalid_snapshot'
    }
  | {
      /** 当前归属下读回了可重算的完整快照；不等于来源准入。 */
      readonly status: 'found'
      /** 读回重新锁定的内容及摘要，不含数据库主键。 */
      readonly snapshot: LockedQuestionPackageSnapshot
    }

/** 公开稳定引用原样绑定参数；数据库大小写排序不能改变它的语义。 */
function reference(value: string): void {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || [...value].length > 64) {
    throw new TypeError('诊断、统一用户及用户植物引用必须合法')
  }
}

/**
 * 长期会话题包持久化；创建在调用方事务中，读回同时核验统一用户和用户植物。
 * 未发布内容仍由受控上层拒绝，当前Repository不是发布设施或HTTP入口。
 */
export function createMysqlDiagnosisQuestionSnapshotRepository(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 精确创建，不做覆盖或重复成功伪装；唯一键错误交给上层幂等用例处理。 */
    append: async (transaction: MysqlTransactionContext<Mysql2QueryConnection>, value: PersistentQuestionSession): Promise<'created' | 'not_found'> => {
      if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('诊断创建需要显式事务') }
      reference(value.diagnosisRef); reference(value.userRef); reference(value.userPlantRef)
      if (!Number.isSafeInteger(value.startedAtMs) || value.startedAtMs < 0 || value.startedAtMs > 8_640_000_000_000_000) { throw new TypeError('诊断时间必须为UTC毫秒') }
      const locked = lockQuestionPackageSnapshot(value.snapshot.snapshot)
      if (locked.snapshotSha256 !== value.snapshot.snapshotSha256) { throw new TypeError('题包快照摘要不匹配') }
      const result = await transaction.connection.execute(`INSERT INTO diagnosis_sessions
        (_openid,diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,
         status,started_at_ms,created_at_ms,updated_at_ms,question_package_snapshot_json,question_package_snapshot_sha256)
        SELECT '',?,u.id,p.id,?,?,'active',?,?,?,CAST(? AS JSON),?
        FROM users AS u JOIN user_plants AS p ON p.user_internal_id=u.id
        WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ?
          AND u.status='active' AND p.lifecycle_status='active'`, [value.diagnosisRef,locked.snapshot.mode,
        locked.snapshot.questionPackageReleaseRef,value.startedAtMs,value.startedAtMs,value.startedAtMs,
        serializeCanonicalJson(locked.snapshot as unknown as CanonicalJsonValue),locked.snapshotSha256,value.userRef,value.userPlantRef])
      if (result.affectedRows > 1) { throw new Error('诊断创建归属返回多行，必须回滚') }
      return result.affectedRows === 1 ? 'created' : 'not_found'
    },
    /** 只读取当前有效用户所属、未删除植物下的精确会话；不重建历史缺失内容。 */
    read: async (userRef: string, userPlantRef: string, diagnosisRef: string): Promise<QuestionSnapshotRead> => {
      reference(userRef); reference(userPlantRef); reference(diagnosisRef)
      return withReadConnection(source, async connection => {
        const rows = await connection.query(`SELECT s.question_package_snapshot_json,s.question_package_snapshot_sha256,
          s.symptom_type,s.question_package_release_ref,s._openid FROM diagnosis_sessions AS s
          JOIN users AS u ON u.id=s.user_internal_id
          JOIN user_plants AS p ON p.id=s.user_plant_internal_id AND p.user_internal_id=s.user_internal_id
          WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ?
            AND BINARY s.diagnosis_ref=BINARY ? AND u.status='active' AND p.lifecycle_status IN ('active','archived')`, [userRef,userPlantRef,diagnosisRef])
        if (rows.length === 0) { return { status:'not_found' } }
        if (rows.length !== 1) { return { status:'invalid_snapshot' } }
        const row = rows[0]!
        if (row._openid !== '') { return { status:'invalid_snapshot' } }
        if (row.question_package_snapshot_json === null && row.question_package_snapshot_sha256 === null) { return { status:'missing_snapshot' } }
        try {
          const json = typeof row.question_package_snapshot_json === 'string' ? JSON.parse(row.question_package_snapshot_json) as unknown : row.question_package_snapshot_json
          const locked = lockQuestionPackageSnapshot(json)
          if (locked.snapshotSha256 !== row.question_package_snapshot_sha256 || locked.snapshot.mode !== row.symptom_type
            || locked.snapshot.questionPackageReleaseRef !== row.question_package_release_ref) { return { status:'invalid_snapshot' } }
          return { status:'found',snapshot:locked }
        } catch (error) {
          if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError) { return { status:'invalid_snapshot' } }
          throw error
        }
      })
    },
  }
}
