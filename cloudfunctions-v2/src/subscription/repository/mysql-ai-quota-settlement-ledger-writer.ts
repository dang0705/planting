import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  AiQuotaSettlementSqlExecutor,
  ApplyAiQuotaSettlementInput,
  PersistAiQuotaSettlementAllocationInput
} from './ai-quota-settlement-repository-types.js'
import { AiQuotaSettlementPersistenceError } from './ai-quota-settlement-repository-types.js'

const one = Number('1')

/** 写入一条与指定预占和批次关联的不可变结算或释放账本。 */
export async function insertAiQuotaSettlementLedger<
  TTransaction extends TransactionExecutionContext
>(
  executor: AiQuotaSettlementSqlExecutor<TTransaction>,
  transaction: TTransaction,
  input: ApplyAiQuotaSettlementInput,
  allocation: PersistAiQuotaSettlementAllocationInput,
  entryType: 'settle' | 'release',
  amount: number,
  ledgerRef: string
): Promise<void> {
  const result = await executor.executeWrite(
    transaction,
    `INSERT INTO \`ai_quota_ledger\`
     (\`ledger_ref\`, \`user_internal_id\`, \`grant_internal_id\`, \`reservation_internal_id\`,
      \`entry_type\`, \`amount\`, \`operation_unique_key\`, \`original_ledger_internal_id\`,
      \`occurred_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      ledgerRef,
      input.userInternalId,
      allocation.grantInternalId,
      input.reservationInternalId,
      entryType,
      amount,
      `${entryType}:${input.reservationRef}:${allocation.grantRef}`,
      input.occurredAtMs,
      input.occurredAtMs,
      input.occurredAtMs
    ]
  )
  if (result.affectedRows !== one) {
    throw new AiQuotaSettlementPersistenceError('WRITE_CONFLICT', '额度结算账本写入冲突')
  }
}
