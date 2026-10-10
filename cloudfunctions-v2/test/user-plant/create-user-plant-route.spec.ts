import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type {
  UserCapabilitySnapshotDto,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import type { ResolveUserPrincipalCommand } from '../../src/identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import {
  CapabilitySnapshotExpiredError,
  CapabilitySnapshotUnavailableError
} from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import type { CreateUserPlantApplicationInput } from '../../src/user-plant/application/create-user-plant.js'
import {
  createUserPlantRoute,
  createUserPlantRouteHandler
} from '../../src/user-plant/http/create-user-plant-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：
 * - `docs/backend-v2/contracts/user-plant.md`「创建用户植物」：请求体严格为空 `{}`；`Idempotency-Key` 只允许作为必填请求头，
 *   误放进 JSON 正文必须 `VALIDATION_FAILED`；成功 200 + `{ data: CreateUserPlantResponse }`；同键同参重放、同键异参
 *   `IDEMPOTENCY_CONFLICT`；能力快照在执行前失效返回 `CAPABILITY_SNAPSHOT_EXPIRED`；公开 DTO 不返回 `user_id`。
 * - `docs/backend-v2/contracts/http-api.md` §3 错误目录（409 CAPABILITY_SNAPSHOT_EXPIRED、401 PRINCIPAL_INVALID、415）
 *   与 §4 幂等作用域（主体、method、规范化 path、业务动作；幂等键 8～128 可打印 ASCII）。
 * - `docs/backend-v2/api/route-registry.json` createUserPlant 登记的错误集合。
 *
 * 测试层次：L2/L3 `unit_fake`。真实经过 node:http、冻结路由分发、固定请求链、AJV 与公开错误映射；
 * 只替换会话解析、能力快照读取和事务化应用用例三个端口。
 * 明确未覆盖：真实 MySQL 幂等表、事务、行锁（见 test/e2e/user-plant-create.mysql.spec.ts 与
 * test/e2e/get-user-plant-http.mysql.spec.ts）、CloudBase 网关与真实平台登录。
 */

const ephemeralPort = 0
const nowMs = Date.UTC(2026, 9, 10, 2, 0, 0)
const bearerToken = 'bearer-create-route-secret-0123456789'
const idempotencyKey = 'create-route-key-000001'
const ownerRef = 'usr_create_route_owner01' as UserRef
const otherRef = 'usr_create_route_other001' as UserRef
const sha256Hex = /^[a-f0-9]{64}$/u

/** 当前会话解析出的登录主体。 */
function principalOf(userId: UserRef): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userId,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: '2026-10-10T01:00:00.000Z',
    expiresAt: '2026-10-11T01:00:00.000Z'
  }
}

/** 服务端可信能力快照；归属必须与当前主体一致。 */
function snapshotOf(userId: UserRef): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_create_route_0001',
    subjectType: 'user',
    user_id: userId,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: 1,
    generatedAt: '2026-10-10T01:59:00.000Z',
    validUntil: '2026-10-10T02:05:00.000Z',
    policyVersion: 'user-plant-limit/2026-10-10.1'
  }
}

/** 应用用例成功时的公开初始投影。 */
const createdData = {
  user_plant_id: 'upl_create_route_new0001',
  lifecycle: 'active',
  identityStatus: 'unidentified',
  version: 1,
  createdAt: '2026-10-10T02:00:00.000Z',
  updatedAt: '2026-10-10T02:00:00.000Z'
} as const

/** 端口调用记录，用于证明失败即停止、不进入后续步骤。 */
type Calls = {
  /** 会话解析输入。 */
  readonly resolve: ResolveUserPrincipalCommand[]
  /** 能力快照读取次数（按主体记录）。 */
  readonly capability: string[]
  /** 进入事务化应用用例的输入。 */
  readonly create: CreateUserPlantApplicationInput[]
  /** 审计事件。 */
  readonly audit: RequestChainAuditEvent[]
}

let server: Server | undefined

