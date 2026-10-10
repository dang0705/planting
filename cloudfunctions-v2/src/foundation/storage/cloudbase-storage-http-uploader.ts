/**
 * CloudBase 云存储 HTTP API 服务端上传器（Provider `cloudbase_storage`，与下载适配器共用同一端点档案与凭证读取方式）。
 * 官方流程（https://docs.cloudbase.net/http-api/storage/get-objects-upload-info）：
 * 1. `POST /v1/storages/get-objects-upload-info` 用对象路径换取 COS 预签名上传信息；
 * 2. 把字节 PUT 到返回的 `uploadUrl`，并携带返回的 COS 签名、临时令牌与对象元数据请求头。
 *
 * 凭证：API Key 只在请求时经 `readApiKey()` 取得；API Key、COS 签名、临时令牌和元数据都不得进入错误、日志或返回值。
 */
import {
  StorageProviderUnavailableError,
  type CloudbaseStorageHttpAdapterDependencies
} from './cloudbase-storage-http-adapter.js'

/** 私有对象上传端口（业务域只依赖本接口，测试用假实现替换）。 */
export interface PrivateObjectUploader {
  /**
   * 把字节上传到云存储私有对象路径，成功返回 CloudBase 文件标识（cloud:// 开头的 fileID）。
   * objectId 非法时在任何网络请求前抛 RangeError；Provider 故障、超时或响应不合法抛 StorageProviderUnavailableError。
   */
  upload(
    objectId: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<{
    /** 上传成功后的 CloudBase 文件标识（cloud:// 开头的 fileID），用于后续持久化与换取下载链接。 */
    readonly cloudObjectId: string
  }>
}

/** 上传器依赖：与下载适配器完全一致（fetch、环境 ID、API Key 读取函数、总时限）。 */
export type CloudbaseStorageHttpUploaderDependencies = CloudbaseStorageHttpAdapterDependencies

/** 对象路径最大长度（字符数），超过即视为调用方编程错误。 */
const maxObjectIdLength = Number('512')

/** 换取上传信息成功后得到的 COS 预签名上传材料（仅在本模块内流动，绝不外泄）。 */
type UploadInfo = {
  /** COS 预签名上传地址，必须为 https。 */
  readonly uploadUrl: string
  /** COS 请求签名，作为 PUT 的 Authorization 请求头。 */
  readonly authorization: string
  /** COS 临时安全令牌，作为 X-Cos-Security-Token 请求头。 */
  readonly token: string
  /** CloudBase 对象元数据，作为 X-Cos-Meta-Fileid 请求头。 */
  readonly cloudObjectMeta: string
  /** 上传完成后的 CloudBase 文件标识。 */
  readonly cloudObjectId: string
}

/** 校验对象路径：非空、不以 / 开头、不含 ..、长度不超过上限；不合法抛 RangeError。 */
function assertValidObjectId(objectId: unknown): asserts objectId is string {
  if (
    typeof objectId !== 'string' ||
    objectId.length === Number('0') ||
    objectId.length > maxObjectIdLength ||
    objectId.startsWith('/') ||
    objectId.includes('..')
  ) {
    throw new RangeError('云存储对象路径不合法')
  }
}

/** 判断值为非空字符串。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > Number('0')
}

/** 从换取上传信息响应体中解析唯一成功项；失败项或形态不合法统一视为不可用。 */
function parseUploadInfo(body: unknown): UploadInfo {
  if (!Array.isArray(body) || body.length !== Number('1')) {
    throw new StorageProviderUnavailableError()
  }
  const [first] = body as unknown[]
  if (!first || typeof first !== 'object') {
    throw new StorageProviderUnavailableError()
  }
  const item = first as Record<string, unknown>
  if (item.code !== undefined) {
    throw new StorageProviderUnavailableError()
  }
  if (
    !isNonEmptyString(item.uploadUrl) ||
    !item.uploadUrl.startsWith('https://') ||
    !isNonEmptyString(item.authorization) ||
    !isNonEmptyString(item.token) ||
    !isNonEmptyString(item.cloudObjectMeta) ||
    !isNonEmptyString(item.cloudObjectId)
  ) {
    throw new StorageProviderUnavailableError()
  }
  return {
    uploadUrl: item.uploadUrl,
    authorization: item.authorization,
    token: item.token,
    cloudObjectMeta: item.cloudObjectMeta,
    cloudObjectId: item.cloudObjectId
  }
}

/** 创建 CloudBase 云存储 HTTP API 服务端上传器。 */
export function createCloudbaseStorageHttpUploader(
  dependencies: CloudbaseStorageHttpUploaderDependencies
): PrivateObjectUploader {
  const endpoint = `https://${dependencies.envId}.api.tcloudbasegateway.com/v1/storages/get-objects-upload-info`
  return {
    async upload(objectId, bytes, contentType) {
      assertValidObjectId(objectId)
      if (!(bytes instanceof Uint8Array) || !isNonEmptyString(contentType)) {
        throw new RangeError('云存储上传参数不合法')
      }
      const apiKey = dependencies.readApiKey()
      if (!apiKey || !/^[a-z0-9-]{1,64}$/u.test(dependencies.envId)) {
        throw new StorageProviderUnavailableError()
      }

      // 两次请求（换取上传信息 + PUT 字节）共用一个总时限。
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), dependencies.totalDeadlineMs)
      try {
        const infoResponse = await dependencies.fetch(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify([{ objectId }]),
          signal: controller.signal
        })
        if (!infoResponse.ok) {
          throw new StorageProviderUnavailableError()
        }
        const info = parseUploadInfo(await infoResponse.json())
        const putResponse = await dependencies.fetch(info.uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: info.authorization,
            'X-Cos-Security-Token': info.token,
            'X-Cos-Meta-Fileid': info.cloudObjectMeta,
            'Content-Type': contentType
          },
          body: bytes,
          signal: controller.signal
        })
        if (!putResponse.ok) {
          throw new StorageProviderUnavailableError()
        }
        await putResponse.body?.cancel().catch(() => undefined)
        return { cloudObjectId: info.cloudObjectId }
      } catch {
        // 任何异常（含网络错误、超时中止、JSON 解析失败）统一为固定消息的不可用错误，丢弃可能含凭证的上游原文。
        throw new StorageProviderUnavailableError()
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
