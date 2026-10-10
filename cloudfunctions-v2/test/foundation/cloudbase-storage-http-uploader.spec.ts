import { describe, expect, test } from 'vitest'

import { StorageProviderUnavailableError } from '../../src/foundation/storage/cloudbase-storage-http-adapter.js'
import { createCloudbaseStorageHttpUploader } from '../../src/foundation/storage/cloudbase-storage-http-uploader.js'

/**
 * Expected 来源：CloudBase 云存储 HTTP API 官方文档 https://docs.cloudbase.net/http-api/storage/get-objects-upload-info
 * （`POST /v1/storages/get-objects-upload-info`，请求 `[{ objectId }]`；成功项含 `uploadUrl`、`authorization`、`token`、
 * `cloudObjectMeta`、`cloudObjectId`，失败项含 `code`/`message`；随后 PUT 字节到 `uploadUrl`，携带
 * `Authorization`、`X-Cos-Security-Token`、`X-Cos-Meta-Fileid`）；凭证不得进入错误（CLAUDE.md §4）。
 * 测试层次：L1 / `unit_fake`（替身 fetch 记录调用）。未覆盖：真实 CloudBase 网关、真实 COS 上传、凭证有效性。
 */
const fakeKey = 'fixture-not-a-real-api-key'
const cosAuthorization = 'q-sign-algorithm=sha1&fixture-cos-signature'
const cosToken = 'fixture-cos-security-token'
const cosMeta = 'fixture-cloud-object-meta'
const objectId = 'diagnosis/usr_fixture_0001/cases/a.jpg'
const cloudObjectId = 'cloud://env-test-001.bucket/diagnosis/usr_fixture_0001/cases/a.jpg'
const uploadUrl =
  'https://bucket.cos.ap-shanghai.myqcloud.com/diagnosis/usr_fixture_0001/cases/a.jpg'
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

/** 替身 fetch 记录的一次调用。 */
type RecordedCall = {
  /** 请求地址文本，用于断言官方路径与预签名地址。 */
  readonly url: string
  /** 请求初始化参数，用于断言方法、请求头与请求体。 */
  readonly init: RequestInit | undefined
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const successItem = {
  objectId,
  uploadUrl,
  authorization: cosAuthorization,
  token: cosToken,
  cloudObjectMeta: cosMeta,
  cloudObjectId
}

/** 按顺序返回预设响应的替身 fetch。 */
function scriptedFetch(responders: readonly ((init?: RequestInit) => Promise<Response>)[]) {
  const calls: RecordedCall[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const responder = responders[calls.length - 1]
    if (!responder) {
      throw new Error('unexpected fetch call')
    }
    return responder(init)
  }) as unknown as typeof fetch
  return { calls, impl }
}

function uploader(
  fetchImpl: typeof fetch,
  totalDeadlineMs = 1000,
  readApiKey: () => string | undefined = () => fakeKey
) {
  return createCloudbaseStorageHttpUploader({
    fetch: fetchImpl,
    envId: 'env-test-001',
    readApiKey,
    totalDeadlineMs
  })
}

/** 断言失败为不可用错误且错误内容不含任何凭证。 */
async function expectUnavailableWithoutSecrets(failure: Promise<unknown>) {
  await expect(failure).rejects.toBeInstanceOf(StorageProviderUnavailableError)
  await failure.catch((error: Error) => {
    const text = `${String(error.message)}\n${String(error.stack)}\n${JSON.stringify(error)}`
    for (const secret of [fakeKey, cosAuthorization, cosToken, cosMeta]) {
      expect(text).not.toContain(secret)
    }
  })
}

