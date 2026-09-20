import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  AiQuotaSettlementAllocationSqlRow,
  AiQuotaSettlementSqlExecutor,
  ApplyAiQuotaSettlementInput,
  LockAiQuotaSettlementAllocationsInput,
  LockAiQuotaSettlementReservationInput,
  LockedAiQuotaSettlementAllocation,
  LockedAiQuotaSettlementReservation,
  MarkPendingAiQuotaReconciliationInput,
  MysqlAiQuotaSettlementRepository
} from './ai-quota-settlement-repository-types.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'
import {
  applyAiQuotaSettlement,
  markAiQuotaPendingReconciliation
} from './mysql-ai-quota-settlement-writer.js'

const zero = Number('0')
const one = Number('1')
const internalPrimaryKeyFormat = /^[1-9][0-9]*$/u
const nonNegativeIntegerTextFormat = /^(?:0|[1-9][0-9]*)$/u
const reservationRefFormat = /^aqr_[A-Za-z0-9_-]{8,}$/u
const grantRefFormat = /^aqg_[A-Za-z0-9_-]{8,}$/u
const ledgerRefFormat = /^aql_[A-Za-z0-9_-]{8,}$/u
const evidenceRefFormat = /^[A-Za-z0-9._:/-]{8,128}$/u

/** 数据库 BIGINT 内部键必须保持正整数十进制文本。 */
function verifyInternalPrimaryKey(value: string): void {
  if (!internalPrimaryKeyFormat.test(value)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算内部主键不合法')
  }
}

/** 将数据库非负整数文本转换为 JavaScript 安全整数。 */
function resolveNonNegativeInteger(value: string, message: string): number {
  if (!nonNegativeIntegerTextFormat.test(value)) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < zero) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return parsed
}

/** 判断输入是否为 JavaScript 可安全表达的非负整数。 */
function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/** 将一条分摊 SQL 行恢复为受控内部快照。 */
function mapAllocationRow(
  row: AiQuotaSettlementAllocationSqlRow
): LockedAiQuotaSettlementAllocation {
  verifyInternalPrimaryKey(row.allocation_internal_id)
  verifyInternalPrimaryKey(row.grant_internal_id)
  const grantVersion = resolveNonNegativeInteger(row.grant_version, '额度批次版本不合法')
  const grantAvailableAmount = resolveNonNegativeInteger(
    row.grant_available_amount,
    '额度批次可用值不合法'
  )
  const grantReservedAmount = resolveNonNegativeInteger(
    row.grant_reserved_amount,
    '额度批次预占值不合法'
  )
  const grantConsumedAmount = resolveNonNegativeInteger(
    row.grant_consumed_amount,
    '额度批次消费值不合法'
  )
  const remainingAmount = resolveNonNegativeInteger(
    row.allocation_remaining_amount,
    '额度分摊剩余值不合法'
  )
  const settledAmount = resolveNonNegativeInteger(
    row.allocation_settled_amount,
    '额度分摊结算值不合法'
  )
  const releasedAmount = resolveNonNegativeInteger(
    row.allocation_released_amount,
    '额度分摊释放值不合法'
  )
  if (
    !grantRefFormat.test(row.grant_ref) ||
    (row.grant_status !== 'active' && row.grant_status !== 'partially_used') ||
    grantVersion < one ||
    remainingAmount <= zero ||
    settledAmount !== zero ||
    releasedAmount !== zero ||
    grantReservedAmount < remainingAmount
  ) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算分摊读回不合法')
  }
  return {
    allocationInternalId: row.allocation_internal_id,
    grantInternalId: row.grant_internal_id,
    grantRef: row.grant_ref,
    grantVersion,
    grantStatus: row.grant_status,
    grantAvailableAmount,
    grantReservedAmount,
    grantConsumedAmount,
    remainingAmount,
    settledAmount,
    releasedAmount
  }
}

