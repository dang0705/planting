/**
 * “供应商结果未知”专用 MySQL Repository。
 * 合同：docs/backend-v2/contracts/care-points-and-ai-quota.md——无法确认供应商结果时，预占进入
 * `pending_reconciliation` 并记录内部原因 `provider_result_unknown`；对账前额度保持锁定，不得自动释放。
 * 本 Repository 只改变预占的状态、原因、版本和更新时间，绝不触碰账户、批次、分摊或账本。
 */
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'

const zero = Number('0')
const one = Number('1')

/** 高熵额度预占公开引用格式。 */
const reservationRefFormat = /^aqr_[A-Za-z0-9_-]+$/

/** 预占生命周期状态。 */
export type AiQuotaProviderUnknownReservationStatus =
  | 'reserved'
  | 'settled'
  | 'released'
  | 'pending_reconciliation'

/** 锁定预占时允许读回的最小 SQL 行。 */
export type AiQuotaProviderUnknownSqlRow = {
  /** 预占 BIGINT 内部主键的十进制文本，只在 Repository 内部流动。 */
  readonly reservation_internal_id: string
  /** 高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 当前预占生命周期状态。 */
  readonly reservation_status: AiQuotaProviderUnknownReservationStatus
  /** 预占乐观锁版本的正整数文本。 */
  readonly reservation_version: string
}

/** 参数化 SQL 写入结果。 */
export type AiQuotaProviderUnknownSqlWriteResult = {
  /** SQL 实际影响的行数。 */
  readonly affectedRows: number
}

/** 本 Repository 使用的参数化 SQL 执行端口。 */
export type AiQuotaProviderUnknownSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务内执行参数化查询并加行锁。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly AiQuotaProviderUnknownSqlRow[]>
  /** 在调用方事务内执行参数化写入。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<AiQuotaProviderUnknownSqlWriteResult>
}

/** 已锁定、等待用例裁决的预占快照。 */
export type LockedAiQuotaProviderUnknownReservation = {
  /** 预占 BIGINT 内部主键文本，仅在 Repository 与用例之间流动，不得进入公开响应。 */
  readonly reservationInternalId: string
  /** 高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 锁定时的预占生命周期状态。 */
  readonly status: AiQuotaProviderUnknownReservationStatus
  /** 锁定时的预占乐观锁版本。 */
  readonly reservationVersion: number
}

/** 按用户归属锁定预占所需的输入。 */
export type LockAiQuotaProviderUnknownReservationInput = {
  /** 已由账户锁验证的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 要标记的高熵额度预占公开引用。 */
  readonly reservationRef: string
}

/** 把 reserved 预占标记为“供应商结果未知”所需的乐观锁输入。 */
export type MarkAiQuotaProviderResultUnknownInput = {
  /** 已锁定预占的 BIGINT 内部主键文本。 */
  readonly reservationInternalId: string
  /** 已锁定预占的高熵公开引用，作为双重匹配条件。 */
  readonly reservationRef: string
  /** 锁定时的预占乐观锁版本。 */
  readonly reservationVersion: number
  /** 状态变更的服务端可信时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** “供应商结果未知”专用 MySQL Repository 端口。 */
export type MysqlAiQuotaProviderUnknownRepository<
  TTransaction extends TransactionExecutionContext
> = {
  /** 锁定指定用户名下的预占；不存在或不属于该用户时返回 null。 */
  readonly lockReservation: (
    transaction: TTransaction,
    input: LockAiQuotaProviderUnknownReservationInput
  ) => Promise<LockedAiQuotaProviderUnknownReservation | null>
  /** 仅把 reserved 预占改为待对账并记录原因，不触碰额度、分摊或账本。 */
  readonly markProviderResultUnknown: (
    transaction: TTransaction,
    input: MarkAiQuotaProviderResultUnknownInput
  ) => Promise<void>
}

/** 校验数据库 BIGINT 文本没有被转换为可能丢精度的 JavaScript number。 */
function verifyInternalPrimaryKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占内部主键不合法')
  }
}

/** 允许读回的预占状态集合。 */
const knownStatuses = new Set<string>(['reserved', 'settled', 'released', 'pending_reconciliation'])

/** 创建“供应商结果未知”专用 MySQL Repository。 */
export function createMysqlAiQuotaProviderUnknownRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaProviderUnknownSqlExecutor<TTransaction>
): MysqlAiQuotaProviderUnknownRepository<TTransaction> {
  const lockReservation = async (
    transaction: TTransaction,
    input: LockAiQuotaProviderUnknownReservationInput
  ): Promise<LockedAiQuotaProviderUnknownReservation | null> => {
    verifyInternalPrimaryKey(input.userInternalId)
    if (!reservationRefFormat.test(input.reservationRef)) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占公开引用不合法')
    }
    const rows = await executor.executeQuery(
      transaction,
      `SELECT CAST(\`id\` AS CHAR) AS \`reservation_internal_id\`, \`reservation_ref\`,
              \`status\` AS \`reservation_status\`, CAST(\`version\` AS CHAR) AS \`reservation_version\`
       FROM \`ai_quota_reservations\`
       WHERE \`user_internal_id\` = ? AND \`reservation_ref\` = ?
       FOR UPDATE`,
      [input.userInternalId, input.reservationRef]
    )
    if (rows.length === zero) {
      return null
    }
    const row = rows[zero]
    if (rows.length !== one || row === undefined) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占读回不唯一')
    }
    verifyInternalPrimaryKey(row.reservation_internal_id)
    if (
      row.reservation_ref !== input.reservationRef ||
      !knownStatuses.has(row.reservation_status)
    ) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占读回不合法')
    }
    if (!/^[1-9][0-9]*$/.test(row.reservation_version)) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占版本格式不合法')
    }
    const reservationVersion = Number(row.reservation_version)
    if (!Number.isSafeInteger(reservationVersion)) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度预占版本超出安全范围'
      )
    }
    return {
      reservationInternalId: row.reservation_internal_id,
      reservationRef: row.reservation_ref,
      status: row.reservation_status,
      reservationVersion
    }
  }

  const markProviderResultUnknown = async (
    transaction: TTransaction,
    input: MarkAiQuotaProviderResultUnknownInput
  ): Promise<void> => {
    verifyInternalPrimaryKey(input.reservationInternalId)
    if (
      !reservationRefFormat.test(input.reservationRef) ||
      !Number.isSafeInteger(input.reservationVersion) ||
      input.reservationVersion < one ||
      !Number.isSafeInteger(input.occurredAtMs) ||
      input.occurredAtMs < zero
    ) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '供应商结果未知标记输入不合法'
      )
    }
    const result = await executor.executeWrite(
      transaction,
      `UPDATE \`ai_quota_reservations\`
       SET \`status\` = 'pending_reconciliation',
           \`reconciliation_reason\` = 'provider_result_unknown',
           \`version\` = \`version\` + 1, \`updated_at_ms\` = ?
       WHERE \`id\` = ? AND \`reservation_ref\` = ? AND \`version\` = ?
         AND \`status\` = 'reserved' AND \`settled_amount\` IS NULL`,
      [
        input.occurredAtMs,
        input.reservationInternalId,
        input.reservationRef,
        input.reservationVersion
      ]
    )
    if (result.affectedRows !== one) {
      throw new AiQuotaSettlementPersistenceError('WRITE_CONFLICT', '供应商结果未知状态更新冲突')
    }
  }

  return { lockReservation, markProviderResultUnknown }
}
