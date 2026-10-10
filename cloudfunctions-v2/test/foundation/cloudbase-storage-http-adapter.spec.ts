import { describe, expect, test, vi } from 'vitest'

import { createCloudbaseStorageHttpAdapter, StorageProviderUnavailableError } from '../../src/foundation/storage/cloudbase-storage-http-adapter.js'

/**
 * Expected 来源：CloudBase 云存储 HTTP API 官方 OpenAPI（storage.v1：`POST /v1/storages/get-objects-download-info`，请求 `[{ cloudObjectId }]`，
 * 响应数组项为 `{ cloudObjectId, downloadUrl }` 或 `{ code, message }`，`Authorization: Bearer <API Key>`）；
 * user-plant-cover-asset.md §2/§4（Provider 不可用 → 调用方 503；凭证只经环境变量名读取，不进入错误或日志）。
 * 测试层次：L1 / `unit_fake`（替身 fetch）。未覆盖：真实 CloudBase 网关、真实 COS 下载、凭证有效性。
 */
const fileId = 'cloud://env-test-001.bucket/user-plant/usr_cover_owner0001/covers/a.jpg'
const fakeKey = 'fixture-not-a-real-key'

function adapter(fetchImpl: typeof fetch, apiKey: string | undefined = fakeKey) {
  return createCloudbaseStorageHttpAdapter({ fetch: fetchImpl, envId: 'env-test-001', readApiKey: () => apiKey, totalDeadlineMs: 1000 })
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('CloudBase 云存储 HTTP API 适配器', () => {
  test('换取下载链接：按官方路径与请求体调用，携带 Bearer，返回 downloadUrl', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json([{ cloudObjectId: fileId, downloadUrl: 'https://cos.example/a.jpg?sign=s&t=1' }]))
    expect(await adapter(fetchImpl as unknown as typeof fetch).getDownloadUrl(fileId)).toBe('https://cos.example/a.jpg?sign=s&t=1')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://env-test-001.api.tcloudbasegateway.com/v1/storages/get-objects-download-info')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(String(init!.body))).toEqual([{ cloudObjectId: fileId }])
    expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${fakeKey}`)
  })

  test('对象不存在（数组项为错误码）→ null，不当作 Provider 故障', async () => {
    expect(await adapter((async () => json([{ code: 'OBJECT_NOT_EXIST', message: 'not exist' }])) as unknown as typeof fetch).getDownloadUrl(fileId)).toBeNull()
  })

  test.each([
    ['未配置 API Key', async () => json([]), undefined],
    ['HTTP 500', async () => json({ code: 'INTERNAL' }, 500), fakeKey],
    ['响应不是数组', async () => json({ data: [] }), fakeKey],
    ['网络错误', async () => { throw new TypeError('fetch failed') }, fakeKey],
    ['无权限错误码', async () => json([{ code: 'STORAGE_EXCEED_AUTHORITY', message: 'x' }]), fakeKey]
  ] as const)('%s → StorageProviderUnavailableError，错误信息不含凭证', async (_name, impl, key) => {
    const failure = adapter(impl as unknown as typeof fetch, key).getDownloadUrl(fileId)
    await expect(failure).rejects.toBeInstanceOf(StorageProviderUnavailableError)
    await failure.catch((error: Error) => { expect(String(error.message) + String(error.stack)).not.toContain(fakeKey) })
  })

  test('超时 → StorageProviderUnavailableError', async () => {
    const slow = (async (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(createCloudbaseStorageHttpAdapter({ fetch: slow, envId: 'env-test-001', readApiKey: () => fakeKey, totalDeadlineMs: 20 }).getDownloadUrl(fileId))
      .rejects.toBeInstanceOf(StorageProviderUnavailableError)
  })

  test('下载：不超过上限返回字节；超过上限返回 too_large；HTTP 错误 → 不可用', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const ok = adapter((async () => new Response(bytes, { status: 200 })) as unknown as typeof fetch)
    expect(Array.from(await ok.download('https://cos.example/a.jpg', 7) as Uint8Array)).toEqual(Array.from(bytes))
    expect(await ok.download('https://cos.example/a.jpg', 6)).toBe('too_large')
    await expect(adapter((async () => new Response('x', { status: 403 })) as unknown as typeof fetch).download('https://cos.example/a.jpg', 10))
      .rejects.toBeInstanceOf(StorageProviderUnavailableError)
  })
})
