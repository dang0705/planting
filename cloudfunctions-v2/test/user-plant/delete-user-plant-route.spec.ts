import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import type { DeleteUserPlantInput } from '../../src/user-plant/application/delete-user-plant.js'
import {
  createDeleteUserPlantRouteHandler,
  deleteUserPlantRoute
} from '../../src/user-plant/http/delete-user-plant-route.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant.md`「删除公开接口」（2026-10-10 用户裁决冻结）：
 * 请求体只允许 `expectedVersion`（≥1 安全整数），引用只从路径、`Idempotency-Key` 只从必填头读取；
 * 成功 200 `{ data: { user_plant_id, lifecycle: 'deleting', version, updatedAt } }`；
 * 404 USER_PLANT_NOT_FOUND / 409 USER_PLANT_VERSION_CONFLICT / 409 IDEMPOTENCY_CONFLICT；不声明能力错误。
 * `http-api.md` §4：幂等作用域含主体、方法、规范化路径、业务动作。
 * 测试层次：L2/L3 `unit_fake`。真实经过 node:http、冻结分发、固定请求链、Bearer 认证器与 AJV；只替换会话解析与删除用例。
 * 明确未覆盖：真实 MySQL CAS、幂等表与删除后各接口不可见（见 test/e2e/user-plant-list-delete.mysql.spec.ts）。
 */

const nowMs = Date.UTC(2026, 9, 10, 6, 0, 0)
const bearerToken = 'bearer-delete-route-secret-0123456'
const idempotencyKey = 'delete-route-key-000001'
const ownerRef = 'usr_delete_route_owner01' as UserRef
const plantRef = 'upl_delete_route_plant01'
const principal: UserPrincipalDto = {
  principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z'
}
const deletion = { user_plant_id: plantRef, lifecycle: 'deleting', version: 3, updatedAt: '2026-10-10T06:00:00.000Z' }

let server: Server | undefined

