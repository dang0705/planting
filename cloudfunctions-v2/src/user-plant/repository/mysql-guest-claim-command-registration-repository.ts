import { computeGuestClaimRequestHash } from '../domain/guest-claim-request-hash.js'
import Ajv from 'ajv'
import type { UserPrincipalDto } from '../../contracts/types.js'
import { userPrincipalSchema } from '../../contracts/schemas.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { GuestClaimProofLockInput } from './mysql-guest-claim-proof-repository.js'
import type { GuestClaimProofResult } from '../domain/verify-guest-claim-proof.js'

/** requested登记命令，任何处理租约与目标创建都不属于此输入。 */
export interface GuestClaimCommandRegistrationInput {
  /** identity已经验真的统一用户。 */ readonly principal: UserPrincipalDto
  /** 当前匿名主体和持有证明的受控上下文。 */ readonly proof: GuestClaimProofLockInput
  /** 待认领且必须属于该游客会话的单株案例。 */ readonly guestPlantCaseRef: string
  /** 用户明确选择的严格目标；新建不接受候选植物引用。 */ readonly target: {
    /** 用户选择新建目标。 */ readonly type: 'new_user_plant'
  } | {
    /** 用户选择已有目标。 */ readonly type: 'existing_user_plant'
    /** 本人已有植物公开引用。 */ readonly user_plant_id: string
  }
  /** 服务端生成，仅首次登记使用；重放必须复用存储引用。 */ readonly claimRef: string
  /** 规范化幂等键摘要，不存秘密或原始持有证明。 */ readonly idempotencyKeyHash: string
}
/** 内部登记结果，绝不作为公开成功认领响应。 */
export type GuestClaimCommandRegistrationResult = {
  /** 只说明命令存在，不说明认领成功。 */ readonly status: 'registered'
  /** 原命令唯一公开引用，仍只供内部编排。 */ readonly claimRef: string
  /** 首次登记验证的证明版本，重试不改写。 */ readonly proofVersion: number
  /** 是否复用了已登记命令。 */ readonly replayed: boolean
} | {
  /** 确定拒绝或存储不可用。 */ readonly status: 'not_claimable' | 'expired' | 'principal_invalid' | 'idempotency_conflict' | 'unavailable'
}
/** 证明检查在同一调用方事务中锁定会话，不接受客户端声明已验证。 */
export interface GuestClaimRegistrationDependencies {
  /** 原有证明Repository的真实端口，测试可只替换此边界。 */ readonly lockAndVerify: (tx: MysqlTransactionContext<Mysql2QueryConnection>, input: GuestClaimProofLockInput) => Promise<GuestClaimProofResult>
}
const principalValid = new Ajv({ strict: true, allErrors: true }).compile(userPrincipalSchema)
/** 公开引用同时受命名空间和已冻结SQL容量约束。 */
function ref(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.length <= 64 && new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,}$`, 'u').test(value) }
/** 内部BIGINT全程字符串，不能宽松转换或公开。 */
function id(value: unknown): value is string { return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value) }
/** 严格读取安全毫秒。 */
function ms(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const n = Number(value)
  return Number.isSafeInteger(n) && Number.isFinite(new Date(n).getTime()) ? n : null
}
/** 无租约或时间默认；第一次等待之前复制所有可信输入。 */
function lock(raw: GuestClaimCommandRegistrationInput): GuestClaimCommandRegistrationInput {
  const keys = ['principal', 'proof', 'guestPlantCaseRef', 'target', 'claimRef', 'idempotencyKeyHash']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 6 || Object.keys(raw).some(k => !keys.includes(k))
    || !raw.proof || !principalValid(raw.principal) || !Number.isSafeInteger(raw.proof.nowMs) || raw.proof.nowMs < 0
    || Date.parse(raw.principal.issuedAt) > raw.proof.nowMs || Date.parse(raw.principal.expiresAt) <= raw.proof.nowMs
    || !Number.isFinite(Date.parse(raw.principal.issuedAt)) || !Number.isFinite(Date.parse(raw.principal.expiresAt))
    || !ref(raw.guestPlantCaseRef, 'gpc') || !ref(raw.claimRef, 'gcl') || typeof raw.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.idempotencyKeyHash)
    || !raw.target || typeof raw.target !== 'object' || Array.isArray(raw.target)
    || (raw.target.type === 'new_user_plant' ? Object.keys(raw.target).length !== 1 : raw.target.type !== 'existing_user_plant' || Object.keys(raw.target).length !== 2 || !ref(raw.target.user_plant_id, 'upl'))) { throw new TypeError('认领登记可信输入不合法') }
  return Object.freeze({ ...raw, principal: Object.freeze({ ...raw.principal }), proof: Object.freeze({ ...raw.proof }), target: Object.freeze({ ...raw.target }) })
}
/** 请求语义不含候选认领引用、时刻或当前证明版本。 */
function requestHash(input: GuestClaimCommandRegistrationInput): string {
  return computeGuestClaimRequestHash({ guestSessionRef: input.proof.guestSessionRef, guestPlantCaseRef: input.guestPlantCaseRef, target: input.target })
}
/** 只登记requested或回读原命令，不执行processing、认领或隐式补偿。 */
export function createMysqlGuestClaimCommandRegistrationRepository(d: GuestClaimRegistrationDependencies) {
  return {
    /** 与后续认领编排共用真实事务；SQL失败与读回不一致必须整体回滚。 */
    register: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, raw: GuestClaimCommandRegistrationInput): Promise<GuestClaimCommandRegistrationResult> => {
      const input = lock(raw)
      if (!tx || tx.transactionContext !== true || !tx.connection) { throw new TypeError('认领登记需要显式事务') }
      const verified = await d.lockAndVerify(tx, input.proof)
      if (!verified || typeof verified !== 'object' || Array.isArray(verified)) { throw new Error('认领证明结果不合法') }
      if (verified.status !== 'verified') {
        if (Object.keys(verified).length !== 1 || !['not_claimable', 'expired', 'unavailable'].includes(verified.status)) { throw new Error('认领证明拒绝结果不合法') }
        return { status: verified.status }
      }
      if (Object.keys(verified).length !== 2 || !Number.isInteger(verified.proofVersion) || verified.proofVersion < 1 || verified.proofVersion > 4294967295) { throw new Error('认领证明结果不合法') }
      const c = tx.connection
      const cases = await c.query(`SELECT CAST(p.id AS CHAR) AS case_id,p.status,p.version,
        CAST(p.completed_at_ms AS CHAR) AS completed_at_ms,CAST(p.expires_at_ms AS CHAR) AS expires_at_ms,
        CAST(p.created_at_ms AS CHAR) AS created_at_ms,CAST(p.updated_at_ms AS CHAR) AS updated_at_ms,
        CAST(p.claimed_user_internal_id AS CHAR) AS claimed_user_internal_id,CAST(p.claimed_user_plant_internal_id AS CHAR) AS claimed_user_plant_internal_id
        FROM guest_plant_cases p JOIN guest_sessions s ON s.id=p.guest_session_internal_id AND s._openid=''
        WHERE BINARY s.guest_session_ref=BINARY ? AND BINARY p.guest_plant_case_ref=BINARY ? AND p._openid='' FOR UPDATE`, [input.proof.guestSessionRef, input.guestPlantCaseRef])
      if (cases.length === 0) { return { status: 'not_claimable' } }
      const p = cases[0]!
      if (cases.length !== 1 || !id(p.case_id)) { return { status: 'unavailable' } }
      const users = await c.query("SELECT CAST(id AS CHAR) AS user_id FROM users WHERE BINARY public_user_id=BINARY ? AND status='active' AND _openid='' FOR UPDATE", [input.principal.user_id])
      if (users.length === 0) { return { status: 'principal_invalid' } }
      if (users.length !== 1 || !id(users[0]!.user_id)) { return { status: 'unavailable' } }
      const userId = users[0]!.user_id
      let targetId: string | null = null
      if (input.target.type === 'existing_user_plant') {
        const targets = await c.query("SELECT CAST(id AS CHAR) AS plant_id FROM user_plants WHERE user_internal_id=? AND BINARY public_user_plant_id=BINARY ? AND lifecycle_status IN ('active','archived') AND _openid='' FOR UPDATE", [userId, input.target.user_plant_id])
        if (targets.length === 0) { return { status: 'not_claimable' } }
        if (targets.length !== 1 || !id(targets[0]!.plant_id)) { return { status: 'unavailable' } }
        targetId = targets[0]!.plant_id
      }
      const hash = requestHash(input)
      const read = () => c.query(`SELECT CAST(id AS CHAR) AS command_id,claim_ref,request_hash,proof_version,status,target_type,
        CAST(requested_user_plant_internal_id AS CHAR) AS requested_target_id,CAST(target_user_plant_internal_id AS CHAR) AS target_id,
        processing_lease_owner_hash,CAST(processing_lease_expires_at_ms AS CHAR) AS lease_expires_at_ms,attempt_count,failure_code
        FROM guest_claim_commands WHERE user_internal_id=? AND guest_plant_case_internal_id=? AND idempotency_key=? AND _openid='' FOR UPDATE`, [userId, p.case_id as string, input.idempotencyKeyHash])
      const prior = await read()
      if (prior.length > 1) { return { status: 'unavailable' } }
      if (prior.length === 1) {
        const m = prior[0]!
        if (typeof m.request_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(m.request_hash)) { return { status: 'unavailable' } }
        if (m.request_hash !== hash) { return { status: 'idempotency_conflict' } }
        if (!id(m.command_id) || !ref(m.claim_ref, 'gcl') || typeof m.proof_version !== 'number' || !Number.isInteger(m.proof_version) || m.proof_version < 1 || m.proof_version > 4294967295
          || !['requested', 'processing', 'failed', 'completed'].includes(m.status as string) || m.target_type !== input.target.type || m.requested_target_id !== targetId) { return { status: 'unavailable' } }
        if (m.status === 'completed') {
          if ((input.target.type === 'existing_user_plant' && m.target_id !== targetId) || p.status !== 'claimed' || p.claimed_user_internal_id !== userId || !id(m.target_id) || p.claimed_user_plant_internal_id !== m.target_id) { return { status: 'unavailable' } }
          const facts = await c.query("SELECT CAST(1 AS DOUBLE) AS linked FROM guest_case_claims WHERE guest_plant_case_internal_id=? AND claim_command_internal_id=? AND user_internal_id=? AND user_plant_internal_id=? AND _openid=''", [p.case_id as string, m.command_id, userId, m.target_id])
          if (facts.length !== 1 || facts[0]!.linked !== 1) { return { status: 'unavailable' } }
        } else if (p.status === 'claimed') { return { status: 'not_claimable' } }
        return { status: 'registered', claimRef: m.claim_ref, proofVersion: m.proof_version, replayed: true }
      }
      if (p.status === 'claimed' || p.claimed_user_internal_id !== null || p.claimed_user_plant_internal_id !== null) { return { status: 'not_claimable' } }
      const now = input.proof.nowMs, created = ms(p.created_at_ms), updated = ms(p.updated_at_ms), completed = ms(p.completed_at_ms), expires = ms(p.expires_at_ms)
      if (created === null || updated === null || expires === null || expires <= created || updated < created || now < updated
        || typeof p.version !== 'number' || !Number.isInteger(p.version) || p.version < 1 || p.version > 4294967295) { return { status: 'unavailable' } }
      if (now >= expires || p.status === 'expired') { return { status: 'expired' } }
      if (p.status !== 'completed') { return { status: 'not_claimable' } }
      if (completed === null || completed < created || completed > updated) { return { status: 'unavailable' } }
      const saved = await c.execute(`INSERT INTO guest_claim_commands(claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,
        target_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,failure_code,created_at_ms,updated_at_ms)
        VALUES(?,?,?,?,?,NULL,?,?,?,'requested',NULL,NULL,0,NULL,?,?)`, [input.claimRef, p.case_id as string, userId, input.target.type, targetId, input.idempotencyKeyHash, hash, verified.proofVersion, now, now])
      if (saved.affectedRows !== 1 || !Number.isSafeInteger(saved.insertId) || saved.insertId <= 0) { throw new Error('认领登记写入未确定') }
      const rows = await read(), m = rows[0]
      if (rows.length !== 1 || !m || m.claim_ref !== input.claimRef || m.request_hash !== hash || m.proof_version !== verified.proofVersion || m.status !== 'requested'
        || m.target_type !== input.target.type || m.requested_target_id !== targetId || m.target_id !== null || m.processing_lease_owner_hash !== null || m.lease_expires_at_ms !== null || m.attempt_count !== 0 || m.failure_code !== null) { throw new Error('认领登记读回不一致') }
      return { status: 'registered', claimRef: input.claimRef, proofVersion: verified.proofVersion, replayed: false }
    }
  }
}
