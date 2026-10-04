import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test } from 'vitest'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { createAuthenticatedEphemeralBindingRouteHandler, authenticatedEphemeralBindingRoute, type AuthenticatedEphemeralBindingRouteDependencies } from '../../src/user-plant/http/authenticated-ephemeral-binding-route.js'
import type { AuthenticatedEphemeralBindingApplicationInput } from '../../src/user-plant/application/bind-authenticated-ephemeral-case.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'

/** L3/unit_fake；Expected来自绑定HTTP合同。真实Node HTTP/固定链，身份、归属与事务应用为替身；不证明MySQL或真实登录。 */
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_binding_owner001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:10Z' }
const caseRef = 'epc_binding_case001', plantRef = 'upl_binding_target001'
const success = { status: 'bound' as const, promotionRef: 'prm_generated_server001', userPlantRef: plantRef, boundAtMs: 2000 }
const servers: Server[] = []
afterEach(async () => { for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())) } })
async function start(overrides: Partial<AuthenticatedEphemeralBindingRouteDependencies> = {}) {
  const calls: AuthenticatedEphemeralBindingApplicationInput[] = [], stages: string[] = [], audits: unknown[] = []
  const d: AuthenticatedEphemeralBindingRouteDependencies = {
    maxBodyBytes: 1024, now: () => 2000, createPromotionRef: () => 'prm_generated_server001',
    resolvePrincipal: async () => { stages.push('identity'); return principal },
    readOwnedCase: async () => { stages.push('ownership'); return { status: 'owned' } },
    bindExisting: async input => { calls.push(input); stages.push('transaction'); return success },
    writeAudit: e => { audits.push(e) }, ...overrides
  }
  const dispatch = createRouteDispatcher([{ route: authenticatedEphemeralBindingRoute, handler: createAuthenticatedEphemeralBindingRouteHandler(d) }])
  const s = createServer((req, res) => { dispatch(req, res).catch(() => undefined) }); servers.push(s)
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r))
  const send = (body: string = JSON.stringify({ target: { type: 'existing_user_plant', user_plant_id: plantRef } }), headers: Record<string, string | string[]> = {}, ref = caseRef) => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/v2/user-plants/ephemeral-cases/${ref}/bindings`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer trusted-token', 'idempotency-key': 'binding-key-001', ...headers } }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }))
    }); req.on('error', reject); req.end(body)
  })
  return { send, calls, stages, audits }
}
test('本人绑定只投影目标引用，顺序和可信命令无客户端身份时间', async () => {
  const f = await start(); expect(await f.send()).toEqual({ status: 200, body: { data: { user_plant_id: plantRef } } })
  expect(f.stages).toEqual(['identity', 'ownership', 'transaction']); expect(f.calls).toHaveLength(1)
  expect(f.calls[0]).toEqual({ principal, command: { ephemeralCaseRef: caseRef, targetUserPlantRef: plantRef, promotionRef: 'prm_generated_server001', occurredAtMs: 2000, idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/u) } })
  expect(f.audits).toEqual([{ outcome: 'allowed' }]); expect(JSON.stringify(f.audits)).not.toContain('trusted-token')
})
test('缺发布限制首先503，认证归属写入均不发生', async () => {
  const f = await start({ maxBodyBytes: null }); expect((await f.send()).status).toBe(503); expect(f.stages).toEqual([])
})
test.each([['text/plain', 415], ['application/json', 413]] as const)('媒体/大小先于认证：%s', async (media, status) => {
  const f = await start({ maxBodyBytes: 8 }); expect((await f.send('x'.repeat(9), { 'content-type': media })).status).toBe(status); expect(f.stages).toEqual([])
})
test('缺Bearer先401，归属与事务不发生', async () => {
  const f = await start(); expect((await f.send('{}', { authorization: '' })).status).toBe(401); expect(f.stages).toEqual([])
})
test('过期统一主体先401，不能访问案例归属', async () => {
  const f = await start({ resolvePrincipal: async () => ({ ...principal, expiresAt: '1970-01-01T00:00:02Z' }) }); expect((await f.send()).status).toBe(401); expect(f.stages).toEqual([])
})
test('他人或不存在案例先404而不解析畸形正文或调用事务', async () => {
  const f = await start({ readOwnedCase: async () => ({ status: 'not_found' }) }); expect(await f.send('{')).toEqual({ status: 404, body: { error: { type: 'NOT_FOUND', message: '案例或用户植物不存在' } } }); expect(f.calls).toEqual([])
})
test.each(['{', '{}', '{"target":{"type":"new_user_plant"}}', `{"target":{"type":"existing_user_plant","user_plant_id":"${plantRef}","userRef":"usr_other"}}`, `{"target":{"type":"existing_user_plant","user_plant_id":"${plantRef}"},"occurredAtMs":0}`])('严格正文拒绝且无事务：%s', async body => {
  const f = await start(); expect((await f.send(body)).status).toBe(400); expect(f.calls).toEqual([])
})
test.each(['short', 'é'.repeat(8), 'a'.repeat(129), ['key-first-001', 'key-second-001']].map(key => ({ key })))('非法或重复幂等头不写：%j', async ({ key }) => {
  const f = await start(); expect((await f.send(undefined, { 'idempotency-key': key })).status).toBe(400); expect(f.calls).toEqual([])
})
test.each([['not_found', 404, 'NOT_FOUND'], ['expired', 409, 'EPHEMERAL_CASE_NOT_BINDABLE'], ['already_bound', 409, 'EPHEMERAL_CASE_NOT_BINDABLE'], ['idempotency_conflict', 409, 'IDEMPOTENCY_CONFLICT'], ['unavailable', 503, 'SERVICE_UNAVAILABLE'], ['principal_invalid', 401, 'PRINCIPAL_INVALID']] as const)('应用拒绝映射：%s', async (status, code, type) => {
  const f = await start({ bindExisting: async () => ({ status }) }); const r = await f.send(); expect(r.status).toBe(code); expect(r.body).toMatchObject({ error: { type } })
})
test.each([{ ...success, secret: 'restricted' }, { ...success, userPlantRef: 'upl_wrong_target001' }, { ...success, boundAtMs: 2001 }, { status: 'unknown', raw: 'restricted' }])('损坏或跨目标结果不能公开成功：%j', async result => {
  const f = await start({ bindExisting: async () => result as never }); expect(await f.send()).toEqual({ status: 500, body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } } })
})
test('历史成功时间可更早，响应保留目标不暴露命令时间', async () => {
  const f = await start({ bindExisting: async () => ({ ...success, boundAtMs: 1500 }) }); expect(await f.send()).toEqual({ status: 200, body: { data: { user_plant_id: plantRef } } })
})
test('服务端命令引用损坏不能因宽松字符串转换进入事务', async () => {
  const f = await start({ createPromotionRef: () => undefined as never }); expect((await f.send()).status).toBe(500); expect(f.calls).toEqual([])
})
