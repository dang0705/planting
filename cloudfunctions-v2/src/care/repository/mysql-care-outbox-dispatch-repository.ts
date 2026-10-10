import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { LeasedCareEvent, LeaseCareEventsInput, LeaseCareEventsResult, SettleCareEventInput } from '../application/dispatch-care-outbox.js'
import { CARE_TIMELINE_EVENT_TYPES, type CareTimelineEventType } from '../domain/care-outbox-dispatch-rules.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('发件箱派发需要显式事务') }
  return transaction.connection
}

const typePlaceholders = CARE_TIMELINE_EVENT_TYPES.map(() => '?').join(', ')

/**
 * 领取一批时间线事件（user-plant-timeline.md §5）：可领取 = pending 且到期，或 dispatching 但租约已过期（崩溃接管）。
 * `FOR UPDATE SKIP LOCKED` 让并发运行互不阻塞、互不重复领取；已尝试满上限且租约过期的直接死信。
 */
export async function leaseCareTimelineEvents(transaction: Transaction, input: LeaseCareEventsInput): Promise<LeaseCareEventsResult> {
  const connection = connectionOf(transaction)
  const rows = await connection.query(
    `SELECT CAST(id AS CHAR) AS id, event_type, user_ref, user_plant_ref, payload_json, CAST(occurred_at_ms AS CHAR) AS occurred_at_ms, attempt_count, status
      FROM care_outbox
      WHERE event_type IN (${typePlaceholders}) AND _openid = ''
        AND ((status = 'pending' AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)) OR (status = 'dispatching' AND lease_until_ms <= ?))
      ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`,
    [...CARE_TIMELINE_EVENT_TYPES, input.nowMs, input.nowMs, input.limit])
  const leased: LeasedCareEvent[] = []
  let deadLettered = 0
  for (const row of rows) {
    const attempts = Number(row.attempt_count)
    if (!Number.isSafeInteger(attempts) || attempts < 0) { throw new Error('发件箱尝试次数损坏') }
    if (attempts >= input.maxAttempts) {
      const written = await connection.execute(
        `UPDATE care_outbox SET status = 'dead_letter', lease_owner = NULL, lease_until_ms = NULL, terminal_reason_code = 'lease_expired_max_attempts', updated_at_ms = ? WHERE id = ?`,
        [input.nowMs, String(row.id)])
      if (written.affectedRows !== 1) { throw new Error('发件箱死信写入未确定') }
      deadLettered += 1
      continue
    }
    const written = await connection.execute(
      `UPDATE care_outbox SET status = 'dispatching', lease_owner = ?, lease_until_ms = ?, attempt_count = attempt_count + 1, next_attempt_at_ms = NULL, updated_at_ms = ? WHERE id = ?`,
      [input.owner, input.nowMs + input.leaseMs, input.nowMs, String(row.id)])
    if (written.affectedRows !== 1) { throw new Error('发件箱租约写入未确定') }
    const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) as unknown : row.payload_json
    const occurredAtMs = Number(row.occurred_at_ms)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isSafeInteger(occurredAtMs)
      || typeof row.user_ref !== 'string' || typeof row.user_plant_ref !== 'string') { throw new Error('发件箱事件行损坏') }
    leased.push({ id: String(row.id), eventType: row.event_type as CareTimelineEventType, userRef: row.user_ref, userPlantRef: row.user_plant_ref,
      payload: payload as Record<string, unknown>, occurredAtMs, attempt: attempts + 1 })
  }
  return { leased, deadLettered }
}

/**
 * 结算一条事件：只在“仍由本次运行持有租约”时生效（条件写），否则返回 false（已被接管，不覆盖他人结果）。
 * delivered → 成功；retry → 回到 pending 等下一次运行；dead_letter → 终止，terminal_reason_code=delivery_failed。
 */
export async function settleCareTimelineEvent(transaction: Transaction, input: SettleCareEventInput): Promise<boolean> {
  const connection = connectionOf(transaction)
  const set = input.outcome === 'delivered'
    ? "status = 'delivered', delivered_at_ms = ?, lease_owner = NULL, lease_until_ms = NULL, updated_at_ms = ?"
    : input.outcome === 'retry'
      ? "status = 'pending', next_attempt_at_ms = ?, lease_owner = NULL, lease_until_ms = NULL, updated_at_ms = ?"
      : "status = 'dead_letter', terminal_reason_code = 'delivery_failed', next_attempt_at_ms = NULL, lease_owner = NULL, lease_until_ms = NULL, updated_at_ms = ?"
  const parameters = input.outcome === 'dead_letter' ? [input.nowMs] : [input.nowMs, input.nowMs]
  const written = await connection.execute(
    `UPDATE care_outbox SET ${set} WHERE id = ? AND status = 'dispatching' AND BINARY lease_owner = BINARY ?`,
    [...parameters, input.id, input.owner])
  return written.affectedRows === 1
}
