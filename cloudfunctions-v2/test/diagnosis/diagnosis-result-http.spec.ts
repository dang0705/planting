import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test, vi } from 'vitest'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import {
  createDiagnosisResultRouteHandler,
  diagnosisResultRoute
} from '../../src/diagnosis/http/result-route.js'
import { diagnosisPublicResultFixture } from '../support/diagnosis-public-result-fixture.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'
/** L3/unit_fake：真实Node HTTP/请求链/公开Schema，替换身份和归属查询。Expected来自冻结result-http及结果Schema，未证明MySQL、平台验真或生成结果。 */
const publicResultFixture = () => structuredClone(diagnosisPublicResultFixture)
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      s =>
        new Promise<void>(r => {
          s.closeAllConnections()
          s.close(() => r())
        })
    )
  )
})
const user = {
  principalType: 'user',
  user_id: 'usr_owner123',
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-04T00:00:00Z',
  expiresAt: '2026-10-05T00:00:00Z'
} as UserPrincipalDto
async function fixture() {
  const read = vi.fn(async () => ({ status: 'found' as const, data: publicResultFixture() })),
    resolve = vi.fn(async () => user),
    audit = vi.fn()
  const server = createServer(
    createRouteDispatcher([
      {
        route: diagnosisResultRoute,
        handler: createDiagnosisResultRouteHandler({
          resolvePrincipal: resolve,
          getResult: read,
          now: () => 1000,
          writeAudit: audit
        })
      }
    ])
  )
  servers.push(server)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/sessions/diagnosis-example/result`
  return {
    read,
    resolve,
    audit,
    get: (
      path = base,
      headers: Record<string, string> = { authorization: 'Bearer fixture-token' }
    ) => fetch(path, { headers }),
    base
  }
}
test('公开结果直接位于data，只有本人精确会话查询一次，无写幂等键', async () => {
  const f = await fixture(),
    r = await f.get()
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ data: publicResultFixture() })
  expect(f.read).toHaveBeenCalledWith({
    userRef: 'usr_owner123',
    diagnosisRef: 'diagnosis-example'
  })
  expect(f.read).toHaveBeenCalledTimes(1)
})
test('无凭证401且不读库；非法路径400', async () => {
  const f = await fixture()
  expect((await f.get(f.base, {})).status).toBe(401)
  expect(f.read).not.toHaveBeenCalled()
  expect((await f.get(f.base.replace('diagnosis-example', 'short'))).status).toBe(400)
  expect(f.read).not.toHaveBeenCalled()
})
test.each([
  ['not_found', 404],
  ['unavailable', 503]
] as const)('%s公开错误不伪造结果', async (status, expected) => {
  const f = await fixture()
  f.read.mockResolvedValueOnce({ status } as never)
  const r = await f.get()
  expect(r.status).toBe(expected)
  expect(await r.json()).toEqual({
    error: {
      type: status === 'not_found' ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE',
      message: status === 'not_found' ? '诊断结果不存在' : '诊断结果暂不可用'
    }
  })
})
test('内部字段不允许通过公开投影；原异常与令牌不进入日志', async () => {
  const f = await fixture()
  f.read.mockResolvedValueOnce({
    status: 'found',
    data: { ...publicResultFixture(), replay: { secret: 'forbidden' } }
  } as never)
  const r = await f.get()
  expect(r.status).toBe(500)
  expect(JSON.stringify(await r.json())).not.toContain('forbidden')
  expect(JSON.stringify(f.audit.mock.calls)).not.toContain('fixture-token')
})
test('合法游客分支未接入返回503，不冒充401、不读长期记录', async () => {
  const f = await fixture()
  f.resolve.mockResolvedValueOnce({ principalType: 'guest', guest_id: 'guest-fixture' } as never)
  expect((await f.get()).status).toBe(503)
  expect(f.read).not.toHaveBeenCalled()
})
