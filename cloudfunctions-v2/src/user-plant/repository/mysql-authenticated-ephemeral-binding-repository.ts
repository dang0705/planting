import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { calculateCanonicalJsonSha256 } from '../../foundation/json/canonical-json-sha256.js'

/** 调用方已验真统一用户，明确选择已有植物的内部绑定命令。 */
export interface AuthenticatedEphemeralExistingBindingInput {
  /** 身份域解析出的统一用户公开引用。 */ readonly userRef: string
  /** 本人临时案例的不可枚举引用。 */ readonly ephemeralCaseRef: string
  /** 用户明确选择的本人长期植物引用。 */ readonly targetUserPlantRef: string
  /** 服务端为新命令生成的高熵引用，重放不替换原引用。 */ readonly promotionRef: string
  /** 原始幂等键的摘要；本端口不接收或保存原始键。 */ readonly idempotencyKeyHash: string
  /** 服务端捕获的UTC毫秒，不用于决定临时TTL。 */ readonly occurredAtMs: number
}
/** 此Repository的内部结果；拒绝原因不直接形成可枚举HTTP响应。 */
export type AuthenticatedEphemeralBindingResult =
  | {
      /** 无法确定绑定的内部稳定类别。 */
      readonly status: 'not_found' | 'expired' | 'already_bound' | 'idempotency_conflict' | 'unavailable' }
  | {
      /** 第一次确定的成功或其重放。 */
      readonly status: 'bound'
      /** 第一次命令的公开引用，不含内部数值键。 */ readonly promotionRef: string
      /** 绑定到的长期植物公开引用。 */ readonly userPlantRef: string
      /** 第一次成功的UTC毫秒，重放保留。 */ readonly boundAtMs: number }
