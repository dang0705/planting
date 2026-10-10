import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPlantDto, UserPlantRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import type { UserPlantLifecycleApplicationInput } from '../../src/user-plant/application/transition-user-plant-lifecycle.js'
import {
  archiveUserPlantRoute,
  createArchiveUserPlantRouteHandler
} from '../../src/user-plant/http/transition-user-plant-route.js'

/**
 * Expected 来源：
 * - `docs/backend-v2/contracts/user-plant.md`「归档与恢复公开接口」：请求体只允许 `expectedVersion`（≥1 的 JS 安全整数）；
 *   `userPlantRef` 只从路径读取、`Idempotency-Key` 只从必填请求头读取；跨用户/不存在统一 404 USER_PLANT_NOT_FOUND；
 *   版本过期 409 USER_PLANT_VERSION_CONFLICT；同键异参 409 IDEMPOTENCY_CONFLICT；
 *   **恢复额外允许 CAPABILITY_DENIED 与 CAPABILITY_SNAPSHOT_EXPIRED，归档路由不声明这两项能力错误**。
 * - `docs/backend-v2/api/route-registry.json` archiveUserPlant 登记的错误集合（不含能力错误）。
 * - `docs/backend-v2/contracts/http-api.md` §4 幂等作用域含业务动作：归档与恢复同键不能互相重放。
 *
 * 测试层次：L2/L3 `unit_fake`。真实经过 node:http、冻结路由分发、固定请求链与 AJV；
 * 只替换会话解析、能力快照读取（归档不得调用）与事务化归档用例。
 * 明确未覆盖：真实 MySQL CAS/行锁/幂等表（见 test/e2e/user-plant-lifecycle.mysql.spec.ts）、CloudBase 网关。
 */

const nowMs = Date.UTC(2026, 9, 10, 3, 0, 0)
const bearerToken = 'bearer-archive-route-secret-0123456'
const idempotencyKey = 'archive-route-key-000001'
const ownerRef = 'usr_archive_route_owner1' as UserRef
const plantRef = 'upl_archive_route_plant01' as UserPlantRef

const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: ownerRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-10T01:00:00.000Z',
  expiresAt: '2026-10-11T01:00:00.000Z'
}

const archivedPlant: UserPlantDto = {
  user_plant_id: plantRef,
  lifecycle: 'archived',
  identityStatus: 'unidentified',
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-10T03:00:00.000Z'
}

/** 端口调用记录。 */
type Calls = {
  /** 能力快照读取次数；归档必须为零。 */
  capability: number
  /** 进入归档用例的命令。 */
  readonly archive: UserPlantLifecycleApplicationInput[]
  /** 审计事件。 */
  readonly audit: RequestChainAuditEvent[]
}

let server: Server | undefined

/** 挂载真实分发器与请求链。 */
async function startService(
  archiveResult?: HttpIdempotencyPublicResponseSnapshot
): Promise<{ baseUrl: string; calls: Calls }> {
  const calls: Calls = { capability: 0, archive: [], audit: [] }
  const dispatch = createRouteDispatcher([
    {
      route: archiveUserPlantRoute,
      handler: createArchiveUserPlantRouteHandler({
        resolvePrincipal: async () => principal,
        resolveCapabilitySnapshot: async () => {
          calls.capability += 1
          throw new Error('归档不得读取能力快照')
        },
        archiveUserPlant: async input => {
          calls.archive.push(input)
          return archiveResult ?? { status: 200, body: { data: archivedPlant } }
        },
        restoreUserPlant: async () => {
          throw new Error('归档路由不得调用恢复用例')
        },
        now: () => nowMs,
        writeAudit: event => {
          calls.audit.push(event)
        }
      })
    }
  ])
  server = createServer((request, response) => {
    dispatch(request, response).catch(() => undefined)
  })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  return { baseUrl: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, calls }
}

