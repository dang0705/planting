import Ajv from 'ajv'
import type { UserPrincipalDto, UserCapabilitySnapshotDto, UserPlantRef } from '../../contracts/types.js'
import { userPrincipalSchema, capabilitySnapshotSchema } from '../../contracts/schemas.js'
import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256 } from '../../foundation/json/canonical-json-sha256.js'
import { createUnidentifiedUserPlant, UserPlantCreateError } from '../domain/create-unidentified-user-plant.js'
import type { MysqlUserPlantRepository } from './mysql-user-plant-repository.js'

/** 已登录用户显式保存案例的完整内部输入，全部生成字段由服务端提供。 */
export interface AuthenticatedEphemeralNewPlantInput {
  /** 已通过identity验真的统一用户。 */ readonly principal: UserPrincipalDto
  /** 当前已发布能力，缺失明确为null且不能私设额度。 */ readonly capabilitySnapshot: UserCapabilitySnapshotDto | null
  /** 等待保存的本人临时案例引用。 */ readonly ephemeralCaseRef: string
  /** 本次新请求候选植物引用，重放不会替换原结果。 */ readonly newUserPlantRef: string
  /** 本次服务端候选命令引用，重放保留第一次引用。 */ readonly promotionRef: string
  /** 幂等原始键摘要，不接受请求摘要。 */ readonly idempotencyKeyHash: string
  /** 服务端可信时刻，不签发或延长案例TTL。 */ readonly occurredAtMs: number
}
/** 新建与绑定内部结果；成功只包括公开引用及原成功时间。 */
export type AuthenticatedEphemeralNewPlantResult = {
  /** 第一次成功或完整原收据重放。 */ readonly status: 'bound'
  /** 原不可变命令公开引用，仅用于内部审计。 */ readonly promotionRef: string
  /** 实际新建目标的公开引用，不一定等于本次候选。 */ readonly userPlantRef: string
  /** 第一次绑定成功时刻，重放不能重新签发。 */ readonly boundAtMs: number
} | {
  /** 业务拒绝或无法证明存储结果的稳定内部类别。 */ readonly status: 'not_found' | 'expired' | 'already_bound' | 'idempotency_conflict' | 'unavailable' | 'principal_invalid' | 'capability_denied' | 'capability_snapshot_expired'
}
const ajv = new Ajv({ strict: true, allErrors: true })
const principalValid = ajv.compile(userPrincipalSchema), capabilityValid = ajv.compile(capabilitySnapshotSchema)
const keys = ['principal', 'capabilitySnapshot', 'ephemeralCaseRef', 'newUserPlantRef', 'promotionRef', 'idempotencyKeyHash', 'occurredAtMs']
/** 数据库容量对应的非空ASCII引用，不把宽松数值强转当校验。 */
function ref(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(value) }
/** 内部大整数键始终保留十进制文本，禁止浮点转换。 */
function id(value: unknown): value is string { return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value) }
/** 按真实MySQL字符串整数无损解析服务端毫秒。 */
function ms(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const n = Number(value); return Number.isSafeInteger(n) && Number.isFinite(new Date(n).getTime()) ? n : null
}
/** 在首次异步操作之前准入并隔离主体、能力数组与生成元数据。 */
export function lockAuthenticatedEphemeralNewPlantInput(input: AuthenticatedEphemeralNewPlantInput): AuthenticatedEphemeralNewPlantInput {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(k => !keys.includes(k))
    || !principalValid(input.principal) || !ref(input.principal.user_id) || !ref(input.ephemeralCaseRef) || !ref(input.newUserPlantRef) || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(input.newUserPlantRef) || !ref(input.promotionRef)
    || typeof input.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(input.idempotencyKeyHash)
    || !Number.isSafeInteger(input.occurredAtMs) || input.occurredAtMs < 0 || !Number.isFinite(new Date(input.occurredAtMs).getTime())
    || !Number.isFinite(Date.parse(input.principal.issuedAt)) || Date.parse(input.principal.issuedAt) > input.occurredAtMs || Date.parse(input.principal.expiresAt) <= input.occurredAtMs
    || !Number.isFinite(Date.parse(input.principal.expiresAt))
    || (input.capabilitySnapshot !== null && (!capabilityValid(input.capabilitySnapshot) || input.capabilitySnapshot.subjectType !== 'user'
      || !Number.isSafeInteger(input.capabilitySnapshot.activeUserPlantLimit) || input.capabilitySnapshot.activeUserPlantLimit < 0))) { throw new TypeError('临时案例新建输入不合法') }
  const snapshot = input.capabilitySnapshot === null ? null : Object.freeze({ ...input.capabilitySnapshot, allowedCapabilities: Object.freeze([...input.capabilitySnapshot.allowedCapabilities]), rewardedAiScopes: Object.freeze([...input.capabilitySnapshot.rewardedAiScopes]) }) as unknown as UserCapabilitySnapshotDto
  return Object.freeze({ ...input, principal: Object.freeze({ ...input.principal }), capabilitySnapshot: snapshot })
}
/** 摘要只来自用户明确的语义，不包含本次生成引用或当前权益。 */
function requestHash(input: AuthenticatedEphemeralNewPlantInput): string { return calculateCanonicalJsonSha256({ ephemeralCaseRef: input.ephemeralCaseRef, targetType: 'new_user_plant' }) }
/** 完整成功关系验证；同键不同目标类型必须先报告冲突。 */
function receipt(row: Record<string, unknown>, input: AuthenticatedEphemeralNewPlantInput): AuthenticatedEphemeralNewPlantResult {
  if (typeof row.request_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.request_hash)) { return { status: 'unavailable' } }
  if (row.request_hash !== requestHash(input)) { return { status: 'idempotency_conflict' } }
  const boundAtMs = ms(row.bound_at_ms)
  if (row.status !== 'completed' || row.target_type !== 'new_user_plant' || !ref(row.promotion_ref) || !ref(row.public_user_plant_id)
    || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(row.public_user_plant_id) || boundAtMs === null || boundAtMs > input.occurredAtMs) { return { status: 'unavailable' } }
  return { status: 'bound', promotionRef: row.promotion_ref, userPlantRef: row.public_user_plant_id, boundAtMs }
}
/** 复用聚合创建端口，在同一事务完成新植物及三表绑定，不自行提交。 */
export function createMysqlAuthenticatedEphemeralNewPlantRepository(plants: MysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>) {
  return {
    /** 原成功重放先于TTL及能力；仅新命令执行真实数量校验。 */
    saveNew: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, raw: AuthenticatedEphemeralNewPlantInput): Promise<AuthenticatedEphemeralNewPlantResult> => {
      const input = lockAuthenticatedEphemeralNewPlantInput(raw)
      if (tx.transactionContext !== true || !tx.connection) { throw new TypeError('新建绑定需要显式事务') }
      const c = tx.connection
      const users = await c.query("SELECT CAST(id AS CHAR) AS user_id FROM users WHERE BINARY public_user_id=BINARY ? AND status='active' AND _openid='' FOR UPDATE", [input.principal.user_id])
      if (users.length === 0) { return { status: 'not_found' } }
      if (users.length !== 1 || !id(users[0]!.user_id)) { return { status: 'unavailable' } }
      const userId = users[0]!.user_id
      const cases = await c.query(`SELECT CAST(id AS CHAR) AS case_id,status,version,CAST(created_at_ms AS CHAR) AS created_at_ms,
        CAST(updated_at_ms AS CHAR) AS updated_at_ms,CAST(expires_at_ms AS CHAR) AS expires_at_ms,CAST(completed_at_ms AS CHAR) AS completed_at_ms,
        CAST(bound_user_plant_internal_id AS CHAR) AS bound_user_plant_internal_id FROM authenticated_ephemeral_plant_cases
        WHERE user_internal_id=? AND BINARY ephemeral_plant_case_ref=BINARY ? AND _openid='' FOR UPDATE`, [userId, input.ephemeralCaseRef])
      if (cases.length === 0) { return { status: 'not_found' } }
      const e = cases[0]!
      if (cases.length !== 1 || !id(e.case_id)) { return { status: 'unavailable' } }
      const read = () => c.query(`SELECT m.promotion_ref,m.request_hash,m.status,m.target_type,p.public_user_plant_id,CAST(b.bound_at_ms AS CHAR) AS bound_at_ms
        FROM authenticated_ephemeral_promotion_commands m LEFT JOIN authenticated_ephemeral_case_bindings b ON b.promotion_command_internal_id=m.id
          AND b.authenticated_ephemeral_case_internal_id=m.authenticated_ephemeral_case_internal_id AND b.user_internal_id=m.user_internal_id AND b.user_plant_internal_id=m.target_user_plant_internal_id AND b._openid=''
        LEFT JOIN user_plants p ON p.id=m.target_user_plant_internal_id AND p.user_internal_id=m.user_internal_id AND p._openid=''
        WHERE m.user_internal_id=? AND m.authenticated_ephemeral_case_internal_id=? AND m.idempotency_key=? AND m._openid=''`, [userId, e.case_id as string, input.idempotencyKeyHash])
      const previous = await read()
      if (previous.length > 1) { return { status: 'unavailable' } }
      if (previous.length === 1) { return receipt(previous[0]!, input) }
      const expires = ms(e.expires_at_ms), created = ms(e.created_at_ms), updated = ms(e.updated_at_ms)
      if (expires === null || created === null || updated === null || expires <= created || updated < created || input.occurredAtMs < updated
        || (e.completed_at_ms !== null && (ms(e.completed_at_ms) === null || ms(e.completed_at_ms)! < created || ms(e.completed_at_ms)! > updated))
        || typeof e.version !== 'number' || !Number.isSafeInteger(e.version) || e.version < 1 || e.version >= 4294967295) { return { status: 'unavailable' } }
      if (e.status === 'bound') { return id(e.bound_user_plant_internal_id) ? { status: 'already_bound' } : { status: 'unavailable' } }
      if (e.bound_user_plant_internal_id !== null) { return { status: 'unavailable' } }
      if (e.status === 'failed' || e.status === 'expired' || input.occurredAtMs >= expires) { return { status: 'expired' } }
      if (e.status !== 'active' && e.status !== 'completed') { return { status: 'unavailable' } }
      if (input.capabilitySnapshot === null) { return { status: 'unavailable' } }
      const count = await plants.lockUserAndCountActive(tx, input.principal.user_id)
      if (count.userInternalId !== userId) { throw new Error('数量归属与案例归属不一致') }
      try {
        createUnidentifiedUserPlant({ principal: input.principal, capabilitySnapshot: input.capabilitySnapshot, currentActiveCount: count.activeCount, newUserPlantRef: input.newUserPlantRef as UserPlantRef, occurredAtMs: input.occurredAtMs })
      } catch (cause) {
        if (!(cause instanceof UserPlantCreateError) || cause.type === 'INTERNAL_INPUT_INVALID') { throw cause }
        return { status: cause.type === 'CAPABILITY_DENIED' ? 'capability_denied' : cause.type === 'CAPABILITY_SNAPSHOT_EXPIRED' ? 'capability_snapshot_expired' : 'principal_invalid' }
      }
      await plants.insertUnidentifiedUserPlant(tx, { userInternalId: userId, userPlantRef: input.newUserPlantRef as UserPlantRef, occurredAtMs: input.occurredAtMs })
      const projection = await plants.readCreateInitialProjection(tx, input.principal.user_id, input.newUserPlantRef as UserPlantRef)
      if (projection.user_plant_id !== input.newUserPlantRef) { throw new Error('新植物初态读回不一致') }
      const targets = await c.query("SELECT CAST(id AS CHAR) AS plant_id FROM user_plants WHERE user_internal_id=? AND BINARY public_user_plant_id=BINARY ? AND _openid='' AND lifecycle_status='active'", [userId, input.newUserPlantRef])
      if (targets.length !== 1 || !id(targets[0]!.plant_id)) { throw new Error('新目标归属未确定') }
      const plantId = targets[0]!.plant_id
      const saved = await c.execute(`INSERT INTO authenticated_ephemeral_promotion_commands
        (promotion_ref,authenticated_ephemeral_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,status,created_at_ms,updated_at_ms)
        VALUES(?,?,?,'new_user_plant',NULL,?,?,?,'completed',?,?)`, [input.promotionRef, e.case_id as string, userId, plantId, input.idempotencyKeyHash, requestHash(input), input.occurredAtMs, input.occurredAtMs])
      if (saved.affectedRows !== 1 || !Number.isSafeInteger(saved.insertId) || saved.insertId <= 0) { throw new Error('新建命令写入未确定') }
      const updatedCase = await c.execute("UPDATE authenticated_ephemeral_plant_cases SET status='bound',bound_user_plant_internal_id=?,version=version+1,updated_at_ms=? WHERE id=? AND user_internal_id=? AND version=? AND status IN ('active','completed') AND bound_user_plant_internal_id IS NULL", [plantId, input.occurredAtMs, e.case_id as string, userId, e.version])
      if (updatedCase.affectedRows !== 1) { throw new Error('新建案例投影未确定') }
      const binding = await c.execute('INSERT INTO authenticated_ephemeral_case_bindings(authenticated_ephemeral_case_internal_id,promotion_command_internal_id,user_internal_id,user_plant_internal_id,bound_at_ms,created_at_ms) VALUES(?,?,?,?,?,?)', [e.case_id as string, saved.insertId, userId, plantId, input.occurredAtMs, input.occurredAtMs])
      if (binding.affectedRows !== 1) { throw new Error('新建绑定事实未确定') }
      const rows = await read(), result = rows.length === 1 ? receipt(rows[0]!, input) : null
      if (!result || result.status !== 'bound' || result.userPlantRef !== input.newUserPlantRef || result.promotionRef !== input.promotionRef || result.boundAtMs !== input.occurredAtMs) { throw new Error('新建绑定关系读回不一致') }
      return result
    }
  }
}
/** 提交未知仅用新连接查询完整原收据，不发起创建或任何写入。 */
export function createMysqlAuthenticatedEphemeralNewPlantCommitUnknownReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 精确原归属、案例与键；候选引用或当前能力不改变历史核对。 */
    readCompleted: async (raw: AuthenticatedEphemeralNewPlantInput): Promise<AuthenticatedEphemeralNewPlantResult | null> => {
      const input = lockAuthenticatedEphemeralNewPlantInput(raw)
      const rows = await withReadConnection(source, c => c.query(`SELECT m.promotion_ref,m.request_hash,m.status,m.target_type,p.public_user_plant_id,CAST(b.bound_at_ms AS CHAR) AS bound_at_ms
        FROM users u JOIN authenticated_ephemeral_plant_cases e ON e.user_internal_id=u.id AND e._openid=''
        JOIN authenticated_ephemeral_promotion_commands m ON m.user_internal_id=u.id AND m.authenticated_ephemeral_case_internal_id=e.id AND m._openid=''
        JOIN authenticated_ephemeral_case_bindings b ON b.promotion_command_internal_id=m.id AND b.authenticated_ephemeral_case_internal_id=e.id AND b.user_internal_id=u.id AND b.user_plant_internal_id=m.target_user_plant_internal_id AND b._openid=''
        JOIN user_plants p ON p.id=m.target_user_plant_internal_id AND p.user_internal_id=u.id AND p._openid=''
        WHERE BINARY u.public_user_id=BINARY ? AND u.status='active' AND u._openid='' AND BINARY e.ephemeral_plant_case_ref=BINARY ? AND m.idempotency_key=?`, [input.principal.user_id, input.ephemeralCaseRef, input.idempotencyKeyHash]))
      if (rows.length === 0) { return null }
      return rows.length === 1 ? receipt(rows[0]!, input) : { status: 'unavailable' }
    }
  }
}
