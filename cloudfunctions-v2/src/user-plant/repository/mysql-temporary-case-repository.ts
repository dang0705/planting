import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 事务内加锁读到的游客会话与其 active 未过期案例数；内部主键不得离开 user-plant 应用层。 */
export interface LockedGuestSessionCases {
  /** 游客会话内部主键十进制文本；只用于同事务写入外键，不得公开。 */
  readonly guestSessionInternalId: string
  /** 加锁读到的游客会话状态：active、completed、failed、expired。 */
  readonly status: string
  /** 加锁读到的游客会话绝对失效时刻，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 同一会话下 status=active 且 expires_at_ms 晚于当前时刻的案例数。 */
  readonly activeCaseCount: number
}

/** 新建游客案例的内部写入命令。 */
export interface InsertGuestCaseInput {
  /** 已加锁游客会话的内部主键。 */
  readonly guestSessionInternalId: string
  /** 服务端生成的 gpc_ 前缀高熵公开引用。 */
  readonly caseRef: string
  /** 领域规则算出的案例绝对失效时刻，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 服务端可信时钟的创建时刻，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 新建登录临时案例的内部写入命令。 */
export interface InsertAuthenticatedCaseInput {
  /** 已加锁统一用户的内部主键。 */
  readonly userInternalId: string
  /** 服务端生成的 epc_ 前缀高熵公开引用。 */
  readonly caseRef: string
  /** 领域规则算出的案例绝对失效时刻，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 服务端可信时钟的创建时刻，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 读回的临时案例公开要素；不含内部主键与归属。 */
export interface TemporaryCaseReadBack {
  /** 数据库中保存的公开引用。 */
  readonly caseRef: string
  /** 数据库中保存的绝对失效时刻，UTC 毫秒。 */
  readonly expiresAtMs: number
}

/**
 * 临时案例 Repository：唯一 SQL 入口。所有方法必须在调用方传入的显式事务内执行，
 * 不自行提交或重试；游客与登录两条路径分表写入，互不触达。
 */
export interface TemporaryCaseRepository<TTransaction extends TransactionExecutionContext> {
  /** 以 FOR UPDATE 锁定游客会话行并计数 active 未过期案例；会话不存在时返回 null。 */
  readonly lockGuestSessionAndCountActiveCases: (
    transaction: TTransaction,
    input: {
      /** 游客主体中的会话公开引用。 */
      readonly guestSessionRef: string
      /** 计数过期判断使用的当前 UTC 毫秒。 */
      readonly nowMs: number
    }
  ) => Promise<LockedGuestSessionCases | null>
  /** 在已锁定会话的事务内插入 active 游客案例。 */
  readonly insertGuestCase: (transaction: TTransaction, input: InsertGuestCaseInput) => Promise<void>
  /** 按会话与公开引用读回刚插入的游客案例。 */
  readonly readGuestCase: (
    transaction: TTransaction,
    input: {
      /** 已加锁游客会话的内部主键。 */
      readonly guestSessionInternalId: string
      /** 待读回案例的公开引用。 */
      readonly caseRef: string
    }
  ) => Promise<TemporaryCaseReadBack>
  /** 以 FOR UPDATE 锁定 active 统一用户；用户不存在或非 active 时返回 null。 */
  readonly lockActiveUser: (
    transaction: TTransaction,
    input: {
      /** 登录主体中的统一用户公开引用。 */
      readonly userRef: string
    }
  ) => Promise<{
    /** 已加锁统一用户内部主键十进制文本；不得公开。 */
    readonly userInternalId: string
  } | null>
  /** 在已锁定用户的事务内插入 active 登录临时案例。 */
  readonly insertAuthenticatedCase: (transaction: TTransaction, input: InsertAuthenticatedCaseInput) => Promise<void>
  /** 按用户与公开引用读回刚插入的登录临时案例。 */
  readonly readAuthenticatedCase: (
    transaction: TTransaction,
    input: {
      /** 已加锁统一用户的内部主键。 */
      readonly userInternalId: string
      /** 待读回案例的公开引用。 */
      readonly caseRef: string
    }
  ) => Promise<TemporaryCaseReadBack>
}

/** 临时案例持久化数据不合法时抛出的内部错误；只能映射为泛化失败。 */
export class TemporaryCasePersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '临时案例持久化错误'
  }
}

/** 内部 BIGINT 主键保持十进制文本，不转浮点。 */
function internalId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) { throw new TemporaryCasePersistenceError('内部主键读回不合法') }
  return value
}

/** 非负 BIGINT 文本转安全整数毫秒。 */
function milliseconds(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { throw new TemporaryCasePersistenceError('时间读回不合法') }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) { throw new TemporaryCasePersistenceError('时间读回超出范围') }
  return parsed
}

/** 显式事务守卫：没有事务上下文时拒绝执行任何 SQL。 */
function connectionOf(transaction: MysqlTransactionContext<Mysql2QueryConnection>): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('临时案例写入需要显式事务') }
  return transaction.connection
}

