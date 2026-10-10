import { createHash, randomBytes } from 'node:crypto'

import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { LockedOwnedUserPlant } from '../../user-plant/repository/mysql-catalog-binding-repository.js'
import type { CareTimelineEventType } from '../domain/care-outbox-dispatch-rules.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>
/** care 形成时间线事实时使用的合同版本（写入 producer_policy_version）。 */
const producerPolicyVersion = 'long-term-care/v1'

/** 追加一条时间线事件的输入。 */
interface AppendCareTimelineEventInput {
  /** 时间线事件类型（浇水事实或计划完成）。 */ readonly eventType: CareTimelineEventType
  /** 来源对象公开引用（事实 cft_ 或计划 cpl_），同时作为聚合引用与发生引用。 */ readonly sourceRef: string
  /** 来源聚合版本（事实为 1，计划为完成后的版本）。 */ readonly aggregateVersion: number
  /** 业务实际发生时间 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 脱敏载荷：只含公开引用、时间与浇水量。 */ readonly payload: CanonicalJsonObject
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}

/**
 * 在调用方事务内向 care_outbox 追加 pending 事件（long-term-care-contract.md §13）。
 * 用户/植物公开引用由同一事务内的内部键关联读出，不信任外部传入；写入行数必须为 1，否则抛错整体回滚。
 */
async function appendCareTimelineEvent(transaction: Transaction, plant: LockedOwnedUserPlant, input: AppendCareTimelineEventInput): Promise<string> {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('care 事件写入需要显式事务') }
  const payloadJson = serializeCanonicalJson(input.payload)
  const eventId = `evt_${randomBytes(18).toString('base64url')}`
  const written = await transaction.connection.execute(
    `INSERT INTO care_outbox (event_id, event_version, producer_domain, user_ref, user_plant_ref, aggregate_ref, aggregate_version, occurrence_ref, event_type,
        producer_policy_version, payload_json, payload_hash, status, attempt_count, occurred_at_ms, created_at_ms, updated_at_ms)
      SELECT ?, 1, 'care', u.public_user_id, p.public_user_plant_id, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 'pending', 0, ?, ?, ?
      FROM user_plants p JOIN users u ON u.id = p.user_internal_id WHERE p.id = ? AND p.user_internal_id = ?`,
    [eventId, input.sourceRef, input.aggregateVersion, input.sourceRef, input.eventType, producerPolicyVersion,
      payloadJson, createHash('sha256').update(payloadJson, 'utf8').digest('hex'), input.occurredAtMs, input.nowMs, input.nowMs,
      plant.plantInternalId, plant.userInternalId])
  if (written.affectedRows !== 1) { throw new Error('care 时间线事件写入未确定') }
  // 返回事件标识，供提交后同请求派发只处理本请求新写入的事件（§13，2026-10-10）。
  return eventId
}

/** 浇水事实已记录：`care.watering_fact_recorded.v1`。 */
export function appendWateringFactRecordedEvent(transaction: Transaction, plant: LockedOwnedUserPlant, input: {
  /** 浇水事实公开引用。 */ readonly factRef: string
  /** 实际浇水 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 浇水量毫升；未知为 null。 */ readonly amountMl: number | null
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}): Promise<string> {
  return appendCareTimelineEvent(transaction, plant, {
    eventType: 'care.watering_fact_recorded.v1', sourceRef: input.factRef, aggregateVersion: 1, occurredAtMs: input.occurredAtMs, nowMs: input.nowMs,
    payload: { factRef: input.factRef, occurredAt: new Date(input.occurredAtMs).toISOString(), amountMl: input.amountMl }
  })
}

/** 检查计划已完成（outcome=done）：`care.plan_completed.v1`。 */
export function appendPlanCompletedEvent(transaction: Transaction, plant: LockedOwnedUserPlant, input: {
  /** 计划公开引用。 */ readonly planRef: string
  /** 完成后的计划版本。 */ readonly planVersion: number
  /** 完成时刻 UTC 毫秒。 */ readonly completedAtMs: number
}): Promise<string> {
  return appendCareTimelineEvent(transaction, plant, {
    eventType: 'care.plan_completed.v1', sourceRef: input.planRef, aggregateVersion: input.planVersion, occurredAtMs: input.completedAtMs, nowMs: input.completedAtMs,
    payload: { planRef: input.planRef, completedAt: new Date(input.completedAtMs).toISOString() }
  })
}
