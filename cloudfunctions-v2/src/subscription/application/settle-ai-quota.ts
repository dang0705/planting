import type { UserRef } from '../../contracts/types.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { planAiQuotaSettlement } from '../domain/plan-ai-quota-settlement.js'
import type { MysqlAiQuotaReservationRepository } from '../repository/mysql-ai-quota-reservation-repository.js'
import type {
  LockedAiQuotaSettlementReservation,
  MysqlAiQuotaSettlementRepository,
  PersistAiQuotaSettlementAllocationInput
} from '../repository/mysql-ai-quota-settlement-repository.js'
import { AiQuotaSettlementPersistenceError } from '../repository/mysql-ai-quota-settlement-repository.js'

const zero = Number('0')

/** 一次模型调用完成后发起额度结算的可信内部命令。 */
export type SettleAiQuotaCommand = {
  /** 已由身份域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 要结算的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 实际成本按不可变策略折算出的结算额度。 */
  readonly settledAmount: number
  /** 供应商实际可审计成本，人民币微元。 */
  readonly actualCostMicros: number
  /** 脱敏供应商用量证据引用。 */
  readonly usageEvidenceRef: string
  /** 超出原预占时暂由平台承担的成本微元；普通结算固定为零。 */
  readonly platformAbsorbedCostMicros: number
  /** 服务端可信业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 首次完成确定性结算或释放后的结果。 */
export type CompletedAiQuotaSettlementResult = {
  /** 结算终态类别：`settled` 表示有实际消费，`released` 表示全部释放。 */
  readonly kind: 'settled' | 'released'
  /** 已进入终态的额度预占公开引用。 */
  readonly reservationRef: string
  /** 本次转为已消费的额度。 */
  readonly settledAmount: number
  /** 本次退回可用余额的额度。 */
  readonly releasedAmount: number
}

/** 超额成本进入待对账后的结果。 */
export type PendingAiQuotaSettlementResult = {
  /** 固定为待对账，表示没有继续扣减用户额度。 */
  readonly kind: 'pending_reconciliation'
  /** 已标记待对账的额度预占公开引用。 */
  readonly reservationRef: string
  /** 实际成本策略要求的结算额度。 */
  readonly requestedSettlementAmount: number
  /** 超过原预占的额度缺口。 */
  readonly quotaShortfallAmount: number
}

/** 相同终态证据安全重放后的结果。 */
export type ReplayedAiQuotaSettlementResult = {
  /** 固定为重放，表示本事务没有新增结算写入。 */
  readonly kind: 'replayed'
  /** 已存在终态的额度预占公开引用。 */
  readonly reservationRef: string
  /** 已存在的生命周期终态。 */
  readonly status: 'settled' | 'released' | 'pending_reconciliation'
  /** 已存在的结算额度；待对账时为空。 */
  readonly settledAmount: number | null
}

/** AI 额度结算应用用例的封闭结果。 */
export type SettleAiQuotaResult =
  | CompletedAiQuotaSettlementResult
  | PendingAiQuotaSettlementResult
  | ReplayedAiQuotaSettlementResult

/** 结算应用用例使用的事务、Repository 和账本引用生成端口。 */
export type SettleAiQuotaDependencies<TTransaction extends TransactionExecutionContext> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 复用额度账户串行锁。 */
  readonly reservationRepository: MysqlAiQuotaReservationRepository<TTransaction>
  /** 负责预占、分摊、批次、账本和账户投影的结算持久化。 */
  readonly settlementRepository: MysqlAiQuotaSettlementRepository<TTransaction>
  /** 为一次结算或释放账本生成高熵公开引用。 */
  readonly createLedgerRef: (entryType: 'settle' | 'release', grantRef: string) => string
}

