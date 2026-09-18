import { requestHttpFile, requestHttpFunction } from '@/api/http'
import { ensureWechatCloudInitialized, getCloudbaseUserIdentity } from '@/utils/cloudbase-auth.js'

const NATIVE_DIAGNOSE_SUFFIXES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'])

function isNativeWechatStorageAvailable() {
  return (
    typeof wx !== 'undefined' &&
    typeof wx?.cloud?.uploadFile === 'function' &&
    typeof wx?.cloud?.getTempFileURL === 'function'
  )
}

function sanitizeCloudPathSegment(value, fallback = 'temp') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)
  return normalized || fallback
}

function normalizeDiagnoseSuffix(value = 'jpg') {
  const normalized = String(value || 'jpg')
    .trim()
    .toLowerCase()
    .replace(/^\./u, '')
  return NATIVE_DIAGNOSE_SUFFIXES.has(normalized) ? normalized : 'jpg'
}

function resolveDiagnoseMimeType(suffix = 'jpg') {
  const normalized = normalizeDiagnoseSuffix(suffix)
  return normalized === 'jpg' || normalized === 'jpeg' ? 'image/jpeg' : `image/${normalized}`
}

function buildNativeDiagnoseCloudPath({ openid, plantId, suffix }) {
  const safeOpenid = sanitizeCloudPathSegment(openid, '')
  if (!safeOpenid) {
    return ''
  }
  const safePlantId = sanitizeCloudPathSegment(plantId, 'temp')
  const random = Math.random().toString(36).slice(2, 10)
  return `diagnose/${safeOpenid}/${safePlantId}_${Date.now()}_${random}.${normalizeDiagnoseSuffix(suffix)}`
}

function callWechatCloudUpload({ filePath, cloudPath }) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: resolve,
      fail: reject
    })
  })
}

function callWechatCloudTempUrl({ fileId }) {
  // 与现有图片链接查询共用 CloudBase 小程序 SDK 的 Promise 合同。
  // 这里的 fileList 必须是云文件 ID 字符串数组；上传完成后先取不到
  // 临时链接会阻断后续“登记图片 -> 盆土识别”两个请求。
  return wx.cloud.getTempFileURL({ fileList: [fileId] })
}

async function resolveNativeWechatOpenId(payload = {}) {
  const cachedOpenid = String(payload.openid || '').trim()
  if (cachedOpenid) {
    return cachedOpenid
  }

  // Pinia 登录态可能尚未完成回填；微信端仍应优先走原生直传，
  // 通过 CloudBase 身份接口补齐 openid，禁止因缓存字段为空退回 HTTP 中转。
  const identity = await getCloudbaseUserIdentity()
  return String(identity?.openid || '').trim()
}

async function requestNativeWechatDiagnoseImageUpload({
  filePath,
  openid,
  plantId,
  suffix,
  fileBytes = 0,
  resolveTempUrl = true
}) {
  const cloudPath = buildNativeDiagnoseCloudPath({ openid, plantId, suffix })
  if (!cloudPath) {
    throw new Error('微信登录身份无效，无法上传诊断图片')
  }

  ensureWechatCloudInitialized()
  const startedAt = Date.now()
  const uploadStartedAt = Date.now()
  const uploadResult = await callWechatCloudUpload({ filePath, cloudPath })
  const uploadFinishedAt = Date.now()
  const fileId = String(uploadResult?.fileID || uploadResult?.fileId || '').trim()
  if (!fileId) {
    throw new Error('上传成功但未获取到图片 ID')
  }

  let tempUrl = ''
  let tempUrlMs = 0
  if (resolveTempUrl) {
    const tempUrlStartedAt = Date.now()
    const urlResult = await callWechatCloudTempUrl({ fileId })
    const tempUrlFinishedAt = Date.now()
    const file = urlResult?.fileList?.[0] || {}
    tempUrl = String(file.tempFileURL || file.download_url || '').trim()
    if (!tempUrl) {
      throw new Error('上传成功但未获取到图片访问地址')
    }
    tempUrlMs = Math.max(0, tempUrlFinishedAt - tempUrlStartedAt)
  }

  return {
    fileId,
    cloudPath,
    url: tempUrl,
    tempUrl,
    suffix: normalizeDiagnoseSuffix(suffix),
    mimeType: resolveDiagnoseMimeType(suffix),
    size: Number(fileBytes || 0),
    uploadTiming: {
      contractVersion: 'diagnose_image_upload_timing_v1',
      transport: 'wechat_cloud_native',
      binaryBytes: Number(fileBytes || 0),
      base64Bytes: 0,
      base64ExpansionBytes: 0,
      decodeAndValidateMs: 0,
      cloudbaseInitMs: 0,
      fileValidationMs: 0,
      tempWriteMs: 0,
      cloudStorageUploadMs: Math.max(0, uploadFinishedAt - uploadStartedAt),
      tempUrlMs,
      uploadPipelineMs: Math.max(0, Date.now() - startedAt)
    }
  }
}

