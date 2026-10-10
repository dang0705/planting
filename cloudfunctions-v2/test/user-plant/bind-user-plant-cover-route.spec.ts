import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import { StorageProviderUnavailableError, type PrivateObjectStorage } from '../../src/foundation/storage/cloudbase-storage-http-adapter.js'
import { createUserBearerAuthenticator } from '../../src/identity/http/user-bearer-authenticator.js'
import type { BindUserPlantCoverInput } from '../../src/user-plant/application/bind-user-plant-cover.js'
import { bindUserPlantCoverRoute, createBindUserPlantCoverRouteHandler } from '../../src/user-plant/http/bind-user-plant-cover-route.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-cover-asset.md §2～§5（2026-10-10 用户审定与裁决）：
 * 请求体严格 {purpose:'profile', fileId, contentSha256}；fileId 必须在本人封面目录；下载后复核大小（≤5 MiB）、SHA-256 与魔数类型；
 * 任一不满足 400 且不进入事务；Provider 不可用 → 503；成功 200 `{ data: { assetRef, purpose, url, urlExpiresAt: null, createdAt } }`。
 * 测试层次：L2/L3 `unit_fake`：真实 node:http、分发、请求链、Bearer 认证器与 AJV；替换会话解析、存储 Provider（假）与登记用例。
 */
const nowMs = Date.UTC(2026, 9, 10, 15)
const ownerRef = 'usr_cover_owner0001' as UserRef
const plantRef = 'upl_cover_plant_0001'
const principal: UserPrincipalDto = { principalType: 'user', user_id: ownerRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '2026-10-10T01:00:00.000Z', expiresAt: '2026-10-11T01:00:00.000Z' }
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const fileId = `cloud://env-test-001.bucket/user-plant/${ownerRef}/covers/a.jpg`
const signedUrl = 'https://cos.example/user-plant/a.jpg?sign=s&t=1'
const validBody = { purpose: 'profile', fileId, contentSha256: sha(jpeg) }

let server: Server | undefined
async function startService(options: { storage?: PrivateObjectStorage | null; result?: HttpIdempotencyPublicResponseSnapshot } = {}) {
  const calls: BindUserPlantCoverInput[] = []
  const storageCalls: string[] = []
  const storage: PrivateObjectStorage | undefined = options.storage === null ? undefined : options.storage ?? {
    getDownloadUrl: async id => { storageCalls.push(`url:${id}`); return signedUrl },
    download: async (_url, maxBytes) => { storageCalls.push(`download:${String(maxBytes)}`); return jpeg }
  }
  const dispatch = createRouteDispatcher([{ route: bindUserPlantCoverRoute, handler: createBindUserPlantCoverRouteHandler({ ...fixturePolicyPorts(),
    authenticate: createUserBearerAuthenticator(async () => principal), now: () => nowMs, writeAudit: () => undefined, storage,
    bindCover: async input => { calls.push(input); return options.result ?? { status: 200, body: { data: { assetRef: input.assetRef, purpose: 'profile', url: input.url, urlExpiresAt: null, createdAt: new Date(nowMs).toISOString() } } } }
  }) }])
  server = createServer((request, response) => { dispatch(request, response).catch(() => undefined) })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  const post = (body: unknown, key: string | null = 'cover-route-key-0001') => fetch(`${baseUrl}/api/v2/user-plants/${plantRef}/assets`, {
    method: 'POST', headers: { authorization: 'Bearer cover-route-bearer-01234567', 'content-type': 'application/json', ...(key === null ? {} : { 'idempotency-key': key }) },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
  return { post, calls, storageCalls }
}
afterEach(async () => { await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve())); server = undefined })

