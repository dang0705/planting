import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import { timelineItemRefFor, type TimelineCursor, type TimelineItemType, type TimelineSourceDomain } from '../domain/timeline.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('时间线读写需要显式事务') }
  return transaction.connection
}

/** 写入一条投影的输入（来源已校验）。 */
export interface TimelineProjectionInput {
  /** 所属统一用户公开引用。 */ readonly userRef: string
  /** 所属用户植物公开引用。 */ readonly userPlantRef: string
  /** 来源业务域（care 或 user-plant）。 */ readonly sourceDomain: TimelineSourceDomain
  /** 来源对象不可变公开引用。 */ readonly sourceRef: string
  /** 时间线项类型（四种之一）。 */ readonly itemType: TimelineItemType
  /** 业务实际发生 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 脱敏展示摘要（含 itemType）。 */ readonly summary: CanonicalJsonObject
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}

/**
 * 幂等写入一条时间线投影：`uq_timeline_source(source_domain, source_ref)` 已存在则不变（重复投递只落一行）。
 * 归属按公开引用在同一条 SQL 内关联内部键；植物或用户不存在返回 false（调用方决定是否视为投递失败）。
 */
export async function upsertTimelineProjection(transaction: Transaction, input: TimelineProjectionInput): Promise<boolean> {
  const written = await connectionOf(transaction).execute(
    `INSERT INTO user_plant_timeline_projection (timeline_item_ref, user_internal_id, user_plant_internal_id, source_domain, source_ref, item_type,
        occurred_at_ms, summary_json, projection_version, created_at_ms, updated_at_ms)
      SELECT ?, p.user_internal_id, p.id, ?, ?, ?, ?, CAST(? AS JSON), 1, ?, ?
      FROM user_plants p JOIN users u ON u.id = p.user_internal_id
      WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ?
      ON DUPLICATE KEY UPDATE user_plant_timeline_projection.id = user_plant_timeline_projection.id`,
    [timelineItemRefFor(input.sourceDomain, input.sourceRef), input.sourceDomain, input.sourceRef, input.itemType, input.occurredAtMs,
      serializeCanonicalJson(input.summary), input.nowMs, input.nowMs, input.userRef, input.userPlantRef])
  if (written.affectedRows === 1) { return true }
  if (written.affectedRows === 0) {
    const existing = await connectionOf(transaction).query(
      'SELECT 1 AS present FROM user_plant_timeline_projection WHERE source_domain = ? AND BINARY source_ref = BINARY ?', [input.sourceDomain, input.sourceRef])
    return existing.length === 1
  }
  throw new Error('时间线投影写入影响行数不合法')
}

/** 列表读回的一行（脱敏前）。 */
export interface TimelineRow {
  /** 时间线项公开引用。 */ readonly timelineItemRef: string
  /** 时间线类型原值。 */ readonly itemType: string
  /** 业务发生 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 库内展示摘要原文（待严格校验）。 */ readonly summary: unknown
}

/**
 * 读取本人可见植物（active/archived）的时间线；植物不可见返回 null（调用方 404）。
 * 排序：发生时间倒序，同刻按时间线项引用二进制倒序；`fetchLimit` 由应用层传“页大小 + 1”。
 */
export async function listOwnedTimeline(transaction: Transaction, input: {
  /** 统一用户公开引用。 */ readonly userRef: string
  /** 用户植物公开引用。 */ readonly userPlantRef: string
  /** 最多读取行数（1～51）。 */ readonly fetchLimit: number
  /** 上一页最后一项位置；第一页为 null。 */ readonly after: TimelineCursor | null
}): Promise<TimelineRow[] | null> {
  const connection = connectionOf(transaction)
  const owners = await connection.query(
    `SELECT CAST(p.user_internal_id AS CHAR) AS user_id, CAST(p.id AS CHAR) AS plant_id FROM user_plants p JOIN users u ON u.id = p.user_internal_id
      WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND u.status = 'active' AND p.lifecycle_status IN ('active', 'archived') AND p._openid = ''`,
    [input.userRef, input.userPlantRef])
  if (owners.length === 0) { return null }
  if (owners.length !== 1) { throw new Error('时间线归属读回不唯一') }
  const parameters: Array<string | number> = [String(owners[0]!.user_id), String(owners[0]!.plant_id)]
  let cursorSql = ''
  if (input.after !== null) {
    cursorSql = ' AND (occurred_at_ms < ? OR (occurred_at_ms = ? AND BINARY timeline_item_ref < BINARY ?))'
    parameters.push(input.after.occurredAtMs, input.after.occurredAtMs, input.after.timelineItemRef)
  }
  parameters.push(input.fetchLimit)
  const rows = await connection.query(
    `SELECT timeline_item_ref, item_type, CAST(occurred_at_ms AS CHAR) AS occurred_at_ms, summary_json FROM user_plant_timeline_projection
      WHERE user_internal_id = ? AND user_plant_internal_id = ?${cursorSql}
      ORDER BY occurred_at_ms DESC, BINARY timeline_item_ref DESC LIMIT ?`, parameters)
  return rows.map(row => {
    const occurred = Number(row.occurred_at_ms)
    if (typeof row.timeline_item_ref !== 'string' || typeof row.item_type !== 'string' || !Number.isSafeInteger(occurred)) { throw new Error('时间线行损坏') }
    return { timelineItemRef: row.timeline_item_ref, itemType: row.item_type, occurredAtMs: occurred,
      summary: typeof row.summary_json === 'string' ? JSON.parse(row.summary_json) as unknown : row.summary_json }
  })
}
