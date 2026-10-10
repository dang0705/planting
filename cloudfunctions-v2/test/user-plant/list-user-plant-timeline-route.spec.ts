import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import type { ListUserPlantTimelineInput } from '../../src/user-plant/application/list-user-plant-timeline.js'
import { encodeTimelineCursor } from '../../src/user-plant/domain/timeline.js'
import { createListUserPlantTimelineRouteHandler, listUserPlantTimelineRoute } from '../../src/user-plant/http/list-user-plant-timeline-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-timeline.md §3 / §6（2026-10-10 用户审定）：查询只有 limit（1～50，缺省 20）与 cursor；
 * 成功 200 `{ data: { items, nextCursor } }`；跨用户/不存在 404 USER_PLANT_NOT_FOUND；摘要不含内部字段。
 * 测试层次：L2/L3 `unit_fake`（真实 node:http、分发、请求链、Bearer 认证器与 AJV；替换会话解析与列表用例）。
 */
const nowMs = Date.UTC(2026, 9, 10, 13)
const ownerRef = 'usr_timeline_owner001' as UserRef
const plantRef = 'upl_timeline_plant001'
const principal: UserPrincipalDto = { principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z' }
const item = { timelineItemRef: `tli_${'a'.repeat(40)}`, itemType: 'care_watering', occurredAt: '2026-10-09T08:00:00.000Z', summary: { itemType: 'care_watering', amountMl: 200 } }

let server: Server | undefined
async function startService(result?: HttpIdempotencyPublicResponseSnapshot) {
  const calls: ListUserPlantTimelineInput[] = []
  const dispatch = createRouteDispatcher([{ route: listUserPlantTimelineRoute, handler: createListUserPlantTimelineRouteHandler({ ...fixturePolicyPorts(),
    authenticate: createUserBearerAuthenticator(async () => principal), now: () => nowMs, writeAudit: () => undefined,
    listTimeline: async input => { calls.push(input); return result ?? { status: 200, body: { data: { items: [item], nextCursor: null } } } }
  }) }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const get = (query = '', ref = plantRef) => fetch(`${baseUrl}/api/v2/user-plants/${ref}/timeline${query}`, { headers: { authorization: 'Bearer timeline-bearer-0123456789' } })
  return { get, calls }
}
afterEach(async () => { await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve())); server = undefined })

describe('GET …/timeline 路由协议合同', () => {
  test('缺省：每页 20、无游标；200 原样返回', async () => {
    const service = await startService()
    const response = await service.get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { items: [item], nextCursor: null } })
    expect(service.calls).toEqual([{ principal, userPlantRef: plantRef, limit: 20, after: null }])
  })

  test('合法游标与 limit 边界', async () => {
    const service = await startService()
    const cursor = encodeTimelineCursor({ occurredAtMs: 1000, timelineItemRef: `tli_${'b'.repeat(40)}` })
    expect((await service.get(`?limit=50&cursor=${cursor}`)).status).toBe(200)
    expect(service.calls[0]).toMatchObject({ limit: 50, after: { occurredAtMs: 1000, timelineItemRef: `tli_${'b'.repeat(40)}` } })
  })

  test.each(['?limit=0', '?limit=51', '?limit=abc', '?cursor=bad', '?itemType=care_watering', '?limit=1&limit=2'])('%s → 400，不进入用例', async query => {
    const service = await startService()
    expect((await service.get(query)).status).toBe(400)
    expect(service.calls).toEqual([])
  })

  test('路径引用不合法 → 400', async () => {
    const service = await startService()
    expect((await service.get('', 'plt_timeline_001')).status).toBe(400)
  })

  test('用例 404 USER_PLANT_NOT_FOUND 透传；未登记错误泛化 500', async () => {
    const notFound = await startService({ status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } })
    expect((await notFound.get()).status).toBe(404)
    await new Promise<void>(resolve => server!.close(() => resolve()))
    const other = await startService({ status: 409, body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: 'x' } } })
    expect((await other.get()).status).toBe(500)
  })

  test('项夹带内部字段或未知类型 → 泛化 500', async () => {
    const leaky = await startService({ status: 200, body: { data: { items: [{ ...item, sourceRef: 'cft_secret_0001' }], nextCursor: null } } } as unknown as HttpIdempotencyPublicResponseSnapshot)
    const response = await leaky.get()
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('cft_secret_0001')
  })
})
