import { createHash } from 'node:crypto'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { ClaimGuestPlantCaseApplicationInput } from '../../src/user-plant/application/claim-guest-plant-case.js'
import { claimGuestPlantCaseRoute, createClaimGuestPlantCaseRouteHandler, type ClaimGuestPlantCaseRouteDependencies } from '../../src/user-plant/http/claim-guest-plant-case-route.js'
import { CapabilitySnapshotExpiredError, CapabilitySnapshotUnavailableError } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'

/**
 * unit_fake（L3）。Expected：guest-session-claim.md（2026-10-09 修订：请求体 guestToken、幂等键只走请求头、公开结果白名单、
 * claimedObjectKinds 按现有临时表）与 http-api 错误码表（GUEST_SESSION_NOT_CLAIMABLE 409、GUEST_SESSION_EXPIRED 410、
 * CAPABILITY_DENIED 403、CAPABILITY_SNAPSHOT_EXPIRED 409、IDEMPOTENCY_CONFLICT 409）；处理中→503（主代理 2026-10-09 裁决）。
 * 真实经过 node:http、冻结分发与固定请求链；身份、能力、应用用例与对象类别读取为替身。
 */
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const now = 3000
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_claimroute_owner1' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:09Z' }
const guestToken = 'G'.repeat(43)
const body = { guestSessionRef: 'gst_claimroute_session1', guestPlantCaseRef: 'gpc_claimroute_case0001', guestToken, target: { type: 'existing_user_plant', user_plant_id: 'upl_claimroute_existing' } }
const completed = { status: 'completed' as const, claimRef: 'gcl_claimroute_candidat', userPlantRef: 'upl_claimroute_existing', guestPlantCaseRef: 'gpc_claimroute_case0001', proofVersion: 1, claimedAtMs: now }
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })

async function start(overrides: Partial<ClaimGuestPlantCaseRouteDependencies> = {}) {
  const stages: string[] = []
  const calls: ClaimGuestPlantCaseApplicationInput[] = []
  const audits: unknown[] = []
  const dependencies: ClaimGuestPlantCaseRouteDependencies = {
    resolvePrincipal: async () => { stages.push('principal'); return principal },
    resolveCapabilitySnapshot: async () => { stages.push('capability'); return null },
    claimGuestPlantCase: async input => { stages.push('claim'); calls.push(input); return completed },
    readClaimedObjectKinds: async input => { stages.push(`kinds:${input.guestPlantCaseRef}`); return ['independent_watering_advice'] },
    createRef: kind => (kind === 'claim' ? 'gcl_claimroute_candidat' : 'upl_claimroute_newplant'),
    now: () => now,
    writeAudit: event => { audits.push(event) },
    ...overrides
  }
  const dispatch = createRouteDispatcher([{ route: claimGuestPlantCaseRoute, handler: createClaimGuestPlantCaseRouteHandler(dependencies) }])
  const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const post = (value: unknown = body, headers: Record<string, string | string[]> = {}, omit: readonly string[] = []) => new Promise<{ status: number; body: { data?: Record<string, unknown>; error?: { type: string; message: string } }; text: string }>((resolve, reject) => {
    const merged: Record<string, string | string[]> = { 'content-type': 'application/json', authorization: 'Bearer user-session-bearer-01', 'idempotency-key': 'claim-key-000001', ...headers }
    for (const name of omit) { delete merged[name] }
    const req = request(`http://127.0.0.1:${port}/api/v2/user-plants/claims`, { method: 'POST', headers: merged }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode!, body: JSON.parse(text), text }) })
    })
    req.on('error', reject)
    req.end(typeof value === 'string' ? value : JSON.stringify(value))
  })
  return { post, stages, calls, audits }
}