describe('CloudBase 云存储 HTTP API 服务端上传器', () => {
  test('先换取上传信息再 PUT 字节，返回 cloudObjectId', async () => {
    const { calls, impl } = scriptedFetch([
      async () => json([successItem]),
      async () => new Response(null, { status: 200 })
    ])
    await expect(uploader(impl).upload(objectId, bytes, 'image/jpeg')).resolves.toEqual({
      cloudObjectId
    })

    expect(calls).toHaveLength(2)
    const [infoCall, putCall] = calls
    expect(infoCall!.url).toBe(
      'https://env-test-001.api.tcloudbasegateway.com/v1/storages/get-objects-upload-info'
    )
    expect(infoCall!.init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(String(infoCall!.init!.body))).toEqual([{ objectId }])
    const infoHeaders = infoCall!.init!.headers as Record<string, string>
    expect(infoHeaders.authorization).toBe(`Bearer ${fakeKey}`)
    expect(infoHeaders['content-type']).toBe('application/json')

    expect(putCall!.url).toBe(uploadUrl)
    expect(putCall!.init).toMatchObject({ method: 'PUT' })
    const putHeaders = putCall!.init!.headers as Record<string, string>
    expect(putHeaders).toEqual({
      Authorization: cosAuthorization,
      'X-Cos-Security-Token': cosToken,
      'X-Cos-Meta-Fileid': cosMeta,
      'Content-Type': 'image/jpeg'
    })
    expect(Array.from(putCall!.init!.body as Uint8Array)).toEqual(Array.from(bytes))
    expect(putCall!.init!.signal).toBeInstanceOf(AbortSignal)
  })

  test('上传信息为失败项（code/message）→ 不可用，且不发起 PUT', async () => {
    const { calls, impl } = scriptedFetch([
      async () => json([{ code: 'STORAGE_EXCEED_AUTHORITY', message: 'denied' }])
    ])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
    expect(calls).toHaveLength(1)
  })

  test('换取上传信息 HTTP 非 2xx → 不可用', async () => {
    const { calls, impl } = scriptedFetch([async () => json({ code: 'INTERNAL' }, 500)])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
    expect(calls).toHaveLength(1)
  })

  test('PUT 上传 HTTP 非 2xx → 不可用，错误不含 COS 签名或临时令牌', async () => {
    const { calls, impl } = scriptedFetch([
      async () => json([successItem]),
      async () => new Response(`<Error>${cosToken}</Error>`, { status: 403 })
    ])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
    expect(calls).toHaveLength(2)
  })

  test.each([
    ['响应不是数组', { data: [] }],
    ['数组长度不为 1', [successItem, successItem]],
    ['缺少 uploadUrl', [{ ...successItem, uploadUrl: undefined }]],
    ['uploadUrl 非 https', [{ ...successItem, uploadUrl: 'http://cos.example/a.jpg' }]],
    ['缺少 authorization', [{ ...successItem, authorization: undefined }]],
    ['缺少 token', [{ ...successItem, token: 42 }]],
    ['缺少 cloudObjectMeta', [{ ...successItem, cloudObjectMeta: undefined }]],
    ['cloudObjectId 为空', [{ ...successItem, cloudObjectId: '' }]]
  ] as const)('响应不合法：%s → 不可用，且不发起 PUT', async (_name, body) => {
    const { calls, impl } = scriptedFetch([async () => json(body)])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
    expect(calls).toHaveLength(1)
  })

  test('响应体不是 JSON → 不可用', async () => {
    const { impl } = scriptedFetch([async () => new Response('not-json', { status: 200 })])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
  })

  test('网络错误 → 不可用', async () => {
    const { impl } = scriptedFetch([
      async () => {
        throw new TypeError(`fetch failed ${fakeKey}`)
      }
    ])
    await expectUnavailableWithoutSecrets(uploader(impl).upload(objectId, bytes, 'image/jpeg'))
  })

  test('未配置 API Key → 不可用，且不发起任何请求', async () => {
    const { calls, impl } = scriptedFetch([])
    await expectUnavailableWithoutSecrets(
      uploader(impl, 1000, () => undefined).upload(objectId, bytes, 'image/jpeg')
    )
    expect(calls).toHaveLength(0)
  })

  test.each([
    ['空字符串', ''],
    ['以 / 开头', '/diagnosis/a.jpg'],
    ['包含 ..', 'diagnosis/../a.jpg'],
    ['超过 512 字符', 'a'.repeat(513)]
  ])('objectId 非法（%s）→ RangeError，且不发起任何请求', async (_name, invalidObjectId) => {
    const { calls, impl } = scriptedFetch([])
    await expect(
      uploader(impl).upload(invalidObjectId, bytes, 'image/jpeg')
    ).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })

  test('objectId 恰为 512 字符时允许', async () => {
    const { calls, impl } = scriptedFetch([
      async () => json([successItem]),
      async () => new Response(null, { status: 200 })
    ])
    await expect(uploader(impl).upload('a'.repeat(512), bytes, 'image/jpeg')).resolves.toEqual({
      cloudObjectId
    })
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual([{ objectId: 'a'.repeat(512) }])
  })

  test('两次请求共用一个总时限：PUT 阶段挂起超过总时限 → 不可用', async () => {
    const hang = async (init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    const { calls, impl } = scriptedFetch([async () => json([successItem]), hang])
    const startedAt = Date.now()
    await expectUnavailableWithoutSecrets(uploader(impl, 30).upload(objectId, bytes, 'image/jpeg'))
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.init!.signal).toBe(calls[1]!.init!.signal)
  })

  test('换取上传信息阶段超时 → 不可用', async () => {
    const hang = async (init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    const { impl } = scriptedFetch([hang])
    await expectUnavailableWithoutSecrets(uploader(impl, 20).upload(objectId, bytes, 'image/jpeg'))
  })
})
