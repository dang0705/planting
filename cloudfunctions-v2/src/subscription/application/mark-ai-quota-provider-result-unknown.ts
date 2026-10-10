/**
 * 标记 AI 额度预占“供应商结果未知”应用用例。
 * 合同：docs/backend-v2/contracts/care-points-and-ai-quota.md——无法确认供应商结果（例如模型调用超时、连接中断，
 * 不知道对方是否已经计费）时，预占进入 `pending_reconciliation`，内部原因 `provider_result_unknown`；
 * 预占额度在对账前保持锁定，既不扣费也不退回（好比快递“状态未知”时先冻结包裹，等查清再签收或退回）。
 */
import type { UserRef } from '../../contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { AiQuotaSettlementPersistenceError } from '../repository/ai-quota-settlement-repository-types.js'
import type { MysqlAiQuotaProviderUnknownRepository } from '../repository/mysql-ai-quota-provider-unknown-repository.js'
import type { MysqlAiQuotaReservationRepository } from '../repository/mysql-ai-quota-reservation-repository.js'

const zero = Number('0')

/** 高熵额度预占公开引用格式。 */
const reservationRefFormat = /^aqr_[A-Za-z0-9_-]+$/

/** 模型调用结果无法确认时发起的可信内部命令。 */
export type MarkAiQuotaProviderResultUnknownCommand = {
  /** 已由身份域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 要标记的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 服务端可信业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 标记用例的封闭结果。 */
export type MarkAiQuotaProviderResultUnknownResult =
  | {
      /** 固定为待对账，表示本次把 reserved 预占转入对账。 */
      readonly kind: 'pending_reconciliation'
      /** 已标记待对账的额度预占公开引用。 */
      readonly reservationRef: string
    }
  | {
      /** 固定为重放，表示预占已离开 reserved，本事务零写入。 */
      readonly kind: 'replayed'
      /** 已存在状态的额度预占公开引用。 */
      readonly reservationRef: string
      /** 预占当前所处的非 reserved 状态。 */
      readonly status: 'settled' | 'released' | 'pending_reconciliation'
    }

/** 标记用例使用的事务与 Repository 端口。 */
export type MarkAiQuotaProviderResultUnknownDependencies<
  TTransaction extends TransactionExecutionContext
> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 复用额度账户串行锁（与结算同样先锁账户再锁预占，避免死锁）。 */
  readonly reservationRepository: Pick<
    MysqlAiQuotaReservationRepository<TTransaction>,
    'lockAccount'
  >
  /** 锁定并更新预占状态的专用 Repository。 */
  readonly providerUnknownRepository: MysqlAiQuotaProviderUnknownRepository<TTransaction>
}

/** 创建“供应商结果未知”标记用例；重复调用安全收敛为 replayed。 */
export function createMarkAiQuotaProviderResultUnknownUseCase<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: MarkAiQuotaProviderResultUnknownDependencies<TTransaction>
): (
  command: MarkAiQuotaProviderResultUnknownCommand
) => Promise<MarkAiQuotaProviderResultUnknownResult> {
  return async command => {
    if (
      typeof command.reservationRef !== 'string' ||
      !reservationRefFormat.test(command.reservationRef) ||
      !Number.isSafeInteger(command.occurredAtMs) ||
      command.occurredAtMs < zero
    ) {
      throw new AiQuotaSettlementPersistenceError(
        'INTERNAL_DATA_INVALID',
        '供应商结果未知标记命令不合法'
      )
    }
    try {
      return await runDatabaseTransaction(
        dependencies.driver,
        async (transaction): Promise<MarkAiQuotaProviderResultUnknownResult> => {
          const account = await dependencies.reservationRepository.lockAccount(
            transaction,
            command.userRef
          )
          const reservation = await dependencies.providerUnknownRepository.lockReservation(
            transaction,
            {
              userInternalId: account.userInternalId,
              reservationRef: command.reservationRef
            }
          )
          if (reservation === null) {
            throw new AiQuotaSettlementPersistenceError('RESERVATION_NOT_FOUND', '额度预占不存在')
          }
          if (reservation.status !== 'reserved') {
            return {
              kind: 'replayed',
              reservationRef: reservation.reservationRef,
              status: reservation.status
            }
          }
          await dependencies.providerUnknownRepository.markProviderResultUnknown(transaction, {
            reservationInternalId: reservation.reservationInternalId,
            reservationRef: reservation.reservationRef,
            reservationVersion: reservation.reservationVersion,
            occurredAtMs: command.occurredAtMs
          })
          return { kind: 'pending_reconciliation', reservationRef: reservation.reservationRef }
        }
      )
    } catch (error: unknown) {
      if (error instanceof DatabaseCommitResultUnknownError) {
        // 提交结果未知：本操作幂等，调用方重试时会按当前状态收敛为 replayed。
        throw new AiQuotaSettlementPersistenceError(
          'COMMIT_RESULT_UNKNOWN',
          '供应商结果未知标记提交结果暂时无法确认'
        )
      }
      throw error
    }
  }
}
