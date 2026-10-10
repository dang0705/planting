import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { CARE_PLAN_EXPIRY_SCAN } from '../domain/care-plan-expiry-rules.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 一批过期写入输入（long-term-care-contract.md §12.1/§12.2）。 */
export interface ExpireDueCarePlansInput {
  /** 截止 UTC 毫秒：计划时刻严格早于它的 planned 计划才会被标为过期。 */
  readonly cutoffMs: number
  /** 写入时刻 UTC 毫秒（updated_at_ms）。 */
  readonly nowMs: number
  /** 本批最多改写行数：1～`care.plans.expiry_scan.batchSize` 的整数。 */
  readonly limit: number
}

/** 显式事务守卫：Repository 写入只允许在事务驱动创建的上下文内执行。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('计划过期写入需要显式事务') }
  return transaction.connection
}

/**
 * 一条带条件的单表更新，把到期 planned 计划标为 expired，返回实际改写行数。
 *
 * 并发闸门（§12.2）：`WHERE status = 'planned'` 由 InnoDB 在行锁后按最新已提交值复核——
 * 用户先完成/跳过的计划不再满足条件被跳过；本语句先改写的计划，用户事务加锁后会读到 expired。
 * 不读后写、不碰日历正文与任何归属列；LIMIT 为已校验整数（mysql2 预处理语句不接受 LIMIT 占位符）。
 */
export async function expireDueCarePlans(transaction: Transaction, input: ExpireDueCarePlansInput): Promise<number> {
  const connection = connectionOf(transaction)
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > CARE_PLAN_EXPIRY_SCAN.batchSize) {
    throw new RangeError('计划过期批量上限不合法')
  }
  const written = await connection.execute(
    `UPDATE care_plans SET status = 'expired', version = version + 1, updated_at_ms = ?
      WHERE status = 'planned' AND scheduled_at_ms < ?
      ORDER BY scheduled_at_ms ASC, id ASC LIMIT ${input.limit}`,
    [input.nowMs, input.cutoffMs])
  if (!Number.isSafeInteger(written.affectedRows) || written.affectedRows < 0 || written.affectedRows > input.limit) {
    throw new Error('计划过期写入影响行数不合法')
  }
  return written.affectedRows
}