/** 恰好一行读回，否则视为数据不完整。 */
function singleRow(rows: readonly Record<string, unknown>[], message: string): Record<string, unknown> {
  if (rows.length !== 1) { throw new TemporaryCasePersistenceError(message) }
  return rows[0]!
}

/** 读回行转为公开要素，并核对引用与写入一致。 */
function readBack(rows: readonly Record<string, unknown>[], caseRef: string): TemporaryCaseReadBack {
  const row = singleRow(rows, '临时案例读回不完整')
  if (row.case_ref !== caseRef || row.status !== 'active') { throw new TemporaryCasePersistenceError('临时案例读回不一致') }
  return { caseRef, expiresAtMs: milliseconds(row.expires_at_ms) }
}

/** 写入必须恰好影响一行。 */
function requireSingleInsert(result: { readonly affectedRows: number }): void {
  if (result.affectedRows !== 1) { throw new TemporaryCasePersistenceError('临时案例写入未确定') }
}

/** 创建 MySQL 临时案例 Repository；只在调用方事务内执行参数化 SQL。 */
export function createMysqlTemporaryCaseRepository(): TemporaryCaseRepository<MysqlTransactionContext<Mysql2QueryConnection>> {
  return {
    lockGuestSessionAndCountActiveCases: async (transaction, input) => {
      const connection = connectionOf(transaction)
      const sessions = await connection.query(
        `SELECT CAST(id AS CHAR) AS session_id, status, CAST(expires_at_ms AS CHAR) AS expires_at_ms
         FROM guest_sessions WHERE BINARY guest_session_ref = BINARY ? AND _openid = '' FOR UPDATE`,
        [input.guestSessionRef]
      )
      if (sessions.length === 0) { return null }
      const session = singleRow(sessions, '游客会话锁定结果不唯一')
      const sessionId = internalId(session.session_id)
      const counted = singleRow(await connection.query(
        `SELECT CAST(COUNT(*) AS CHAR) AS active_count FROM guest_plant_cases
         WHERE guest_session_internal_id = ? AND status = 'active' AND expires_at_ms > ? AND _openid = ''`,
        [sessionId, input.nowMs]
      ), '游客案例计数结果不完整')
      return {
        guestSessionInternalId: sessionId,
        status: typeof session.status === 'string' ? session.status : '',
        expiresAtMs: milliseconds(session.expires_at_ms),
        activeCaseCount: milliseconds(counted.active_count)
      }
    },
    insertGuestCase: async (transaction, input) => {
      requireSingleInsert(await connectionOf(transaction).execute(
        `INSERT INTO guest_plant_cases
           (guest_plant_case_ref, guest_session_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
         VALUES (?, ?, 'active', ?, 1, ?, ?)`,
        [input.caseRef, input.guestSessionInternalId, input.expiresAtMs, input.occurredAtMs, input.occurredAtMs]
      ))
    },
    readGuestCase: async (transaction, input) => readBack(await connectionOf(transaction).query(
      `SELECT guest_plant_case_ref AS case_ref, status, CAST(expires_at_ms AS CHAR) AS expires_at_ms
       FROM guest_plant_cases WHERE guest_session_internal_id = ? AND BINARY guest_plant_case_ref = BINARY ? AND _openid = ''`,
      [input.guestSessionInternalId, input.caseRef]
    ), input.caseRef),
    lockActiveUser: async (transaction, input) => {
      const users = await connectionOf(transaction).query(
        `SELECT CAST(id AS CHAR) AS user_id FROM users
         WHERE BINARY public_user_id = BINARY ? AND status = 'active' AND _openid = '' FOR UPDATE`,
        [input.userRef]
      )
      if (users.length === 0) { return null }
      return { userInternalId: internalId(singleRow(users, '统一用户锁定结果不唯一').user_id) }
    },
    insertAuthenticatedCase: async (transaction, input) => {
      requireSingleInsert(await connectionOf(transaction).execute(
        `INSERT INTO authenticated_ephemeral_plant_cases
           (ephemeral_plant_case_ref, user_internal_id, status, expires_at_ms, version, created_at_ms, updated_at_ms)
         VALUES (?, ?, 'active', ?, 1, ?, ?)`,
        [input.caseRef, input.userInternalId, input.expiresAtMs, input.occurredAtMs, input.occurredAtMs]
      ))
    },
    readAuthenticatedCase: async (transaction, input) => readBack(await connectionOf(transaction).query(
      `SELECT ephemeral_plant_case_ref AS case_ref, status, CAST(expires_at_ms AS CHAR) AS expires_at_ms
       FROM authenticated_ephemeral_plant_cases WHERE user_internal_id = ? AND BINARY ephemeral_plant_case_ref = BINARY ? AND _openid = ''`,
      [input.userInternalId, input.caseRef]
    ), input.caseRef)
  }
}
