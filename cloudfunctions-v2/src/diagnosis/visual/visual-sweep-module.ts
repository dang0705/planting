import { randomBytes } from 'node:crypto'

import type { DiagnosisMaintenanceSweepSettings } from './application/visual-maintenance-sweep.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type {
  MysqlConnectionPoolPort,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver
} from '../../foundation/database/transaction-runner.js'
import { createMarkAiQuotaProviderResultUnknownUseCase } from '../../subscription/application/mark-ai-quota-provider-result-unknown.js'
import { createScanExpiredAiQuotaReservationsUseCase } from '../../subscription/application/scan-expired-ai-quota-reservations.js'
import { createSettleAiQuotaUseCase } from '../../subscription/application/settle-ai-quota.js'
import { createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository } from '../../subscription/repository/mysql-ai-quota-commit-unknown-repository.js'
import { createMysqlAiQuotaExpiryRepository } from '../../subscription/repository/mysql-ai-quota-expiry-repository.js'
import { createMysqlAiQuotaProviderUnknownRepository } from '../../subscription/repository/mysql-ai-quota-provider-unknown-repository.js'
import { createMysqlAiQuotaReservationRepository } from '../../subscription/repository/mysql-ai-quota-reservation-repository.js'
import { createMysqlAiQuotaSettlementRepository } from '../../subscription/repository/mysql-ai-quota-settlement-repository.js'
import {
  createDiagnosisMaintenanceSweep,
  createRecoverStaleVisualDiagnosesUseCase
} from './application/visual-maintenance-sweep.js'
import { createMysqlVisualDiagnosisRepository } from './repository/mysql-visual-diagnosis-repository.js'

/**
 * diagnosis 低频补扫的装配（入口与真实库测试共用）：预占到期扫描复用 subscription 用例，卡住会话回收复用视觉诊断仓储与额度用例。
 */
type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 装配依赖。 */
export interface DiagnosisMaintenanceSweepModuleDependencies {
  /** MySQL 连接来源。 */
  readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 共享数据库事务驱动（MySQL）。 */
  readonly driver: DatabaseTransactionDriver<Transaction>
  /** 批量与预算参数（RUNTIME_PARAMETERS.diagnosis.maintenanceSweep）。 */
  readonly settings: DiagnosisMaintenanceSweepSettings
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 装配 diagnosis 低频补扫。 */
export function createDiagnosisMaintenanceSweepFromSource(
  deps: DiagnosisMaintenanceSweepModuleDependencies
) {
  const { source, driver, now } = deps
  const executor = {
    executeQuery: async (transaction: Transaction, sql: string, parameters: readonly unknown[]) =>
      (await transaction.connection.query(sql, toSqlParameters(parameters))) as never,
    executeWrite: async (transaction: Transaction, sql: string, parameters: readonly unknown[]) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  }
  const randomRef = (prefix: string) => `${prefix}${randomBytes(18).toString('base64url')}`
  const reservationRepository = createMysqlAiQuotaReservationRepository<Transaction>(executor)
  return createDiagnosisMaintenanceSweep({
    scanExpiredReservations: createScanExpiredAiQuotaReservationsUseCase<Transaction>({
      driver,
      repository: createMysqlAiQuotaExpiryRepository<Transaction>(executor)
    }),
    recoverStaleSessions: createRecoverStaleVisualDiagnosesUseCase({
      runTransaction: work => runDatabaseTransaction(driver, work),
      repository: createMysqlVisualDiagnosisRepository(),
      settleQuota: createSettleAiQuotaUseCase<Transaction>({
        driver,
        reservationRepository,
        settlementRepository: createMysqlAiQuotaSettlementRepository<Transaction>(executor),
        createLedgerRef: () => randomRef('aql_'),
        commitUnknownReadOnlyRepository:
          createMysqlAiQuotaSettlementCommitUnknownReadOnlyRepository({
            executeQuery: (sql, parameters) =>
              withReadConnection(
                source,
                async connection =>
                  (await connection.query(sql, toSqlParameters(parameters))) as never
              )
          })
      }),
      markProviderUnknown: createMarkAiQuotaProviderResultUnknownUseCase<Transaction>({
        driver,
        reservationRepository,
        providerUnknownRepository:
          createMysqlAiQuotaProviderUnknownRepository<Transaction>(executor)
      }),
      now
    }),
    settings: deps.settings,
    now
  })
}
