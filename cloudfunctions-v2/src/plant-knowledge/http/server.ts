import type { PlantKnowledgePublicSearchRules } from '../../configuration/business-policies/index.js'
import type { PolicyRulesPort, PolicySnapshotPort } from '../../foundation/policy/require-policy.js'
import { createServer, type Server } from 'node:http'

import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../foundation/http/route-dispatcher.js'
import { createGetPublishedPlantRouteHandler } from '../application/get-published-plant.js'
import { createGetPlantEncyclopediaRouteHandler } from '../application/get-plant-encyclopedia.js'
import { createMysqlPlantEncyclopediaRepository } from '../repository/mysql-plant-encyclopedia-repository.js'
import { createSearchPlantCatalogRouteHandler } from '../application/search-plant-catalog.js'
import { createMysqlPlantCatalogRepository } from '../repository/mysql-plant-catalog-repository.js'
import { createSearchPublishedPlantsRouteHandler } from '../application/search-published-plants.js'
import { createFilterPlantsByVisualAxesRouteHandler, type PlantVisualAxisPort } from '../application/filter-plants-by-visual-axes.js'
import { createListPlantVisualAxesRouteHandler } from '../application/list-plant-visual-axes.js'
import { createMysqlPlantVisualAxisRepository } from '../repository/mysql-plant-visual-axis-repository.js'
import { createMysqlPublishedPlantRepository } from '../repository/mysql-published-plant-repository.js'
import { createMysqlPublishedPlantSearchRepository } from '../repository/mysql-published-plant-search-repository.js'
import {
  getPublishedPlantRoute,
  getPlantEncyclopediaRoute,
  searchPublishedPlantsRoute,
  searchPlantCatalogRoute,
  filterPlantsByVisualAxesRoute,
  listPlantVisualAxesRoute
} from './routes.js'

/** plant-knowledge 云函数 HTTP 服务依赖。 */
export type PlantKnowledgeServerDependencies = {
  /** 每请求独占连接来源；连接参数由入口从受控环境变量读取。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
  /** 读取公开搜索策略快照（plant-knowledge/public_search）；入口由类型化读取器适配，null 时搜索 / 百科接口 503。 */
  readonly readPublicSearchRules: PolicyRulesPort<PlantKnowledgePublicSearchRules>
  /** 同一策略的带发布版本号快照（三轴筛选在响应顶层注明策略版本）；null 或 v1 正文时三轴接口 503。 */
  readonly readPublicSearchSnapshot: PolicySnapshotPort<PlantKnowledgePublicSearchRules>
}

const okStatus = 200

/** 三轴筛选只读端口：每次调用借用一条只读连接，结束即归还。 */
function createVisualAxisPort(connectionSource: PlantKnowledgeServerDependencies['connectionSource']): PlantVisualAxisPort {
  return {
    readCatalog: catalogVersion =>
      withReadConnection(connectionSource, connection => createMysqlPlantVisualAxisRepository(connection).readCatalog(catalogVersion)),
    filterPlants: search =>
      withReadConnection(connectionSource, connection => createMysqlPlantVisualAxisRepository(connection).filterPlants(search)),
    readAxisValues: (ids, sources) =>
      withReadConnection(connectionSource, connection => createMysqlPlantVisualAxisRepository(connection).readAxisValues(ids, sources))
  }
}

/** 组装 plant-knowledge 函数的 HTTP 服务：`/health` 探针加冻结路由分发，不监听端口。 */
export function createPlantKnowledgeServer(dependencies: PlantKnowledgeServerDependencies): Server {
  const visualAxisDependencies = {
    readPublicSearchSnapshot: dependencies.readPublicSearchSnapshot,
    visualAxes: createVisualAxisPort(dependencies.connectionSource),
    writeAudit: dependencies.writeAudit
  }
  const dispatch = createRouteDispatcher([
    { route: listPlantVisualAxesRoute, handler: createListPlantVisualAxesRouteHandler(visualAxisDependencies) },
    { route: filterPlantsByVisualAxesRoute, handler: createFilterPlantsByVisualAxesRouteHandler(visualAxisDependencies) },
    {
      route: getPlantEncyclopediaRoute,
      handler: createGetPlantEncyclopediaRouteHandler({
        getPlantEncyclopedia: query =>
          withReadConnection(dependencies.connectionSource, connection =>
            createMysqlPlantEncyclopediaRepository(connection).getPlantEncyclopedia(query)
          ),
        readPublicSearchRules: dependencies.readPublicSearchRules,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: searchPlantCatalogRoute,
      handler: createSearchPlantCatalogRouteHandler({
        searchPlantCatalog: query =>
          withReadConnection(dependencies.connectionSource, connection =>
            createMysqlPlantCatalogRepository(connection).searchPlantCatalog(query)
          ),
        readPublicSearchRules: dependencies.readPublicSearchRules,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: searchPublishedPlantsRoute,
      handler: createSearchPublishedPlantsRouteHandler({
        searchPublishedPlants: (query, maxItems) =>
          withReadConnection(dependencies.connectionSource, connection =>
            createMysqlPublishedPlantSearchRepository(connection).searchPublishedPlants(query, maxItems)
          ),
        readPublicSearchRules: dependencies.readPublicSearchRules,
        writeAudit: dependencies.writeAudit
      })
    },
    {
      route: getPublishedPlantRoute,
      handler: createGetPublishedPlantRouteHandler({
        readPublishedPlant: plantIdentityRef =>
          withReadConnection(dependencies.connectionSource, connection =>
            createMysqlPublishedPlantRepository(connection).findPublishedPlant(plantIdentityRef)
          ),
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
