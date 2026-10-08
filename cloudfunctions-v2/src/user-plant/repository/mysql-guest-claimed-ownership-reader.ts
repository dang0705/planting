import Ajv from 'ajv'
import type { UserPrincipalDto } from '../../contracts/types.js'
import { userPrincipalSchema } from '../../contracts/schemas.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 服务端归属查询；外部调用者不得自报统一用户。 */
export interface GuestClaimedOwnershipInput {
  /** 身份域已经验真的统一用户，内部API签名由后续协议层负责。 */ readonly principal: UserPrincipalDto
  /** 待解析的单株游客案例。 */ readonly guestPlantCaseRef: string
  /** 当前可信服务器时刻，不是客户端采集时间。 */ readonly nowMs: number
}
/** 仅供领域读取授权的归属摘要，不含临时对象内容或资格。 */
export type GuestClaimedOwnershipResult = {
  /** 完整认领事实一致且属于当前用户。 */ readonly status: 'owned'
  /** 原认领的公开引用。 */ readonly claimRef: string
  /** 当前派生归属的长期植物。 */ readonly userPlantRef: string
  /** 被认领的原单株游客案例公开引用（gpc 命名空间），与查询输入一致。 */ readonly guestPlantCaseRef: string
} | {
  /** 不可见与技术故障分开，但不得泄露其他用户是否存在。 */
  readonly status: 'not_found' | 'unavailable'
}
const validatePrincipal = new Ajv({ strict: true, allErrors: true }).compile(userPrincipalSchema)
/** SQL容量与公开引用命名空间同时成立，不接受数字键。 */
function reference(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(value)
}
/** 首次等待前复制身份，防止上游异步修改改变查询范围。 */
function lock(raw: GuestClaimedOwnershipInput): GuestClaimedOwnershipInput {
  const keys = ['principal', 'guestPlantCaseRef', 'nowMs']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 3 || Object.keys(raw).some(k => !keys.includes(k))
    || !validatePrincipal(raw.principal) || !reference(raw.guestPlantCaseRef, 'gpc') || !Number.isSafeInteger(raw.nowMs) || raw.nowMs < 0 || !Number.isFinite(new Date(raw.nowMs).getTime())
    || !Number.isFinite(Date.parse(raw.principal.issuedAt)) || !Number.isFinite(Date.parse(raw.principal.expiresAt))
    || Date.parse(raw.principal.issuedAt) > raw.nowMs || Date.parse(raw.principal.expiresAt) <= raw.nowMs) { throw new TypeError('案例派生归属查询非法') }
  return Object.freeze({ ...raw, principal: Object.freeze({ ...raw.principal }) })
}
/** 白名单投影；内部查询返回多余字段也视为损坏而非透传。 */
function project(rows: readonly Record<string, unknown>[], input: GuestClaimedOwnershipInput): GuestClaimedOwnershipResult {
  if (!rows.length) { return { status: 'not_found' } }
  const row = rows[0]!, keys = ['claim_ref', 'user_plant_ref', 'guest_case_ref', 'claimed_at_ms']
  if (rows.length !== 1 || !row || Object.keys(row).length !== 4 || Object.keys(row).some(k => !keys.includes(k))
    || !reference(row.claim_ref, 'gcl') || !reference(row.user_plant_ref, 'upl') || row.guest_case_ref !== input.guestPlantCaseRef
    || typeof row.claimed_at_ms !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(row.claimed_at_ms)) { return { status: 'unavailable' } }
  const at = Number(row.claimed_at_ms)
  if (!Number.isSafeInteger(at) || !Number.isFinite(new Date(at).getTime()) || at > input.nowMs) { return { status: 'unavailable' } }
  return Object.freeze({ status: 'owned', claimRef: row.claim_ref, userPlantRef: row.user_plant_ref, guestPlantCaseRef: input.guestPlantCaseRef })
}
/** 各域可复用的单一归属Reader；本端口不代替带签名的内部HTTP协议。 */
export function createMysqlGuestClaimedOwnershipReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 新连接读取完整成功链，绝不跨域改写临时对象。 */
    readOwnership: async (raw: GuestClaimedOwnershipInput): Promise<GuestClaimedOwnershipResult> => {
      const input = lock(raw)
      try {
        return await withReadConnection(source, async c => project(await c.query(`SELECT m.claim_ref,p.public_user_plant_id AS user_plant_ref,
          e.guest_plant_case_ref AS guest_case_ref,CAST(f.claimed_at_ms AS CHAR) AS claimed_at_ms
          FROM users u JOIN guest_plant_cases e ON e.claimed_user_internal_id=u.id AND e.status='claimed' AND e._openid=''
          JOIN guest_sessions s ON s.id=e.guest_session_internal_id AND s._openid=''
          JOIN guest_claim_commands m ON m.guest_plant_case_internal_id=e.id AND m.user_internal_id=u.id AND m.status='completed' AND m.target_user_plant_internal_id=e.claimed_user_plant_internal_id AND m._openid=''
          JOIN guest_case_claims f ON f.claim_command_internal_id=m.id AND f.guest_plant_case_internal_id=e.id AND f.user_internal_id=u.id AND f.user_plant_internal_id=e.claimed_user_plant_internal_id AND f._openid=''
          JOIN user_plants p ON p.id=e.claimed_user_plant_internal_id AND p.user_internal_id=u.id AND p.lifecycle_status IN ('active','archived') AND p._openid=''
          WHERE BINARY u.public_user_id=BINARY ? AND u.status='active' AND u._openid='' AND BINARY e.guest_plant_case_ref=BINARY ?`, [input.principal.user_id, input.guestPlantCaseRef]), input))
      } catch { return { status: 'unavailable' } }
    }
  }
}
