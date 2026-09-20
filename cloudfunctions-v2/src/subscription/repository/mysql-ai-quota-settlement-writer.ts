import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  AiQuotaSettlementSqlExecutor,
  ApplyAiQuotaSettlementInput,
  MarkPendingAiQuotaReconciliationInput,
  PersistAiQuotaSettlementAllocationInput
} from './ai-quota-settlement-repository-types.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'
import { insertAiQuotaSettlementLedger } from './mysql-ai-quota-settlement-ledger-writer.js'

const zero = Number('0')
const one = Number('1')

/** 任一状态写入必须恰好命中一行，否则由调用方回滚整个事务。 */
function assertSingleWrite(affectedRows: number, message: string): void {
  if (affectedRows !== one) {
    throw new AiQuotaSettlementPersistenceError('WRITE_CONFLICT', message)
  }
}

/** 在同一事务写入一条分摊的批次、allocation 与不可变账本终态。 */
async function applySettlementAllocation<TTransaction extends TransactionExecutionContext>(
  executor: AiQuotaSettlementSqlExecutor<TTransaction>,
  transaction: TTransaction,
  input: ApplyAiQuotaSettlementInput,
  allocation: PersistAiQuotaSettlementAllocationInput
): Promise<string> {
  assertSingleWrite(
    (
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_grants\`
         SET \`status\` = CASE
               WHEN \`consumed_amount\` + ? = 0 AND \`reserved_amount\` - ? = 0 THEN 'active'
               WHEN \`available_amount\` + ? = 0 AND \`reserved_amount\` - ? = 0 THEN 'used'
               ELSE 'partially_used'
             END,
             \`available_amount\` = \`available_amount\` + ?,
             \`reserved_amount\` = \`reserved_amount\` - ?,
             \`consumed_amount\` = \`consumed_amount\` + ?,
             \`version\` = \`version\` + 1,
             \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`grant_ref\` = ?
           AND \`version\` = ? AND \`status\` IN ('active', 'partially_used')
           AND \`reserved_amount\` >= ?`,
        [
          allocation.settledAmount,
          allocation.remainingAmount,
          allocation.releasedAmount,
          allocation.remainingAmount,
          allocation.releasedAmount,
          allocation.remainingAmount,
          allocation.settledAmount,
          input.occurredAtMs,
          allocation.grantInternalId,
          input.userInternalId,
          allocation.grantRef,
          allocation.grantVersion,
          allocation.remainingAmount
        ]
      )
    ).affectedRows,
    '额度批次结算并发冲突'
  )
  assertSingleWrite(
    (
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_reservation_allocations\`
         SET \`remaining_amount\` = 0,
             \`settled_amount\` = \`settled_amount\` + ?,
             \`released_amount\` = \`released_amount\` + ?,
             \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`reservation_internal_id\` = ? AND \`grant_internal_id\` = ?
           AND \`remaining_amount\` = ?`,
        [
          allocation.settledAmount,
          allocation.releasedAmount,
          input.occurredAtMs,
          allocation.allocationInternalId,
          input.reservationInternalId,
          allocation.grantInternalId,
          allocation.remainingAmount
        ]
      )
    ).affectedRows,
    '额度预占分摊结算冲突'
  )

  let lastLedgerRef = ''
  if (allocation.settledAmount > zero && allocation.settleLedgerRef !== undefined) {
    await insertAiQuotaSettlementLedger(
      executor,
      transaction,
      input,
      allocation,
      'settle',
      allocation.settledAmount,
      allocation.settleLedgerRef
    )
    lastLedgerRef = allocation.settleLedgerRef
  }
  if (allocation.releasedAmount > zero && allocation.releaseLedgerRef !== undefined) {
    await insertAiQuotaSettlementLedger(
      executor,
      transaction,
      input,
      allocation,
      'release',
      allocation.releasedAmount,
      allocation.releaseLedgerRef
    )
    lastLedgerRef = allocation.releaseLedgerRef
  }
  return lastLedgerRef
}

/** 原子应用完整结算或释放计划。 */
export async function applyAiQuotaSettlement<TTransaction extends TransactionExecutionContext>(
  executor: AiQuotaSettlementSqlExecutor<TTransaction>,
  transaction: TTransaction,
  input: ApplyAiQuotaSettlementInput
): Promise<void> {
  let lastLedgerRef = ''
  for (const allocation of input.allocations) {
    const allocationLastLedgerRef = await applySettlementAllocation(
      executor,
      transaction,
      input,
      allocation
    )
    if (allocationLastLedgerRef !== '') {
      lastLedgerRef = allocationLastLedgerRef
    }
  }
  if (lastLedgerRef === '') {
    throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度结算缺少不可变账本')
  }

  assertSingleWrite(
    (
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_reservations\`
         SET \`settled_amount\` = ?, \`actual_cost_micros\` = ?, \`usage_evidence_ref\` = ?,
             \`platform_absorbed_cost_micros\` = ?,
             \`status\` = ?, \`version\` = \`version\` + 1, \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`reservation_ref\` = ?
           AND \`version\` = ? AND \`status\` = ?`,
        [
          input.settledAmount,
          input.actualCostMicros,
          input.usageEvidenceRef,
          input.platformAbsorbedCostMicros,
          input.settledAmount === zero ? 'released' : 'settled',
          input.occurredAtMs,
          input.reservationInternalId,
          input.userInternalId,
          input.reservationRef,
          input.reservationVersion,
          input.expectedReservationStatus
        ]
      )
    ).affectedRows,
    '额度预占终态更新冲突'
  )
  assertSingleWrite(
    (
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_accounts\`
         SET \`available_amount\` = \`available_amount\` + ?,
             \`reserved_amount\` = \`reserved_amount\` - ?,
             \`consumed_amount\` = \`consumed_amount\` + ?,
             \`version\` = \`version\` + 1,
             \`last_ledger_internal_id\` = (SELECT \`id\` FROM \`ai_quota_ledger\` WHERE \`ledger_ref\` = ?),
             \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`version\` = ?
           AND \`reserved_amount\` >= ?`,
        [
          input.releasedAmount,
          input.estimatedAmount,
          input.settledAmount,
          lastLedgerRef,
          input.occurredAtMs,
          input.accountInternalId,
          input.userInternalId,
          input.accountVersion,
          input.estimatedAmount
        ]
      )
    ).affectedRows,
    '额度账户结算投影冲突'
  )
}

/** 超额成本只标记待对账，保持用户预占和批次分摊不变。 */
export async function markAiQuotaPendingReconciliation<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaSettlementSqlExecutor<TTransaction>,
  transaction: TTransaction,
  input: MarkPendingAiQuotaReconciliationInput
): Promise<void> {
  assertSingleWrite(
    (
      await executor.executeWrite(
        transaction,
        `UPDATE \`ai_quota_reservations\`
         SET \`actual_cost_micros\` = ?, \`usage_evidence_ref\` = ?,
             \`platform_absorbed_cost_micros\` = ?, \`status\` = 'pending_reconciliation',
             \`reconciliation_reason\` = 'observed_cost_overage',
             \`version\` = \`version\` + 1, \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`reservation_ref\` = ?
           AND \`version\` = ? AND \`status\` = 'reserved' AND \`settled_amount\` IS NULL`,
        [
          input.actualCostMicros,
          input.usageEvidenceRef,
          input.platformAbsorbedCostMicros,
          input.occurredAtMs,
          input.reservationInternalId,
          input.userInternalId,
          input.reservationRef,
          input.reservationVersion
        ]
      )
    ).affectedRows,
    '额度预占待对账更新冲突'
  )
}
