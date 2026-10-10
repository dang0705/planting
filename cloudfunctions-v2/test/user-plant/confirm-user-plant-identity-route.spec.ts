import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { PlantIdentityRef, UserPlantDto, UserPlantRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import type { ConfirmUserPlantIdentityInput } from '../../src/user-plant/application/confirm-user-plant-identity.js'
import {
  confirmUserPlantIdentityRoute,
  createConfirmUserPlantIdentityRouteHandler
} from '../../src/user-plant/http/confirm-user-plant-identity-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant-identity-confirmation.md`（2026-10-10 用户审定冻结）：
 * 请求体严格 {expectedVersion, plantIdentityRef: pid_…, source: {type:'user_search'}}；幂等键只走头；
 * 成功 200 `{ data: UserPlantDto }`；错误集合见 §4；身份可用性在事务前只读确认，读取失败 503。
 * 测试层次：L2/L3 `unit_fake`：真实 node:http、冻结分发、请求链、Bearer 认证器与 AJV；替换会话解析、身份准入读取与确认用例。
 * 明确未覆盖：真实事务、历史表与发布判定 SQL（见 test/e2e/user-plant-identity-confirmation.mysql.spec.ts）。
 */

const nowMs = Date.UTC(2026, 9, 10, 8, 0, 0)
const bearerToken = 'bearer-confirm-route-secret-012345'
const idempotencyKey = 'confirm-route-key-000001'
const ownerRef = 'usr_confirm_route_owner1' as UserRef
const plantRef = 'upl_confirm_route_plant1'
const identityRef = 'pid_confirm_route_ident1'
const principal: UserPrincipalDto = {
  principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z'
}
const confirmed: UserPlantDto = {
  user_plant_id: plantRef as UserPlantRef, lifecycle: 'active', identityStatus: 'confirmed',
  confirmedIdentityRef: identityRef as PlantIdentityRef,
  version: 3, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z'
}
const validBody = { expectedVersion: 2, plantIdentityRef: identityRef, source: { type: 'user_search' } }

let server: Server | undefined

async function startService(options: {
  readonly result?: HttpIdempotencyPublicResponseSnapshot
  readonly published?: boolean | 'throws'
} = {}) {
  const calls: ConfirmUserPlantIdentityInput[] = []
  const lookups: string[] = []
  const audit: RequestChainAuditEvent[] = []
  const dispatch = createRouteDispatcher([{
    route: confirmUserPlantIdentityRoute,
    handler: createConfirmUserPlantIdentityRouteHandler({ ...fixturePolicyPorts(),
      authenticate: createUserBearerAuthenticator(async () => principal),
      now: () => nowMs,
      writeAudit: event => { audit.push(event) },
      isPublishedIdentity: async ref => {
        lookups.push(ref)
        if (options.published === 'throws') { throw new Error('SQL 内部错误 secret') }
        return options.published ?? true
      },
      confirmIdentity: async input => {
        calls.push(input)
        return options.result ?? { status: 200, body: { data: confirmed } }
      }
    })
  }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const post = (body: unknown, options2: { key?: string | null; ref?: string } = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' }
    const key = options2.key === undefined ? idempotencyKey : options2.key
    if (key !== null) { headers['idempotency-key'] = key }
    return fetch(`${baseUrl}/api/v2/user-plants/${options2.ref ?? plantRef}/identity-confirmations`, {
      method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  }
  return { post, calls, lookups, audit }
}

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe('POST …/identity-confirmations 路由协议合同', () => {
  test('正常确认：200 公开投影；命令含会话主体、路径引用、版本、身份引用、事务前的发布判定与确认动作作用域', async () => {
    const service = await startService()
    const response = await service.post(validBody)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: confirmed })
    expect(service.lookups).toEqual([identityRef])
    expect(service.calls).toHaveLength(1)
    expect(service.calls[0]).toMatchObject({
      userRef: ownerRef, userPlantRef: plantRef, expectedVersion: 2, plantIdentityRef: identityRef, identityPublished: true, nowMs,
      idempotency: { httpMethod: 'POST', normalizedPath: '/api/v2/user-plants/{userPlantRef}/identity-confirmations', operationId: 'confirmUserPlantIdentity' }
    })
    expect(service.calls[0]!.confirmationRef).toMatch(/^idc_[A-Za-z0-9_-]{8,60}$/u)
    expect(JSON.stringify(service.calls[0]!.idempotency)).not.toContain(idempotencyKey)
  })

  test('身份未发布时仍进入事务（归属与归档判定优先），由用例决定 404 NOT_FOUND', async () => {
    const service = await startService({ published: false })
    await service.post(validBody)
    expect(service.calls[0]!.identityPublished).toBe(false)
  })

  test('身份准入读取失败 → 503，不泄露内部信息、不进入事务', async () => {
    const service = await startService({ published: 'throws' })
    const response = await service.post(validBody)
    const text = await response.text()

    expect(response.status).toBe(503)
    expect(text).not.toContain('secret')
    expect(service.calls).toEqual([])
  })

  test('同键同参摘要一致；换身份或换版本摘要不同', async () => {
    const service = await startService()
    await service.post(validBody)
    await service.post(validBody)
    await service.post({ ...validBody, plantIdentityRef: 'pid_confirm_route_ident2' })
    await service.post({ ...validBody, expectedVersion: 3 })
    const [first, replay, otherIdentity, otherVersion] = service.calls.map(call => call.idempotency.requestHash)
    expect(replay).toBe(first)
    expect(otherIdentity).not.toBe(first)
    expect(otherVersion).not.toBe(first)
  })

  test.each([
    ['正文携带 idempotencyKey', { ...validBody, idempotencyKey }],
    ['正文携带 identityStatus', { ...validBody, identityStatus: 'confirmed' }],
    ['正文携带 user_id', { ...validBody, user_id: ownerRef }],
    ['缺少 source', { expectedVersion: 2, plantIdentityRef: identityRef }],
    ['source 为识别候选（本期未开放）', { ...validBody, source: { type: 'identification_candidate', candidateRef: 'idn_x_00000001' } }],
    ['source 夹带额外字段', { ...validBody, source: { type: 'user_search', note: 'x' } }],
    ['身份引用不是 pid_', { ...validBody, plantIdentityRef: 'tax_confirm_route_01' }],
    ['身份引用过短', { ...validBody, plantIdentityRef: 'pid_short' }],
    ['缺少 expectedVersion', { plantIdentityRef: identityRef, source: { type: 'user_search' } }],
    ['expectedVersion 为 0', { ...validBody, expectedVersion: 0 }],
    ['expectedVersion 超出安全整数', '{"expectedVersion":9007199254740993,"plantIdentityRef":"pid_confirm_route_ident1","source":{"type":"user_search"}}'],
    ['正文不是 JSON', '{']
  ])('%s → 400 VALIDATION_FAILED，不查身份、不进入事务', async (_name, body) => {
    const service = await startService()
    const response = await service.post(body)

    expect(response.status).toBe(400)
    expect(service.lookups).toEqual([])
    expect(service.calls).toEqual([])
  })

  test.each([
    ['缺少幂等头', { key: null }],
    ['路径引用不是 upl_', { ref: 'plt_confirm_route_01' }]
  ] as const)('%s → 400，零写入', async (_name, options) => {
    const service = await startService()
    expect((await service.post(validBody, options)).status).toBe(400)
    expect(service.calls).toEqual([])
  })

  test.each([
    [404, 'USER_PLANT_NOT_FOUND'], [409, 'USER_PLANT_ARCHIVED'], [409, 'USER_PLANT_VERSION_CONFLICT'],
    [409, 'IDEMPOTENCY_CONFLICT'], [404, 'NOT_FOUND'], [503, 'SERVICE_UNAVAILABLE']
  ] as const)('用例确定结果 %s %s 原样透传', async (status, type) => {
    const service = await startService({ result: { status, body: { error: { type, message: '确定结果' } } } })
    const response = await service.post(validBody)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: { type, message: '确定结果' } })
  })

  test.each([[403, 'CAPABILITY_DENIED'], [409, 'CAPABILITY_SNAPSHOT_EXPIRED']] as const)('未声明错误 %s %s → 泛化 500', async (status, type) => {
    const service = await startService({ result: { status, body: { error: { type, message: 'x' } } } })
    expect((await service.post(validBody)).status).toBe(500)
  })

  test('投影夹带 user_id → 500 且不泄露；审计不含 Bearer、幂等键、user_id', async () => {
    const service = await startService({ result: { status: 200, body: { data: { ...confirmed, user_id: ownerRef } } } as unknown as HttpIdempotencyPublicResponseSnapshot })
    const response = await service.post(validBody)
    const serialized = JSON.stringify([await response.text(), service.audit])
    expect(response.status).toBe(500)
    for (const secret of [ownerRef, bearerToken, idempotencyKey]) { expect(serialized).not.toContain(secret) }
  })
})
