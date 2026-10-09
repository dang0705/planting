import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { lockTemporaryCareOwner, type TemporaryCareOwner, type TemporaryCareResultRecord } from '../domain/temporary-care-result-record.js'
import { createMysqlTemporaryCareResultRepository } from './mysql-temporary-care-result-repository.js'

/** 事务内加锁读到的本人临时案例；内部主键不得公开。 */
export interface LockedCareTemporaryCase {
  /** 案例内部主键十进制文本，只用于同事务外键写入。 */
  readonly caseInternalId: string
  /** 案例绝对失效时刻，UTC 毫秒；会话与结果期限等于它（裁决 4）。 */
  readonly expiresAtMs: number
}

/** 查找或创建浇水会话的输入。 */
export interface WateringSessionInput {
  /** 已验真的案例归属，决定写入游客或登录外键列。 */
  readonly owner: TemporaryCareOwner
  /** 已加锁案例的内部主键。 */
  readonly caseInternalId: string
  /** 无 active 会话时使用的服务端高熵候选引用。 */
  readonly candidateSessionRef: string
  /** 新会话失效时刻（等于案例失效时刻）。 */
  readonly expiresAtMs: number
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
}

/** 浇水建议事务端口：全部方法在调用方显式事务内执行。 */
export interface WateringAdviceRepository<TTransaction extends TransactionExecutionContext> {
  /** 按归属 FOR UPDATE 锁定 active 且未过期的本人临时案例；不属于本人/不存在/已过期返回 null。 */
  readonly lockOwnedCase: (transaction: TTransaction, owner: TemporaryCareOwner, nowMs: number) => Promise<LockedCareTemporaryCase | null>
  /** 复用该案例唯一 active 浇水会话，没有则创建；返回会话公开引用。 */
  readonly findOrCreateWateringSession: (transaction: TTransaction, input: WateringSessionInput) => Promise<string>
  /** 追加一条不可变临时养护结果（复用既有结果仓储 SQL 与归属复核）。 */
  readonly appendResult: (transaction: TTransaction, record: TemporaryCareResultRecord) => Promise<'created' | 'not_found'>
  /** 同事务读回结果正文摘要；不存在返回 null。 */
  readonly readResultHash: (transaction: TTransaction, resultRef: string) => Promise<string | null>
}

/** 浇水建议持久化数据不合法时的内部错误；只能映射为泛化失败。 */
export class WateringAdvicePersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '浇水建议持久化错误'
  }
}

/** 显式事务守卫。 */
function connectionOf(transaction: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('浇水建议写入需要显式事务') }
  return transaction.connection
}

/** 非负 BIGINT 文本转安全整数。 */
function milliseconds(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new WateringAdvicePersistenceError('时间读回不合法')
  }
  return Number(value)
}

/** 内部主键保持十进制文本。 */
function internalId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) { throw new WateringAdvicePersistenceError('内部主键读回不合法') }
  return value
}

/** 按归属分支选择固定 SQL；输入只走参数绑定。 */
function caseLockSql(owner: TemporaryCareOwner, nowMs: number): { sql: string; params: readonly (string | number)[] } {
  if (owner.kind === 'guest') {
    return {
      sql: `SELECT CAST(e.id AS CHAR) AS case_id, CAST(e.expires_at_ms AS CHAR) AS expires_at_ms
        FROM guest_plant_cases e JOIN guest_sessions g ON g.id = e.guest_session_internal_id AND g._openid = ''
        WHERE BINARY g.guest_session_ref = BINARY ? AND BINARY e.guest_plant_case_ref = BINARY ?
          AND g.status = 'active' AND g.expires_at_ms > ? AND e.status = 'active' AND e.expires_at_ms > ? AND e._openid = ''
        FOR UPDATE`,
      params: [owner.guestSessionRef, owner.caseRef, nowMs, nowMs]
    }
  }
  return {
    sql: `SELECT CAST(e.id AS CHAR) AS case_id, CAST(e.expires_at_ms AS CHAR) AS expires_at_ms
      FROM authenticated_ephemeral_plant_cases e JOIN users u ON u.id = e.user_internal_id AND u.status = 'active' AND u._openid = ''
      WHERE BINARY u.public_user_id = BINARY ? AND BINARY e.ephemeral_plant_case_ref = BINARY ?
        AND e.status = 'active' AND e.expires_at_ms > ? AND e._openid = ''
      FOR UPDATE`,
    params: [owner.userRef, owner.caseRef, nowMs]
  }
}

/** 创建 MySQL 浇水建议事务仓储；结果追加复用既有临时养护结果仓储。 */
export function createMysqlWateringAdviceRepository(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>
): WateringAdviceRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  const results = createMysqlTemporaryCareResultRepository(source)
  return {
    lockOwnedCase: async (transaction, inputOwner, nowMs) => {
      const owner = lockTemporaryCareOwner(inputOwner)
      const { sql, params } = caseLockSql(owner, nowMs)
      const rows = await connectionOf(transaction).query(sql, params)
      if (rows.length === 0) { return null }
      if (rows.length !== 1) { throw new WateringAdvicePersistenceError('临时案例锁定结果不唯一') }
      return { caseInternalId: internalId(rows[0]!.case_id), expiresAtMs: milliseconds(rows[0]!.expires_at_ms) }
    },
    findOrCreateWateringSession: async (transaction, input) => {
      const connection = connectionOf(transaction)
      const column = input.owner.kind === 'guest' ? 'guest_plant_case_internal_id' : 'authenticated_ephemeral_case_internal_id'
      const existing = await connection.query(
        `SELECT session_ref FROM temporary_care_sessions
         WHERE ${column} = ? AND capability_type = 'watering' AND status = 'active' AND expires_at_ms > ? AND _openid = ''`,
        [input.caseInternalId, input.nowMs]
      )
      if (existing.length > 1) { throw new WateringAdvicePersistenceError('同一案例存在多个 active 浇水会话') }
      if (existing.length === 1) {
        const ref = existing[0]!.session_ref
        if (typeof ref !== 'string') { throw new WateringAdvicePersistenceError('会话引用读回不合法') }
        return ref
      }
      const written = await connection.execute(
        `INSERT INTO temporary_care_sessions (session_ref, ${column}, capability_type, status, expires_at_ms, created_at_ms, updated_at_ms)
         VALUES (?, ?, 'watering', 'active', ?, ?, ?)`,
        [input.candidateSessionRef, input.caseInternalId, input.expiresAtMs, input.nowMs, input.nowMs]
      )
      if (written.affectedRows !== 1) { throw new WateringAdvicePersistenceError('浇水会话写入未确定') }
      return input.candidateSessionRef
    },
    appendResult: (transaction, record) => results.append(transaction, record),
    readResultHash: async (transaction, resultRef) => {
      const rows = await connectionOf(transaction).query(
        `SELECT result_sha256 FROM temporary_care_results WHERE BINARY result_ref = BINARY ? AND _openid = ''`, [resultRef]
      )
      if (rows.length === 0) { return null }
      const hash = rows[0]!.result_sha256
      return typeof hash === 'string' ? hash : null
    }
  }
}
