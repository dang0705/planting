import { createHash } from 'node:crypto'

/** 用户显式选择的认领目标，不包含服务端新建候选引用。 */
export type GuestClaimTarget = {
  /** 固定的新建意图。 */ readonly type: 'new_user_plant'
} | {
  /** 固定的已有植物意图。 */ readonly type: 'existing_user_plant'
  /** 等待服务端归属核验的植物公开引用。 */ readonly user_plant_id: string
}
/** 登记和原收据核对共用的规范请求语义；调用方负责严格准入。 */
export interface GuestClaimRequestSemantic {
  /** 原游客会话引用。 */ readonly guestSessionRef: string
  /** 原单株游客案例引用。 */ readonly guestPlantCaseRef: string
  /** 用户选择，不能用本次生成的植物引用代替。 */ readonly target: GuestClaimTarget
}
/** 固定字段顺序计算请求SHA-256；候选claimRef、时刻及证明版本从未进入摘要。 */
export function computeGuestClaimRequestHash(input: GuestClaimRequestSemantic): string {
  return createHash('sha256').update(JSON.stringify({ guestSessionRef: input.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef, target: input.target.type === 'new_user_plant' ? { type: 'new_user_plant' } : { type: 'existing_user_plant', user_plant_id: input.target.user_plant_id } }), 'utf8').digest('hex')
}
