import type { ClaimedGuestObjectKind } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 对象类别查询输入：已认领案例的公开引用（认领事务提交后读取）。 */
export interface GuestCaseObjectKindsQuery {
  /** 原游客会话公开引用。 */
  readonly guestSessionRef: string
  /** 已认领游客案例公开引用。 */
  readonly guestPlantCaseRef: string
}

/**
 * 认领结果的 claimedObjectKinds 只读查询（guest-session-claim.md 2026-10-09 修订）：按现有临时表判断案例下存在哪些对象类别。
 * care 临时结果 → independent_watering_advice；临时诊断结果 → fixed_diagnosis_result；临时浇水视觉证据 → soil_visual_evidence。
 * identification_candidate 在其临时表存在前不出现。只返回类别，不返回对象 ID 或内容；结果按合同枚举顺序。
 */
export function createMysqlGuestCaseObjectKindsReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 数据库错误向上传播，由 HTTP 边界映射为 503（不以空列表冒充）。 */
    read: async (query: GuestCaseObjectKindsQuery): Promise<ClaimedGuestObjectKind[]> => {
      const rows = await withReadConnection(source, connection => connection.query(
        `SELECT
           EXISTS(SELECT 1 FROM temporary_diagnosis_results d WHERE d.guest_plant_case_internal_id = e.id AND d._openid = '') AS has_diagnosis,
           EXISTS(SELECT 1 FROM temporary_care_results r WHERE r.guest_plant_case_internal_id = e.id AND r._openid = '') AS has_watering,
           EXISTS(SELECT 1 FROM temporary_watering_visual_evidence v WHERE v.guest_plant_case_internal_id = e.id AND v._openid = '') AS has_soil_visual
         FROM guest_plant_cases e JOIN guest_sessions s ON s.id = e.guest_session_internal_id AND s._openid = ''
         WHERE BINARY s.guest_session_ref = BINARY ? AND BINARY e.guest_plant_case_ref = BINARY ? AND e._openid = ''`,
        [query.guestSessionRef, query.guestPlantCaseRef]
      ))
      if (rows.length !== 1) { throw new Error('认领案例对象类别读取不完整') }
      const row = rows[0]!
      const kinds: ClaimedGuestObjectKind[] = []
      if (Number(row.has_diagnosis) === 1) { kinds.push('fixed_diagnosis_result') }
      if (Number(row.has_watering) === 1) { kinds.push('independent_watering_advice') }
      if (Number(row.has_soil_visual) === 1) { kinds.push('soil_visual_evidence') }
      return kinds
    }
  }
}
