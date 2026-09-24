import type { UserRef } from '../../contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { planAiQuotaSettlement } from '../domain/plan-ai-quota-settlement.js'
import type { MysqlAiQuotaReservationRepository } from '../repository/mysql-ai-quota-reservation-repository.js'
import type {
  LockedAiQuotaSettlementReservation,
  MysqlAiQuotaSettlementRepository
} from '../repository/mysql-ai-quota-settlement-repository.js'
import { AiQuotaSettlementPersistenceError } from '../repository/mysql-ai-quota-settlement-repository.js'
import {
  reconcileAiQuotaSettlementCommitResult,
  type AiQuotaSettlementCommitUnknownReadOnlyRepository
} from './ai-quota-commit-unknown-reconciliation.js'
import { bindAiQuotaSettlementAllocations } from './bind-ai-quota-settlement-allocations.js'

const zero = Number('0')

/** 待对账最终裁决命令共有的可信字段。 */
type ResolvePendingAiQuotaCommandBase = {
  /** 已由身份域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 要裁决的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 最终供应商账单证明的实际成本微元；未调用时固定为零。 */
  readonly actualCostMicros: number
  /** 最终且脱敏的供应商账单或未调用证据引用。 */
  readonly finalEvidenceRef: string
  /** 最终由平台承担的成本微元；确认未调用时固定为零。 */
  readonly platformAbsorbedCostMicros: number
  /** 服务端可信业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 最终证据确认调用已发生，并给出不超过原预占的用户结算额。 */
export type SettlePendingAiQuotaCommand = ResolvePendingAiQuotaCommandBase & {
  /** 固定为按最终证据结算。 */
  readonly resolution: 'settle_final_evidence'
  /** 最终由用户承担的正整数额度；不得超过锁定后的原预占。 */
  readonly settledAmount: number
}

/** 最终证据确认供应商调用未发生，可以全量释放原预占。 */
export type ReleasePendingAiQuotaCommand = ResolvePendingAiQuotaCommandBase & {
  /** 固定为确认未调用后释放。 */
  readonly resolution: 'release_no_call'
}

/** 最终供应商证据对待对账预占作出的封闭裁决命令。 */
export type ResolvePendingAiQuotaCommand =
  | SettlePendingAiQuotaCommand
  | ReleasePendingAiQuotaCommand

/** 首次完成待对账最终裁决后的结果。 */
export type ResolvedPendingAiQuotaResult = {
  /** 最终裁决为结算或全量释放。 */
  readonly kind: 'settled' | 'released'
  /** 已完成裁决的额度预占公开引用。 */
  readonly reservationRef: string
  /** 最终由用户额度承担的额度。 */
  readonly settledAmount: number
  /** 最终退回用户可用余额的额度。 */
  readonly releasedAmount: number
  /** 最终仍由平台承担的成本微元。 */
  readonly platformAbsorbedCostMicros: number
}

/** 提交结果未知后由新连接证明既有终态的结果。 */
export type ReplayedPendingAiQuotaResolutionResult = {
  /** 固定为重放，表示没有再次执行任何额度写入。 */
  readonly kind: 'replayed'
  /** 已存在终态的额度预占公开引用。 */
  readonly reservationRef: string
  /** 已存在的最终生命周期状态。 */
  readonly status: 'settled' | 'released' | 'pending_reconciliation'
  /** 已存在的用户结算额度；仍待对账时为空。 */
  readonly settledAmount: number | null
}

/** 待对账最终裁决用例的封闭结果。 */
export type ResolvePendingAiQuotaResult =
  | ResolvedPendingAiQuotaResult
  | ReplayedPendingAiQuotaResolutionResult

/** 待对账最终裁决所需的事务、Repository 和引用生成端口。 */
export type ResolvePendingAiQuotaDependencies<TTransaction extends TransactionExecutionContext> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 锁定统一用户额度账户。 */
  readonly reservationRepository: MysqlAiQuotaReservationRepository<TTransaction>
  /** 锁定并原子完成待对账预占、分摊、批次和账本。 */
  readonly settlementRepository: MysqlAiQuotaSettlementRepository<TTransaction>
  /** 为最终结算或释放生成高熵不可变账本引用。 */
  readonly createLedgerRef: (entryType: 'settle' | 'release', grantRef: string) => string
  /** COMMIT 未知时使用新连接只读证明已提交终态。 */
  readonly commitUnknownReadOnlyRepository: AiQuotaSettlementCommitUnknownReadOnlyRepository
}

/** 校验最终裁决内部命令不会伪造用户扣费或平台差额。 */
function verifyResolutionCommand(command: ResolvePendingAiQuotaCommand): void {
  const commonValid =
    Number.isSafeInteger(command.actualCostMicros) &&
    command.actualCostMicros >= zero &&
    Number.isSafeInteger(command.platformAbsorbedCostMicros) &&
    command.platformAbsorbedCostMicros >= zero &&
    Number.isSafeInteger(command.occurredAtMs) &&
    command.occurredAtMs >= zero
  const resolutionValid =
    (command.resolution === 'settle_final_evidence' &&
      Number.isSafeInteger(command.settledAmount) &&
      command.settledAmount > zero &&
      command.actualCostMicros > zero) ||
    (command.resolution === 'release_no_call' &&
      command.actualCostMicros === zero &&
      command.platformAbsorbedCostMicros === zero)
  if (!commonValid || !resolutionValid) {
    throw new AiQuotaSettlementPersistenceError(
      'INTERNAL_DATA_INVALID',
      '额度待对账最终裁决输入不合法'
    )
  }
}

