import type { CareLongTermRules, HttpRequestWriteRules } from '../../configuration/business-policies/index.js'
import type { PolicyRulesPort } from '../../foundation/policy/require-policy.js'
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
  /** 读取长期养护规则策略快照（care/long_term_rules）；入口由类型化读取器适配，null 时对应接口 503。 */
  readonly readLongTermRules: PolicyRulesPort<CareLongTermRules>
  /** 读取 HTTP 写入策略快照（http/request_write）；null 时写接口 503。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /**
   * 写入时顺带派发（long-term-care-contract.md §13，用户 2026-10-10 裁决）：写事务提交后对本请求新写入的事件尽力派发一次，
   * 自带等待上限且永不抛出；未接入时只靠补扫（care-maintenance-sweep）。入口用 createInlineCareEventDispatcherFromSource 组装。
   */
  readonly dispatchCreatedEvents?: (eventIds: readonly string[]) => Promise<unknown>
}

/** 给写用例套上“提交后同请求派发”：收集本次事务新写入的事件，结果返回前派发；派发结果不改变响应。 */
function withInlineDispatch<TCommand extends { readonly onEventAppended?: (eventId: string) => void }, TResult>(
  command: (input: TCommand) => Promise<TResult>, dispatch: ((eventIds: readonly string[]) => Promise<unknown>) | undefined
): (input: TCommand) => Promise<TResult> {
  if (dispatch === undefined) { return command }
  return async input => {
    const eventIds: string[] = []
    const result = await command({ ...input, onEventAppended: eventId => { eventIds.push(eventId) } })
    if (eventIds.length > 0) { try { await dispatch(eventIds) } catch { /* 尽力而为：失败留给补扫，不影响已成功的响应。 */ } }
    return result
  }
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
    readLongTermRules: dependencies.readLongTermRules, readHttpWriteRules: dependencies.readHttpWriteRules,
    readPlantContext: query => plantContextReader.read(query),
    readTaxonDisplayName: async ref => (await taxonReader.read(ref))?.displayName ?? null,
    commands: (() => {
      const commands = createLongTermCareCommands({ ...idempotentWrite, createRef: kind => `${refPrefix[kind]}${randomBytes(18).toString('base64url')}` })
      return { recordWatering: withInlineDispatch(commands.recordWatering, dependencies.dispatchCreatedEvents),
        confirmProposal: withInlineDispatch(commands.confirmProposal, dependencies.dispatchCreatedEvents),
        completePlan: withInlineDispatch(commands.completePlan, dependencies.dispatchCreatedEvents) }
    })(),
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
          createAdvice: createUserPlantWateringAdviceApplicationService(idempotentWrite)
        },
        // care → weather 只读适配：城市目录（策略 v0-city-outdoor）的中心坐标；临时案例与长期植物共用。
        resolveCityCoordinates: async cityCode => {
          const profile = await withReadConnection(dependencies.connectionSource, connection =>
            createMysqlCityClimateFitRepository({ query: (sql, parameters) => connection.query(sql, toSqlParameters(parameters)) }).getProfile(cityCode))
          return profile === null ? null : { latitude: profile.lat, longitude: profile.lon }
        },
        now: dependencies.now,
        readHttpWriteRules: dependencies.readHttpWriteRules,
        readLongTermRules: dependencies.readLongTermRules,
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