/** 挂载真实分发器；result 为删除用例替身的返回值。 */
async function startService(result?: HttpIdempotencyPublicResponseSnapshot) {
  const calls: DeleteUserPlantInput[] = []
  const audit: RequestChainAuditEvent[] = []
  const dispatch = createRouteDispatcher([{
    route: deleteUserPlantRoute,
    handler: createDeleteUserPlantRouteHandler({
      authenticate: createUserBearerAuthenticator(async () => principal),
      now: () => nowMs,
      writeAudit: event => { audit.push(event) },
      deleteUserPlant: async input => {
        calls.push(input)
        return result ?? { status: 200, body: { data: deletion } }
      }
    })
  }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const remove = (body: string, options: { key?: string | null; ref?: string; contentType?: string } = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${bearerToken}`, 'content-type': options.contentType ?? 'application/json' }
    const key = options.key === undefined ? idempotencyKey : options.key
    if (key !== null) { headers['idempotency-key'] = key }
    return fetch(`${baseUrl}/api/v2/user-plants/${options.ref ?? plantRef}`, { method: 'DELETE', headers, body })
  }
  return { remove, calls, audit }
}

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe('DELETE /api/v2/user-plants/{userPlantRef} 删除路由协议合同', () => {
  test('正常删除：200 deleting 投影；命令只含会话主体、路径引用、正文版本与删除动作幂等作用域', async () => {
    const service = await startService()
    const response = await service.remove('{"expectedVersion":2}')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: deletion })
    expect(service.calls).toHaveLength(1)
    expect(service.calls[0]).toMatchObject({
      userRef: ownerRef,
      userPlantRef: plantRef,
      expectedVersion: 2,
      nowMs,
      idempotency: { principalType: 'user', httpMethod: 'DELETE', normalizedPath: '/api/v2/user-plants/{userPlantRef}', operationId: 'deleteUserPlant' }
    })
    expect(JSON.stringify(service.calls[0]!.idempotency)).not.toContain(idempotencyKey)
    expect(JSON.stringify(service.calls[0]!.idempotency)).not.toContain(ownerRef)
  })

  test('同键同参摘要一致；同键换版本或换植物摘要不同（供幂等层判 409 IDEMPOTENCY_CONFLICT）', async () => {
    const service = await startService()
    await service.remove('{"expectedVersion":2}')
    await service.remove('{"expectedVersion":2}')
    await service.remove('{"expectedVersion":3}')
    await service.remove('{"expectedVersion":2}', { ref: 'upl_delete_route_plant02' })
    const [first, replay, otherVersion, otherPlant] = service.calls.map(call => call.idempotency)

    expect(replay!.requestHash).toBe(first!.requestHash)
    expect(replay!.idempotencyKeyHash).toBe(first!.idempotencyKeyHash)
    expect(otherVersion!.requestHash).not.toBe(first!.requestHash)
    expect(otherPlant!.requestHash).not.toBe(first!.requestHash)
  })

  test.each([
    ['正文携带 idempotencyKey', `{"expectedVersion":2,"idempotencyKey":"${idempotencyKey}"}`],
    ['正文携带 user_id', `{"expectedVersion":2,"user_id":"${ownerRef}"}`],
    ['正文携带 lifecycle', '{"expectedVersion":2,"lifecycle":"deleted"}'],
    ['缺少 expectedVersion', '{}'],
    ['expectedVersion 为 0', '{"expectedVersion":0}'],
    ['expectedVersion 为小数', '{"expectedVersion":2.5}'],
    ['expectedVersion 为字符串', '{"expectedVersion":"2"}'],
    ['expectedVersion 超出安全整数', '{"expectedVersion":9007199254740993}'],
    ['正文为数组', '[]'],
    ['正文为空', ''],
    ['正文不是 JSON', '{']
  ])('%s → 400 VALIDATION_FAILED，零写入', async (_name, body) => {
    const service = await startService()
    const response = await service.remove(body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } })
    expect(service.calls).toEqual([])
  })

  test.each([
    ['缺少幂等头', { key: null }],
    ['幂等键过短', { key: 'short07' }],
    ['路径引用不是 upl_ 前缀', { ref: 'plt_delete_route_01' }],
    ['路径引用过长', { ref: `upl_${'a'.repeat(61)}` }]
  ] as const)('%s → 400，零写入', async (_name, options) => {
    const service = await startService()
    expect((await service.remove('{"expectedVersion":2}', options)).status).toBe(400)
    expect(service.calls).toEqual([])
  })

  test('非 JSON 媒体类型 → 415，零写入', async () => {
    const service = await startService()
    expect((await service.remove('{"expectedVersion":2}', { contentType: 'text/plain' })).status).toBe(415)
    expect(service.calls).toEqual([])
  })

  test.each([
    [404, 'USER_PLANT_NOT_FOUND', '用户植物不存在'],
    [409, 'USER_PLANT_VERSION_CONFLICT', '用户植物版本已变化，请重新读取'],
    [409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求'],
    [503, 'SERVICE_UNAVAILABLE', '服务暂时不可用']
  ] as const)('用例确定结果 %s %s 原样透传', async (status, type, message) => {
    const service = await startService({ status, body: { error: { type, message } } })
    const response = await service.remove('{"expectedVersion":2}')

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { type, message } })
  })

  test.each([
    [403, 'CAPABILITY_DENIED'],
    [409, 'USER_PLANT_ARCHIVED'],
    [409, 'CAPABILITY_SNAPSHOT_EXPIRED']
  ] as const)('删除路由未声明 %s %s → 泛化 500', async (status, type) => {
    const service = await startService({ status, body: { error: { type, message: '不应透传' } } })
    expect((await service.remove('{"expectedVersion":2}')).status).toBe(500)
  })

  test.each([
    ['lifecycle 不是 deleting', { ...deletion, lifecycle: 'archived' }],
    ['夹带 user_id', { ...deletion, user_id: ownerRef }],
    ['夹带档案', { ...deletion, profile: { nickname: '小青' } }]
  ])('用例投影 %s → 泛化 500，不泄露', async (_name, data) => {
    const service = await startService({ status: 200, body: { data } } as HttpIdempotencyPublicResponseSnapshot)
    const response = await service.remove('{"expectedVersion":2}')
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(text).not.toContain(ownerRef)
  })

  test('响应与审计不含 Bearer、幂等键原文或 user_id', async () => {
    const service = await startService()
    const serialized = JSON.stringify([await (await service.remove('{"expectedVersion":2}')).text(), service.audit])
    expect(serialized).not.toContain(bearerToken)
    expect(serialized).not.toContain(idempotencyKey)
    expect(serialized).not.toContain(ownerRef)
  })
})
