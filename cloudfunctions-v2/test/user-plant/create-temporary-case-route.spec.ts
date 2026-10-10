import { createHash } from 'node:crypto'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'

import type { GuestPrincipalDto, GuestSessionRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import type { CreateTemporaryCaseApplicationInput } from '../../src/user-plant/application/create-temporary-case.js'
import {
  createTemporaryCaseRoute,
  createTemporaryCaseRouteHandler,
  type CreateTemporaryCaseRouteDependencies
} from '../../src/user-plant/http/create-temporary-case-route.js'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * unit_fake（L3）。Expected：temporary-case-contract.md §1–§3、http-api 公共合同（415/413）；测试矩阵 R1–R6、S1。
 * 真实经过 node:http、冻结路由分发与固定请求链；主体解析、策略读取与应用用例为替身。不证明 MySQL。
 */
const now = Date.UTC(2026, 9, 9, 4)
const hour = 3_600_000
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const guest: GuestPrincipalDto = {
  principalType: 'guest', guestSessionRef: 'gst_route_session_001' as GuestSessionRef, authProvider: 'server_issued_guest_token',
  issuedAt: new Date(now - hour).toISOString(), expiresAt: new Date(now + 24 * hour).toISOString()
}
const user: UserPrincipalDto = {
  principalType: 'user', user_id: 'usr_route_user_00001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: new Date(now - hour).toISOString(), expiresAt: new Date(now + 24 * hour).toISOString()
}
const guestToken = `guest.${'A'.repeat(43)}`
const policy = { guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168 }
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function send(port: number, body: string, headers: Record<string, string | string[]>) {
  return new Promise<{ status: number; body: unknown; text: string }>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/api/v2/user-plants/temporary-cases`, { method: 'POST', headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode!, body: JSON.parse(text), text }) })
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function start(principal: GuestPrincipalDto | UserPrincipalDto = guest, overrides: Partial<CreateTemporaryCaseRouteDependencies> = {}, useDefaultCaseRef = false) {
  const stages: string[] = []
  const calls: CreateTemporaryCaseApplicationInput[] = []
  const audits: unknown[] = []
  const dependencies: CreateTemporaryCaseRouteDependencies = { ...fixturePolicyPorts(),
    resolvePrincipal: async () => { stages.push('principal'); return principal },
    readLimitsPolicy: async capturedAt => { stages.push(`policy:${capturedAt}`); return policy as never },
    createTemporaryCase: async input => {
      stages.push('transaction'); calls.push(input)
      const ownerKind = input.principal.principalType === 'guest' ? 'guest' : 'authenticated'
      return { status: 200, body: { data: { caseRef: input.newCaseRef, ownerKind, expiresAt: new Date(now + 24 * hour).toISOString() } } }
    },
    createCaseRef: ownerKind => (ownerKind === 'guest' ? 'gpc_route_case_00001' : 'epc_route_case_00001'),
    now: () => now,
    writeAudit: event => { audits.push(event) },
    ...overrides
  }
  if (useDefaultCaseRef) { delete (dependencies as { createCaseRef?: unknown }).createCaseRef }
  const dispatch = createRouteDispatcher([{ route: createTemporaryCaseRoute, handler: createTemporaryCaseRouteHandler(dependencies) }])
  const port = await listen(createServer((req, res) => { dispatch(req, res).catch(() => undefined) }))
  const post = (body = '{}', headers: Record<string, string | string[]> = {}, omit: readonly string[] = []) => {
    const merged: Record<string, string | string[]> = {
      'content-type': 'application/json', authorization: `Bearer ${guestToken}`, 'idempotency-key': 'temp-case-key-0001', ...headers
    }
    for (const name of omit) { delete merged[name] }
    return send(port, body, merged)
  }
  return { post, stages, calls, audits }
}

describe('POST /api/v2/user-plants/temporary-cases 路由', () => {
  test('R6 游客命令：guest 作用域、gpc_ 引用、键只以摘要进入；响应只含三字段', async () => {
    const f = await start()
    const response = await f.post()
    expect(response).toMatchObject({ status: 200, body: { data: { caseRef: 'gpc_route_case_00001', ownerKind: 'guest', expiresAt: new Date(now + 24 * hour).toISOString() } } })
    expect(Object.keys((response.body as { data: object }).data).sort()).toEqual(['caseRef', 'expiresAt', 'ownerKind'])
    expect(f.stages).toEqual(['principal', `policy:${new Date(now).toISOString()}`, 'transaction'])
    expect(f.calls[0]).toEqual({
      principal: guest,
      limits: policy,
      newCaseRef: 'gpc_route_case_00001',
      occurredAtMs: now,
      idempotency: {
        principalType: 'guest', principalScopeHash: sha('gst_route_session_001'), httpMethod: 'POST',
        normalizedPath: '/api/v2/user-plants/temporary-cases', operationId: 'createTemporaryCase',
        idempotencyKeyHash: sha('temp-case-key-0001'), requestHash: sha('{}'),
        createdAtMs: now, expiresAtMs: now + 168 * hour
      }
    })
    expect(f.audits).toEqual([{ outcome: 'allowed' }])
  })

  test('R6 登录命令：user 作用域、epc_ 引用', async () => {
    const f = await start(user)
    const response = await f.post('{}', { authorization: 'Bearer user-session-bearer-0001' })
    expect(response.status).toBe(200)
    expect(f.calls[0]?.newCaseRef).toBe('epc_route_case_00001')
    expect(f.calls[0]?.idempotency).toMatchObject({ principalType: 'user', principalScopeHash: sha('usr_route_user_00001') })
  })

  test('默认引用生成器：游客 gpc_、登录 epc_，高熵且不超过 64 字符', async () => {
    const guestRoute = await start(guest, {}, true)
    await guestRoute.post()
    const userRoute = await start(user, {}, true)
    await userRoute.post('{}', { authorization: 'Bearer user-session-bearer-0001' })
    expect(guestRoute.calls[0]?.newCaseRef).toMatch(/^gpc_[A-Za-z0-9_-]{22,60}$/u)
    expect(userRoute.calls[0]?.newCaseRef).toMatch(/^epc_[A-Za-z0-9_-]{22,60}$/u)
  })

  test.each(['{', '[]', 'null', '{"ownerKind":"guest"}', '{"user_id":"usr_x"}', '"x"'])('R1 正文 %s → 400，不读策略不进事务', async body => {
    const f = await start()
    const response = await f.post(body)
    expect(response).toMatchObject({ status: 400, body: { error: { type: 'VALIDATION_FAILED' } } })
    expect(f.stages).toEqual(['principal'])
  })

  test.each([[{ 'idempotency-key': '' }], [{ 'idempotency-key': 'short' }], [{ 'idempotency-key': 'a'.repeat(129) }], [{ 'idempotency-key': ['temp-case-key-0001', 'temp-case-key-0002'] }]])('R2 幂等头非法 %j → 400', async headers => {
    const f = await start()
    expect((await f.post('{}', headers)).status).toBe(400)
    expect(f.calls).toEqual([])
  })

  test('R2 缺 Idempotency-Key → 400', async () => {
    const f = await start()
    const missing = await f.post('{}', {}, ['idempotency-key'])
    expect(missing.status).toBe(400)
    expect(f.calls).toEqual([])
  })

  test('R3 缺 Bearer → 401，不解析主体', async () => {
    const f = await start()
    expect((await f.post('{}', { authorization: '' })).status).toBe(401)
    expect(f.stages).toEqual([])
  })

  test('R3 主体解析 PRINCIPAL_INVALID → 401；游客主体已过期 → 401', async () => {
    const rejected = await start(guest, { resolvePrincipal: async () => { throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '游客会话无效或已过期') } })
    expect(await rejected.post()).toMatchObject({ status: 401, body: { error: { type: 'PRINCIPAL_INVALID' } } })
    expect(rejected.calls).toEqual([])
    const expired = await start({ ...guest, expiresAt: new Date(now).toISOString() })
    expect((await expired.post()).status).toBe(401)
    expect(expired.calls).toEqual([])
  })

  test('R4 无策略发布 → 503；读取抛错 → 503；均不进事务', async () => {
    const missing = await start(guest, { readLimitsPolicy: async () => null })
    expect(await missing.post()).toMatchObject({ status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE' } } })
    expect(missing.calls).toEqual([])
    const failing = await start(guest, { readLimitsPolicy: async () => { throw new Error('select failed at host db-internal') } })
    const response = await failing.post()
    expect(response.status).toBe(503)
    expect(response.text).not.toContain('db-internal')
    expect(failing.calls).toEqual([])
  })

  test('R5 媒体类型错误 → 415；超大正文 → 413；均在认证前', async () => {
    const f = await start()
    expect((await f.post('{}', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await f.post(`{"a":"${'x'.repeat(1_048_577)}"}`)).status).toBe(413)
    expect(f.stages).toEqual([])
  })

  test('应用用例确定拒绝原样映射：409 上限 / 409 幂等冲突 / 401 / 503', async () => {
    for (const [status, type] of [[409, 'TEMPORARY_CASE_LIMIT_REACHED'], [409, 'IDEMPOTENCY_CONFLICT'], [401, 'PRINCIPAL_INVALID'], [503, 'SERVICE_UNAVAILABLE']] as const) {
      const f = await start(guest, { createTemporaryCase: async () => ({ status, body: { error: { type, message: '固定消息' } } }) })
      expect(await f.post()).toMatchObject({ status, body: { error: { type, message: '固定消息' } } })
      // 审计分类沿用 foundation 请求链既有规则（request-chain.ts：status ≥ 500 记 failed，其余记 denied）。
      expect(f.audits).toEqual([{ outcome: status >= 500 ? 'failed' : 'denied', errorType: type }])
    }
  })

  test('应用用例返回不合合同的成功体 → 500，不外泄', async () => {
    const f = await start(guest, { createTemporaryCase: async () => ({ status: 200, body: { data: { caseRef: 'epc_route_case_00001', ownerKind: 'guest', expiresAt: 'x', user_id: 'usr_route_user_00001' } } }) })
    const response = await f.post()
    expect(response.status).toBe(500)
    expect(response.text).not.toContain('usr_route_user_00001')
  })

  test('S1 响应与审计不含令牌、user_id、会话引用与幂等键原文', async () => {
    const f = await start(user)
    const response = await f.post('{}', { authorization: 'Bearer user-session-bearer-0001' })
    const observed = response.text + JSON.stringify(f.audits)
    for (const secret of ['user-session-bearer-0001', 'usr_route_user_00001', 'temp-case-key-0001', 'gst_route_session_001']) {
      expect(observed).not.toContain(secret)
    }
  })
})

describe('user-plant 服务接线', () => {
  test('POST temporary-cases 无凭证 → 401 且不访问数据库（路由已接入，不是 404/405）', async () => {
    let connectionRequested = false
    const server = createUserPlantServer({ ...fixturePolicyPorts(),
      connectionSource: { getConnection: async () => { connectionRequested = true; throw new Error('不应访问数据库') } },
      now: () => now,
      resolveCapabilitySnapshot: async () => { throw new Error('不应解析能力') },
      writeAudit: () => undefined,
      recordRollbackFailure: () => undefined
    })
    const port = await listen(server)
    const response = await send(port, '{}', { 'content-type': 'application/json', 'idempotency-key': 'temp-case-key-0001' })
    expect(response).toMatchObject({ status: 401, body: { error: { type: 'PRINCIPAL_INVALID' } } })
    expect(connectionRequested).toBe(false)
  })
})