/** 仅精确匹配已完成的最终证据才可重放；pending 仍未裁决，不得当作成功终态。 */
function isTerminalReplay(
  reservation: LockedAiQuotaSettlementReservation,
  command: ResolvePendingAiQuotaCommand
): boolean {
  if (command.resolution === 'release_no_call') {
    return (
      reservation.status === 'released' &&
      reservation.settledAmount === zero &&
      reservation.actualCostMicros === zero &&
      reservation.usageEvidenceRef === command.finalEvidenceRef &&
      reservation.platformAbsorbedCostMicros === zero
    )
  }
  return (
    reservation.status === 'settled' &&
    reservation.settledAmount === command.settledAmount &&
    reservation.actualCostMicros === command.actualCostMicros &&
    reservation.usageEvidenceRef === command.finalEvidenceRef &&
    reservation.platformAbsorbedCostMicros === command.platformAbsorbedCostMicros
  )
}

/** 创建待对账额度的最终证据裁决用例。 */
export function createResolvePendingAiQuotaUseCase<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: ResolvePendingAiQuotaDependencies<TTransaction>
): (command: ResolvePendingAiQuotaCommand) => Promise<ResolvePendingAiQuotaResult> {
  return async command => {
    verifyResolutionCommand(command)
    let attemptedSettlementAmount: number | null = null
    try {
      return await runDatabaseTransaction(dependencies.driver, async transaction => {
        const account = await dependencies.reservationRepository.lockAccount(
          transaction,
          command.userRef
        )
        const reservation = await dependencies.settlementRepository.lockReservation(transaction, {
          userInternalId: account.userInternalId,
          reservationRef: command.reservationRef
        })
        if (reservation.status !== 'pending_reconciliation') {
          if (reservation.status !== 'settled' && reservation.status !== 'released') {
            throw new AiQuotaSettlementPersistenceError(
              'SETTLEMENT_CONFLICT',
              '额度预占不处于待对账状态'
            )
          }
          if (!isTerminalReplay(reservation, command)) {
            throw new AiQuotaSettlementPersistenceError(
              'SETTLEMENT_CONFLICT',
              '额度预占终态证据冲突'
            )
          }
          return {
            kind: 'replayed',
            reservationRef: reservation.reservationRef,
            status: reservation.status,
            settledAmount: reservation.settledAmount
          }
        }
        const allocations = await dependencies.settlementRepository.lockAllocations(transaction, {
          userInternalId: account.userInternalId,
          reservationInternalId: reservation.reservationInternalId,
          estimatedAmount: reservation.estimatedAmount
        })
        const requestedSettlementAmount =
          command.resolution === 'settle_final_evidence' ? command.settledAmount : zero
        if (requestedSettlementAmount > reservation.estimatedAmount) {
          throw new AiQuotaSettlementPersistenceError(
            'INTERNAL_DATA_INVALID',
            '最终证据结算额度超过原预占上限'
          )
        }
        attemptedSettlementAmount = requestedSettlementAmount
        const plan = planAiQuotaSettlement({
          estimatedAmount: reservation.estimatedAmount,
          settledAmount: requestedSettlementAmount,
          allocations: allocations.map(allocation => ({
            grantRef: allocation.grantRef,
            remainingAmount: allocation.remainingAmount
          }))
        })
        if (plan.kind === 'pending_reconciliation') {
          throw new AiQuotaSettlementPersistenceError(
            'INTERNAL_DATA_INVALID',
            '额度待对账最终裁决产生了非法计划'
          )
        }
        await dependencies.settlementRepository.applySettlement(transaction, {
          userInternalId: account.userInternalId,
          accountInternalId: account.accountInternalId,
          accountVersion: account.accountVersion,
          reservationInternalId: reservation.reservationInternalId,
          reservationRef: reservation.reservationRef,
          reservationVersion: reservation.reservationVersion,
          expectedReservationStatus: 'pending_reconciliation',
          estimatedAmount: reservation.estimatedAmount,
          settledAmount: plan.settledAmount,
          releasedAmount: plan.releasedAmount,
          actualCostMicros: command.actualCostMicros,
          usageEvidenceRef: command.finalEvidenceRef,
          platformAbsorbedCostMicros: command.platformAbsorbedCostMicros,
          occurredAtMs: command.occurredAtMs,
          allocations: bindAiQuotaSettlementAllocations(
            allocations,
            plan.allocations,
            dependencies.createLedgerRef
          )
        })
        return {
          kind: plan.kind,
          reservationRef: reservation.reservationRef,
          settledAmount: plan.settledAmount,
          releasedAmount: plan.releasedAmount,
          platformAbsorbedCostMicros: command.platformAbsorbedCostMicros
        }
      })
    } catch (error: unknown) {
      if (!(error instanceof DatabaseCommitResultUnknownError)) {
        throw error
      }
      if (attemptedSettlementAmount === null) {
        throw new AiQuotaSettlementPersistenceError(
          'COMMIT_RESULT_UNKNOWN',
          '额度待对账最终裁决未进入可对账提交阶段'
        )
      }
      const reconciliation = await reconcileAiQuotaSettlementCommitResult(
        dependencies.commitUnknownReadOnlyRepository,
        {
          userRef: command.userRef,
          reservationRef: command.reservationRef,
          settledAmount: attemptedSettlementAmount,
          actualCostMicros: command.actualCostMicros,
          usageEvidenceRef: command.finalEvidenceRef,
          platformAbsorbedCostMicros: command.platformAbsorbedCostMicros
        }
      )
      if (reconciliation.kind === 'replay') {
        return {
          kind: 'replayed',
          reservationRef: command.reservationRef,
          status: reconciliation.status,
          settledAmount: reconciliation.settledAmount
        }
      }
      throw new AiQuotaSettlementPersistenceError(
        'COMMIT_RESULT_UNKNOWN',
        '额度待对账最终裁决结果暂时无法确认'
      )
    }
  }
}