/** 挂载真实分发器与请求链，只替换三个服务端端口。 */
async function startService(overrides: {
  readonly resolvePrincipal?: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  readonly resolveCapabilitySnapshot?: (
    principal: UserPrincipalDto
  ) => Promise<UserCapabilitySnapshotDto>
  readonly createUserPlant?: (
    input: CreateUserPlantApplicationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
} = {}): Promise<{ baseUrl: string; calls: Calls }> {
  const calls: Calls = { resolve: [], capability: [], create: [], audit: [] }
  const dispatch = createRouteDispatcher([
    {
      route: createUserPlantRoute,
      handler: createUserPlantRouteHandler({ ...fixturePolicyPorts(),
        resolvePrincipal: async command => {
          calls.resolve.push(command)
          return (overrides.resolvePrincipal ?? (async () => principalOf(ownerRef)))(command)
        },
        resolveCapabilitySnapshot: async principal => {
          calls.capability.push(principal.user_id)
          return (
            overrides.resolveCapabilitySnapshot ?? (async (p: UserPrincipalDto) => snapshotOf(p.user_id))
          )(principal)
        },
        createUserPlant: async input => {
          calls.create.push(input)
          return (
            overrides.createUserPlant ??
            (async () => ({ status: 200, body: { data: createdData } }) as HttpIdempotencyPublicResponseSnapshot)
          )(input)
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
  await new Promise<void>(resolve => server?.listen(ephemeralPort, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${String(address.port)}`, calls }
}

/** 发起创建请求；null 表示省略该请求头。 */
function postCreate(
  baseUrl: string,
  options: {
    readonly body?: string
    readonly key?: string | null
    readonly authorization?: string | null
    readonly contentType?: string
  } = {}
) {
  const headers: Record<string, string> = { 'content-type': options.contentType ?? 'application/json' }
  const key = options.key === undefined ? idempotencyKey : options.key
  if (key !== null) {
    headers['idempotency-key'] = key
  }
  const authorization =
    options.authorization === undefined ? `Bearer ${bearerToken}` : options.authorization
  if (authorization !== null) {
    headers.authorization = authorization
  }
  return fetch(`${baseUrl}/api/v2/user-plants`, {
    method: 'POST',
    headers,
    body: options.body ?? '{}'
  })
}

afterEach(async () => {
  await new Promise<void>(resolve => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  server = undefined
})

describe('POST /api/v2/user-plants 创建路由协议合同', () => {
  test('正常创建：200 只返回六个公开字段；命令只含会话主体、服务端快照、服务端引用与不可逆幂等摘要', async () => {
    const { baseUrl, calls } = await startService()
    const response = await postCreate(baseUrl)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ data: createdData })
    expect(text).not.toContain(ownerRef)
    expect(calls.resolve).toEqual([{ bearerToken, nowMs }])
    expect(calls.create).toHaveLength(1)
    const input = calls.create[0]!
    expect(input.principal).toEqual(principalOf(ownerRef))
    expect(input.capabilitySnapshot).toEqual(snapshotOf(ownerRef))
    expect(input.newUserPlantRef).toMatch(/^upl_[A-Za-z0-9_-]{8,}$/u)
    expect(input.idempotency).toMatchObject({
      principalType: 'user',
      httpMethod: 'POST',
      normalizedPath: '/api/v2/user-plants',
      operationId: 'createUserPlant'
    })
    expect(input.idempotency.principalScopeHash).toMatch(sha256Hex)
    expect(input.idempotency.idempotencyKeyHash).toMatch(sha256Hex)
    expect(input.idempotency.requestHash).toMatch(sha256Hex)
    expect(JSON.stringify(input.idempotency)).not.toContain(idempotencyKey)
    expect(JSON.stringify(input.idempotency)).not.toContain(ownerRef)
    expect(calls.audit).toEqual([{ outcome: 'allowed' }])
  })

  test('同键同参两次请求得到相同幂等作用域与摘要；换键或换用户则作用域不同，不能互相重放', async () => {
    const { baseUrl, calls } = await startService({
      resolvePrincipal: async command =>
        principalOf(command.bearerToken === 'bearer-create-route-other-0123456789' ? otherRef : ownerRef)
    })
    await postCreate(baseUrl)
    await postCreate(baseUrl)
    await postCreate(baseUrl, { key: 'create-route-key-000002' })
    await postCreate(baseUrl, { authorization: 'Bearer bearer-create-route-other-0123456789' })

    const [first, replay, otherKey, otherUser] = calls.create.map(input => input.idempotency)
    expect(replay!.principalScopeHash).toBe(first!.principalScopeHash)
    expect(replay!.idempotencyKeyHash).toBe(first!.idempotencyKeyHash)
    expect(replay!.requestHash).toBe(first!.requestHash)
    expect(otherKey!.idempotencyKeyHash).not.toBe(first!.idempotencyKeyHash)
    expect(otherUser!.principalScopeHash).not.toBe(first!.principalScopeHash)
    expect(otherUser!.idempotencyKeyHash).toBe(first!.idempotencyKeyHash)
  })

  test.each([
    ['正文携带 idempotencyKey', '{"idempotencyKey":"create-route-key-000001"}'],
    ['正文携带 user_id', `{"user_id":"${otherRef}"}`],
    ['正文携带 lifecycle', '{"lifecycle":"archived"}'],
    ['正文携带 identityStatus', '{"identityStatus":"confirmed"}'],
    ['正文携带 version', '{"version":7}'],
    ['正文携带数量上限', '{"activeUserPlantLimit":99}'],
    ['正文携带 user_plant_id', '{"user_plant_id":"upl_client_chosen_0001"}'],
    ['正文携带档案字段', '{"nickname":"小青"}'],
    ['正文为数组', '[]'],
    ['正文为 null', 'null'],
    ['正文为字符串', '"{}"'],
    ['正文不是 JSON', '{']
  ])('%s → 400 VALIDATION_FAILED，不读取能力快照、不进入事务', async (_name, body) => {
    const { baseUrl, calls } = await startService()
    const response = await postCreate(baseUrl, { body })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(calls.capability).toEqual([])
    expect(calls.create).toEqual([])
  })

  test.each([
    ['缺少 Idempotency-Key', null],
    ['Idempotency-Key 少于 8 字符', 'short07'],
    ['Idempotency-Key 超过 128 字符', 'k'.repeat(129)]
  ])('%s → 400 VALIDATION_FAILED，零写入', async (_name, key) => {
    const { baseUrl, calls } = await startService()
    const response = await postCreate(baseUrl, { key })

    expect(response.status).toBe(400)
    expect(calls.create).toEqual([])
  })

  test('恰好 8 与 128 字符的幂等键都被接受', async () => {
    const { baseUrl, calls } = await startService()
    expect((await postCreate(baseUrl, { key: 'k'.repeat(8) })).status).toBe(200)
    expect((await postCreate(baseUrl, { key: 'k'.repeat(128) })).status).toBe(200)
    expect(calls.create).toHaveLength(2)
  })

  test('缺少 Bearer → 401，不解析主体、不读能力、零写入', async () => {
    const { baseUrl, calls } = await startService()
    const response = await postCreate(baseUrl, { authorization: null })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效或已过期' }
    })
    expect(calls.resolve).toEqual([])
    expect(calls.create).toEqual([])
  })

  test('游客 Bearer 或失效会话无法解析为登录用户 → 401，游客不能直接创建长期植物', async () => {
    const { baseUrl, calls } = await startService({
      resolvePrincipal: async () => {
        throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '游客令牌不是登录会话')
      }
    })
    const response = await postCreate(baseUrl, { authorization: 'Bearer guest.fixture-guest-token-0001' })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效或已过期' }
    })
    expect(calls.capability).toEqual([])
    expect(calls.create).toEqual([])
  })

  test('伪造平台主体请求头不改变会话解析输入，命令归属仍是会话解析出的 user_id', async () => {
    const { baseUrl, calls } = await startService()
    const response = await fetch(`${baseUrl}/api/v2/user-plants`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-wx-openid': 'oWx-forged-openid-0001',
        'x-user-id': otherRef
      },
      body: '{}'
    })

    expect(response.status).toBe(200)
    expect(calls.resolve).toEqual([{ bearerToken, nowMs }])
    expect(calls.create[0]!.principal.user_id).toBe(ownerRef)
  })

  test('非 JSON 媒体类型 → 415，先于身份解析', async () => {
    const { baseUrl, calls } = await startService()
    const response = await postCreate(baseUrl, { contentType: 'text/plain' })

    expect(response.status).toBe(415)
    expect(calls.resolve).toEqual([])
  })

  test('能力快照已过期 → 409 CAPABILITY_SNAPSHOT_EXPIRED，不进入事务', async () => {
    const { baseUrl, calls } = await startService({
      resolveCapabilitySnapshot: async () => {
        throw new CapabilitySnapshotExpiredError()
      }
    })
    const response = await postCreate(baseUrl)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { type: 'CAPABILITY_SNAPSHOT_EXPIRED' }
    })
    expect(calls.create).toEqual([])
  })

  test('能力快照不可用 → 503 SERVICE_UNAVAILABLE，不猜默认额度、不进入事务', async () => {
    const { baseUrl, calls } = await startService({
      resolveCapabilitySnapshot: async () => {
        throw new CapabilitySnapshotUnavailableError()
      }
    })
    const response = await postCreate(baseUrl)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' }
    })
    expect(calls.create).toEqual([])
  })

  test('能力快照归属他人 → 泛化 500，不进入事务、不泄露他人引用', async () => {
    const { baseUrl, calls } = await startService({
      resolveCapabilitySnapshot: async () => snapshotOf(otherRef)
    })
    const response = await postCreate(baseUrl)
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } })
    expect(text).not.toContain(otherRef)
    expect(calls.create).toEqual([])
  })

  test.each([
    [409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同请求'],
    [403, 'CAPABILITY_DENIED', '当前可创建的用户植物数量已达上限'],
    [409, 'CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效']
  ] as const)('应用用例确定拒绝 %s %s 按原状态透传', async (status, type, message) => {
    const { baseUrl } = await startService({
      createUserPlant: async () => ({ status, body: { error: { type, message } } })
    })
    const response = await postCreate(baseUrl)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { type, message } })
  })

  test('应用用例返回未登记错误类型 → 泛化 500，不透传', async () => {
    const { baseUrl } = await startService({
      createUserPlant: async () => ({
        status: 404,
        body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } }
      })
    })
    const response = await postCreate(baseUrl)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } })
  })

  test('应用用例投影夹带 user_id 等额外字段 → 泛化 500，响应不含该字段', async () => {
    const { baseUrl } = await startService({
      createUserPlant: async () =>
        ({
          status: 200,
          body: { data: { ...createdData, user_id: ownerRef, id: 41 } }
        }) as unknown as HttpIdempotencyPublicResponseSnapshot
    })
    const response = await postCreate(baseUrl)
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(text).not.toContain(ownerRef)
    expect(text).not.toContain('user_id')
  })

  test('响应与审计不含 Bearer、幂等键原文或 user_id', async () => {
    const { baseUrl, calls } = await startService()
    const ok = await postCreate(baseUrl)
    const denied = await postCreate(baseUrl, { body: '{"user_id":"x"}' })
    const serialized = JSON.stringify([await ok.text(), await denied.text(), calls.audit])

    expect(serialized).not.toContain(bearerToken)
    expect(serialized).not.toContain(idempotencyKey)
    expect(serialized).not.toContain(ownerRef)
    expect(calls.audit).toEqual([
      { outcome: 'allowed' },
      { outcome: 'denied', errorType: 'VALIDATION_FAILED' }
    ])
  })
})