function unwrapResponseEnvelope(raw, fallbackMessage = '请求失败') {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  const code = Number(raw.code ?? 200)
  if (code !== 200) {
    throw new Error(raw.message || fallbackMessage)
  }

  return raw.data ?? null
}

function isRetryableRequestError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network error') ||
    message.includes('request:fail') ||
    message.includes('fail timeout')
  )
}

function normalizeRequestError(error, fallbackMessage) {
  const message = String(error?.message || error || '')
  if (/timeout|timed out|fail timeout/i.test(message)) {
    return new Error(`${fallbackMessage}，请求超时，请重试`)
  }
  return error instanceof Error ? error : new Error(fallbackMessage)
}

async function requestWithRetry(
  task,
  { retries = 1, fallbackMessage = '请求失败', onAttempt = null } = {}
) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (typeof onAttempt === 'function') {
        onAttempt(attempt + 1)
      }
      return await task()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isRetryableRequestError(error)) {
        break
      }
    }
  }

  throw normalizeRequestError(lastError, fallbackMessage)
}

export async function requestDiagnoseImageUpload(payload = {}, { onAttempt = null } = {}) {
  if (payload?.filePath) {
    if (isNativeWechatStorageAvailable()) {
      // 微信端按 CloudBase 官方原生存储链路上传，避免文件先进入 HTTP 云函数
      // 再由云函数转发到 COS；原生链路不携带 Base64，也不对未知结果重试，
      // 防止网络超时后产生重复文件。其他平台继续使用 multipart HTTP 回退。
      const nativeOpenid = await resolveNativeWechatOpenId(payload)
      if (nativeOpenid) {
        console.log('[诊断图片上传][路由]', { transport: 'wechat_cloud_native' })
        if (typeof onAttempt === 'function') {
          onAttempt(1)
        }
        return requestNativeWechatDiagnoseImageUpload({
          ...payload,
          openid: nativeOpenid
        })
      }
    }

    console.log('[诊断图片上传][路由]', { transport: 'multipart_file' })
    const formData = Object.fromEntries(
      Object.entries({
        suffix: payload.suffix,
        plantId: payload.plantId,
        maxAge: payload.maxAge
      }).filter(([, value]) => value !== undefined && value !== null && value !== '')
    )
    const response = await requestWithRetry(
      () =>
        requestHttpFile('storage-http/storage/diagnose-images', {
          filePath: payload.filePath,
          name: 'file',
          formData,
          requirePlatformSession: true,
          timeout: 30000
        }),
      { retries: 1, fallbackMessage: '上传诊断图片失败', onAttempt }
    )
    return unwrapResponseEnvelope(response, '上传诊断图片失败')
  }

  // 兼容尚未更新的小程序版本；新的诊断上传调用方必须传 filePath，
  // 禁止为了上传诊断图片重新转换为 Base64。
  const response = await requestWithRetry(
    () =>
      requestHttpFunction('storage-http/storage/diagnose-images', {
        method: 'POST',
        body: payload,
        requirePlatformSession: true,
        timeout: 30000
      }),
    { retries: 1, fallbackMessage: '上传诊断图片失败', onAttempt }
  )

  return unwrapResponseEnvelope(response, '上传诊断图片失败')
}

export async function requestDiagnoseImageDelete(payload = {}) {
  const response = await requestHttpFunction('storage-http/storage/diagnose-images', {
    method: 'DELETE',
    body: payload,
    requirePlatformSession: true
  })

  return unwrapResponseEnvelope(response, '删除诊断图片失败')
}

export async function requestStorageFileUpload(payload = {}) {
  const response = await requestWithRetry(
    () =>
      requestHttpFunction('storage-http/storage/files', {
        method: 'POST',
        body: payload,
        timeout: 30000
      }),
    { retries: 1, fallbackMessage: '上传图片失败' }
  )

  return unwrapResponseEnvelope(response, '上传图片失败')
}

export async function requestStorageFileUrl(query = {}) {
  const response = await requestWithRetry(
    () =>
      requestHttpFunction('storage-http/storage/files', {
        method: 'GET',
        query,
        timeout: 10000
      }),
    { retries: 1, fallbackMessage: '获取图片链接失败' }
  )

  return unwrapResponseEnvelope(response, '获取图片链接失败')
}

export async function requestStorageFileDelete(payload = {}) {
  const response = await requestHttpFunction('storage-http/storage/files', {
    method: 'DELETE',
    body: payload
  })

  return unwrapResponseEnvelope(response, '删除图片失败')
}

export async function registerDiagnoseImageAsPlantImage(payload = {}) {
  const response = await requestHttpFunction('storage-http/storage/plant-images', {
    method: 'POST',
    body: payload,
    requirePlatformSession: true,
    timeout: 15000
  })
  return unwrapResponseEnvelope(response, '登记盆土照片失败')
}
