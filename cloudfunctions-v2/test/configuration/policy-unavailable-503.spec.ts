import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { createExpireCarePlansJob, type CarePlanExpiryLogEvent } from '../../src/care/application/expire-care-plans.js'
import { createLongTermCareRouteBindings, type LongTermCareRouteDependencies } from '../../src/care/http/long-term-care-routes.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createRouteDispatcher, type RouteBinding } from '../../src/foundation/http/route-dispatcher.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import { createListUserPlantsRouteHandler, listUserPlantsRoute } from '../../src/user-plant/http/list-user-plants-route.js'
import { createWeatherServer } from '../../src/weather/http/server.js'
import { careLongTermRulesV1, fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * L3 / unit_fake（真实 node:http → 冻结路由 → 请求链；只替换策略读取端口与数据库连接）。
 * Expected 来源：configuration-layers.md v2 §3「读不到、Schema 不过或 SHA 不符时 HTTP 返回 503，定时任务本次不执行；
 * 不回退源码默认值」与 http-api.md 错误表 `SERVICE_UNAVAILABLE`（503，必要依赖不可用且不能安全降级）。
 * 未覆盖：真实数据库中策略缺失（读取器返回 null 的条件见 test/foundation/mysql-typed-policy-reader.spec.ts）。
 */
const now = Date.parse('2026-10-11T00:00:00Z')
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })
const user: UserPrincipalDto = { principalType: 'user', user_id: 'usr_policy_user_0001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() }
const unavailable = async () => null

/** 启动服务并发一个请求，返回状态与正文。 */
async function send(server: Server, method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'content-type': 'application/json', authorization: 'Bearer user-session-token', 'idempotency-key': 'policy-unavailable-0001' }
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }))
    })
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
const dispatchServer = (bindings: RouteBinding[]) => {
  const dispatch = createRouteDispatcher(bindings)
  return createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
}
/** 只记录 SQL、返回空行的连接；用于证明策略不可用时不访问业务数据。 */
function recordingConnection() {
  const queries: string[] = []
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined,
    release: () => undefined, destroy: () => undefined, execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (sql: string) => { queries.push(sql); return [] }
  }
  return { queries, source: { getConnection: async () => connection } }
}

describe('策略快照不可用 → 503 SERVICE_UNAVAILABLE（不回退默认值）', () => {
  const careDependencies = (overrides: Partial<LongTermCareRouteDependencies>): LongTermCareRouteDependencies => {
    const unused = async () => { throw new Error('策略不可用时不应调用业务端口') }
    return {
      authenticate: async () => user, now: () => now, writeAudit: () => undefined, ...fixturePolicyPorts(),
      readPlantContext: unused, readTaxonDisplayName: unused,
      commands: { recordWatering: unused, confirmProposal: unused, completePlan: unused },
      reads: { latestWateringFact: unused, listPlans: unused, latestAdvice: unused },
      ...overrides
    }
  }

  it('care 计划列表：长期养护规则不可用', async () => {
    const response = await send(dispatchServer(createLongTermCareRouteBindings(careDependencies({ readLongTermRules: unavailable }))),
      'GET', '/api/v2/care/user-plants/upl_policy_plant_001/plans')
    expect(response).toEqual({ status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' } } })
  })

  it('care 记录浇水（写接口）：HTTP 写入策略（幂等保留期）不可用', async () => {
    const response = await send(dispatchServer(createLongTermCareRouteBindings(careDependencies({ readHttpWriteRules: unavailable }))),
      'POST', '/api/v2/care/user-plants/upl_policy_plant_001/facts', { factType: 'watering', occurredAt: new Date(now - 60_000).toISOString() })
    expect(response.status).toBe(503)
    expect(response.body.error.type).toBe('SERVICE_UNAVAILABLE')
  })

  it('user-plant 植物列表：列表规则不可用', async () => {
    const handler = createListUserPlantsRouteHandler({ ...fixturePolicyPorts(), authenticate: async () => user, now: () => now, writeAudit: () => undefined,
      readListRules: unavailable, listUserPlants: async () => { throw new Error('不应调用') } })
    const response = await send(dispatchServer([{ route: listUserPlantsRoute, handler }]), 'GET', '/api/v2/user-plants')
    expect(response.status).toBe(503)
    expect(response.body.error.type).toBe('SERVICE_UNAVAILABLE')
  })

  it('weather 推荐：公开读取规则不可用，且不查询城市数据', async () => {
    const { queries, source } = recordingConnection()
    const server = createWeatherServer({ ...fixturePolicyPorts(), connectionSource: source, writeAudit: () => undefined, readPublicReadRules: unavailable })
    const response = await send(server, 'GET', '/api/v2/weather/city-climate/recommendations?cityCode=chongqing')
    expect(response.status).toBe(503)
    expect(response.body.error.type).toBe('SERVICE_UNAVAILABLE')
    expect(queries).toEqual([])
  })

  it.each([
    ['已发布身份搜索', '/api/v2/plant-knowledge/search?q=%E9%BE%9F'],
    ['目录搜索', '/api/v2/plant-knowledge/catalog/search?q=%E9%BE%9F'],
  ])('plant-knowledge %s：公开搜索规则不可用，且不查询植物数据', async (_name, path) => {
    const { queries, source } = recordingConnection()
    const server = createPlantKnowledgeServer({ ...fixturePolicyPorts(), connectionSource: source, writeAudit: () => undefined, readPublicSearchRules: unavailable })
    const response = await send(server, 'GET', path)
    expect(response.status).toBe(503)
    expect(response.body.error.type).toBe('SERVICE_UNAVAILABLE')
    expect(queries).toEqual([])
  })

  it('计划过期扫描：长期养护规则不可用 → not_started，不执行任何批次', async () => {
    const logs: CarePlanExpiryLogEvent[] = []
    let batches = 0
    const run = createExpireCarePlansJob({ now: () => now, readLongTermRules: unavailable, runBudgetFraction: 0.5,
      runBatch: async () => { batches += 1; return 0 }, log: event => { logs.push(event) } })
    expect(await run({ functionTimeoutMs: 60_000 })).toMatchObject({ outcome: 'not_started', batchCount: 0, expiredCount: 0 })
    expect(batches).toBe(0)
  })

  it('计划过期扫描：规则可用时截止 = 现在 − 发布中的宽限小时（v1 = 72）', async () => {
    const calls: Array<{ cutoffMs: number }> = []
    const run = createExpireCarePlansJob({ now: () => now, readLongTermRules: async () => careLongTermRulesV1(), runBudgetFraction: 0.5,
      runBatch: async input => { calls.push(input); return 0 }, log: () => undefined })
    await run({ functionTimeoutMs: 60_000 })
    expect(calls).toEqual([expect.objectContaining({ cutoffMs: now - 72 * 3_600_000 })])
  })
})
