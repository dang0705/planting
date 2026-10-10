import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPlantDto, UserPlantRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import type { ListUserPlantsApplicationInput } from '../../src/user-plant/application/list-user-plants.js'
import { encodeUserPlantListCursor } from '../../src/user-plant/domain/user-plant-list-query.js'
import {
  createListUserPlantsRouteHandler,
  listUserPlantsRoute
} from '../../src/user-plant/http/list-user-plants-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant.md`「列表公开接口」（2026-10-10 用户裁决冻结）：
 * 查询参数仅 lifecycle（active|archived，省略=两者）、limit（1～50，省略 20）、cursor（不透明）；未知/重复/非法 → 400；
 * 成功 200 `{ data: { items: UserPlantDto[], nextCursor } }`；主体只来自 Bearer；不需要幂等键。
 * 配置目录 `user-plant.list.page_size` = {default:20,max:50}（hard_rule）。
 * 测试层次：L2/L3 `unit_fake`。真实经过 node:http、冻结路由分发、固定请求链、真实 Bearer 认证器与 AJV；
 * 只替换会话解析与列表用例。明确未覆盖：真实 SQL 排序/游标/归属（见 test/e2e/user-plant-list-delete.mysql.spec.ts）。
 */

const nowMs = Date.UTC(2026, 9, 10, 5, 0, 0)
const bearerToken = 'bearer-list-route-secret-01234567'
const ownerRef = 'usr_list_route_owner001' as UserRef
const principal: UserPrincipalDto = {
  principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z'
}
const plant: UserPlantDto = {
  user_plant_id: 'upl_list_route_plant001' as UserPlantRef, lifecycle: 'active', identityStatus: 'unidentified',
  version: 1, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z'
}

let server: Server | undefined

/** 挂载真实分发器；listResult 为列表用例的替身返回。 */
async function startService(options: {
  readonly listResult?: HttpIdempotencyPublicResponseSnapshot
  readonly resolveFails?: boolean
} = {}) {
  const calls: ListUserPlantsApplicationInput[] = []
  const audit: RequestChainAuditEvent[] = []
  const dispatch = createRouteDispatcher([{
    route: listUserPlantsRoute,
    handler: createListUserPlantsRouteHandler({ ...fixturePolicyPorts(),
      authenticate: createUserBearerAuthenticator(async () => {
        if (options.resolveFails) { throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '会话无效') }
        return principal
      }),
      now: () => nowMs,
      writeAudit: event => { audit.push(event) },
      listUserPlants: async input => {
        calls.push(input)
        return options.listResult ?? { status: 200, body: { data: { items: [plant], nextCursor: null } } }
      }
    })
  }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const get = (query = '', authorization: string | null = `Bearer ${bearerToken}`) =>
    fetch(`${baseUrl}/api/v2/user-plants${query}`, { headers: authorization === null ? {} : { authorization } })
  return { get, calls, audit }
}

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe('GET /api/v2/user-plants 列表路由协议合同', () => {
  test('缺省查询：两种可见生命周期、每页 20、无游标；主体来自会话；200 原样返回公开投影', async () => {
    const service = await startService()
    const response = await service.get()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { items: [plant], nextCursor: null } })
    expect(service.calls).toEqual([{ principal, lifecycles: ['active', 'archived'], limit: 20, after: null }])
    expect(service.audit).toEqual([{ outcome: 'allowed' }])
  })

  test.each([
    ['?lifecycle=active', ['active']],
    ['?lifecycle=archived', ['archived']]
  ] as const)('%s 只筛选对应生命周期', async (query, lifecycles) => {
    const service = await startService()
    expect((await service.get(query)).status).toBe(200)
    expect(service.calls[0]!.lifecycles).toEqual(lifecycles)
  })

  test.each(['?limit=1', '?limit=50'])('%s 是合法边界', async query => {
    const service = await startService()
    expect((await service.get(query)).status).toBe(200)
    expect(service.calls[0]!.limit).toBe(Number(query.split('=')[1]))
  })

  test('合法游标被解码为上一页最后一项的位置', async () => {
    const service = await startService()
    const cursor = encodeUserPlantListCursor({ createdAtMs: 1_700_000_000_000, userPlantRef: 'upl_list_route_plant009' as UserPlantRef })
    expect((await service.get(`?cursor=${cursor}&limit=5`)).status).toBe(200)
    expect(service.calls[0]).toMatchObject({ limit: 5, after: { createdAtMs: 1_700_000_000_000, userPlantRef: 'upl_list_route_plant009' } })
  })

  test.each([
    ['lifecycle=deleting', '?lifecycle=deleting'],
    ['lifecycle=deleted', '?lifecycle=deleted'],
    ['lifecycle 为空', '?lifecycle='],
    ['lifecycle=all', '?lifecycle=all'],
    ['limit=0', '?limit=0'],
    ['limit=51', '?limit=51'],
    ['limit=-1', '?limit=-1'],
    ['limit=1.5', '?limit=1.5'],
    ['limit=abc', '?limit=abc'],
    ['limit 前导零', '?limit=05'],
    ['未知参数 user_id', `?user_id=${ownerRef}`],
    ['重复 limit', '?limit=1&limit=2'],
    ['被篡改的游标', '?cursor=bm90LWEtY3Vyc29y'],
    ['空游标', '?cursor=']
  ])('%s → 400 VALIDATION_FAILED，不进入列表用例', async (_name, query) => {
    const service = await startService()
    const response = await service.get(query)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } })
    expect(service.calls).toEqual([])
  })

  test('缺少 Bearer 或会话无效（含游客令牌）→ 401，不进入列表用例', async () => {
    const missing = await startService()
    expect((await missing.get('', null)).status).toBe(401)
    expect(missing.calls).toEqual([])
    await new Promise<void>(resolve => server!.close(() => resolve()))
    const invalid = await startService({ resolveFails: true })
    expect((await invalid.get('', 'Bearer guest.fixture-guest-token')).status).toBe(401)
    expect(invalid.calls).toEqual([])
  })

  test('列表用例返回夹带 user_id 的项 → 泛化 500，不泄露', async () => {
    const service = await startService({
      listResult: { status: 200, body: { data: { items: [{ ...plant, user_id: ownerRef }], nextCursor: null } } } as unknown as HttpIdempotencyPublicResponseSnapshot
    })
    const response = await service.get()
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(text).not.toContain(ownerRef)
  })

  test('列表从不返回 404：用例若返回 USER_PLANT_NOT_FOUND 也泛化为 500', async () => {
    const service = await startService({
      listResult: { status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } }
    })
    expect((await service.get()).status).toBe(500)
  })

  test('响应与审计不含 Bearer 或 user_id', async () => {
    const service = await startService()
    const serialized = JSON.stringify([await (await service.get()).text(), service.audit])
    expect(serialized).not.toContain(bearerToken)
    expect(serialized).not.toContain(ownerRef)
  })
})
