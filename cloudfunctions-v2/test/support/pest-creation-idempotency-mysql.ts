import { createHash } from 'node:crypto'
import {
  createIdempotentPestDiagnosisCreationService,
  calculatePestDiagnosisCreationRequestHash,
  type PestDiagnosisCreationCommand
} from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import type { PestQuestionSessionCreation } from '../../src/diagnosis/application/create-pest-question-session.js'
import {
  createMysql2ConnectionSource,
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlTransactionDriver,
  type MysqlTransactionContext
} from '../../src/foundation/database/mysql-transaction-driver.js'
import {
  createMysqlHttpIdempotencyRepository,
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import { projectPestQuestionPackage } from '../../src/diagnosis/http/pest-question-public-projection.js'

/** 测试支架：实际共享账本、事务与新连接对账；不构成正式HTTP投影。 */
export function pestCreationMysqlHarness(
  source: ReturnType<typeof createMysql2ConnectionSource>,
  createInTransaction: (
    tx: MysqlTransactionContext<Mysql2QueryConnection>,
    input: PestDiagnosisCreationCommand
  ) => Promise<PestQuestionSessionCreation>
) {
  const dependencies = {
    driver: createMysqlTransactionDriver(source, () => undefined),
    idempotencyRepository: createMysqlHttpIdempotencyRepository<
      MysqlTransactionContext<Mysql2QueryConnection>
    >({
      executeQuery: (tx, sql, params) =>
        tx.connection.query(sql, toSqlParameters(params)) as unknown as Promise<
          readonly HttpIdempotencySqlRow[]
        >,
      executeWrite: (tx, sql, params) => tx.connection.execute(sql, toSqlParameters(params))
    }),
    commitUnknownRepository: createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
      executeQuery: (sql, params) =>
        withReadConnection(source, conn =>
          conn.query(sql, toSqlParameters(params))
        ) as unknown as Promise<readonly HttpIdempotencySqlRow[]>
    }),
    createInTransaction,
    projectPublicResponse: (result: PestQuestionSessionCreation) => {
      if (result.status !== 'created') {
        return {
          status: 503,
          body: { error: { type: 'SERVICE_UNAVAILABLE', message: '题包暂时不可用' } }
        }
      }
      return {
        status: 200,
        body: {
          data: {
            diagnosisSessionRef: result.diagnosisRef,
            questionPackage: projectPestQuestionPackage(result.snapshot)
          }
        }
      }
    }
  }
  return { dependencies, run: createIdempotentPestDiagnosisCreationService(dependencies) }
}
/** 显式测试时间和期限仅为场景数据，不是生产保留期默认值。 */
export function pestCreationMysqlInput(key: string, assetRef = 'upa_owner123') {
  const command: PestDiagnosisCreationCommand = {
    userRef: 'usr_owner123',
    userPlantRef: 'upl_owner123',
    mode: 'pest',
    assetRef,
    startedAtMs: 1500
  }
  return {
    ...command,
    idempotency: {
      principalType: 'user' as const,
      principalScopeHash: createHash('sha256').update(command.userRef).digest('hex'),
      httpMethod: 'POST',
      normalizedPath: '/api/v2/diagnosis/sessions',
      operationId: 'createDiagnosisSession',
      idempotencyKeyHash: createHash('sha256').update(key).digest('hex'),
      requestHash: calculatePestDiagnosisCreationRequestHash(command),
      createdAtMs: 1500,
      expiresAtMs: 3000
    }
  }
}
