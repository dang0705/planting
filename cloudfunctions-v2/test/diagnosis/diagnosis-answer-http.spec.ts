import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import {
  createDiagnosisAnswerRouteHandler,
  diagnosisAnswerRoute,
  projectDiagnosisAnswerResponse
} from '../../src/diagnosis/http/answer-route.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/** unit_fake / L3：真实Node HTTP；身份和事务用例为替身。Expected来自answer-http-contract，不证明MySQL或平台验真。 */
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
  const submit = vi.fn(async (input: any) =>
    projectDiagnosisAnswerResponse(input.diagnosisRef, { status: 'recorded', answerCount: 4 })
  )
  const resolve = vi.fn(async () => principal)
  const audit = vi.fn()
  const handler = createDiagnosisAnswerRouteHandler({ ...fixturePolicyPorts(),
    resolvePrincipal: resolve,
    submitAnswers: submit,
    now: () => 1000,
    writeAudit: audit
  })
  const server = createServer(createRouteDispatcher([{ route: diagnosisAnswerRoute, handler }]))
  servers.push(server)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/sessions/diagnosis-example/answers`
  const body = {
    userPlantRef: 'upl_owner123',
    requestMode: 'answer_submit',
    answers: [{ questionKey: 'soil_status', optionKey: 'unknown' }]
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
describe('问诊答案公开协议', () => {
  test('受控身份构造命令，返回答案确认，不包含内部结果', async () => {
    const f = await harness()
    const response = await f.post()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { diagnosisSessionRef: 'diagnosis-example', answersRecorded: true }
    })
    expect(f.submit.mock.calls[0]![0]).toMatchObject({
      userRef: principal.user_id,
      userPlantRef: f.body.userPlantRef,
      diagnosisRef: 'diagnosis-example',
      submitted: { requestMode: 'answer_submit', answers: f.body.answers }
    })
    expect(f.submit.mock.calls[0]![0].submitted).not.toHaveProperty('userPlantRef')
  })
  test.each([
    { user_id: 'usr_other' },
    { questionPackage: {} },
    { answers: [{ questionKey: 'soil_status', optionKey: 'unknown', internalId: 1 }] }
  ])('拒绝客户端越界字段 %j', async extra => {
    const f = await harness()
    expect((await f.post({ ...f.body, ...extra })).status).toBe(400)
    expect(f.submit).not.toHaveBeenCalled()
  })
  test('错误媒体类型和过大正文在认证之前拒绝', async () => {
    const f = await harness()
    expect((await f.post(f.body, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await f.post('x'.repeat(1048577))).status).toBe(413)
    expect(f.resolve).not.toHaveBeenCalled()
  })
  test('缺Bearer和幂等键不写入', async () => {
    const f = await harness()
    expect((await f.post(f.body, { authorization: '' })).status).toBe(401)
    expect((await f.post(f.body, { 'idempotency-key': '' })).status).toBe(400)
    expect(f.submit).not.toHaveBeenCalled()
  })
  test('未知异常及非法成功输出不公开原文', async () => {
    const f = await harness()
    f.submit.mockRejectedValueOnce(new Error('secret-db-password'))
    let r = await f.post()
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('secret-db-password')
    f.submit.mockResolvedValueOnce({
      status: 200,
      body: {
        data: { diagnosisSessionRef: 'diagnosis-example', answersRecorded: true, internalId: 99 }
      }
    } as any)
    r = await f.post()
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('internalId')
  })
  test('固定错误转发，损坏快照不冒充不存在', async () => {
    const f = await harness()
    f.submit.mockResolvedValueOnce(
      projectDiagnosisAnswerResponse('diagnosis-example', { status: 'invalid_snapshot' })
    )
    const r = await f.post()
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({
      error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' }
    })
  })
  test.each(['recorded', 'replayed'] as const)('首次和重放只投影相同确认 %s', status => {
    expect(projectDiagnosisAnswerResponse('diagnosis-example', { status, answerCount: 4 })).toEqual(
      {
        status: 200,
        body: { data: { diagnosisSessionRef: 'diagnosis-example', answersRecorded: true } }
      }
    )
  })
  test('不同答案不能覆盖已经记录的整包', () => {
    expect(projectDiagnosisAnswerResponse('diagnosis-example', { status: 'conflict' })).toEqual({
      status: 409,
      body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '已记录的答案不能覆盖' } }
    })
  })
  test('合法错误形状也不能携带依赖的敏感原文', async () => {
    const f = await harness()
    f.submit.mockResolvedValueOnce({
      status: 503,
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: 'secret-db-password' } }
    } as any)
    const r = await f.post()
    expect(r.status).toBe(503)
    expect(await r.text()).not.toContain('secret-db-password')
  })
})
