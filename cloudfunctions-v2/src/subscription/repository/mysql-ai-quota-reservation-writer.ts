import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  AiQuotaReservationSqlExecutor,
  ApplyAllocatedReservationInput
} from './ai-quota-reservation-repository-types.js'
import { assertSingleWrite } from './ai-quota-reservation-repository-validation.js'

/** 在同一事务中应用单条批次扣减、分摊和不可变账本记录。 */
export async function applyAiQuotaAllocation<TTransaction extends TransactionExecutionContext>(
  executor: AiQuotaReservationSqlExecutor<TTransaction>,
  transaction: TTransaction,
  input: ApplyAllocatedReservationInput,
  allocation: ApplyAllocatedReservationInput['allocations'][number]
): Promise<void> {
  assertSingleWrite(
    await executor.executeWrite(
      transaction,
      `UPDATE \`ai_quota_grants\`
       SET \`available_amount\` = \`available_amount\` - ?,
           \`reserved_amount\` = \`reserved_amount\` + ?,
           \`status\` = 'partially_used',
           \`version\` = \`version\` + 1, \`updated_at_ms\` = ?
       WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`grant_ref\` = ?
         AND \`version\` = ? AND \`status\` IN ('active', 'partially_used')
         AND \`available_amount\` >= ?`,
      [
        allocation.reservedAmount,
        allocation.reservedAmount,
        input.occurredAtMs,
        allocation.grantInternalId,
        input.userInternalId,
        allocation.grantRef,
        allocation.grantVersion,
        allocation.reservedAmount
      ]
    ),
    '额度批次并发更新冲突'
  )
  assertSingleWrite(
    await executor.executeWrite(
      transaction,
      `INSERT INTO \`ai_quota_reservation_allocations\`
       (\`reservation_internal_id\`, \`grant_internal_id\`, \`reserved_amount\`, \`remaining_amount\`,
        \`settled_amount\`, \`released_amount\`, \`created_at_ms\`, \`updated_at_ms\`)
       SELECT \`r\`.\`id\`, \`g\`.\`id\`, ?, ?, 0, 0, ?, ?
       FROM \`ai_quota_reservations\` AS \`r\`
       JOIN \`ai_quota_grants\` AS \`g\` ON \`g\`.\`id\` = ? AND \`g\`.\`grant_ref\` = ? AND \`g\`.\`user_internal_id\` = ?
       WHERE \`r\`.\`reservation_ref\` = ? AND \`r\`.\`user_internal_id\` = ?`,
      [
        allocation.reservedAmount,
        allocation.reservedAmount,
        input.occurredAtMs,
        input.occurredAtMs,
        allocation.grantInternalId,
        allocation.grantRef,
        input.userInternalId,
        input.reservationRef,
        input.userInternalId
      ]
    ),
    '额度预占分摊写入冲突'
  )
  assertSingleWrite(
    await executor.executeWrite(
      transaction,
      `INSERT INTO \`ai_quota_ledger\`
       (\`ledger_ref\`, \`user_internal_id\`, \`grant_internal_id\`, \`reservation_internal_id\`,
        \`entry_type\`, \`amount\`, \`operation_unique_key\`, \`original_ledger_internal_id\`,
        \`occurred_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
       SELECT ?, \`r\`.\`user_internal_id\`, \`g\`.\`id\`, \`r\`.\`id\`,
              'reserve', ?, ?, NULL, ?, ?, ?
       FROM \`ai_quota_reservations\` AS \`r\`
       JOIN \`ai_quota_grants\` AS \`g\` ON \`g\`.\`id\` = ? AND \`g\`.\`grant_ref\` = ? AND \`g\`.\`user_internal_id\` = ?
       WHERE \`r\`.\`reservation_ref\` = ? AND \`r\`.\`user_internal_id\` = ?`,
      [
        allocation.ledgerRef,
        allocation.reservedAmount,
        `reserve:${input.reservationRef}:${allocation.grantRef}`,
        input.occurredAtMs,
        input.occurredAtMs,
        input.occurredAtMs,
        allocation.grantInternalId,
        allocation.grantRef,
        input.userInternalId,
        input.reservationRef,
        input.userInternalId
      ]
    ),
    '额度预占账本写入冲突'
  )
}