describe('POST /api/v2/user-plants/claims 路由', () => {
  test('已有目标 Happy：命令只含服务端可信字段；响应只含白名单四字段；首次 replayed=false', async () => {
    const f = await start()
    const response = await f.post()
    expect(response).toMatchObject({ status: 200, body: { data: { claimRef: 'gcl_claimroute_candidat', userPlantId: 'upl_claimroute_existing', claimedObjectKinds: ['independent_watering_advice'], replayed: false } } })
    expect(Object.keys(response.body.data!).sort()).toEqual(['claimRef', 'claimedObjectKinds', 'replayed', 'userPlantId'])
    expect(f.stages).toEqual(['principal', 'claim', 'kinds:gpc_claimroute_case0001'])
    expect(f.calls[0]).toEqual({
      principal,
      proof: { guestSessionRef: 'gst_claimroute_session1', possessionProof: guestToken, nowMs: now, proofRotationGraceSeconds: null },
      guestPlantCaseRef: 'gpc_claimroute_case0001',
      target: { type: 'existing_user_plant', user_plant_id: 'upl_claimroute_existing' },
      claimRef: 'gcl_claimroute_candidat',
      idempotencyKeyHash: sha('claim-key-000001')
    })
  })

  test('同键重放：应用返回原 claimRef（≠本次候选）→ replayed=true', async () => {
    const f = await start({ claimGuestPlantCase: async () => ({ ...completed, claimRef: 'gcl_claimroute_original' }) })
    expect((await f.post()).body.data).toMatchObject({ claimRef: 'gcl_claimroute_original', replayed: true })
  })

  test('新建目标：带服务端候选植物与能力快照（缺失为 null）', async () => {
    const f = await start({ claimGuestPlantCase: async input => { f.calls.push(input); return { ...completed, userPlantRef: 'upl_claimroute_newplant' } } })
    const response = await f.post({ ...body, target: { type: 'new_user_plant' } })
    expect(response.body.data).toMatchObject({ userPlantId: 'upl_claimroute_newplant' })
    expect(f.calls[0]).toMatchObject({ target: { type: 'new_user_plant' }, newUserPlantRef: 'upl_claimroute_newplant', capabilitySnapshot: null })
    expect(f.stages).toContain('capability')
  })

  // 合同（guest-session-claim.md，2026-10-10 用户裁决）：新建目标且快照已失效、无可重放原成功 → 409 CAPABILITY_SNAPSHOT_EXPIRED；
  // 已成功的同键重放不依赖当前快照；快照只是暂时读不到（非过期）仍为 503。
  const newTarget = { ...body, target: { type: 'new_user_plant' } }
  test('新建目标：能力快照已过期且事务因缺快照无法完成 → 409 CAPABILITY_SNAPSHOT_EXPIRED', async () => {
    const f = await start({ resolveCapabilitySnapshot: async () => { throw new CapabilitySnapshotExpiredError() }, claimGuestPlantCase: async () => ({ status: 'unavailable' }) as never })
    expect(await f.post(newTarget)).toMatchObject({ status: 409, body: { error: { type: 'CAPABILITY_SNAPSHOT_EXPIRED' } } })
  })

  test('新建目标：快照已过期但原成功可重放 → 200 replayed=true，不受快照影响', async () => {
    const f = await start({ resolveCapabilitySnapshot: async () => { throw new CapabilitySnapshotExpiredError() }, claimGuestPlantCase: async () => ({ ...completed, claimRef: 'gcl_claimroute_original1' }) })
    expect(await f.post(newTarget)).toMatchObject({ status: 200, body: { data: { replayed: true } } })
  })

  test('新建目标：快照暂时不可用（非过期）→ 仍为 503 SERVICE_UNAVAILABLE', async () => {
    const f = await start({ resolveCapabilitySnapshot: async () => { throw new CapabilitySnapshotUnavailableError() }, claimGuestPlantCase: async () => ({ status: 'unavailable' }) as never })
    expect(await f.post(newTarget)).toMatchObject({ status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE' } } })
  })

  test.each([
    ['not_claimable', 409, 'GUEST_SESSION_NOT_CLAIMABLE'], ['expired', 410, 'GUEST_SESSION_EXPIRED'], ['principal_invalid', 401, 'PRINCIPAL_INVALID'],
    ['idempotency_conflict', 409, 'IDEMPOTENCY_CONFLICT'], ['capability_denied', 403, 'CAPABILITY_DENIED'],
    ['capability_snapshot_expired', 409, 'CAPABILITY_SNAPSHOT_EXPIRED'], ['processing', 503, 'SERVICE_UNAVAILABLE'], ['unavailable', 503, 'SERVICE_UNAVAILABLE']
  ] as const)('应用结果 %s → %s %s，不读对象类别', async (status, code, type) => {
    const f = await start({ claimGuestPlantCase: async () => ({ status }) as never })
    expect(await f.post()).toMatchObject({ status: code, body: { error: { type } } })
    expect(f.stages.some(stage => stage.startsWith('kinds'))).toBe(false)
  })

  test.each([
    ['非 JSON', '{'], ['缺 guestToken', (({ guestToken: _t, ...rest }) => rest)(body)], ['令牌长度不符', { ...body, guestToken: 'G'.repeat(42) }],
    ['正文携带 idempotencyKey', { ...body, idempotencyKey: 'claim-key-000001' }], ['未知字段', { ...body, userId: 'usr_x' }],
    ['新建带植物引用', { ...body, target: { type: 'new_user_plant', user_plant_id: 'upl_claimroute_existing' } }]
  ])('DTO %s → 400，不调用用例', async (_name, value) => {
    const f = await start()
    expect((await f.post(value)).status).toBe(400)
    expect(f.calls).toEqual([])
  })

  test('缺/非法/重复 Idempotency-Key → 400；缺 Bearer → 401', async () => {
    const f = await start()
    expect((await f.post(body, {}, ['idempotency-key'])).status).toBe(400)
    expect((await f.post(body, { 'idempotency-key': 'short' })).status).toBe(400)
    expect((await f.post(body, { 'idempotency-key': ['claim-key-000001', 'claim-key-000002'] })).status).toBe(400)
    expect((await f.post(body, {}, ['authorization'])).status).toBe(401)
    expect(f.calls).toEqual([])
  })

  test('游客 Bearer 不能认领（authenticated 路由只接受登录主体）→ 401', async () => {
    const f = await start({ resolvePrincipal: async () => ({ principalType: 'guest' }) as never })
    expect((await f.post()).status).toBe(401)
    expect(f.calls).toEqual([])
  })

  test('脱敏：响应、审计不含游客令牌、user_id、会话引用、幂等键原文', async () => {
    const f = await start()
    const response = await f.post()
    const observed = response.text + JSON.stringify(f.audits)
    for (const secret of [guestToken, 'usr_claimroute_owner1', 'gst_claimroute_session1', 'claim-key-000001', 'user-session-bearer-01']) {
      expect(observed).not.toContain(secret)
    }
  })

  // 合同：claimedObjectKinds 必须如实说明已获派生归属的类别；读取失败不能用空列表冒充，返回 503，客户端用同一幂等键重放原收据。
  test('对象类别读取失败 → 503（不以空列表冒充），已提交认领可用同键重放', async () => {
    const f = await start({ readClaimedObjectKinds: async () => { throw new Error('db-internal') } })
    const response = await f.post()
    expect(response).toMatchObject({ status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE' } } })
    expect(response.text).not.toContain('db-internal')
  })
})
