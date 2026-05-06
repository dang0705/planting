import { requestHttpFunction } from '@/api/http'

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

async function requestWithRetry(task, { retries = 1, fallbackMessage = '请求失败' } = {}) {
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
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

export async function requestDiagnoseImageUpload(payload = {}) {
  const response = await requestWithRetry(
    () =>
      requestHttpFunction('storage-http/storage/diagnose-images', {
        method: 'POST',
        body: payload,
        timeout: 30000
      }),
    { retries: 1, fallbackMessage: '上传诊断图片失败' }
  )

  return unwrapResponseEnvelope(response, '上传诊断图片失败')
}

export async function requestDiagnoseImageDelete(payload = {}) {
  const response = await requestHttpFunction('storage-http/storage/diagnose-images', {
    method: 'DELETE',
    body: payload
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