const allowedKeys = ['userRef', 'ephemeralCaseRef', 'targetUserPlantRef', 'promotionRef', 'idempotencyKeyHash', 'occurredAtMs']
/** 非空不透明引用只验证存储容量和无空白ASCII形状，本端口不冻结HTTP前缀。 */
function reference(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(value) }
/** 内部BIGINT键仍保留十进制文本，不转浮点。 */
function internalId(value: unknown): value is string { return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value) }
/** 服务端毫秒必须无损且在Date范围内；不使用宽松数值转换。 */
function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const ms = Number(value)
  return Number.isSafeInteger(ms) && Number.isFinite(new Date(ms).getTime()) ? ms : null
}
/** 第一个await之前锁定可信命令，拒绝额外字段和调用方自报请求摘要。 */
export function lockAuthenticatedEphemeralExistingBindingInput(input: unknown): Readonly<AuthenticatedEphemeralExistingBindingInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) { throw new TypeError('绑定命令不合法') }
  const v = input as Record<string, unknown>
  if (Object.keys(v).length !== allowedKeys.length || Object.keys(v).some(k => !allowedKeys.includes(k))
    || !reference(v.userRef) || !reference(v.ephemeralCaseRef) || !reference(v.targetUserPlantRef) || !reference(v.promotionRef)
    || typeof v.idempotencyKeyHash !== 'string' || !/^[a-f0-9]{64}$/u.test(v.idempotencyKeyHash)
    || typeof v.occurredAtMs !== 'number' || !Number.isSafeInteger(v.occurredAtMs) || v.occurredAtMs < 0
    || !Number.isFinite(new Date(v.occurredAtMs).getTime())) { throw new TypeError('绑定命令不合法') }
  return Object.freeze({ ...v }) as unknown as Readonly<AuthenticatedEphemeralExistingBindingInput>
}
/** 绑定收据只接受完整成功关系，公开结果不携带内部数据库键。 */
function receipt(row: Record<string, unknown>, hash: string): AuthenticatedEphemeralBindingResult {
  if (typeof row.request_hash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.request_hash)) { return { status: 'unavailable' } }
  if (row.request_hash !== hash) { return { status: 'idempotency_conflict' } }
  const boundAtMs = timestamp(row.bound_at_ms)
  if (row.status !== 'completed' || row.target_type !== 'existing_user_plant' || !reference(row.promotion_ref)
    || !reference(row.public_user_plant_id) || boundAtMs === null) { return { status: 'unavailable' } }
  return Object.freeze({ status: 'bound', promotionRef: row.promotion_ref, userPlantRef: row.public_user_plant_id, boundAtMs })
}
/** 仅在显式事务内持久化绑定；不自行提交、重试、延长案例或创建目标植物。 */
export function createMysqlAuthenticatedEphemeralBindingRepository() {
  return {
    /** 统一用户锁→本人案例锁→原成功收据→新命令门→三表写入→确定读回。 */
    bindExisting: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, input: unknown): Promise<AuthenticatedEphemeralBindingResult> => {
      const command = lockAuthenticatedEphemeralExistingBindingInput(input)
      if (tx.transactionContext !== true || !tx.connection) { throw new TypeError('绑定需要显式事务') }
      const c = tx.connection
      const users = await c.query(`SELECT CAST(id AS CHAR) AS user_id FROM users
        WHERE BINARY public_user_id=BINARY ? AND status='active' AND _openid='' FOR UPDATE`, [command.userRef])
      if (users.length === 0) { return { status: 'not_found' } }
      if (users.length !== 1 || !internalId(users[0]!.user_id)) { return { status: 'unavailable' } }
      const userId = users[0]!.user_id
      const cases = await c.query(`SELECT CAST(id AS CHAR) AS case_id,status,version,
        CAST(expires_at_ms AS CHAR) AS expires_at_ms,CAST(created_at_ms AS CHAR) AS created_at_ms,
        CAST(completed_at_ms AS CHAR) AS completed_at_ms,CAST(updated_at_ms AS CHAR) AS updated_at_ms,
        CAST(bound_user_plant_internal_id AS CHAR) AS bound_user_plant_internal_id
        FROM authenticated_ephemeral_plant_cases WHERE user_internal_id=?
        AND BINARY ephemeral_plant_case_ref=BINARY ? AND _openid='' FOR UPDATE`, [userId, command.ephemeralCaseRef])
      if (cases.length === 0) { return { status: 'not_found' } }
      const item = cases[0]!
      if (cases.length !== 1 || !internalId(item.case_id)) { return { status: 'unavailable' } }
      const caseId = item.case_id
      const hash = calculateCanonicalJsonSha256({ ephemeralCaseRef: command.ephemeralCaseRef, targetType: 'existing_user_plant', targetUserPlantRef: command.targetUserPlantRef })
      /** 唯一绑定关系与命令联合读回，原结果不能由最新目标或案例期限重新生成。 */
      const read = () => c.query(`SELECT m.promotion_ref,m.request_hash,m.status,m.target_type,
        p.public_user_plant_id,CAST(b.bound_at_ms AS CHAR) AS bound_at_ms
        FROM authenticated_ephemeral_promotion_commands m
        LEFT JOIN authenticated_ephemeral_case_bindings b ON b.promotion_command_internal_id=m.id
          AND b.authenticated_ephemeral_case_internal_id=m.authenticated_ephemeral_case_internal_id
          AND b.user_internal_id=m.user_internal_id AND b.user_plant_internal_id=m.target_user_plant_internal_id AND b._openid=''
        LEFT JOIN user_plants p ON p.id=m.target_user_plant_internal_id AND p.user_internal_id=m.user_internal_id AND p._openid=''
        WHERE m.user_internal_id=? AND m.authenticated_ephemeral_case_internal_id=? AND m.idempotency_key=? AND m._openid=''`, [userId, caseId, command.idempotencyKeyHash])
      const old = await read()
      if (old.length > 1) { return { status: 'unavailable' } }
      if (old.length === 1) { return receipt(old[0]!, hash) }
      const expires = timestamp(item.expires_at_ms), created = timestamp(item.created_at_ms), updated = timestamp(item.updated_at_ms)
      const completed = item.completed_at_ms === null ? null : timestamp(item.completed_at_ms)
      if (expires === null || created === null || updated === null || expires <= created || updated < created
        || command.occurredAtMs < updated || (item.completed_at_ms !== null && completed === null)
        || typeof item.version !== 'number' || !Number.isSafeInteger(item.version) || item.version < 1 || item.version >= 4294967295) { return { status: 'unavailable' } }
      if (item.status === 'bound') { return internalId(item.bound_user_plant_internal_id) ? { status: 'already_bound' } : { status: 'unavailable' } }
      if (item.bound_user_plant_internal_id !== null) { return { status: 'unavailable' } }
      if (item.status === 'failed' || item.status === 'expired' || command.occurredAtMs >= expires) { return { status: 'expired' } }
      if (item.status !== 'active' && item.status !== 'completed') { return { status: 'unavailable' } }
      const targets = await c.query(`SELECT CAST(id AS CHAR) AS plant_id FROM user_plants
        WHERE user_internal_id=? AND BINARY public_user_plant_id=BINARY ?
        AND lifecycle_status IN ('active','archived') AND _openid='' FOR UPDATE`, [userId, command.targetUserPlantRef])
      if (targets.length === 0) { return { status: 'not_found' } }
      if (targets.length !== 1 || !internalId(targets[0]!.plant_id)) { return { status: 'unavailable' } }
      const plantId = targets[0]!.plant_id
      const saved = await c.execute(`INSERT INTO authenticated_ephemeral_promotion_commands
        (promotion_ref,authenticated_ephemeral_case_internal_id,user_internal_id,target_type,
         requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,status,created_at_ms,updated_at_ms)
        VALUES(?,?,?,'existing_user_plant',?,?,?,?,'completed',?,?)`,
        [command.promotionRef,caseId,userId,plantId,plantId,command.idempotencyKeyHash,hash,command.occurredAtMs,command.occurredAtMs])
      if (saved.affectedRows !== 1 || !Number.isSafeInteger(saved.insertId) || saved.insertId <= 0) { throw new Error('绑定命令写入未确定') }
      const projection = await c.execute(`UPDATE authenticated_ephemeral_plant_cases
        SET status='bound',bound_user_plant_internal_id=?,version=version+1,updated_at_ms=?
        WHERE id=? AND user_internal_id=? AND version=? AND status IN ('active','completed') AND bound_user_plant_internal_id IS NULL`,
        [plantId,command.occurredAtMs,caseId,userId,item.version])
      if (projection.affectedRows !== 1) { throw new Error('临时案例绑定投影未确定') }
      const binding = await c.execute(`INSERT INTO authenticated_ephemeral_case_bindings
        (authenticated_ephemeral_case_internal_id,promotion_command_internal_id,user_internal_id,user_plant_internal_id,bound_at_ms,created_at_ms)
        VALUES(?,?,?,?,?,?)`, [caseId,saved.insertId,userId,plantId,command.occurredAtMs,command.occurredAtMs])
      if (binding.affectedRows !== 1) { throw new Error('唯一绑定事实写入未确定') }
      const rows = await read(), result = rows.length === 1 ? receipt(rows[0]!, hash) : null
      if (!result || result.status !== 'bound' || result.promotionRef !== command.promotionRef
        || result.userPlantRef !== command.targetUserPlantRef || result.boundAtMs !== command.occurredAtMs) { throw new Error('成功绑定关系读回不一致') }
      return result
    }
  }
}

