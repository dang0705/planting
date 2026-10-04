import Ajv from 'ajv'
import { timingSafeEqual } from 'node:crypto'
import { userPrincipalSchema } from '../../contracts/schemas.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { computeGuestClaimRequestHash } from '../domain/guest-claim-request-hash.js'
import type { GuestClaimCommandRegistrationInput, GuestClaimRegistrationDependencies } from './mysql-guest-claim-command-registration-repository.js'
import type { GuestClaimCompletedReceiptResult } from './mysql-guest-claim-completed-receipt-reader.js'

/** 已持有租约的服务端完成命令，不允许客户端提交期限或内部键。 */
export interface GuestClaimExistingCompletionInput extends GuestClaimCommandRegistrationInput {
  /** 用户显式选择的本人已有植物，不能传入本次新建候选。 */
  readonly target: {
    /** 只处理已有植物，不改变目标资格。 */
    readonly type: 'existing_user_plant'
    /** 本人已有植物的公开引用，必须通过数据库归属核验。 */
    readonly user_plant_id: string
  }
  /** 当前服务端租约持有者的SHA-256摘要，不能作为公开响应。 */ readonly leaseOwnerHash: string
}
/** 内部结果必须等待外层提交，损坏存储与确定拒绝分别表达。 */
export type GuestClaimExistingCompletionResult = Exclude<GuestClaimCompletedReceiptResult, null> | {
  /** 确定的归属、证明、状态或者期限拒绝，均未发生写入。 */ readonly status: 'not_claimable' | 'expired' | 'principal_invalid'
}
const validPrincipal = new Ajv({ strict: true, allErrors: true }).compile(userPrincipalSchema)
/** 公开引用采用冻结命名空间和SQL容量，不进行隐式类型转换。 */
function ref(v: unknown, prefix: string): v is string { return typeof v === 'string' && v.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(v) }
/** 内部主键保持字符串，不丢失BIGINT精度。 */
function id(v: unknown): v is string { return typeof v === 'string' && /^[1-9][0-9]*$/u.test(v) }
/** 严格解析安全时间，缺失不等于零。 */
function ms(v: unknown): number | null { if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(v)) { return null }; const n = Number(v); return Number.isSafeInteger(n) && Number.isFinite(new Date(n).getTime()) ? n : null }
/** 第一次等待前固定全部可信输入，不接受额外身份和期限。 */
function lock(raw: GuestClaimExistingCompletionInput): GuestClaimExistingCompletionInput {
  const keys = ['principal', 'proof', 'guestPlantCaseRef', 'target', 'claimRef', 'idempotencyKeyHash', 'leaseOwnerHash']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 7 || Object.keys(raw).some(k => !keys.includes(k))
    || !validPrincipal(raw.principal) || !raw.proof || !Number.isSafeInteger(raw.proof.nowMs) || raw.proof.nowMs < 0 || !Number.isFinite(new Date(raw.proof.nowMs).getTime())
    || !Number.isFinite(Date.parse(raw.principal.issuedAt)) || !Number.isFinite(Date.parse(raw.principal.expiresAt)) || Date.parse(raw.principal.issuedAt) > raw.proof.nowMs || Date.parse(raw.principal.expiresAt) <= raw.proof.nowMs
    || !ref(raw.guestPlantCaseRef, 'gpc') || !ref(raw.claimRef, 'gcl') || !ref(raw.proof.guestSessionRef, 'gst')
    || !raw.target || typeof raw.target !== 'object' || Array.isArray(raw.target) || Object.keys(raw.target).length !== 2 || !Object.hasOwn(raw.target, 'type') || raw.target.type !== 'existing_user_plant' || !ref(raw.target.user_plant_id, 'upl')
    || typeof raw.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.idempotencyKeyHash) || typeof raw.leaseOwnerHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.leaseOwnerHash)) { throw new TypeError('已有目标认领完成输入不合法') }
  return Object.freeze({ ...raw, principal: Object.freeze({ ...raw.principal }), proof: Object.freeze({ ...raw.proof }), target: Object.freeze({ ...raw.target }) })
}
/** 调用方唯一拥有事务生命周期；本端口不取得或延长处理租约。 */
export function createMysqlGuestClaimExistingCompletionRepository(d: GuestClaimRegistrationDependencies) {
  return {
    /** 同事务完成案例投影、命令、不可变事实及上一版证明清理；错误必须外层回滚。 */
    complete: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, raw: GuestClaimExistingCompletionInput): Promise<GuestClaimExistingCompletionResult> => {
      const input = lock(raw), now = input.proof.nowMs
      if (!tx || tx.transactionContext !== true || !tx.connection) { throw new TypeError('认领完成需要显式事务') }
      const proof = await d.lockAndVerify(tx, input.proof)
      if (!proof || typeof proof !== 'object' || Array.isArray(proof)) { throw new Error('证明结果不合法') }
      if (proof.status !== 'verified') {
        if (Object.keys(proof).length !== 1 || !['not_claimable', 'expired', 'unavailable'].includes(proof.status)) { throw new Error('证明拒绝结果不合法') }
        return { status: proof.status }
      }
      if (Object.keys(proof).length !== 2 || !Number.isInteger(proof.proofVersion) || proof.proofVersion < 1 || proof.proofVersion > 4294967295) { throw new Error('证明版本不合法') }
      const c = tx.connection
      const cases = await c.query(`SELECT CAST(p.id AS CHAR) AS case_id,p.status,p.version,CAST(p.created_at_ms AS CHAR) AS created_at_ms,CAST(p.completed_at_ms AS CHAR) AS completed_at_ms,CAST(p.updated_at_ms AS CHAR) AS updated_at_ms,CAST(p.expires_at_ms AS CHAR) AS expires_at_ms,CAST(p.claimed_user_internal_id AS CHAR) AS claimed_user_internal_id,CAST(p.claimed_user_plant_internal_id AS CHAR) AS claimed_user_plant_internal_id FROM guest_plant_cases p JOIN guest_sessions s ON s.id=p.guest_session_internal_id AND s._openid='' WHERE BINARY s.guest_session_ref=BINARY ? AND BINARY p.guest_plant_case_ref=BINARY ? AND p._openid='' FOR UPDATE`, [input.proof.guestSessionRef, input.guestPlantCaseRef])
      if (cases.length === 0) { return { status: 'not_claimable' } }
      const p = cases[0]!, created = ms(p.created_at_ms), completed = ms(p.completed_at_ms), updated = ms(p.updated_at_ms), expires = ms(p.expires_at_ms)
      if (cases.length !== 1 || !id(p.case_id) || created === null || updated === null || expires === null || updated < created || now < updated || expires <= created || !Number.isInteger(p.version) || typeof p.version !== 'number' || p.version < 1 || p.version >= 4294967295) { return { status: 'unavailable' } }
      if (expires <= now || p.status === 'expired') { return { status: 'expired' } }
      if (p.status !== 'completed' || p.claimed_user_internal_id !== null || p.claimed_user_plant_internal_id !== null) { return { status: 'not_claimable' } }
      if (completed === null || completed < created || completed > updated) { return { status: 'unavailable' } }
      const users = await c.query("SELECT CAST(id AS CHAR) AS user_id FROM users WHERE BINARY public_user_id=BINARY ? AND status='active' AND _openid='' FOR UPDATE", [input.principal.user_id])
      if (users.length === 0) { return { status: 'principal_invalid' } }
      if (users.length !== 1 || !id(users[0]!.user_id)) { return { status: 'unavailable' } }
      const userId = users[0]!.user_id
      const plants = await c.query("SELECT CAST(id AS CHAR) AS plant_id FROM user_plants WHERE user_internal_id=? AND BINARY public_user_plant_id=BINARY ? AND lifecycle_status IN ('active','archived') AND _openid='' FOR UPDATE", [userId, input.target.user_plant_id])
      if (plants.length === 0) { return { status: 'not_claimable' } }
      if (plants.length !== 1 || !id(plants[0]!.plant_id)) { return { status: 'unavailable' } }
      const plantId = plants[0]!.plant_id
      const commands = await c.query(`SELECT CAST(id AS CHAR) AS command_id,claim_ref,request_hash,proof_version,status,CAST(requested_user_plant_internal_id AS CHAR) AS requested_target_id,CAST(target_user_plant_internal_id AS CHAR) AS target_id,processing_lease_owner_hash AS lease_owner_hash,CAST(processing_lease_expires_at_ms AS CHAR) AS lease_expires_at_ms,attempt_count,CAST(updated_at_ms AS CHAR) AS updated_at_ms FROM guest_claim_commands WHERE user_internal_id=? AND guest_plant_case_internal_id=? AND idempotency_key=? AND target_type='existing_user_plant' AND _openid='' FOR UPDATE`, [userId, p.case_id, input.idempotencyKeyHash])
      if (commands.length === 0) { return { status: 'not_claimable' } }
      const m = commands[0]!
      if (commands.length !== 1 || !id(m.command_id) || typeof m.request_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(m.request_hash)) { return { status: 'unavailable' } }
      if (m.request_hash !== computeGuestClaimRequestHash({ guestSessionRef: input.proof.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef, target: input.target })) { return { status: 'idempotency_conflict' } }
      if (m.status !== 'processing' || m.claim_ref !== input.claimRef || m.requested_target_id !== plantId || m.target_id !== null) { return { status: 'not_claimable' } }
      const leaseEnd = ms(m.lease_expires_at_ms), commandUpdated = ms(m.updated_at_ms)
      if (leaseEnd === null || commandUpdated === null || commandUpdated > now || leaseEnd <= commandUpdated || typeof m.lease_owner_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(m.lease_owner_hash) || typeof m.proof_version !== 'number' || !Number.isInteger(m.proof_version) || m.proof_version < 1 || m.proof_version > 4294967295 || typeof m.attempt_count !== 'number' || !Number.isInteger(m.attempt_count) || m.attempt_count < 1) { return { status: 'unavailable' } }
      if (!timingSafeEqual(Buffer.from(m.lease_owner_hash, 'hex'), Buffer.from(input.leaseOwnerHash, 'hex'))) { return { status: 'not_claimable' } }
      if (leaseEnd <= now) { return { status: 'expired' } }
      const write = async (sql: string, args: Array<string | number | null>) => { const result = await c.execute(sql, args); if (result.affectedRows !== 1) { throw new Error('认领原子写入未确定') } }
      await write("UPDATE guest_plant_cases SET status='claimed',claimed_user_internal_id=?,claimed_user_plant_internal_id=?,version=version+1,updated_at_ms=? WHERE id=? AND status='completed' AND version=? AND claimed_user_internal_id IS NULL AND claimed_user_plant_internal_id IS NULL AND _openid=''", [userId, plantId, now, p.case_id, p.version])
      await write("UPDATE guest_claim_commands SET status='completed',target_user_plant_internal_id=?,processing_lease_owner_hash=NULL,processing_lease_expires_at_ms=NULL,updated_at_ms=? WHERE id=? AND status='processing' AND processing_lease_owner_hash=? AND processing_lease_expires_at_ms>? AND _openid=''", [plantId, now, m.command_id, input.leaseOwnerHash, now])
      await write('INSERT INTO guest_case_claims(guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,claimed_at_ms,created_at_ms) VALUES(?,?,?,?,?,?)', [p.case_id, m.command_id, userId, plantId, now, now])
      await write("UPDATE guest_sessions SET previous_possession_proof_hash=NULL,previous_proof_valid_until_ms=NULL,updated_at_ms=? WHERE BINARY guest_session_ref=BINARY ? AND _openid=''", [now, input.proof.guestSessionRef])
      const rows = await c.query(`SELECT m.claim_ref,m.proof_version,CAST(f.claimed_at_ms AS CHAR) AS claimed_at_ms,p.version AS case_version,s.previous_possession_proof_hash,s.previous_proof_valid_until_ms FROM guest_case_claims f JOIN guest_claim_commands m ON m.id=f.claim_command_internal_id AND m.status='completed' AND m.target_user_plant_internal_id=f.user_plant_internal_id AND m.user_internal_id=f.user_internal_id AND m.guest_plant_case_internal_id=f.guest_plant_case_internal_id AND m._openid='' JOIN guest_plant_cases p ON p.id=f.guest_plant_case_internal_id AND p.status='claimed' AND p.claimed_user_internal_id=f.user_internal_id AND p.claimed_user_plant_internal_id=f.user_plant_internal_id AND p._openid='' JOIN guest_sessions s ON s.id=p.guest_session_internal_id AND s._openid='' WHERE f.claim_command_internal_id=? AND f._openid=''`, [m.command_id])
      const r = rows[0]
      if (rows.length !== 1 || !r || r.claim_ref !== input.claimRef || r.proof_version !== m.proof_version || ms(r.claimed_at_ms) !== now || r.case_version !== p.version + 1 || r.previous_possession_proof_hash !== null || r.previous_proof_valid_until_ms !== null) { throw new Error('认领成功关系读回不一致') }
      return Object.freeze({ status: 'completed', claimRef: input.claimRef, userPlantRef: input.target.user_plant_id, guestPlantCaseRef: input.guestPlantCaseRef, proofVersion: m.proof_version, claimedAtMs: now })
    }
  }
}
