import { createServer, type Server } from 'node:http'

import type { UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlRollbackFailureRecorder,
  type MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlRow
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { createResolveUserPrincipalUseCase } from '../../identity/application/resolve-user-principal.js'
import {
  createMysqlUserPrincipalRepository,
  type UserPrincipalSqlRow
} from '../../identity/repository/mysql-user-principal-repository.js'
import { createGetUserPlantApplicationService } from '../application/get-user-plant.js'
import { createUserPlantApplicationService } from '../application/create-user-plant.js'
import {
  createArchiveUserPlantApplicationService,
  createRestoreUserPlantApplicationService
} from '../application/transition-user-plant-lifecycle.js'
import {
  createMysqlUserPlantLifecycleRepository,
  type UserPlantLifecycleSqlRow
} from '../repository/mysql-user-plant-lifecycle-repository.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlRow
} from '../repository/mysql-user-plant-repository.js'
import { createGetUserPlantRouteHandler, getUserPlantRoute } from './get-user-plant-route.js'
import { createUserPlantRoute, createUserPlantRouteHandler } from './create-user-plant-route.js'
import {
  archiveUserPlantRoute,
  createArchiveUserPlantRouteHandler,
  createRestoreUserPlantRouteHandler,
  restoreUserPlantRoute
} from './transition-user-plant-route.js'

/** user-plant 云函数 HTTP 服务依赖。 */
export type UserPlantServerDependencies = {
  /** 每请求独占连接来源；连接参数由入口从受控环境变量读取。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端可信时钟，返回当前 UTC 毫秒。 */
  readonly now: () => number
  /** 订阅域服务端快照适配器；没有可信快照时须失败关闭，禁止读取客户端传值。 */
  readonly resolveCapabilitySnapshot: (
    principal: UserPrincipalDto
  ) => Promise<UserCapabilitySnapshotDto>
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 事务回滚失败的内部观测端口。 */
  readonly recordRollbackFailure: MysqlRollbackFailureRecorder<Mysql2QueryConnection>
}

const okStatus = 200

/** 组装 user-plant 函数的 HTTP 服务：`/health` 探针加冻结路由分发，不监听端口。 */
export function createUserPlantServer(dependencies: UserPlantServerDependencies): Server {
  const driver = createMysqlTransactionDriver(
    dependencies.connectionSource,
    dependencies.recordRollbackFailure
  )
  const userPlantRepository = createMysqlUserPlantRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const resolvePrincipal = createResolveUserPrincipalUseCase({
    repository: {
      read: input =>
        withReadConnection(dependencies.connectionSource, connection =>
          createMysqlUserPrincipalRepository({
            executeQuery: async (sql, parameters) =>
              (await connection.query(
                sql,
                toSqlParameters(parameters)
              )) as unknown as readonly UserPrincipalSqlRow[]
          }).read(input)
        )
    }
  })
  const getUserPlant = createGetUserPlantApplicationService({
    driver,
    repository: userPlantRepository
  })
  const idempotencyRepository = createMysqlHttpIdempotencyRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly HttpIdempotencySqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const commitUnknownReadOnlyRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(
    {
      executeQuery: (sql, parameters) =>
        withReadConnection(
          dependencies.connectionSource,
          async connection =>
            (await connection.query(
              sql,
              toSqlParameters(parameters)
            )) as unknown as readonly HttpIdempotencySqlRow[]
        )
    }
  )
  const createUserPlant = createUserPlantApplicationService({
    driver,
    userPlantRepository,
    idempotencyRepository,
    commitUnknownReadOnlyRepository
  })
  const lifecycleRepository = createMysqlUserPlantLifecycleRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly UserPlantLifecycleSqlRow[],
    executeWrite: (transaction, sql, parameters) =>
      transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const lifecycleDependencies = {
    driver,
    idempotencyRepository,
    lifecycleRepository,
    userPlantRepository,
    commitUnknownReadOnlyRepository
  }
  const archiveUserPlant = createArchiveUserPlantApplicationService(lifecycleDependencies)
  const restoreUserPlant = createRestoreUserPlantApplicationService(lifecycleDependencies)

  const transitionRouteDependencies = {
    resolvePrincipal,
    resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
    archiveUserPlant,
    restoreUserPlant,
    now: dependencies.now,
    writeAudit: dependencies.writeAudit
  }

  const dispatch = createRouteDispatcher([
    {
      route: createUserPlantRoute,
      handler: createUserPlantRouteHandler({
        resolvePrincipal,
        resolveCapabilitySnapshot: dependencies.resolveCapabilitySnapshot,
        createUserPlant,
        now: dependencies.now,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getUserPlantRoute,
      handler: createGetUserPlantRouteHandler({
        resolvePrincipal,
        getUserPlant,
        now: dependencies.now,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: archiveUserPlantRoute,
      handler: createArchiveUserPlantRouteHandler(transitionRouteDependencies)
    },
    {
      route: restoreUserPlantRoute,
      handler: createRestoreUserPlantRouteHandler(transitionRouteDependencies)
    }
  ])

  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/health' && request.method === 'GET') {
      request.resume()
      const body = JSON.stringify({ ok: true })
      response.writeHead(okStatus, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body, 'utf8')
      })
      response.end(body)
      return
    }
    dispatch(request, response).catch(() => undefined)
  })
}
