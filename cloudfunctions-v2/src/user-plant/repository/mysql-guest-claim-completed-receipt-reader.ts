import Ajv from 'ajv'
import type { UserPrincipalDto } from '../../contracts/types.js'
import { userPrincipalSchema } from '../../contracts/schemas.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { computeGuestClaimRequestHash, type GuestClaimTarget } from '../domain/guest-claim-request-hash.js'

/** 已登录用户对原认领请求的受控核对，不携带原始匿名证明或数据库键。 */
export interface GuestClaimCompletedReceiptInput {
  /** identity已经验真的统一用户。 */ readonly principal: UserPrincipalDto
  /** 原游客会话，只核对与成功案例的关系。 */ readonly guestSessionRef: string
  /** 原单株游客案例。 */ readonly guestPlantCaseRef: string
  /** 原显式请求目标，用于规范摘要及目标核验。 */ readonly target: GuestClaimTarget
  /** 原请求幂等键的SHA-256摘要，只用于核对已保存的命令，不允许返回给调用方。。 */ readonly idempotencyKeyHash: string
  /** 本次捕获的可信UTC毫秒。 */ readonly nowMs: number
}
/** 受控内部成功收据，不替代公开对象类别查询。 */
export type GuestClaimCompletedReceiptResult = {
  /** 四方一致的已完成成功事实。 */ readonly status: 'completed'
  /** 关联原命令的唯一认领引用。 */ readonly claimRef: string
  /** 最终归属的用户植物公开引用。 */ readonly userPlantRef: string
  /** 原案例公开引用，供受控领域对象查询。 */ readonly guestPlantCaseRef: string
  /** 原认领审计的已验真证明版本。 */ readonly proofVersion: number
  /** 原不可变成功事实UTC毫秒。 */ readonly claimedAtMs: number
} | {
  /** 损坏/故障不可用，或者同键请求语义冲突。 */ readonly status: 'unavailable' | 'idempotency_conflict'
} | null
const principalValid = new Ajv({ strict: true, allErrors: true }).compile(userPrincipalSchema)
/** 保持冻结命名空间和SQL容量，拒绝宽松字符串转换。 */
function reference(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(value) }
/** 等待连接前固定请求，禁止额外归属、候选结果或时限输入。 */
function lock(input: GuestClaimCompletedReceiptInput): GuestClaimCompletedReceiptInput {
  const keys = ['principal', 'guestSessionRef', 'guestPlantCaseRef', 'target', 'idempotencyKeyHash', 'nowMs']
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))
    || !principalValid(input.principal) || !Number.isSafeInteger(input.nowMs) || input.nowMs < 0 || !Number.isFinite(new Date(input.nowMs).getTime())
    || !Number.isFinite(Date.parse(input.principal.issuedAt)) || !Number.isFinite(Date.parse(input.principal.expiresAt))
    || Date.parse(input.principal.issuedAt) > input.nowMs || Date.parse(input.principal.expiresAt) <= input.nowMs
    || !reference(input.guestSessionRef, 'gst') || !reference(input.guestPlantCaseRef, 'gpc')
    || typeof input.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(input.idempotencyKeyHash)
    || !input.target || typeof input.target !== 'object' || Array.isArray(input.target) || !Object.hasOwn(input.target, 'type')
    || (input.target.type === 'new_user_plant' ? Object.keys(input.target).length !== 1 : input.target.type !== 'existing_user_plant' || Object.keys(input.target).length !== 2 || !reference(input.target.user_plant_id, 'upl'))) { throw new TypeError('认领成功收据查询不合法') }
  return Object.freeze({ ...input, principal: Object.freeze({ ...input.principal }), target: Object.freeze({ ...input.target }) })
}
/** 严格投影原成功事实，只在结构完整后判断请求冲突。 */
function project(row: Record<string, unknown>, input: GuestClaimCompletedReceiptInput): Exclude<GuestClaimCompletedReceiptResult, null> {
  const keys = ['claim_ref', 'request_hash', 'proof_version', 'target_type', 'requested_target_ref', 'user_plant_ref', 'guest_case_ref', 'claimed_at_ms']
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(k => !keys.includes(k))
    || !reference(row.claim_ref, 'gcl') || !reference(row.user_plant_ref, 'upl') || row.guest_case_ref !== input.guestPlantCaseRef
    || typeof row.proof_version !== 'number' || !Number.isInteger(row.proof_version) || row.proof_version < 1 || row.proof_version > 4294967295
    || typeof row.request_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.request_hash)
    || typeof row.claimed_at_ms !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(row.claimed_at_ms)
    || (row.target_type === 'new_user_plant' ? row.requested_target_ref !== null : row.target_type !== 'existing_user_plant' || row.requested_target_ref !== row.user_plant_ref)) { return { status: 'unavailable' } }
  const claimedAtMs = Number(row.claimed_at_ms)
  if (!Number.isSafeInteger(claimedAtMs) || !Number.isFinite(new Date(claimedAtMs).getTime()) || claimedAtMs > input.nowMs) { return { status: 'unavailable' } }
  if (row.request_hash !== computeGuestClaimRequestHash(input)) { return { status: 'idempotency_conflict' } }
  if (row.target_type !== input.target.type || (input.target.type === 'existing_user_plant' && input.target.user_plant_id !== row.user_plant_ref)) { return { status: 'unavailable' } }
  return Object.freeze({ status: 'completed', claimRef: row.claim_ref, userPlantRef: row.user_plant_ref, guestPlantCaseRef: input.guestPlantCaseRef, proofVersion: row.proof_version, claimedAtMs })
}
/** 完成/未知提交后的新连接只读核对，没有写入或认领重试端口。 */
export function createMysqlGuestClaimCompletedReceiptReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 只承认可见、不可变且关系完整的成功收据；技术故障不伪装成null。 */
    readCompleted: async (raw: GuestClaimCompletedReceiptInput): Promise<GuestClaimCompletedReceiptResult> => {
      const input = lock(raw)
      try {
        return await withReadConnection(source, async c => {
          const rows = await c.query(`SELECT m.claim_ref,m.request_hash,m.proof_version,m.target_type,
            r.public_user_plant_id AS requested_target_ref,p.public_user_plant_id AS user_plant_ref,e.guest_plant_case_ref AS guest_case_ref,CAST(f.claimed_at_ms AS CHAR) AS claimed_at_ms
            FROM users u JOIN guest_claim_commands m ON m.user_internal_id=u.id AND m.status='completed' AND m._openid=''
            JOIN guest_plant_cases e ON e.id=m.guest_plant_case_internal_id AND e.status='claimed' AND e.claimed_user_internal_id=u.id AND e.claimed_user_plant_internal_id=m.target_user_plant_internal_id AND e._openid=''
            JOIN guest_sessions s ON s.id=e.guest_session_internal_id AND s._openid=''
            JOIN guest_case_claims f ON f.claim_command_internal_id=m.id AND f.guest_plant_case_internal_id=e.id AND f.user_internal_id=u.id AND f.user_plant_internal_id=m.target_user_plant_internal_id AND f._openid=''
            JOIN user_plants p ON p.id=m.target_user_plant_internal_id AND p.user_internal_id=u.id AND p.lifecycle_status IN ('active','archived') AND p._openid=''
            LEFT JOIN user_plants r ON r.id=m.requested_user_plant_internal_id AND r.user_internal_id=u.id AND r._openid=''
            WHERE BINARY u.public_user_id=BINARY ? AND u.status='active' AND u._openid='' AND BINARY s.guest_session_ref=BINARY ? AND BINARY e.guest_plant_case_ref=BINARY ? AND m.idempotency_key=?`, [input.principal.user_id, input.guestSessionRef, input.guestPlantCaseRef, input.idempotencyKeyHash])
          if (rows.length === 0) { return null }
          return rows.length === 1 ? project(rows[0]!, input) : { status: 'unavailable' }
        })
      } catch { return { status: 'unavailable' } }
    }
  }
}
