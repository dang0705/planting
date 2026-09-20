import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { planAiQuotaReservationExpiry } from '../domain/plan-ai-quota-reservation-expiry.js'
import type { MysqlAiQuotaExpiryRepository } from '../repository/mysql-ai-quota-expiry-repository.js'
import { AiQuotaSettlementPersistenceError } from '../repository/ai-quota-settlement-repository-types.js'

const zero = Number('0')
const one = Number('1')

/** 单批 TTL 扫描命令；批量上限必须由已批准任务配置显式提供。 */
export type ScanExpiredAiQuotaReservationsCommand = {
  /** 扫描使用的服务端可信时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 本批最多锁定的记录数，不存在代码内默认值。 */
  readonly batchLimit: number
}

/** 单批 TTL 扫描的可审计内部结果。 */
export type ScanExpiredAiQuotaReservationsResult = {
  /** 本批成功转入待对账的记录数。 */
  readonly pendingCount: number
  /** 已转入待对账的高熵预占公开引用，按锁定顺序返回。 */
  readonly reservationRefs: readonly string[]
}

/** TTL 扫描用例依赖。 */
export type ScanExpiredAiQuotaReservationsDependencies<
  TTransaction extends TransactionExecutionContext
> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 锁定并更新到期预占的专用 Repository。 */
  readonly repository: MysqlAiQuotaExpiryRepository<TTransaction>
}

/** 创建单批 TTL 扫描用例；失败时整批回滚，调度方可在下一轮重新扫描。 */
export function createScanExpiredAiQuotaReservationsUseCase<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: ScanExpiredAiQuotaReservationsDependencies<TTransaction>
): (
  command: ScanExpiredAiQuotaReservationsCommand
) => Promise<ScanExpiredAiQuotaReservationsResult> {
  return async command => {
    if (
      !Number.isSafeInteger(command.occurredAtMs) ||
      command.occurredAtMs < zero ||
      !Number.isSafeInteger(command.batchLimit) ||
      command.batchLimit < one
    ) {
      throw new AiQuotaSettlementPersistenceError('INTERNAL_DATA_INVALID', '额度预占TTL扫描命令不合法')
    }
    return runDatabaseTransaction(dependencies.driver, async transaction => {
      const reservations = await dependencies.repository.lockExpiredReservations(transaction, command)
      const reservationRefs: string[] = []
      for (const reservation of reservations) {
        const plan = planAiQuotaReservationExpiry({
          status: reservation.status,
          expiresAtMs: reservation.expiresAtMs,
          occurredAtMs: command.occurredAtMs
        })
        if (plan.kind !== 'require_reconciliation') {
          continue
        }
        await dependencies.repository.markPendingReconciliation(transaction, {
          ...reservation,
          occurredAtMs: command.occurredAtMs
        })
        reservationRefs.push(reservation.reservationRef)
      }
      return { pendingCount: reservationRefs.length, reservationRefs }
    })
  }
}
