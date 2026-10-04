import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import type {
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../src/identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import type {
  GetUserPlantApplicationInput,
  GetUserPlantApplicationResponse
} from '../../src/user-plant/application/get-user-plant.js'
import {
  createGetUserPlantRouteHandler,
  getUserPlantRoute
} from '../../src/user-plant/http/get-user-plant-route.js'
import { findProjectRoot } from '../support/project-root.js'

const ephemeralPort = 0
const routePrefix = '/api/v2/user-plants/'
const ownedPlantRef = 'upl_route_owned_0001'
const bearerToken = 'bearer-route-secret-0123456789abcdef'
const platformSubject = 'oWx-route-openid-should-never-leak'
const nowMs = Date.UTC(2026, 8, 24, 3, 0, 0)

const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_route_owner_0001' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-09-24T02:00:00.000Z',
  expiresAt: '2026-09-25T02:00:00.000Z'
}

const ownedPlant: UserPlantDto = {
  user_plant_id: ownedPlantRef as UserPlantRef,
  lifecycle: 'active',
  identityStatus: 'unidentified',
  version: 2,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z'
}

const notFoundResponse: GetUserPlantApplicationResponse = {
  status: 404,
  body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在或不可访问' } }
}

/** 记录每个端口是否被调用，用于证明失败即停止。 */
type Calls = {
  /** Principal 解析端口收到的命令。 */
  resolve: ResolveUserPrincipalCommand[]
  /** 归属读取端口收到的输入。 */
  read: GetUserPlantApplicationInput[]
  /** 请求结束事件。 */
  audit: RequestChainAuditEvent[]
}

let server: Server | undefined