/** 验证结算或释放写入的全部金额、引用和分摊守恒。 */
function verifyApplyInput(input: ApplyAiQuotaSettlementInput): void {
  verifyInternalPrimaryKey(input.userInternalId)
  verifyInternalPrimaryKey(input.accountInternalId)
  verifyInternalPrimaryKey(input.reservationInternalId)
  if (
    !reservationRefFormat.test(input.reservationRef) ||
    !Number.isSafeInteger(input.accountVersion) ||
    input.accountVersion < one ||
    !Number.isSafeInteger(input.reservationVersion) ||
    input.reservationVersion < one ||
    !Number.isSafeInteger(input.estimatedAmount) ||
    input.estimatedAmount <= zero ||
    !isSafeNonNegativeInteger(input.settledAmount) ||
    !isSafeNonNegativeInteger(input.releasedAmount) ||
    input.settledAmount + input.releasedAmount !== input.estimatedAmount ||
    !isSafeNonNegativeInteger(input.actualCostMicros) ||
    !evidenceRefFormat.test(input.usageEvidenceRef) ||
    !isSafeNonNegativeInteger(input.occurredAtMs) ||
    input.allocations.length === zero
  ) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算写入输入不合法')
  }

  let remainingTotal = zero
  let settledTotal = zero
  let releasedTotal = zero
  const grantRefs = new Set<string>()
  const ledgerRefs = new Set<string>()
  for (const allocation of input.allocations) {
    verifyInternalPrimaryKey(allocation.allocationInternalId)
    verifyInternalPrimaryKey(allocation.grantInternalId)
    if (
      !grantRefFormat.test(allocation.grantRef) ||
      !Number.isSafeInteger(allocation.grantVersion) ||
      allocation.grantVersion < one ||
      !Number.isSafeInteger(allocation.remainingAmount) ||
      allocation.remainingAmount <= zero ||
      !isSafeNonNegativeInteger(allocation.settledAmount) ||
      !isSafeNonNegativeInteger(allocation.releasedAmount) ||
      allocation.settledAmount + allocation.releasedAmount !== allocation.remainingAmount ||
      (allocation.settledAmount > zero &&
        (allocation.settleLedgerRef === undefined ||
          !ledgerRefFormat.test(allocation.settleLedgerRef))) ||
      (allocation.settledAmount === zero && allocation.settleLedgerRef !== undefined) ||
      (allocation.releasedAmount > zero &&
        (allocation.releaseLedgerRef === undefined ||
          !ledgerRefFormat.test(allocation.releaseLedgerRef))) ||
      (allocation.releasedAmount === zero && allocation.releaseLedgerRef !== undefined) ||
      grantRefs.has(allocation.grantRef)
    ) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算分摊输入不合法')
    }
    grantRefs.add(allocation.grantRef)
    for (const ledgerRef of [allocation.settleLedgerRef, allocation.releaseLedgerRef]) {
      if (ledgerRef !== undefined) {
        if (ledgerRefs.has(ledgerRef)) {
          throw new AiQuotaSettlementPersistenceError(
            'INTERNAL_DATA_INVALID',
            '额度结算账本引用重复'
          )
        }
        ledgerRefs.add(ledgerRef)
      }
    }
    remainingTotal += allocation.remainingAmount
    settledTotal += allocation.settledAmount
    releasedTotal += allocation.releasedAmount
  }
  if (
    remainingTotal !== input.estimatedAmount ||
    settledTotal !== input.settledAmount ||
    releasedTotal !== input.releasedAmount
  ) {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算分摊不守恒')
  }
}