/** 发起归档请求；key 为 null 时省略幂等头。 */
function postArchive(baseUrl: string, body: string, key: string | null = idempotencyKey, ref: string = plantRef) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${bearerToken}`,
    'content-type': 'application/json'
  }
  if (key !== null) {
    headers['idempotency-key'] = key
  }
  return fetch(`${baseUrl}/api/v2/user-plants/${ref}/archive`, { method: 'POST', headers, body })
}

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe('POST /api/v2/user-plants/{userPlantRef}/archive 路由协议合同', () => {
  test('正常归档：200 公开投影；命令只含路径引用、正文版本与归档动作作用域；不读取能力快照', async () => {
    const { baseUrl, calls } = await startService()
    const response = await postArchive(baseUrl, '{"expectedVersion":2}')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: archivedPlant })
    expect(calls.capability).toBe(0)
    expect(calls.archive).toHaveLength(1)
    expect(calls.archive[0]).toMatchObject({
      principal,
      userPlantRef: plantRef,
      expectedVersion: 2,
      occurredAtMs: nowMs,
      idempotency: {
        principalType: 'user',
        httpMethod: 'POST',
        normalizedPath: '/api/v2/user-plants/{userPlantRef}/archive',
        operationId: 'archiveUserPlant'
      }
    })
    expect(JSON.stringify(calls.archive[0]!.idempotency)).not.toContain(idempotencyKey)
  })

  test('同键同参请求摘要一致；同键换版本或换植物时请求摘要不同（供应用层判定 409 IDEMPOTENCY_CONFLICT）', async () => {
    const { baseUrl, calls } = await startService()
    await postArchive(baseUrl, '{"expectedVersion":2}')
    await postArchive(baseUrl, '{"expectedVersion":2}')
    await postArchive(baseUrl, '{"expectedVersion":3}')
    await postArchive(baseUrl, '{"expectedVersion":2}', idempotencyKey, 'upl_archive_route_plant02')

    const [first, replay, otherVersion, otherPlant] = calls.archive.map(input => input.idempotency)
    expect(replay!.requestHash).toBe(first!.requestHash)
    expect(replay!.idempotencyKeyHash).toBe(first!.idempotencyKeyHash)
    expect(otherVersion!.idempotencyKeyHash).toBe(first!.idempotencyKeyHash)
    expect(otherVersion!.requestHash).not.toBe(first!.requestHash)
    expect(otherPlant!.requestHash).not.toBe(first!.requestHash)
  })

  test.each([
    ['正文携带 idempotencyKey', `{"expectedVersion":2,"idempotencyKey":"${idempotencyKey}"}`],
    ['正文携带 user_id', `{"expectedVersion":2,"user_id":"${ownerRef}"}`],
    ['正文携带 userPlantRef', `{"expectedVersion":2,"userPlantRef":"${plantRef}"}`],
    ['正文携带能力快照', '{"expectedVersion":2,"capabilitySnapshot":{}}'],
    ['缺少 expectedVersion', '{}'],
    ['expectedVersion 为 0', '{"expectedVersion":0}'],
    ['expectedVersion 为负数', '{"expectedVersion":-1}'],
    ['expectedVersion 为小数', '{"expectedVersion":1.5}'],
    ['expectedVersion 为字符串', '{"expectedVersion":"2"}'],
    ['expectedVersion 为 null', '{"expectedVersion":null}'],
    ['expectedVersion 超出安全整数', '{"expectedVersion":9007199254740993}'],
    ['正文为数组', '[]'],
    ['正文不是 JSON', '{']
  ])('%s → 400 VALIDATION_FAILED，零写入', async (_name, body) => {
    const { baseUrl, calls } = await startService()
    const response = await postArchive(baseUrl, body)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } })
    expect(calls.archive).toEqual([])
  })

  test.each([
    ['缺少幂等头', null, plantRef],
    ['幂等键过短', 'short07', plantRef],
    ['路径引用不是 upl_ 前缀', idempotencyKey, 'plt_archive_route_01'],
    ['路径引用超过 64 字符', idempotencyKey, `upl_${'a'.repeat(61)}`]
  ])('%s → 400，零写入', async (_name, key, ref) => {
    const { baseUrl, calls } = await startService()
    const response = await postArchive(baseUrl, '{"expectedVersion":2}', key, ref)

    expect(response.status).toBe(400)
    expect(calls.archive).toEqual([])
  })

  test.each([
    [404, 'USER_PLANT_NOT_FOUND', '用户植物不存在或不可访问'],
    [409, 'USER_PLANT_VERSION_CONFLICT', '用户植物版本已变化'],
    [409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同请求']
  ] as const)('应用用例确定拒绝 %s %s 原样透传', async (status, type, message) => {
    const { baseUrl } = await startService({ status, body: { error: { type, message } } })
    const response = await postArchive(baseUrl, '{"expectedVersion":2}')

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { type, message } })
  })

  test.each([
    [403, 'CAPABILITY_DENIED', '当前能力不允许'],
    [409, 'CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效']
  ] as const)('归档路由不声明能力错误：用例若返回 %s %s 也必须泛化为 500', async (status, type, message) => {
    const { baseUrl } = await startService({ status, body: { error: { type, message } } })
    const response = await postArchive(baseUrl, '{"expectedVersion":2}')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } })
  })

  test('投影夹带 user_id → 泛化 500，响应与审计不含 Bearer、幂等键、user_id', async () => {
    const { baseUrl, calls } = await startService({
      status: 200,
      body: { data: { ...archivedPlant, user_id: ownerRef } }
    } as unknown as HttpIdempotencyPublicResponseSnapshot)
    const response = await postArchive(baseUrl, '{"expectedVersion":2}')
    const serialized = JSON.stringify([await response.text(), calls.audit])

    expect(response.status).toBe(500)
    expect(serialized).not.toContain(ownerRef)
    expect(serialized).not.toContain(bearerToken)
    expect(serialized).not.toContain(idempotencyKey)
  })
})
