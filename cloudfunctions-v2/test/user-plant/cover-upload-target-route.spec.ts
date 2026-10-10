import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import { buildCoverUploadPath, isOwnCoverFileId } from '../../src/user-plant/domain/cover-asset.js'
import { userPlantAssetRulesV1 } from '../support/business-policy-fixtures.js'
import type { GetCoverUploadTargetInput } from '../../src/user-plant/application/get-cover-upload-target.js'
import { coverUploadTargetRoute, createCoverUploadTargetRouteHandler } from '../../src/user-plant/http/cover-upload-target-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-cover-asset.md §2.1（2026-10-10 用户追加「获取上传目录」）：
 * GET …/cover-upload-target 只读、无查询参数；200 `{ data: { purpose:'profile', cloudPath, allowedMimeTypes, maxBytes } }`，
 * cloudPath = user-plant/{本人用户公开编号}/covers/{userPlantRef}-{32 位十六进制}，追加扩展名后必须通过登记时的本人目录校验；
 * 不单独返回用户编号字段；审计不含用户编号。404 透传，未登记错误 500。
 * 测试层次：L2 / unit_fake：真实 node:http、分发、请求链、Bearer 认证器与 AJV；替换会话解析与用例（假）。
 */
const ownerRef = 'usr_upload_owner0001' as UserRef
const plantRef = 'upl_upload_plant_0001'
const principal: UserPrincipalDto = { principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z' }
const random = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

let server: Server | undefined
async function startService(result?: HttpIdempotencyPublicResponseSnapshot) {
  const calls: GetCoverUploadTargetInput[] = []
  const audits: RequestChainAuditEvent[] = []
  const dispatch = createRouteDispatcher([{ route: coverUploadTargetRoute, handler: createCoverUploadTargetRouteHandler({ ...fixturePolicyPorts(),
    authenticate: createUserBearerAuthenticator(async () => principal), now: () => Date.UTC(2026, 9, 10, 12), writeAudit: event => { audits.push(event) },
    readUploadTarget: async input => {
      calls.push(input)
      return result ?? { status: 200, body: { data: { purpose: 'profile', cloudPath: buildCoverUploadPath(input.principal.user_id, input.userPlantRef, random),
        allowedMimeTypes: [...userPlantAssetRulesV1().allowedMimeTypes], maxBytes: userPlantAssetRulesV1().maxImageBytes } } }
    }
  }) }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const get = (suffix = '', ref = plantRef) => fetch(`${baseUrl}/api/v2/user-plants/${ref}/cover-upload-target${suffix}`, { headers: { authorization: 'Bearer upload-route-bearer-01234567' } })
  return { get, calls, audits }
}
afterEach(async () => { await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve())); server = undefined })

describe('封面上传路径（域规则）', () => {
  test('路径形状固定：本人目录 + 植物引用 + 32 位十六进制；追加扩展名后通过登记目录校验', () => {
    const cloudPath = buildCoverUploadPath(ownerRef, plantRef, random)
    expect(cloudPath).toBe(`user-plant/${ownerRef}/covers/${plantRef}-${random}`)
    for (const extension of ['.jpg', '.png', '.webp']) {
      expect(isOwnCoverFileId(`cloud://env-test-001.bucket-1/${cloudPath}${extension}`, ownerRef)).toBe(true)
    }
    expect(() => buildCoverUploadPath(ownerRef, plantRef, 'XYZ')).toThrow(TypeError)
    expect(() => buildCoverUploadPath('usr_bad/../x', plantRef, random)).toThrow(TypeError)
  })
})

describe('GET …/cover-upload-target 路由', () => {
  test('正常：200 返回 purpose、cloudPath、类型与大小上限；没有单独的用户编号字段；审计不含用户编号', async () => {
    const service = await startService()
    const response = await service.get()
    expect(response.status).toBe(200)
    const body = await response.json() as { data: Record<string, unknown> }
    expect(body).toEqual({ data: { purpose: 'profile', cloudPath: `user-plant/${ownerRef}/covers/${plantRef}-${random}`,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5_242_880 } })
    expect(Object.keys(body.data)).not.toContain('user_id')
    expect(service.calls).toEqual([{ principal, userPlantRef: plantRef, rules: userPlantAssetRulesV1() }])
    expect(JSON.stringify(service.audits)).not.toContain(ownerRef)
  })

  test.each([['带查询参数', '?purpose=profile', plantRef], ['植物引用非法', '', 'not-a-plant']])('%s → 400，不调用用例', async (_name, suffix, ref) => {
    const service = await startService()
    expect((await service.get(suffix, ref)).status).toBe(400)
    expect(service.calls).toEqual([])
  })

  test('用例 404 透传；未登记错误 → 500', async () => {
    const notFound = await startService({ status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } })
    expect((await notFound.get()).status).toBe(404)
    await new Promise<void>(resolve => server!.close(() => resolve()))
    const other = await startService({ status: 409, body: { error: { type: 'USER_PLANT_ARCHIVED', message: 'x' } } })
    expect((await other.get()).status).toBe(500)
  })
})
