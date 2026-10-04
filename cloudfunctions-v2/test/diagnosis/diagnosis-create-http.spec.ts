import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import {
  createDiagnosisCreationRouteHandler,
  diagnosisCreationRoute
} from '../../src/diagnosis/http/create-session-route.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'

/** unit_fake / L3：真实Node HTTP；身份和事务用例为替身。Expected来自create-session-http-contract，不证明MySQL或平台验真。 */
const principal = {
  principalType: 'user',
  user_id: 'usr_owner123',
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-04T00:00:00Z',
  expiresAt: '2026-10-05T00:00:00Z'
} as UserPrincipalDto
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
async function harness() {
  const submit = vi.fn(async (_input: any) => ({
    status: 200,
    body: {
      data: {
        diagnosisSessionRef: 'dia_example123',
        mode: 'yellow_leaf',
        questionPackage: {
          questionCount: 1,
          questions: [
            {
              questionKey: 'question',
              text: '题目',
              inputKind: 'choice',
              options: [{ optionKey: 'unknown', text: '不确定' }]
            }
          ]
        }
      }
    }
  }))
  const resolve = vi.fn(async () => principal)
  const audit = vi.fn()
  const handler = createDiagnosisCreationRouteHandler({
    resolvePrincipal: resolve,
    createSession: submit,
    now: () => 1000,
    writeAudit: audit
  })
  const server = createServer(createRouteDispatcher([{ route: diagnosisCreationRoute, handler }]))
  servers.push(server)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/sessions`
  const body = {
    userPlantRef: 'upl_owner123',
    mode: 'yellow_leaf'
  }
  const post = (value: unknown = body, headers: Record<string, string> = {}) =>
    fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token-example',
        'idempotency-key': 'key-example-123',
        ...headers
      },
      body: typeof value === 'string' ? value : JSON.stringify(value)
    })
  return { submit, resolve, audit, post, body }
}
describe('V1复用固定会话创建协议', () => {
  test('身份域主体构造命令，客户端不能指定题包', async () => {
    const f = await harness()
    const r = await f.post()
    expect(r.status).toBe(200)
    const body = (await r.json()) as { data: { diagnosisSessionRef: string } }
    expect(body.data.diagnosisSessionRef).toBe('dia_example123')
    expect(f.submit.mock.calls[0]![0]).toMatchObject({
      userRef: principal.user_id,
      userPlantRef: f.body.userPlantRef,
      mode: 'yellow_leaf',
      startedAtMs: 1000
    })
  })
  test.each([
    { user_id: 'usr_other' },
    { questionPackage: {} },
    { mode: 'root_rot' },
    { mode: 'specific_pest_visual' }
  ])('拒绝额外内容或非固定入口 %j', async extra => {
    const f = await harness()
    expect((await f.post({ ...f.body, ...extra })).status).toBe(400)
    expect(f.submit).not.toHaveBeenCalled()
  })
  test('缺身份或幂等头不创建', async () => {
    const f = await harness()
    expect((await f.post(f.body, { authorization: '' })).status).toBe(401)
    expect((await f.post(f.body, { 'idempotency-key': '' })).status).toBe(400)
    expect(f.submit).not.toHaveBeenCalled()
  })
  test('媒体类型和过大正文在身份前拒绝', async () => {
    const f = await harness()
    expect((await f.post(f.body, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await f.post('x'.repeat(1048577))).status).toBe(413)
    expect(f.resolve).not.toHaveBeenCalled()
  })
  test('内部字段不能穿透成功响应', async () => {
    const f = await harness()
    f.submit.mockResolvedValueOnce({
      status: 200,
      body: {
        data: {
          diagnosisSessionRef: 'dia_example123',
          mode: 'yellow_leaf',
          questionPackage: { questionCount: 1, questions: [] },
          releaseRef: 'secret'
        }
      }
    } as any)
    const r = await f.post()
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('secret')
  })
  test('依赖错误原文不公开', async () => {
    const f = await harness()
    f.submit.mockRejectedValueOnce(new Error('secret-password'))
    const r = await f.post()
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('secret-password')
  })
})