/** 创建只访问 reservation、allocation、grant、ledger 和账户投影的结算 Repository。 */
export function createMysqlAiQuotaSettlementRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaSettlementSqlExecutor<TTransaction>
): MysqlAiQuotaSettlementRepository<TTransaction> {
  const lockReservation = async (
    transaction: TTransaction,
    input: LockAiQuotaSettlementReservationInput
  ): Promise<LockedAiQuotaSettlementReservation> => {
    verifyInternalPrimaryKey(input.userInternalId)
    if (!reservationRefFormat.test(input.reservationRef)) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占公开引用不合法')
    }
    const rows = await executor.executeQuery(
      transaction,
      `SELECT 'settlement_reservation' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`reservation_internal_id\`,
              \`reservation_ref\`, CAST(\`estimated_amount\` AS CHAR) AS \`estimated_amount\`,
              CAST(\`settled_amount\` AS CHAR) AS \`settled_amount\`,
              CAST(\`actual_cost_micros\` AS CHAR) AS \`actual_cost_micros\`, \`usage_evidence_ref\`,
              CAST(\`platform_absorbed_cost_micros\` AS CHAR) AS \`platform_absorbed_cost_micros\`,
              \`status\` AS \`reservation_status\`, CAST(\`version\` AS CHAR) AS \`reservation_version\`
       FROM \`ai_quota_reservations\`
       WHERE \`id\` IS NOT NULL AND \`user_internal_id\` = ? AND \`reservation_ref\` = ?
       FOR UPDATE`,
      [input.userInternalId, input.reservationRef]
    )
    const row = rows[zero]
    if (rows.length !== one || row?.kind !== 'settlement_reservation') {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占结算读回不完整')
    }
    verifyInternalPrimaryKey(row.reservation_internal_id)
    const estimatedAmount = resolveNonNegativeInteger(row.estimated_amount, '额度预占值不合法')
    const reservationVersion = resolveNonNegativeInteger(
      row.reservation_version,
      '额度预占版本不合法'
    )
    const settledAmount =
      row.settled_amount === null
        ? null
        : resolveNonNegativeInteger(row.settled_amount, '额度结算值不合法')
    const actualCostMicros =
      row.actual_cost_micros === null
        ? null
        : resolveNonNegativeInteger(row.actual_cost_micros, '额度实际成本不合法')
    const platformAbsorbedCostMicros = resolveNonNegativeInteger(
      row.platform_absorbed_cost_micros,
      '平台承担成本不合法'
    )
    if (estimatedAmount <= zero || reservationVersion < one) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占结算读回不合法')
    }
    return {
      reservationInternalId: row.reservation_internal_id,
      reservationRef: row.reservation_ref,
      estimatedAmount,
      settledAmount,
      actualCostMicros,
      usageEvidenceRef: row.usage_evidence_ref,
      platformAbsorbedCostMicros,
      status: row.reservation_status,
      reservationVersion
    }
  }

  const lockAllocations = async (
    transaction: TTransaction,
    input: LockAiQuotaSettlementAllocationsInput
  ): Promise<readonly LockedAiQuotaSettlementAllocation[]> => {
    verifyInternalPrimaryKey(input.userInternalId)
    verifyInternalPrimaryKey(input.reservationInternalId)
    if (!Number.isSafeInteger(input.estimatedAmount) || input.estimatedAmount <= zero) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度结算分摊查询条件不合法'
      )
    }
    const rows = await executor.executeQuery(
      transaction,
      `SELECT 'settlement_allocation' AS \`kind\`,
              CAST(\`a\`.\`id\` AS CHAR) AS \`allocation_internal_id\`,
              CAST(\`g\`.\`id\` AS CHAR) AS \`grant_internal_id\`, \`g\`.\`grant_ref\`,
              CAST(\`g\`.\`version\` AS CHAR) AS \`grant_version\`, \`g\`.\`status\` AS \`grant_status\`,
              CAST(\`g\`.\`available_amount\` AS CHAR) AS \`grant_available_amount\`,
              CAST(\`g\`.\`reserved_amount\` AS CHAR) AS \`grant_reserved_amount\`,
              CAST(\`g\`.\`consumed_amount\` AS CHAR) AS \`grant_consumed_amount\`,
              CAST(\`a\`.\`remaining_amount\` AS CHAR) AS \`allocation_remaining_amount\`,
              CAST(\`a\`.\`settled_amount\` AS CHAR) AS \`allocation_settled_amount\`,
              CAST(\`a\`.\`released_amount\` AS CHAR) AS \`allocation_released_amount\`
       FROM \`ai_quota_reservation_allocations\` AS \`a\`
       JOIN \`ai_quota_grants\` AS \`g\` ON \`g\`.\`id\` = \`a\`.\`grant_internal_id\`
       WHERE \`a\`.\`reservation_internal_id\` = ? AND \`g\`.\`user_internal_id\` = ?
       ORDER BY \`g\`.\`expires_at_ms\`, \`g\`.\`granted_at_ms\`, \`g\`.\`grant_ref\`
       FOR UPDATE`,
      [input.reservationInternalId, input.userInternalId]
    )
    const allocations: LockedAiQuotaSettlementAllocation[] = []
    const seenGrantRefs = new Set<string>()
    let remainingTotal = zero
    for (const row of rows) {
      if (row.kind !== 'settlement_allocation') {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度结算分摊查询返回未知行'
        )
      }
      const allocation = mapAllocationRow(row)
      if (seenGrantRefs.has(allocation.grantRef)) {
        throw new AiQuotaSettlementPersistenceError(
          'INTERNAL_DATA_INVALID',
          '额度结算分摊查询返回重复批次'
        )
      }
      seenGrantRefs.add(allocation.grantRef)
      remainingTotal += allocation.remainingAmount
      allocations.push(allocation)
    }
    if (allocations.length === zero || remainingTotal !== input.estimatedAmount) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算分摊不守恒')
    }
    return allocations
  }

  const applySettlement = async (
    transaction: TTransaction,
    input: ApplyAiQuotaSettlementInput
  ): Promise<void> => {
    verifyApplyInput(input)
    await applyAiQuotaSettlement(executor, transaction, input)
  }

  const markPendingReconciliation = async (
    transaction: TTransaction,
    input: MarkPendingAiQuotaReconciliationInput
  ): Promise<void> => {
    verifyInternalPrimaryKey(input.userInternalId)
    verifyInternalPrimaryKey(input.reservationInternalId)
    if (
      !reservationRefFormat.test(input.reservationRef) ||
      !Number.isSafeInteger(input.reservationVersion) ||
      input.reservationVersion < one ||
      !Number.isSafeInteger(input.actualCostMicros) ||
      input.actualCostMicros <= zero ||
      !evidenceRefFormat.test(input.usageEvidenceRef) ||
      !Number.isSafeInteger(input.platformAbsorbedCostMicros) ||
      input.platformAbsorbedCostMicros <= zero ||
      !isSafeNonNegativeInteger(input.occurredAtMs)
    ) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度待对账写入输入不合法'
      )
    }
    await markAiQuotaPendingReconciliation(executor, transaction, input)
  }

  return { lockReservation, lockAllocations, applySettlement, markPendingReconciliation }
}

export type * from './ai-quota-settlement-repository-types.js'
export { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'
