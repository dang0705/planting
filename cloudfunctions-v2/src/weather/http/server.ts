import type { WeatherPublicReadRules } from '../../configuration/business-policies/index.js'
import type { PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { createServer, type Server } from 'node:http'

import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import {
  createGetCityClimateFitRouteHandler,
  createGetCityClimateProfileRouteHandler,
  createListCityClimateProfilesRouteHandler,
  createListCityClimateRecommendationsRouteHandler
} from '../application/city-climate-fit.js'
import { createMysqlCityClimateFitRepository } from '../repository/mysql-city-climate-fit-repository.js'
import {
  getCityClimateFitRoute,
  getCityClimateProfileRoute,
  listCityClimateProfilesRoute,
  listCityClimateRecommendationsRoute
} from './routes.js'

/** weather 云函数 HTTP 服务依赖。 */
export type WeatherServerDependencies = {
  /** 每请求独占连接来源；连接参数由入口从受控环境变量读取。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 读取 weather 公开读取策略快照（weather/public_read）；入口由类型化读取器适配，null 时推荐接口 503。 */
  readonly readPublicReadRules: PolicyRulesPort<WeatherPublicReadRules>
}

const okStatus = 200

function createCityClimatePort(connectionSource: WeatherServerDependencies['connectionSource']) {
  return {
    listProfiles: () =>
      withReadConnection(connectionSource, connection =>
        createMysqlCityClimateFitRepository(connection).listProfiles()
      ),
    getProfile: (cityCode: string) =>
      withReadConnection(connectionSource, connection =>
        createMysqlCityClimateFitRepository(connection).getProfile(cityCode)
      ),
    getFit: (cityCode: string, plantId: string) =>
      withReadConnection(connectionSource, connection =>
        createMysqlCityClimateFitRepository(connection).getFit(cityCode, plantId)
      ),
    listRecommendations: (cityCode: string, top: number) =>
      withReadConnection(connectionSource, connection =>
        createMysqlCityClimateFitRepository(connection).listRecommendations(cityCode, top)
      )
  }
}

/** 组装 weather 函数的 HTTP 服务：`/health` 探针加冻结路由分发。 */
export function createWeatherServer(dependencies: WeatherServerDependencies): Server {
  const cityClimateFit = createCityClimatePort(dependencies.connectionSource)
  const dispatch = createRouteDispatcher([
    {
      route: listCityClimateProfilesRoute,
      handler: createListCityClimateProfilesRouteHandler({
        cityClimateFit,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getCityClimateProfileRoute,
      handler: createGetCityClimateProfileRouteHandler({
        cityClimateFit,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getCityClimateFitRoute,
      handler: createGetCityClimateFitRouteHandler({
        cityClimateFit,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: listCityClimateRecommendationsRoute,
      handler: createListCityClimateRecommendationsRouteHandler({
        cityClimateFit,
        readPublicReadRules: dependencies.readPublicReadRules,
        writeAudit: dependencies.writeAudit
      })
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
