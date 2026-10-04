import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { validateDiagnosisModelOutput } from '../domain/validate-diagnosis-model-output.js'
/** 已验证统一身份与服务端锁定合同的内部查询；不是HTTP输入DTO。 */
export interface OwnedVisualEvidenceQuery {
  /** 当前统一用户公开引用。 */ readonly userRef: string
  /** 当前用户植物公开引用。 */ readonly userPlantRef: string
  /** 图片已经归属的诊断会话引用。 */ readonly diagnosisRef: string
  /** 当前会话内的精确视觉证据引用。 */ readonly evidenceRef: string
  /** 调用方锁定的输出结构合同；不等于模型/Prompt完整发布准入。 */ readonly modelContractVersion: string
  /** 服务端UTC毫秒，不采纳客户端时间。 */ readonly capturedAtMs: number
}
/** 可用证据仅供内部归约，不进入公开响应或自动选题。 */
export type OwnedVisualEvidenceRead =
  | {
      /** 缺归属、已过期或内容损坏的内部原因。 */ readonly status:
        | 'not_found'
        | 'expired'
        | 'invalid'
    }
  | {
      /** 当前归属与合同有效，尚未授予可信档位。 */ readonly status: 'found'
      /** 用户已提交的证据公开引用。 */ readonly evidenceRef: string
      /** 采集的植物区域类型。 */ readonly evidenceKind: string
      /** 精确的已核验模型输出结构版本。 */ readonly modelContractVersion: string
      /** 不可变结构化输出，不包含原始模型响应。 */ readonly output: CanonicalJsonObject
    }
/** 严格数据库毫秒，避免隐式数值转换与精度丢失。 */
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= 8_640_000_000_000_000 ? n : null
}
/** 同一事务锁定精确归属的视觉证据与私有资产；不读私有URL或执行上传。 */
export function createMysqlOwnedVisualEvidenceReader() {
  return {
    /** 归属、状态、合同及有效期共同通过才能供后续准入消费。 */ read: async (
      tx: MysqlTransactionContext<Mysql2QueryConnection>,
      input: OwnedVisualEvidenceQuery
    ): Promise<OwnedVisualEvidenceRead> => {
      if (
        !tx.transactionContext ||
        !tx.connection ||
        !Number.isSafeInteger(input.capturedAtMs) ||
        input.capturedAtMs < 0 ||
        input.capturedAtMs > 8_640_000_000_000_000 ||
        input.modelContractVersion !== 'diagnosis-model-output/v1' ||
        [input.userRef, input.userPlantRef, input.diagnosisRef, input.evidenceRef].some(
          v => typeof v !== 'string' || !v.length || v.trim() !== v || [...v].length > 64
        )
      ) {
        throw new TypeError('视觉证据读取范围或合同非法')
      }
      const rows = await tx.connection.query(
        `SELECT e.evidence_ref,e.evidence_kind,e.model_contract_version,e.evidence_json,
      CAST(e.created_at_ms AS CHAR) AS created_at_ms,CAST(e.expires_at_ms AS CHAR) AS expires_at_ms,
      CAST(a.cleanup_after_ms AS CHAR) AS cleanup_after_ms,e._openid AS evidence_openid,
      a._openid AS asset_openid,s._openid AS session_openid,u._openid AS user_openid,p._openid AS plant_openid
      FROM diagnosis_visual_evidence AS e JOIN diagnosis_sessions AS s ON s.id=e.diagnosis_session_internal_id
      JOIN users AS u ON u.id=s.user_internal_id JOIN user_plants AS p ON p.id=s.user_plant_internal_id AND p.user_internal_id=u.id
      JOIN user_plant_assets AS a ON a.id=e.asset_internal_id AND a.user_internal_id=u.id AND a.user_plant_internal_id=p.id
      WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ?
      AND BINARY s.diagnosis_ref=BINARY ? AND BINARY e.evidence_ref=BINARY ?
      AND u.status='active' AND p.lifecycle_status='active' AND s.status='active'
      AND s.symptom_type='specific_pest_visual' AND a.asset_purpose='diagnosis_evidence' AND a.status='active' FOR SHARE`,
        [input.userRef, input.userPlantRef, input.diagnosisRef, input.evidenceRef]
      )
      if (!rows.length) {
        return { status: 'not_found' }
      }
      if (rows.length !== 1) {
        return { status: 'invalid' }
      }
      const row = rows[0]!
      const created = time(row.created_at_ms),
        expires = time(row.expires_at_ms),
        cleanup = row.cleanup_after_ms === null ? null : time(row.cleanup_after_ms)
      if (
        created === null ||
        expires === null ||
        expires <= created ||
        created > input.capturedAtMs ||
        (row.cleanup_after_ms !== null && cleanup === null) ||
        row.model_contract_version !== input.modelContractVersion ||
        row.evidence_ref !== input.evidenceRef ||
        !['leaf', 'stem', 'soil_surface', 'whole_plant'].includes(String(row.evidence_kind)) ||
        ['evidence_openid', 'asset_openid', 'session_openid', 'user_openid', 'plant_openid'].some(
          key => row[key] !== ''
        )
      ) {
        return { status: 'invalid' }
      }
      if (input.capturedAtMs >= expires || (cleanup !== null && input.capturedAtMs >= cleanup)) {
        return { status: 'expired' }
      }
      let json: unknown = row.evidence_json
      if (typeof json === 'string') {
        try {
          json = JSON.parse(json)
        } catch {
          return { status: 'invalid' }
        }
      }
      const validated = validateDiagnosisModelOutput(json)
      if (validated.status !== 'valid') {
        return { status: 'invalid' }
      }
      return {
        status: 'found',
        evidenceRef: input.evidenceRef,
        evidenceKind: row.evidence_kind as string,
        modelContractVersion: input.modelContractVersion,
        output: validated.output
      }
    }
  }
}
