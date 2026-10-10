/**
 * CloudBase 云存储 HTTP API 受控适配器（Provider `cloudbase_storage`，endpointProfile `cloudbase_storage_http_api_v1`）。
 * 用户 2026-10-10 裁决：不引入 `@cloudbase/node-sdk`，用 Node 22 原生 fetch 调官方 OpenAPI `storage.v1`。
 * 依赖审查见 `.codex/backend-v2/evidence/E03-cover-sdk-dependency-review-2026-10-10.md`。
 *
 * 凭证：只通过调用方注入的 `readApiKey()`（按 credentialRef 环境变量名读取）在请求时取得，绝不进入错误、日志或返回值。
 */

/** 私有对象存储端口（业务域只依赖本接口，测试用假实现替换）。 */
export interface PrivateObjectStorage {
  /** 用 fileID 换取临时下载链接；对象不存在返回 null；Provider 故障抛 StorageProviderUnavailableError。 */
  readonly getDownloadUrl: (fileId: string) => Promise<string | null>
  /** 下载对象内容；超过 maxBytes 返回 'too_large'（不再继续读取）；Provider 故障抛 StorageProviderUnavailableError。 */
  readonly download: (url: string, maxBytes: number) => Promise<Uint8Array | 'too_large'>
}

/** 云存储暂不可用（未配置凭证、网络失败、超时、HTTP 错误或响应不合法）；消息固定，不含凭证或上游原文。 */
export class StorageProviderUnavailableError extends Error {
  constructor() {
    super('云存储暂不可用')
    this.name = 'StorageProviderUnavailableError'
  }
}

/** 适配器依赖。 */
export interface CloudbaseStorageHttpAdapterDependencies {
  /** 原生 fetch（测试注入替身）。 */
  readonly fetch: typeof fetch
  /** CloudBase 环境 ID，用于网关域名 `https://{envId}.api.tcloudbasegateway.com`。 */
  readonly envId: string
  /** 按 credentialRef 读取服务端 API Key；未配置返回 undefined（→ 不可用）。 */
  readonly readApiKey: () => string | undefined
  /** 单次调用总时限毫秒（Provider 档案 totalDeadlineMs）。 */
  readonly totalDeadlineMs: number
}

/** 在总时限内执行一次 fetch；任何异常统一为不可用。 */
async function fetchWithin(dependencies: CloudbaseStorageHttpAdapterDependencies, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), dependencies.totalDeadlineMs)
  try {
    return await dependencies.fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new StorageProviderUnavailableError()
  } finally {
    clearTimeout(timer)
  }
}

/** 对象不存在类错误码（OpenAPI storage.v1 错误码表）；其余错误码视为 Provider 不可用。 */
const missingObjectCodes = new Set(['OBJECT_NOT_EXIST', 'INVALID_PARAM'])

/** 创建 CloudBase 云存储 HTTP API 适配器。 */
export function createCloudbaseStorageHttpAdapter(dependencies: CloudbaseStorageHttpAdapterDependencies): PrivateObjectStorage {
  const endpoint = `https://${dependencies.envId}.api.tcloudbasegateway.com/v1/storages/get-objects-download-info`
  return {
    async getDownloadUrl(fileId) {
      const apiKey = dependencies.readApiKey()
      if (!apiKey || !/^[a-z0-9-]{1,64}$/u.test(dependencies.envId)) { throw new StorageProviderUnavailableError() }
      const response = await fetchWithin(dependencies, endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify([{ cloudObjectId: fileId }])
      })
      if (!response.ok) { throw new StorageProviderUnavailableError() }
      let body: unknown
      try { body = await response.json() } catch { throw new StorageProviderUnavailableError() }
      if (!Array.isArray(body) || body.length !== 1 || !body[0] || typeof body[0] !== 'object') { throw new StorageProviderUnavailableError() }
      const item = body[0] as Record<string, unknown>
      if (typeof item.code === 'string') {
        if (missingObjectCodes.has(item.code)) { return null }
        throw new StorageProviderUnavailableError()
      }
      if (typeof item.downloadUrl !== 'string' || !/^https:\/\//u.test(item.downloadUrl)) { throw new StorageProviderUnavailableError() }
      return item.downloadUrl
    },
    async download(url, maxBytes) {
      if (!/^https:\/\//u.test(url) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) { throw new StorageProviderUnavailableError() }
      const response = await fetchWithin(dependencies, url, { method: 'GET' })
      if (!response.ok || !response.body) { throw new StorageProviderUnavailableError() }
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          total += chunk.byteLength
          if (total > maxBytes) { await response.body.cancel().catch(() => undefined); return 'too_large' }
          chunks.push(chunk)
        }
      } catch { throw new StorageProviderUnavailableError() }
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return bytes
    }
  }
}
