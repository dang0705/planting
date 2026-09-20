import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type {
  MysqlAiQuotaSettlementRepository,
  PersistAiQuotaSettlementAllocationInput
} from '../repository/mysql-ai-quota-settlement-repository.js'
import { AiQuotaSettlementPersistenceError } from '../repository/mysql-ai-quota-settlement-repository.js'

const zero = Number('0')

/** 把纯领域结算计划绑定到已锁定内部键、版本与不可变账本引用。 */
export function bindAiQuotaSettlementAllocations(
  lockedAllocations: Awaited<
    ReturnType<MysqlAiQuotaSettlementRepository<TransactionExecutionContext>['lockAllocations']>
  >,
  plannedAllocations: readonly {
    /** 被结算或释放批次的公开引用。 */
    readonly grantRef: string
    /** 本次结算额度。 */
    readonly settledAmount: number
    /** 本次释放额度。 */
    readonly releasedAmount: number
  }[],
  createLedgerRef: (entryType: 'settle' | 'release', grantRef: string) => string
): readonly PersistAiQuotaSettlementAllocationInput[] {
  return plannedAllocations.map(planned => {
    const locked = lockedAllocations.find(candidate => candidate.grantRef === planned.grantRef)
    if (locked === undefined) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度结算计划无法绑定已锁定分摊'
      )
    }
    return {
      allocationInternalId: locked.allocationInternalId,
      grantInternalId: locked.grantInternalId,
      grantRef: locked.grantRef,
      grantVersion: locked.grantVersion,
      remainingAmount: locked.remainingAmount,
      settledAmount: planned.settledAmount,
      releasedAmount: planned.releasedAmount,
      ...(planned.settledAmount > zero
        ? { settleLedgerRef: createLedgerRef('settle', locked.grantRef) }
        : {}),
      ...(planned.releasedAmount > zero
        ? { releaseLedgerRef: createLedgerRef('release', locked.grantRef) }
        : {})
    }
  })
}