/** 判断已存在终态是否与本次供应商证据完全一致。 */
function isTerminalReplay(
  reservation: LockedAiQuotaSettlementReservation,
  command: SettleAiQuotaCommand
): boolean {
  if (reservation.status === 'settled' || reservation.status === 'released') {
    return (
      reservation.settledAmount === command.settledAmount &&
      reservation.actualCostMicros === command.actualCostMicros &&
      reservation.usageEvidenceRef === command.usageEvidenceRef &&
      reservation.platformAbsorbedCostMicros === command.platformAbsorbedCostMicros
    )
  }
  if (reservation.status === 'pending_reconciliation') {
    return (
      reservation.settledAmount === null &&
      reservation.actualCostMicros === command.actualCostMicros &&
      reservation.usageEvidenceRef === command.usageEvidenceRef &&
      reservation.platformAbsorbedCostMicros === command.platformAbsorbedCostMicros
    )
  }
  return false
}

/** 把纯领域终态重新绑定到已锁定的内部键、版本和账本引用。 */
function bindSettlementAllocations(
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

/** 创建 AI 额度结算应用用例。 */
export function createSettleAiQuotaUseCase<TTransaction extends TransactionExecutionContext>(
  dependencies: SettleAiQuotaDependencies<TTransaction>
): (command: SettleAiQuotaCommand) => Promise<SettleAiQuotaResult> {
  return command =>
    runDatabaseTransaction(dependencies.driver, async transaction => {
      const account = await dependencies.reservationRepository.lockAccount(
        transaction,
        command.userRef
      )
      const reservation = await dependencies.settlementRepository.lockReservation(transaction, {
        userInternalId: account.userInternalId,
        reservationRef: command.reservationRef
      })
      if (reservation.status !== 'reserved') {
        if (!isTerminalReplay(reservation, command)) {
          throw new AiQuotaSettlementPersistenceError('SETTLEMENT_CONFLICT', '额度预占终态证据冲突')
        }
        return {
          kind: 'replayed',
          reservationRef: reservation.reservationRef,
          status: reservation.status,
          settledAmount: reservation.settledAmount
        }
      }

      const lockedAllocations = await dependencies.settlementRepository.lockAllocations(
        transaction,
        {
          userInternalId: account.userInternalId,
          reservationInternalId: reservation.reservationInternalId,
          estimatedAmount: reservation.estimatedAmount
        }
      )
      const plan = planAiQuotaSettlement({
        estimatedAmount: reservation.estimatedAmount,
        settledAmount: command.settledAmount,
        allocations: lockedAllocations.map(allocation => ({
          grantRef: allocation.grantRef,
          remainingAmount: allocation.remainingAmount
        }))
      })
      if (plan.kind === 'pending_reconciliation') {
        await dependencies.settlementRepository.markPendingReconciliation(transaction, {
          userInternalId: account.userInternalId,
          reservationInternalId: reservation.reservationInternalId,
          reservationRef: reservation.reservationRef,
          reservationVersion: reservation.reservationVersion,
          actualCostMicros: command.actualCostMicros,
          usageEvidenceRef: command.usageEvidenceRef,
          platformAbsorbedCostMicros: command.platformAbsorbedCostMicros,
          occurredAtMs: command.occurredAtMs
        })
        return {
          kind: plan.kind,
          reservationRef: reservation.reservationRef,
          requestedSettlementAmount: plan.requestedSettlementAmount,
          quotaShortfallAmount: plan.quotaShortfallAmount
        }
      }

      await dependencies.settlementRepository.applySettlement(transaction, {
        userInternalId: account.userInternalId,
        accountInternalId: account.accountInternalId,
        accountVersion: account.accountVersion,
        reservationInternalId: reservation.reservationInternalId,
        reservationRef: reservation.reservationRef,
        reservationVersion: reservation.reservationVersion,
        estimatedAmount: reservation.estimatedAmount,
        settledAmount: plan.settledAmount,
        releasedAmount: plan.releasedAmount,
        actualCostMicros: command.actualCostMicros,
        usageEvidenceRef: command.usageEvidenceRef,
        occurredAtMs: command.occurredAtMs,
        allocations: bindSettlementAllocations(
          lockedAllocations,
          plan.allocations,
          dependencies.createLedgerRef
        )
      })
      return {
        kind: plan.kind,
        reservationRef: reservation.reservationRef,
        settledAmount: plan.settledAmount,
        releasedAmount: plan.releasedAmount
      }
    })
}