describe('POST …/assets 封面登记路由', () => {
  test('正常：先换链接、按 5 MiB 上限下载复核，再进入事务；响应 urlExpiresAt 为 null、不含 fileId', async () => {
    const service = await startService()
    const response = await service.post(validBody)
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ data: { assetRef: expect.stringMatching(/^ast_[A-Za-z0-9_-]{8,60}$/u), purpose: 'profile', url: signedUrl, urlExpiresAt: null, createdAt: new Date(nowMs).toISOString() } })
    expect(text).not.toContain('cloud://')
    expect(service.storageCalls).toEqual([`url:${fileId}`, 'download:5242880'])
    expect(service.calls[0]).toMatchObject({ userRef: ownerRef, userPlantRef: plantRef, fileId, contentSha256: sha(jpeg), url: signedUrl, nowMs,
      idempotency: { httpMethod: 'POST', operationId: 'bindUserPlantAsset', normalizedPath: '/api/v2/user-plants/{userPlantRef}/assets' } })
  })

  test.each([
    ['他人目录', { ...validBody, fileId: 'cloud://env-test-001.bucket/user-plant/usr_cover_other00001/covers/a.jpg' }],
    ['非封面目录', { ...validBody, fileId: `cloud://env-test-001.bucket/user-plant/${ownerRef}/a.jpg` }],
    ['purpose 不是 profile', { ...validBody, purpose: 'growth' }],
    ['哈希不是 64 位小写十六进制', { ...validBody, contentSha256: 'ABC' }],
    ['夹带额外字段', { ...validBody, mimeType: 'image/jpeg' }],
    ['缺少 fileId', { purpose: 'profile', contentSha256: sha(jpeg) }]
  ])('%s → 400，不访问存储、不进入事务', async (_name, body) => {
    const service = await startService()
    expect((await service.post(body)).status).toBe(400)
    expect(service.storageCalls).toEqual([])
    expect(service.calls).toEqual([])
  })

  test.each([
    ['文件不存在', { getDownloadUrl: async () => null, download: async () => jpeg }],
    ['文件超过 5 MiB', { getDownloadUrl: async () => signedUrl, download: async () => 'too_large' as const }],
    ['内容哈希不一致', { getDownloadUrl: async () => signedUrl, download: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe1]) }],
    ['真实类型是 GIF', { getDownloadUrl: async () => signedUrl, download: async () => new Uint8Array([...Buffer.from('GIF89a')]) }]
  ])('%s → 400，不进入事务', async (_name, storage) => {
    const service = await startService({ storage: storage as PrivateObjectStorage })
    const body = _name === '真实类型是 GIF' ? { ...validBody, contentSha256: sha(new Uint8Array([...Buffer.from('GIF89a')])) } : validBody
    expect((await service.post(body)).status).toBe(400)
    expect(service.calls).toEqual([])
  })

  test.each([
    ['未配置存储 Provider', null],
    ['换链接失败', { getDownloadUrl: async (): Promise<string | null> => { throw new StorageProviderUnavailableError() }, download: async () => jpeg }],
    ['下载失败', { getDownloadUrl: async (): Promise<string | null> => signedUrl, download: async (): Promise<Uint8Array> => { throw new StorageProviderUnavailableError() } }]
  ] as const)('%s → 503 SERVICE_UNAVAILABLE，不进入事务', async (_name, storage) => {
    const service = await startService({ storage: storage as PrivateObjectStorage | null })
    const response = await service.post(validBody)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { type: 'SERVICE_UNAVAILABLE' } })
    expect(service.calls).toEqual([])
  })

  test('缺少幂等头 → 400；用例 404/409 透传；未登记错误 → 500', async () => {
    const service = await startService()
    expect((await service.post(validBody, null)).status).toBe(400)
    await new Promise<void>(resolve => server!.close(() => resolve()))
    const notFound = await startService({ result: { status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } } })
    expect((await notFound.post(validBody)).status).toBe(404)
    await new Promise<void>(resolve => server!.close(() => resolve()))
    const other = await startService({ result: { status: 409, body: { error: { type: 'USER_PLANT_ARCHIVED', message: 'x' } } } })
    expect((await other.post(validBody)).status).toBe(500)
  })
})