/** 提交未知只读核对端口；新连接单SELECT，没有锁、写入、重绑或TTL延长。 */
export function createMysqlAuthenticatedEphemeralBindingCommitUnknownReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 原归属、案例、键与请求摘要必须一致，缺完整三表收据返回null。 */
    readCompleted: async (input: AuthenticatedEphemeralExistingBindingInput): Promise<AuthenticatedEphemeralBindingResult | null> => {
      const command = lockAuthenticatedEphemeralExistingBindingInput(input)
      const rows = await withReadConnection(source, c => c.query(`SELECT m.promotion_ref,m.request_hash,m.status,m.target_type,
        p.public_user_plant_id,CAST(b.bound_at_ms AS CHAR) AS bound_at_ms
        FROM users u JOIN authenticated_ephemeral_plant_cases e ON e.user_internal_id=u.id AND e._openid=''
        JOIN authenticated_ephemeral_promotion_commands m ON m.user_internal_id=u.id AND m.authenticated_ephemeral_case_internal_id=e.id AND m._openid=''
        JOIN authenticated_ephemeral_case_bindings b ON b.promotion_command_internal_id=m.id
          AND b.authenticated_ephemeral_case_internal_id=e.id AND b.user_internal_id=u.id AND b.user_plant_internal_id=m.target_user_plant_internal_id AND b._openid=''
        JOIN user_plants p ON p.id=b.user_plant_internal_id AND p.user_internal_id=u.id AND p._openid=''
        WHERE BINARY u.public_user_id=BINARY ? AND u.status='active' AND u._openid=''
          AND BINARY e.ephemeral_plant_case_ref=BINARY ? AND m.idempotency_key=?`,
        [command.userRef, command.ephemeralCaseRef, command.idempotencyKeyHash]))
      if (rows.length === 0) { return null }
      if (rows.length !== 1) { return { status: 'unavailable' } }
      const hash = calculateCanonicalJsonSha256({ ephemeralCaseRef: command.ephemeralCaseRef, targetType: 'existing_user_plant', targetUserPlantRef: command.targetUserPlantRef })
      const result = receipt(rows[0]!, hash)
      if (result.status === 'bound' && (result.userPlantRef !== command.targetUserPlantRef || result.boundAtMs > command.occurredAtMs)) { return { status: 'unavailable' } }
      return result
    }
  }
}
