import { createHash } from 'node:crypto'

import type { RewardableDomainEventDto } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { createPendingRewardEventRecord } from '../../foundation/outbox/reward-outbox.js'

const zero = Number('0')
const one = Number('1')
const sha256Format = /^[a-f0-9]{64}$/u

/** user-plant 奖励 outbox 持久化违反内部合同或写入结果异常。 */
export class RewardOutboxPersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = '奖励发件箱持久化错误'
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type UserPlantOutboxSqlWriteResult = {
  /** 参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/** user-plant 奖励 outbox 使用的受控参数化 SQL 执行端口。 */
export type UserPlantOutboxSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 必须在调用方传入的同一事务中执行 INSERT。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<UserPlantOutboxSqlWriteResult>
}

/** user-plant 域唯一允许的 outbox 写入端口。 */
export type MysqlUserPlantOutboxRepository<TTransaction extends TransactionExecutionContext> = {
  /**
   * 写入一条待投递的首株完整档案奖励事实。
   * 事件、业务档案和 HTTP 幂等完成记录必须由应用层放在同一事务中提交。
   */
  readonly insertPending: (
    transaction: TTransaction,
    event: RewardableDomainEventDto,
    aggregateVersion: number,
    createdAtMs: number
  ) => Promise<void>
}

/** 判断未知值是否为可规范化的普通 JSON 对象。 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 生成递归稳定键序的 JSON 文本。
 * 该文本同时用于 `payload_json` 和 SHA-256 校验，避免同义键序造成摘要漂移。
 */
function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RewardOutboxPersistenceError('奖励事件载荷不是合法 JSON')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(element => canonicalizeJson(element)).join(',')}]`
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(',')}}`
  }
  throw new RewardOutboxPersistenceError('奖励事件载荷不是合法 JSON')
}

/** 验证事件时间，并转换成数据库使用的 UTC 毫秒。 */
function resolveOccurredAtMs(occurredAt: string): number {
  const occurredAtMs = Date.parse(occurredAt)
  if (!Number.isSafeInteger(occurredAtMs) || occurredAtMs < zero || new Date(occurredAtMs).toISOString() !== occurredAt) {
    throw new RewardOutboxPersistenceError('奖励事件发生时间不合法')
  }
  return occurredAtMs
}

/** 创建只写 `user_plant_outbox` 的 MySQL Repository。 */
export function createMysqlUserPlantOutboxRepository<TTransaction extends TransactionExecutionContext>(
  executor: UserPlantOutboxSqlExecutor<TTransaction>
): MysqlUserPlantOutboxRepository<TTransaction> {
  return {
    async insertPending(transaction, event, aggregateVersion, createdAtMs) {
      const pendingRecord = createPendingRewardEventRecord('user-plant', event)
      if (
        pendingRecord.event.eventType !== 'user_plant.profile_completed.v1' ||
        !pendingRecord.event.userPlantRef ||
        !Number.isSafeInteger(aggregateVersion) ||
        aggregateVersion <= zero ||
        !Number.isSafeInteger(createdAtMs) ||
        createdAtMs < zero
      ) {
        throw new RewardOutboxPersistenceError('用户植物奖励事件输入不合法')
      }

      const payloadJson = canonicalizeJson(pendingRecord.event.payload)
      const calculatedPayloadHash = createHash('sha256').update(payloadJson).digest('hex')
      if (!sha256Format.test(pendingRecord.event.payloadHash) || calculatedPayloadHash !== pendingRecord.event.payloadHash) {
        throw new RewardOutboxPersistenceError('奖励事件载荷摘要不一致')
      }

      const result = await executor.executeWrite(
        transaction,
        `INSERT INTO \`user_plant_outbox\`
          (\`_openid\`, \`event_id\`, \`event_version\`, \`producer_domain\`, \`user_ref\`, \`user_plant_ref\`,
           \`aggregate_ref\`, \`aggregate_version\`, \`occurrence_ref\`, \`event_type\`, \`policy_version\`,
           \`payload_json\`, \`payload_hash\`, \`status\`, \`lease_owner\`, \`lease_until_ms\`, \`attempt_count\`,
           \`next_attempt_at_ms\`, \`occurred_at_ms\`, \`delivered_at_ms\`, \`terminal_reason_code\`,
           \`created_at_ms\`, \`updated_at_ms\`)
         VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 'pending', NULL, NULL, 0, NULL, ?, NULL, NULL, ?, ?)`,
        [
          pendingRecord.event.eventId,
          pendingRecord.event.eventVersion,
          pendingRecord.event.producerDomain,
          pendingRecord.event.userRef,
          pendingRecord.event.userPlantRef,
          pendingRecord.event.aggregateRef,
          aggregateVersion,
          pendingRecord.event.occurrenceRef,
          pendingRecord.event.eventType,
          pendingRecord.event.policyVersion,
          payloadJson,
          pendingRecord.event.payloadHash,
          resolveOccurredAtMs(pendingRecord.event.occurredAt),
          createdAtMs,
          createdAtMs
        ]
      )

      if (result.affectedRows !== one) {
        throw new RewardOutboxPersistenceError('奖励事件未能可靠写入')
      }
    }
  }
}
