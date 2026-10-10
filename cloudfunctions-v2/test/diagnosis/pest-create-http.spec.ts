import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test, vi } from 'vitest'
import {
  createDiagnosisCreationRouteHandler,
  diagnosisCreationRoute
} from '../../src/diagnosis/http/create-session-route.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/** unit_fake/L3。来源：pest-create-http-contract.md；真实Node HTTP请求链，身份与事务为替身。
 * 不证明MySQL、视觉准入或真实平台验真；错误/额外字段不得触发应用写入。
 */
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      s =>
        new Promise<void>(resolve => {
          s.closeAllConnections()
          s.close(() => resolve())
        })
    )
  )
})
async function harness(enabled = true) {
  const data = {
    diagnosisSessionRef: 'dia_example123',
    mode: 'specific_pest_visual',
    questionPackage: {
      questionCount: 1,
      questions: [
        {
          questionKey: 'whitefly_adults',
          text: '是否可见白色小虫？',
          inputKind: 'choice',
          options: [{ optionKey: 'unknown', text: '不确定' }],
          riskLevel: 'low',
          riskNotice: '不方便操作时请跳过',
          safetyInstructions: ['只观察叶背'],
          requiresExplicitConsent: false,
          skipOptionEnabled: true
        }
      ]
    }
  }
  const fixed = vi.fn(),
    pest = vi.fn(async (_input: unknown) => ({ status: 200, body: { data } })),
    audit = vi.fn()
  const handler = createDiagnosisCreationRouteHandler({ ...fixturePolicyPorts(),
    resolvePrincipal: async () =>
      ({ principalType: 'user', user_id: 'usr_owner123' }) as UserPrincipalDto,
    createSession: fixed,
    ...(enabled ? { createPestSession: pest } : {}),
    now: () => 1500,
    writeAudit: audit
  })
  const server = createServer(createRouteDispatcher([{ route: diagnosisCreationRoute, handler }]))
  servers.push(server)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/sessions`
  const body = {
    userPlantRef: 'upl_owner123',
    mode: 'specific_pest_visual',
    assetRef: 'upa_owner123'
  }
  const post = (value: unknown = body, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer example-token',
        'idempotency-key': 'pest-request-123',
        ...headers
      },
      body: JSON.stringify(value)
    })
  return { body, data, fixed, pest, audit, post }
}
test('虫害HTTP接统一用户和私有资产，返回完整安全题包', async () => {
  const f = await harness(),
    r = await f.post()
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ data: f.data })
  expect(f.pest.mock.calls[0]![0]).toMatchObject({
    userRef: 'usr_owner123',
    userPlantRef: 'upl_owner123',
    mode: 'pest',
    assetRef: 'upa_owner123',
    startedAtMs: 1500
  })
  expect(f.fixed).not.toHaveBeenCalled()
  expect(JSON.stringify(f.audit.mock.calls)).not.toMatch(/example-token|upa_owner123/)
})
test.each([
  { tier: 'high' },
  { candidateModes: ['whitefly'] },
  { output: {} },
  { lockedEvidenceKeys: [] },
  { user_id: 'other' },
  { startedAtMs: 1 },
  { questionPackage: {} }
])('客户端额外字段%j拒绝', async patch => {
  const f = await harness()
  expect((await f.post({ ...f.body, ...patch })).status).toBe(400)
  expect(f.pest).not.toHaveBeenCalled()
})
test.each([undefined, null, '', ' '])('缺失或非法资产%j拒绝', async assetRef => {
  const f = await harness()
  expect((await f.post({ ...f.body, assetRef })).status).toBe(400)
  expect(f.pest).not.toHaveBeenCalled()
})
test('固定症状不能夹带私有资产', async () => {
  const f = await harness()
  expect((await f.post({ ...f.body, mode: 'yellow_leaf' })).status).toBe(400)
  expect(f.fixed).not.toHaveBeenCalled()
})
test('无受控虫害用例时503，不改走固定题包', async () => {
  const f = await harness(false)
  expect((await f.post()).status).toBe(503)
  expect(f.fixed).not.toHaveBeenCalled()
})
test('缺身份或幂等键不能创建', async () => {
  const f = await harness()
  expect((await f.post(f.body, { authorization: '' })).status).toBe(401)
  expect((await f.post(f.body, { 'idempotency-key': '' })).status).toBe(400)
  expect(f.pest).not.toHaveBeenCalled()
})
test.each(['riskNotice', 'safetyInstructions', 'requiresExplicitConsent', 'skipOptionEnabled'])(
  '成功题包缺%s拒绝公开',
  async field => {
    const f = await harness()
    delete (f.data.questionPackage.questions[0] as any)[field]
    expect((await f.post()).status).toBe(500)
  }
)
test('其他模式或空题包不能冒充虫害成功', async () => {
  const f = await harness()
  f.data.mode = 'yellow_leaf'
  expect((await f.post()).status).toBe(500)
  const g = await harness()
  g.data.questionPackage.questions = []
  expect((await g.post()).status).toBe(500)
})
test('内部字段和Provider错误原文不穿透', async () => {
  const f = await harness()
  Object.assign(f.data, { assetRef: 'private-secret' })
  const r = await f.post()
  expect(r.status).toBe(500)
  expect(await r.text()).not.toContain('private-secret')
  const g = await harness()
  g.pest.mockRejectedValueOnce(new Error('provider-secret'))
  const e = await g.post()
  expect(e.status).toBe(500)
  expect(await e.text()).not.toContain('provider-secret')
})
