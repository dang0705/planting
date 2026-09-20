import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'

const zero = Number('0')
const one = Number('1')

/** TTL 扫描允许读回的最小预占行。 */
export type ExpiredAiQuotaReservationSqlRow = {
  /** 预占 BIGINT 内部主键的十进制文本。 */
  readonly reservation_internal_id: string
  /** 高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 当前预占生命周期状态。 */
  readonly reservation_status: 'reserved'
  /** 预占失效边界的 UTC 毫秒文本。 */
  readonly expires_at_ms: string
  /** 预占乐观锁版本的正整数文本。 */
  readonly reservation_version: string
}

/** 参数化 TTL 扫描 SQL 写入结果。 */
export type AiQuotaExpirySqlWriteResult = {
  /** SQL 实际影响的行数。 */
  readonly affectedRows: number
}

/** TTL 扫描使用的参数化 SQL 执行端口。 */
export type AiQuotaExpirySqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务内查询并锁定到期预占。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly ExpiredAiQuotaReservationSqlRow[]>
  /** 在调用方事务内更新单条预占状态。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<AiQuotaExpirySqlWriteResult>
}

/** 已锁定、等待领域规则裁决的到期预占。 */
export type LockedExpiredAiQuotaReservation = {
  /** 预占 BIGINT 内部主键文本，仅在 Repository 内部流动。 */
  readonly reservationInternalId: string
  /** 高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 当前预占生命周期状态。 */
  readonly status: 'reserved'
  /** 预占失效边界，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 预占锁定时的乐观锁版本。 */
  readonly reservationVersion: number
}

/** 锁定一批到期预占所需的可信输入。 */
export type LockExpiredAiQuotaReservationsInput = {
  /** 扫描使用的服务端可信时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 已由任务合同批准的单批扫描上限；Repository 不提供隐式默认值。 */
  readonly batchLimit: number
}

/** 把单条到期预占标记为待对账所需的乐观锁输入。 */
export type MarkExpiredAiQuotaReservationPendingInput = LockedExpiredAiQuotaReservation & {
  /** 状态变更的服务端可信时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** TTL 扫描的 MySQL Repository 端口。 */
export type MysqlAiQuotaExpiryRepository<TTransaction extends TransactionExecutionContext> = {
  /** 以稳定顺序锁定一批仍处于 reserved 的到期预占。 */
  readonly lockExpiredReservations: (
    transaction: TTransaction,
    input: LockExpiredAiQuotaReservationsInput
  ) => Promise<readonly LockedExpiredAiQuotaReservation[]>
  /** 仅改变 reservation 状态和原因，不触碰额度、分摊或账本。 */
  readonly markPendingReconciliation: (
    transaction: TTransaction,
    input: MarkExpiredAiQuotaReservationPendingInput
  ) => Promise<void>
}

/** 校验数据库 BIGINT 文本没有被转换为可能丢精度的 JavaScript number。 */
function verifyInternalPrimaryKey(value: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占内部主键不合法')
  }
}

/** 把受控十进制文本转换为安全的非负整数。 */
function parseSafeInteger(value: string, allowZero: boolean, label: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', `${label}格式不合法`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? zero : one)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', `${label}超出安全范围`)
  }
  return parsed
}

/** 创建不携带默认业务参数的 MySQL TTL 扫描 Repository。 */
export function createMysqlAiQuotaExpiryRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaExpirySqlExecutor<TTransaction>
): MysqlAiQuotaExpiryRepository<TTransaction> {
  const lockExpiredReservations = async (
    transaction: TTransaction,
    input: LockExpiredAiQuotaReservationsInput
  ): Promise<readonly LockedExpiredAiQuotaReservation[]> => {
    if (
      !Number.isSafeInteger(input.occurredAtMs) ||
      input.occurredAtMs < zero ||
      !Number.isSafeInteger(input.batchLimit) ||
      input.batchLimit < one
    ) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占TTL扫描输入不合法')
    }
    const rows = await executor.executeQuery(
      transaction,
      `SELECT CAST(\`id\` AS CHAR) AS \`reservation_internal_id\`, \`reservation_ref\`,
              \`status\` AS \`reservation_status\`, CAST(\`expires_at_ms\` AS CHAR) AS \`expires_at_ms\`,
              CAST(\`version\` AS CHAR) AS \`reservation_version\`
       FROM \`ai_quota_reservations\`
       WHERE \`status\` = 'reserved' AND \`settled_amount\` IS NULL AND \`expires_at_ms\` <= ?
       ORDER BY \`expires_at_ms\`, \`id\`
       LIMIT ${String(input.batchLimit)}
       FOR UPDATE SKIP LOCKED`,
      [input.occurredAtMs]
    )
    const seenRefs = new Set<string>()
    return rows.map(row => {
      verifyInternalPrimaryKey(row.reservation_internal_id)
      if (!/^aqr_[A-Za-z0-9_-]+$/.test(row.reservation_ref) || seenRefs.has(row.reservation_ref)) {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度预占TTL扫描返回非法或重复引用'
        )
      }
      seenRefs.add(row.reservation_ref)
      return {
        reservationInternalId: row.reservation_internal_id,
        reservationRef: row.reservation_ref,
        status: row.reservation_status,
        expiresAtMs: parseSafeInteger(row.expires_at_ms, true, '额度预占失效时间'),
        reservationVersion: parseSafeInteger(row.reservation_version, false, '额度预占版本')
      }
    })
  }

  const markPendingReconciliation = async (
    transaction: TTransaction,
    input: MarkExpiredAiQuotaReservationPendingInput
  ): Promise<void> => {
    verifyInternalPrimaryKey(input.reservationInternalId)
    if (
      !/^aqr_[A-Za-z0-9_-]+$/.test(input.reservationRef) ||
      !Number.isSafeInteger(input.expiresAtMs) ||
      input.expiresAtMs < zero ||
      !Number.isSafeInteger(input.reservationVersion) ||
      input.reservationVersion < one ||
      !Number.isSafeInteger(input.occurredAtMs) ||
      input.occurredAtMs < input.expiresAtMs
    ) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占TTL更新输入不合法')
    }
    const result = await executor.executeWrite(
      transaction,
      `UPDATE \`ai_quota_reservations\`
       SET \`status\` = 'pending_reconciliation',
           \`reconciliation_reason\` = 'reservation_ttl_expired',
           \`version\` = \`version\` + 1, \`updated_at_ms\` = ?
       WHERE \`id\` = ? AND \`reservation_ref\` = ? AND \`version\` = ?
         AND \`status\` = 'reserved' AND \`settled_amount\` IS NULL AND \`expires_at_ms\` <= ?`,
      [
        input.occurredAtMs,
        input.reservationInternalId,
        input.reservationRef,
        input.reservationVersion,
        input.occurredAtMs
      ]
    )
    if (result.affectedRows !== one) {
      throw new AiQuotaSettlementPersistenceError('WRITE_CONFLICT', '额度预占TTL状态更新冲突')
    }
  }

  return { lockExpiredReservations, markPendingReconciliation }
}
