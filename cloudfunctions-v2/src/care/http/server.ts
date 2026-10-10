import { createServer, type Server } from 'node:http'

import type { GuestPrincipalDto, UserPrincipalDto } from '../../contracts/types.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlRollbackFailureRecorder,
  type MysqlTransactionContext
} from '../../foundation/database/mysql-transaction-driver.js'
import { toSqlParameters, withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { createMysqlCityClimateFitRepository } from '../../weather/repository/mysql-city-climate-fit-repository.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlRow
} from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { createMysqlTropicalsWateringBaselineRepository } from '../../plant-knowledge/repository/mysql-tropicals-watering-baseline-repository.js'
import { createMysqlTemporaryCaseOwnershipReader } from '../../user-plant/repository/mysql-temporary-case-ownership-reader.js'
import { createWateringAdviceApplicationService } from '../application/create-watering-advice.js'
import type { NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { OpenMeteoRadiationQuery } from '../provider/open-meteo-radiation-client.js'
import { createMysqlMvpWateringPolicyReader } from '../repository/mysql-mvp-watering-policy-reader.js'
import { createMysqlWateringAdviceRepository } from '../repository/mysql-watering-advice-repository.js'
import { WATERING_BASELINE_POLICY_VERSION } from '../watering/watering-advice-hard-rules.js'
import { createWateringAdviceRoute, createWateringAdviceRouteHandler } from './watering-advice-route.js'
import { randomBytes } from 'node:crypto'
import { createUserBearerAuthenticator } from '../../identity/http/user-bearer-authenticator.js'
import { createMysqlTropicalsTaxonReader } from '../../plant-knowledge/repository/mysql-tropicals-taxon-reader.js'
import { createMysqlUserPlantCareContextReader } from '../../user-plant/repository/mysql-user-plant-care-context-reader.js'
import { createUserPlantWateringAdviceApplicationService } from '../application/create-user-plant-watering-advice.js'
import { createLongTermCareCommands } from '../application/long-term-care-commands.js'
import { createMysqlLongTermCareReadRepository } from '../repository/mysql-long-term-care-read-repository.js'
import { createLongTermCareRouteBindings } from './long-term-care-routes.js'

/** care 云函数 HTTP 服务依赖。 */
export interface CareServerDependencies {
  /** 每请求独占连接来源；连接参数由入口从受控环境变量读取。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 服务端可信时钟，返回当前 UTC 毫秒。 */
  readonly now: () => number
  /** guest_or_authenticated 合并主体解析（identity 域提供）。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** Open-Meteo 辐射获取并标准化；不可用返回 null。 */
  readonly fetchRadiation: (query: OpenMeteoRadiationQuery) => Promise<NormalizedOutdoorRadiation | null>
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 事务回滚失败的内部观测端口。 */
  readonly recordRollbackFailure: MysqlRollbackFailureRecorder<Mysql2QueryConnection>
}

const okStatus = 200

/** 组装 care 函数 HTTP 服务：`/health` 探针加冻结路由分发，不监听端口。 */
export function createCareServer(dependencies: CareServerDependencies): Server {
  const source = dependencies.connectionSource
  const driver = createMysqlTransactionDriver(source, dependencies.recordRollbackFailure)
  const idempotencyRepository = createMysqlHttpIdempotencyRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
    executeQuery: async (transaction, sql, parameters) =>
      (await transaction.connection.query(sql, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[],
    executeWrite: (transaction, sql, parameters) => transaction.connection.execute(sql, toSqlParameters(parameters))
  })
  const commitUnknownReadOnlyRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
    executeQuery: (sql, parameters) => withReadConnection(source, async connection =>
      (await connection.query(sql, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[])
  })
  const createWateringAdvice = createWateringAdviceApplicationService({
    driver, idempotencyRepository, repository: createMysqlWateringAdviceRepository(source), commitUnknownReadOnlyRepository
  })
  const policyReader = createMysqlMvpWateringPolicyReader(source)
  const ownershipReader = createMysqlTemporaryCaseOwnershipReader(source)
  /** care → plant-knowledge 只读适配：只读硬规则版本的基线，非可用候选一律视为缺失。 */
  const baselineRepository = createMysqlTropicalsWateringBaselineRepository({
    query: (sql, parameters) => withReadConnection(source, connection => connection.query(sql, toSqlParameters(parameters)))
  })

  const idempotentWrite = { driver, idempotencyRepository, commitUnknownReadOnlyRepository }
  const plantContextReader = createMysqlUserPlantCareContextReader(source)
  const careReads = createMysqlLongTermCareReadRepository(source)
  /** care → plant-knowledge 只读适配：日历标题用的品种中文名。 */
  const taxonReader = createMysqlTropicalsTaxonReader({
    query: (sql, parameters) => withReadConnection(source, connection => connection.query(sql, toSqlParameters(parameters)))
  })
  const refPrefix = { fact: 'cft_', plan: 'cpl_', command: 'ccm_', observation: 'ceo_' } as const
  const longTermRoutes = createLongTermCareRouteBindings({
    authenticate: createUserBearerAuthenticator(dependencies.resolvePrincipal), now: dependencies.now, writeAudit: dependencies.writeAudit,
    readPlantContext: query => plantContextReader.read(query),
    readTaxonDisplayName: async ref => (await taxonReader.read(ref))?.displayName ?? null,
    commands: createLongTermCareCommands({ ...idempotentWrite, createRef: kind => `${refPrefix[kind]}${randomBytes(18).toString('base64url')}` }),
    reads: careReads
  })

  const dispatch = createRouteDispatcher([
    ...longTermRoutes,
    {
      route: createWateringAdviceRoute,
      handler: createWateringAdviceRouteHandler({
        resolvePrincipal: dependencies.resolvePrincipal,
        readOwnedCase: ({ owner, nowMs }) => ownershipReader.readOwned(owner.kind === 'guest'
          ? { kind: 'guest', guestSessionRef: owner.guestSessionRef, caseRef: owner.caseRef, nowMs }
          : { kind: 'authenticated', userRef: owner.userRef, caseRef: owner.caseRef, nowMs }),
        readWateringPolicy: async capturedAt => {
          const resolution = await policyReader.read(capturedAt)
          return resolution.status === 'available' ? { releaseRef: resolution.releaseRef, snapshot: resolution.snapshot } : null
        },
        readPlantBaseline: async catalogTaxonRef => {
          const baseline = await baselineRepository.read({ catalogTaxonRef, policyVersion: WATERING_BASELINE_POLICY_VERSION })
          return baseline.status === 'available_candidate'
            ? { tier: baseline.tier, trigger: baseline.trigger, baselineDays: { min: baseline.baselineDays.min, max: baseline.baselineDays.max } }
            : null
        },
        fetchRadiation: dependencies.fetchRadiation,
        createWateringAdvice,
        userPlant: {
          readPlantContext: query => plantContextReader.read(query),
          readLatestWateringFact: scope => careReads.latestWateringFact(scope),
          createAdvice: createUserPlantWateringAdviceApplicationService(idempotentWrite),
          // care → weather 只读适配：城市目录（策略 v0-city-outdoor）的中心坐标。
          resolveCityCoordinates: async cityRef => {
            const profile = await withReadConnection(dependencies.connectionSource, connection =>
              createMysqlCityClimateFitRepository({ query: (sql, parameters) => connection.query(sql, toSqlParameters(parameters)) }).getProfile(cityRef))
            return profile === null ? null : { latitude: profile.lat, longitude: profile.lon }
          }
        },
        now: dependencies.now,
        writeAudit: dependencies.writeAudit
      })
    }
  ])

  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === '/health' && request.method === 'GET') {
      request.resume()
      const body = JSON.stringify({ ok: true })
      response.writeHead(okStatus, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body, 'utf8') })
      response.end(body)
      return
    }
    dispatch(request, response).catch(() => undefined)
  })
}
