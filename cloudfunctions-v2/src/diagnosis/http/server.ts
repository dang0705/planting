import { createServer } from 'node:http'
import type {
  MysqlConnectionPoolPort,
  MysqlRollbackFailureRecorder,
  MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import { createMysqlTransactionDriver } from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  toSqlParameters,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import {
  createMysqlHttpIdempotencyRepository,
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  type HttpIdempotencySqlRow
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createFixedQuestionSessionInTransaction } from '../application/create-fixed-question-session.js'
import { createIdempotentDiagnosisCreationService } from '../application/idempotent-create-diagnosis.js'
import { createIdempotentDiagnosisAnswerService } from '../application/idempotent-diagnosis-answers.js'
import { submitDiagnosisAnswersInTransaction } from '../application/submit-diagnosis-answers.js'
import { createMysqlDiagnosisQuestionSnapshotRepository } from '../repository/mysql-diagnosis-question-snapshot-repository.js'
import { createMysqlFixedQuestionReleaseReader } from '../repository/mysql-fixed-question-release-reader.js'
import { createMysqlDiagnosisAnswerRepository } from '../repository/mysql-diagnosis-answer-repository.js'
import {
  createDiagnosisCreationRouteHandler,
  diagnosisCreationRoute,
  projectDiagnosisCreationResponse,
  type DiagnosisCreationRouteDependencies
} from './create-session-route.js'
import {
  createDiagnosisAnswerRouteHandler,
  diagnosisAnswerRoute,
  projectDiagnosisAnswerResponse
} from './answer-route.js'

/** diagnosis运行接线依赖；身份只由identity域解析，不能由业务正文提供。 */
export interface DiagnosisServerDependencies {
  /** 真实MySQL连接来源；请求内使用独占事务连接。 */ readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 受控身份域用例，测试替身不能作为真实平台验真证据。 */ readonly resolvePrincipal: DiagnosisCreationRouteDependencies['resolvePrincipal']
  /** 服务端UTC毫秒。 */ readonly now: () => number
  /** 脱敏请求结果，不记录模型、正文或凭证。 */ readonly writeAudit: (
    event: RequestChainAuditEvent
  ) => void | Promise<void>
  /** 事务回滚失败观测端口。 */ readonly recordRollbackFailure: MysqlRollbackFailureRecorder<Mysql2QueryConnection>
}
/** 只组装已实现创建/作答纵向用例；无正式虫害准备，不提供视觉调用默认值。 */
export function createDiagnosisServer(deps: DiagnosisServerDependencies) {
  const source = deps.connectionSource
  const driver = createMysqlTransactionDriver(source, deps.recordRollbackFailure)
  const ledger = createMysqlHttpIdempotencyRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (tx, sql, parameters) =>
      (await tx.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly HttpIdempotencySqlRow[],
    executeWrite: (tx, sql, parameters) => tx.connection.execute(sql, toSqlParameters(parameters))
  })
  const commitUnknownRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
    executeQuery: (sql, parameters) =>
      withReadConnection(
        source,
        async connection =>
          (await connection.query(
            sql,
            toSqlParameters(parameters)
          )) as unknown as readonly HttpIdempotencySqlRow[]
      )
  })
  const shared = { driver, idempotencyRepository: ledger, commitUnknownRepository }
  const snapshots = createMysqlDiagnosisQuestionSnapshotRepository(source)
  const createSession = createIdempotentDiagnosisCreationService({
    ...shared,
    createInTransaction: createFixedQuestionSessionInTransaction({
      published: createMysqlFixedQuestionReleaseReader().read,
      append: snapshots.append,
      read: snapshots.readInTransaction
    }),
    projectPublicResponse: projectDiagnosisCreationResponse
  })
  const answers = createMysqlDiagnosisAnswerRepository()
  const protocol = {
    resolvePrincipal: deps.resolvePrincipal,
    now: deps.now,
    writeAudit: deps.writeAudit
  }
  const dispatch = createRouteDispatcher([
    {
      route: diagnosisCreationRoute,
      handler: createDiagnosisCreationRouteHandler({ ...protocol, createSession })
    },
    {
      route: diagnosisAnswerRoute,
      handler: createDiagnosisAnswerRouteHandler({
        ...protocol,
        submitAnswers: input =>
          createIdempotentDiagnosisAnswerService({
            ...shared,
            submitInTransaction: (tx, command) =>
              submitDiagnosisAnswersInTransaction(answers, tx, command),
            projectPublicResponse: result =>
              projectDiagnosisAnswerResponse(input.diagnosisRef, result)
          })(input)
      })
    }
  ])
  return createServer((request, response) => {
    if (
      request.method === 'GET' &&
      new URL(request.url ?? '/', 'http://127.0.0.1').pathname === '/health'
    ) {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    // 分发器负责脱敏错误响应；此处不重复输出内部异常。
    dispatch(request, response).catch(() => undefined)
  })
}
