import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  serializeCanonicalJson,
  type CanonicalJsonObject
} from '../../foundation/json/canonical-json-sha256.js'
import { validateDiagnosisModelOutput } from '../domain/validate-diagnosis-model-output.js'
/** 尚未创建诊断会话时，按统一用户及植物读取既有私有资产。 */
interface OwnedDiagnosisAssetQuery {
  /** 身份域确认的统一用户引用。 */ readonly userRef: string
  /** 用户明确选择的植物引用。 */ readonly userPlantRef: string
  /** 已归属植物的私有资产公开引用。 */ readonly assetRef: string
  /** 服务端创建时间，用于拒绝已到清理时间的资产。 */ readonly startedAtMs: number
}
/** 精确资产读取不披露私有文件标识或内部主键。 */
export type OwnedDiagnosisAssetRead =
  | {
      /** 归属缺失、已经过期或内容非法。 */
      readonly status: 'not_found' | 'expired' | 'invalid'
    }
  | {
      /** 资产已按同一事务归属锁定。 */ readonly status: 'found'
      /** 精确的私有资产公开引用。 */ readonly assetRef: string
      /** 模型分析必须绑定此文件内容摘要。 */ readonly contentSha256: string
    }
/** 上层已准入的结构化视觉证据；Repository仍重新核验合同与归属。 */
export interface PersistentDiagnosisVisualEvidence {
  /** 新会话的高熵公开引用。 */ readonly diagnosisRef: string
  /** 服务端生成的高熵视觉证据引用。 */ readonly evidenceRef: string
  /** 身份域解析的统一用户引用。 */ readonly userRef: string
  /** 同一用户的目标植物引用。 */ readonly userPlantRef: string
  /** 被分析的私有诊断资产引用。 */ readonly assetRef: string
  /** 分析针对的资产内容摘要，用于防止内容变化后误绑定。 */ readonly assetContentSha256: string
  /** 已确认的图片采集区域。 */ readonly evidenceKind:
    | 'leaf'
    | 'stem'
    | 'soil_surface'
    | 'whole_plant'
  /** 通过已确认Schema的结构化副本，不是原始模型输出。 */ readonly output: CanonicalJsonObject
  /** 可信服务端UTC毫秒，不采用客户端时间。 */ readonly createdAtMs: number
  /** 上游明确提供的保留截止时间，不设默认期限。 */ readonly expiresAtMs: number
}
/** 引用原样绑定，不强制转换或修剪后替代实际身份。 */
function refs(values: readonly string[]): void {
  if (
    values.some(v => typeof v !== 'string' || !v.length || v.trim() !== v || [...v].length > 64)
  ) {
    throw new TypeError('视觉资产或归属引用非法')
  }
}
/** 与数据库BIGINT的无损范围一致，不创造新的有效期策略。 */
function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
}
/** 原事务精确读取私有资产或创建视觉证据；不取公开URL、不更新原资产。 */
export function createMysqlDiagnosisVisualEvidenceRepository() {
  return {
    /** 资产可先存在于用户植物下，随后随诊断会话原子关联。 */
    readOwnedAsset: async (
      tx: MysqlTransactionContext<Mysql2QueryConnection>,
      input: OwnedDiagnosisAssetQuery
    ): Promise<OwnedDiagnosisAssetRead> => {
      if (tx.transactionContext !== true || !tx.connection || !validTime(input.startedAtMs)) {
        throw new TypeError('视觉资产读取需要有效原事务')
      }
      refs([input.userRef, input.userPlantRef, input.assetRef])
      const rows = await tx.connection.query(
        `SELECT a.asset_ref,a.content_hash,CAST(a.cleanup_after_ms AS CHAR) AS cleanup_after_ms,
    a._openid AS asset_openid,u._openid AS user_openid,p._openid AS plant_openid
    FROM user_plant_assets AS a JOIN users AS u ON u.id=a.user_internal_id
    JOIN user_plants AS p ON p.id=a.user_plant_internal_id AND p.user_internal_id=u.id
    WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ? AND BINARY a.asset_ref=BINARY ?
    AND u.status='active' AND p.lifecycle_status='active' AND a.status='active' AND a.asset_purpose='diagnosis_evidence' FOR SHARE`,
        [input.userRef, input.userPlantRef, input.assetRef]
      )
      if (!rows.length) {
        return { status: 'not_found' }
      }
      if (rows.length !== 1) {
        return { status: 'invalid' }
      }
      const row = rows[0]!
      if (
        row.asset_ref !== input.assetRef ||
        typeof row.content_hash !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(row.content_hash) ||
        ['asset_openid', 'user_openid', 'plant_openid'].some(k => row[k] !== '')
      ) {
        return { status: 'invalid' }
      }
      if (row.cleanup_after_ms !== null) {
        if (
          typeof row.cleanup_after_ms !== 'string' ||
          !/^(0|[1-9][0-9]*)$/u.test(row.cleanup_after_ms) ||
          !validTime(Number(row.cleanup_after_ms))
        ) {
          return { status: 'invalid' }
        }
        if (Number(row.cleanup_after_ms) <= input.startedAtMs) {
          return { status: 'expired' }
        }
      }
      return { status: 'found', assetRef: input.assetRef, contentSha256: row.content_hash }
    },
    /** INSERT SELECT再次按字节核验会话、资产、用途、状态及内容摘要。 */
    append: async (
      tx: MysqlTransactionContext<Mysql2QueryConnection>,
      input: PersistentDiagnosisVisualEvidence
    ): Promise<'created' | 'not_found'> => {
      if (
        tx.transactionContext !== true ||
        !tx.connection ||
        !validTime(input.createdAtMs) ||
        !validTime(input.expiresAtMs) ||
        input.expiresAtMs <= input.createdAtMs
      ) {
        throw new TypeError('视觉证据创建需要有效原事务与明确期限')
      }
      refs([
        input.userRef,
        input.userPlantRef,
        input.assetRef,
        input.diagnosisRef,
        input.evidenceRef
      ])
      const output = validateDiagnosisModelOutput(input.output)
      if (
        output.status !== 'valid' ||
        !/^[a-f0-9]{64}$/u.test(input.assetContentSha256) ||
        !['leaf', 'stem', 'soil_surface', 'whole_plant'].includes(input.evidenceKind)
      ) {
        throw new TypeError('视觉证据合同或内容摘要非法')
      }
      const result = await tx.connection.execute(
        `INSERT INTO diagnosis_visual_evidence
    (evidence_ref,diagnosis_session_internal_id,asset_internal_id,evidence_kind,model_contract_version,evidence_json,expires_at_ms,created_at_ms,updated_at_ms)
    SELECT ?,s.id,a.id,?,'diagnosis-model-output/v1',CAST(? AS JSON),?,?,?
    FROM diagnosis_sessions AS s JOIN users AS u ON u.id=s.user_internal_id
    JOIN user_plants AS p ON p.id=s.user_plant_internal_id AND p.user_internal_id=u.id
    JOIN user_plant_assets AS a ON a.user_internal_id=u.id AND a.user_plant_internal_id=p.id
    WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ? AND BINARY s.diagnosis_ref=BINARY ?
    AND BINARY a.asset_ref=BINARY ? AND BINARY a.content_hash=BINARY ?
    AND u.status='active' AND p.lifecycle_status='active' AND s.status='active' AND s.symptom_type='specific_pest_visual'
    AND a.status='active' AND a.asset_purpose='diagnosis_evidence' AND (a.cleanup_after_ms IS NULL OR a.cleanup_after_ms>?)
    AND u._openid='' AND p._openid='' AND s._openid='' AND a._openid=''`,
        [
          input.evidenceRef,
          input.evidenceKind,
          serializeCanonicalJson(output.output),
          input.expiresAtMs,
          input.createdAtMs,
          input.createdAtMs,
          input.userRef,
          input.userPlantRef,
          input.diagnosisRef,
          input.assetRef,
          input.assetContentSha256,
          input.createdAtMs
        ]
      )
      if (result.affectedRows > 1) {
        throw new Error('视觉证据匹配多个归属对象')
      }
      return result.affectedRows === 1 ? 'created' : 'not_found'
    }
  }
}