/** 挂载真实分发器、请求链与 AJV；只替换会话解析和归属读取两个端口。 */
async function startService(overrides: {
  readonly resolvePrincipal?: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  readonly getUserPlant?: (
    input: GetUserPlantApplicationInput
  ) => Promise<GetUserPlantApplicationResponse>
}): Promise<{ baseUrl: string; calls: Calls }> {
  const calls: Calls = { resolve: [], read: [], audit: [] }
  const dispatch = createRouteDispatcher([
    {
      route: getUserPlantRoute,
      handler: createGetUserPlantRouteHandler({
        resolvePrincipal: async command => {
          calls.resolve.push(command)
          return (overrides.resolvePrincipal ?? (async () => principal))(command)
        },
        getUserPlant: async input => {
          calls.read.push(input)
          return (
            overrides.getUserPlant ??
            (async () => ({ status: 200, body: { data: ownedPlant } }) as const)
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

/** 以 Bearer 发起单株读取请求。 */
function getPlant(
  baseUrl: string,
  ref: string,
  authorization: string | null = `Bearer ${bearerToken}`
) {
  return fetch(`${baseUrl}${routePrefix}${ref}`, {
    headers: authorization === null ? {} : { authorization }
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

const principalInvalidBody = {
  error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效或已过期' }
}

/**
 * Expected 来源：route-registry.json 的 getUserPlant 登记（authenticated；错误 VALIDATION_FAILED、
 * PRINCIPAL_INVALID、USER_PLANT_NOT_FOUND）、http-api/v1 §1 固定顺序与 §3 错误目录、
 * principal-and-capability.md §1「Principal 无效返回 401」、user-plant.md 公开引用 `upl_...`、
 * 003_user_plant.sql `public_user_plant_id VARCHAR(64)`、AGENTS.md §4 公开响应与日志脱敏。
 * 层次：L1 / unit_fake。真实经过 node:http、冻结路由分发器、固定请求链与 AJV；
 * 替换身份验真、Principal 解析、归属读取三个端口。
 * 不覆盖：真实 SQL、会话过期/撤销的数据库判定（见 e2e/get-user-plant-http.mysql.spec.ts）、CloudBase 网关。
 */
describe('GET /api/v2/user-plants/{userPlantRef}', () => {
  test('已登录会话读取本人植物只验证 Bearer，不重新索取平台凭证', async () => {
    const { baseUrl, calls } = await startService({})
    const response = await getPlant(baseUrl, ownedPlantRef)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: ownedPlant })
    expect(calls.resolve).toEqual([{ bearerToken, nowMs }])
    expect(calls.read).toEqual([{ principal, userPlantRef: ownedPlantRef }])
  })

  test('路由常量与 route-registry.json 冻结登记完全一致', () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(findProjectRoot(), 'docs/backend-v2/api/route-registry.json'),
        'utf8'
      )
    ) as { routes: Array<{ method: string; path: string; operationId: string; security: string }> }
    const frozen = registry.routes.find(route => route.operationId === 'getUserPlant')
    expect(getUserPlantRoute).toEqual({
      method: frozen?.method,
      path: frozen?.path,
      operationId: frozen?.operationId,
      security: frozen?.security
    })
  })

  test('本人植物返回 200 公开投影；Principal 由会话解析，归属读取只收到统一主体', async () => {
    const { baseUrl, calls } = await startService({})
    const response = await getPlant(baseUrl, ownedPlantRef)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: ownedPlant })
    expect(calls.resolve).toEqual([{ bearerToken, nowMs }])
    expect(calls.read).toEqual([{ principal, userPlantRef: ownedPlantRef }])
    expect(calls.audit).toEqual([{ outcome: 'allowed' }])
  })

  test.each([
    ['缺少 Authorization', null],
    ['非 Bearer 方案', `Basic ${bearerToken}`],
    ['Bearer 后为空', 'Bearer '],
    ['Bearer 含空白', `Bearer ${bearerToken} extra`]
  ])('%s → 401 PRINCIPAL_INVALID，且不调用解析与读取', async (_label, authorization) => {
    const { baseUrl, calls } = await startService({})
    const response = await getPlant(baseUrl, ownedPlantRef, authorization)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(principalInvalidBody)
    expect(calls.resolve).toHaveLength(0)
    expect(calls.read).toHaveLength(0)
  })

  test('会话过期、撤销或无匹配（Principal 无效）→ 401，不读取用户植物', async () => {
    const { baseUrl, calls } = await startService({
      resolvePrincipal: async () => {
        throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '登录会话无效')
      }
    })
    const response = await getPlant(baseUrl, ownedPlantRef)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(principalInvalidBody)
    expect(calls.read).toHaveLength(0)
  })

  test.each([
    ['非 upl_ 前缀', 'usr_route_owner_0001'],
    ['upl_ 后不足 8 位', 'upl_short'],
    ['含非法字符', 'upl_route.owned.0001'],
    ['超过 64 字符', `upl_${'a'.repeat(61)}`]
  ])('已认证但路径引用 %s → 400 VALIDATION_FAILED，不读取用户植物', async (_label, ref) => {
    const { baseUrl, calls } = await startService({})
    const response = await getPlant(baseUrl, ref)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(calls.read).toHaveLength(0)
  })

  test('恰好 64 字符的引用通过校验并进入归属读取', async () => {
    const boundaryRef = `upl_${'a'.repeat(60)}`
    const { baseUrl, calls } = await startService({})
    const response = await getPlant(baseUrl, boundaryRef)

    expect(response.status).toBe(200)
    expect(calls.read).toEqual([{ principal, userPlantRef: boundaryRef }])
  })

  test('他人、不存在或不可见植物统一返回 404 USER_PLANT_NOT_FOUND', async () => {
    const { baseUrl } = await startService({ getUserPlant: async () => notFoundResponse })
    const response = await getPlant(baseUrl, 'upl_route_foreign_0001')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(notFoundResponse.body)
  })

  test('身份数据损坏等内部错误 → 泛化 500，不泄露内部消息', async () => {
    const { baseUrl } = await startService({
      resolvePrincipal: async () => {
        throw new UnifiedUserPrincipalResolveError(
          'INTERNAL_IDENTITY_DATA_INVALID',
          '统一身份数据库快照不唯一'
        )
      }
    })
    const response = await getPlant(baseUrl, ownedPlantRef)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(
      JSON.stringify({ error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } })
    )
  })

  test('响应与审计事件均不含 Bearer、平台主体或统一用户引用', async () => {
    const { baseUrl, calls } = await startService({
      resolvePrincipal: async () => {
        throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', platformSubject)
      }
    })
    const denied = await getPlant(baseUrl, ownedPlantRef)
    const serialized = JSON.stringify([await denied.text(), calls.audit])

    expect(serialized).not.toContain(bearerToken)
    expect(serialized).not.toContain(platformSubject)
    expect(serialized).not.toContain(principal.user_id)
    expect(calls.audit).toEqual([{ outcome: 'denied', errorType: 'PRINCIPAL_INVALID' }])
  })

  test('伪造平台身份请求头不会改变会话解析输入', async () => {
    const { baseUrl, calls } = await startService({})
    const response = await fetch(`${baseUrl}${routePrefix}${ownedPlantRef}`, {
      headers: { authorization: `Bearer ${bearerToken}`, 'x-wx-openid': platformSubject }
    })

    expect(response.status).toBe(200)
    expect(calls.resolve).toEqual([{ bearerToken, nowMs }])
  })
})
