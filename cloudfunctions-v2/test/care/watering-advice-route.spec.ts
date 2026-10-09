import { createHash } from 'node:crypto'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'

import type { CreateWateringAdviceApplicationInput } from '../../src/care/application/create-watering-advice.js'
import { createCareServer } from '../../src/care/http/server.js'
import { createWateringAdviceRoute, createWateringAdviceRouteHandler, type WateringAdviceRouteDependencies } from '../../src/care/http/watering-advice-route.js'
import type { OpenMeteoRadiationQuery } from '../../src/care/provider/open-meteo-radiation-client.js'
import type { GuestPrincipalDto, GuestSessionRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'

/**
 * unit_fake（L3）。Expected：watering-advice-http-test-matrix.md R1–R7、S（HTTP 合同、裁决 1/2/5/8）。
 * 真实经过 node:http、冻结分发、请求链、请求解析与组装；主体、归属、策略、基线、辐射与事务用例为替身。
 */
const day = 86_400_000
const now = Date.UTC(2026, 9, 9, 4)
const guest: GuestPrincipalDto = { principalType: 'guest', guestSessionRef: 'gst_route_session_001' as GuestSessionRef, authProvider: 'server_issued_guest_token',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + day).toISOString() }
const user: UserPrincipalDto = { principalType: 'user', user_id: 'usr_route_user_00001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + day).toISOString() }
const body = {
  target: { kind: 'temporary_case', caseRef: 'gpc_route_case_00001' },
  catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
  location: { latitude: 31.230416, longitude: 121.473701 },
  window: { orientation: 'S', glassLayers: 'double' },
  soil: { state: 'wet', scope: 'root_zone', observedAt: new Date(now - 3.5 * day).toISOString() }
}
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
function send(port: number, text: string, headers: Record<string, string | string[]>) {
  return new Promise<{ status: number; body: { data?: { resultRef: string; result: { status: string } }; error?: { type: string; message: string } }; text: string }>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/api/v2/care/watering-advice`, { method: 'POST', headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode!, body: JSON.parse(raw), text: raw }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

async function start(principal: GuestPrincipalDto | UserPrincipalDto = guest, overrides: Partial<WateringAdviceRouteDependencies> = {}) {
  const stages: string[] = []
  const calls: CreateWateringAdviceApplicationInput[] = []
  const queries: OpenMeteoRadiationQuery[] = []
  const audits: unknown[] = []
  const dependencies: WateringAdviceRouteDependencies = {
    resolvePrincipal: async () => { stages.push('principal'); return principal },
    readOwnedCase: async input => { stages.push(`owned:${input.owner.kind}:${input.owner.caseRef}`); return 'owned' },
    readWateringPolicy: async () => { stages.push('policy'); return null },
    readPlantBaseline: async ref => { stages.push(`baseline:${ref}`); return { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } } },
    fetchRadiation: async query => { stages.push('radiation'); queries.push(query); return null },
    createWateringAdvice: async input => {
      stages.push('transaction'); calls.push(input)
      return { status: 200, body: { data: { resultRef: input.newResultRef, result: input.built.result } } }
    },
    createRef: kind => (kind === 'session' ? 'tcs_route_session_01' : 'cres_route_result_01'),
    now: () => now,
    writeAudit: event => { audits.push(event) },
    ...overrides
  }
  const dispatch = createRouteDispatcher([{ route: createWateringAdviceRoute, handler: createWateringAdviceRouteHandler(dependencies) }])
  const port = await listen(createServer((req, res) => { dispatch(req, res).catch(() => undefined) }))
  const post = (value: unknown = body, headers: Record<string, string | string[]> = {}, omit: readonly string[] = []) => {
    const merged: Record<string, string | string[]> = { 'content-type': 'application/json', authorization: `Bearer guest.${'A'.repeat(43)}`, 'idempotency-key': 'watering-key-0001', ...headers }
    for (const name of omit) { delete merged[name] }
    return send(port, typeof value === 'string' ? value : JSON.stringify(value), merged)
  }
  return { post, stages, calls, queries, audits }
}

describe('POST /api/v2/care/watering-advice 路由', () => {
  test('游客 Happy：顺序、命令、幂等作用域、降精度 Provider 查询；无策略 200 temporarily_unavailable', async () => {
    const f = await start()
    const response = await f.post()
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ resultRef: 'cres_route_result_01', result: { status: 'temporarily_unavailable' } })
    expect(f.stages).toEqual(['principal', 'owned:guest:gpc_route_case_00001', 'policy', 'baseline:https://tropicals.cn/species/epipremnum-aureum', 'radiation', 'transaction'])
    expect(f.queries).toEqual([{ latitude: 31.23, longitude: 121.47, pastDays: 4, forecastDays: 16 }])
    expect(f.calls[0]).toMatchObject({
      owner: { kind: 'guest', guestSessionRef: 'gst_route_session_001', caseRef: 'gpc_route_case_00001' },
      newSessionRef: 'tcs_route_session_01', newResultRef: 'cres_route_result_01', occurredAtMs: now,
      idempotency: { principalType: 'guest', principalScopeHash: createHash('sha256').update('gst_route_session_001').digest('hex'),
        httpMethod: 'POST', normalizedPath: '/api/v2/care/watering-advice', operationId: 'createWateringAdvice',
        idempotencyKeyHash: createHash('sha256').update('watering-key-0001').digest('hex'),
        requestHash: calculateCanonicalJsonSha256(body), createdAtMs: now, expiresAtMs: now + 168 * 3_600_000 }
    })
    expect(f.audits).toEqual([{ outcome: 'allowed' }])
  })

  test('R7 键顺序不同 → 同一请求摘要', async () => {
    const f = await start()
    const reordered = { window: body.window, soil: body.soil, location: { longitude: 121.473701, latitude: 31.230416 }, catalogTaxonRef: body.catalogTaxonRef, target: body.target }
    await f.post(body)
    await f.post(reordered)
    expect(f.calls[0]?.idempotency.requestHash).toBe(f.calls[1]?.idempotency.requestHash)
  })

  test('登录用户：epc_ 案例、user 作用域', async () => {
    const f = await start(user)
    const response = await f.post({ ...body, target: { kind: 'temporary_case', caseRef: 'epc_route_case_00001' } }, { authorization: 'Bearer user-session-bearer-0001' })
    expect(response.status).toBe(200)
    expect(f.calls[0]?.owner).toEqual({ kind: 'authenticated', userRef: 'usr_route_user_00001', caseRef: 'epc_route_case_00001' })
    expect(f.calls[0]?.idempotency).toMatchObject({ principalType: 'user', principalScopeHash: createHash('sha256').update('usr_route_user_00001').digest('hex') })
  })

  test('R1 user_plant → 400「长期植物浇水建议暂未开放」，不读策略不调 Provider', async () => {
    const f = await start(user)
    const response = await f.post({ ...body, target: { kind: 'user_plant', userPlantRef: 'upl_route_plant_0001' } }, { authorization: 'Bearer user-session-bearer-0001' })
    expect(response).toMatchObject({ status: 400, body: { error: { type: 'VALIDATION_FAILED', message: '长期植物浇水建议暂未开放' } } })
    expect(f.stages).toEqual(['principal'])
  })

  test.each([['非 JSON', '{'], ['未知字段', { ...body, userId: 'usr_x' }], ['时间晚于 now', { ...body, soil: { ...body.soil, observedAt: new Date(now + 60_000).toISOString() } }], ['缺 window', { target: body.target, catalogTaxonRef: body.catalogTaxonRef, location: body.location }]])('R2 %s → 400', async (_name, value) => {
    const f = await start()
    expect((await f.post(value)).status).toBe(400)
    expect(f.calls).toEqual([])
  })

  test('R3 缺/非法幂等头 → 400；缺 Bearer → 401', async () => {
    const f = await start()
    expect((await f.post(body, {}, ['idempotency-key'])).status).toBe(400)
    expect((await f.post(body, { 'idempotency-key': 'short' })).status).toBe(400)
    expect((await f.post(body, { 'idempotency-key': ['watering-key-0001', 'watering-key-0002'] })).status).toBe(400)
    expect((await f.post(body, {}, ['authorization'])).status).toBe(401)
    expect(f.calls).toEqual([])
  })

  test('R4 游客传 epc_ / 登录传 gpc_ / 归属 not_found → 404，不调 Provider', async () => {
    const guestWrong = await start()
    expect((await guestWrong.post({ ...body, target: { kind: 'temporary_case', caseRef: 'epc_route_case_00001' } })).status).toBe(404)
    const userWrong = await start(user)
    expect((await userWrong.post(body, { authorization: 'Bearer user-session-bearer-0001' })).status).toBe(404)
    const notOwned = await start(guest, { readOwnedCase: async () => 'not_found' })
    expect(await notOwned.post()).toMatchObject({ status: 404, body: { error: { type: 'NOT_FOUND' } } })
    for (const f of [guestWrong, userWrong, notOwned]) {
      expect(f.stages).not.toContain('radiation')
      expect(f.calls).toEqual([])
    }
  })

  test('R5 策略或基线读取抛错 → 503；Provider 抛错/不可用仍 200', async () => {
    const policyDown = await start(guest, { readWateringPolicy: async () => { throw new Error('db-internal-host') } })
    const policyResponse = await policyDown.post()
    expect(policyResponse.status).toBe(503)
    expect(policyResponse.text).not.toContain('db-internal-host')
    const baselineDown = await start(guest, { readPlantBaseline: async () => { throw new Error('db') } })
    expect((await baselineDown.post()).status).toBe(503)
    const providerDown = await start(guest, { fetchRadiation: async () => { throw new Error('network') } })
    expect((await providerDown.post()).status).toBe(200)
    expect(providerDown.calls).toHaveLength(1)
  })

  test('R6 无任何证据时回看 0 天', async () => {
    const f = await start()
    const { soil: _soil, ...withoutSoil } = body
    await f.post(withoutSoil)
    expect(f.queries[0]).toMatchObject({ pastDays: 0, forecastDays: 16 })
  })

  test('应用确定拒绝原样映射：409 / 404 / 503', async () => {
    for (const [status, type] of [[409, 'IDEMPOTENCY_CONFLICT'], [404, 'NOT_FOUND'], [503, 'SERVICE_UNAVAILABLE']] as const) {
      const f = await start(guest, { createWateringAdvice: async () => ({ status, body: { error: { type, message: '固定消息' } } }) })
      expect(await f.post()).toMatchObject({ status, body: { error: { type } } })
    }
  })

  test('S 响应与审计不含令牌、会话引用、幂等键、精确坐标', async () => {
    const f = await start()
    const response = await f.post()
    const observed = response.text + JSON.stringify(f.audits)
    for (const secret of ['A'.repeat(43), 'gst_route_session_001', 'watering-key-0001', '31.230416', 'gpc_route_case_00001']) {
      expect(observed).not.toContain(secret)
    }
    expect(Object.keys(response.body.data!).sort()).toEqual(['result', 'resultRef'])
  })
})

describe('care 服务接线', () => {
  test('POST watering-advice 无凭证 → 401 且不访问数据库与 Provider', async () => {
    let touched = false
    const server = createCareServer({
      connectionSource: { getConnection: async () => { touched = true; throw new Error('不应访问数据库') } },
      now: () => now,
      resolvePrincipal: async () => { touched = true; throw new Error('不应解析') },
      fetchRadiation: async () => { touched = true; return null },
      writeAudit: () => undefined,
      recordRollbackFailure: () => undefined
    })
    const port = await listen(server)
    const response = await send(port, JSON.stringify(body), { 'content-type': 'application/json', 'idempotency-key': 'watering-key-0001' })
    expect(response).toMatchObject({ status: 401, body: { error: { type: 'PRINCIPAL_INVALID' } } })
    expect(touched).toBe(false)
  })
})
