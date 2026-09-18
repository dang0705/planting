import { httpRequest } from '@/http-functions/core/httpRequest'

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

function unwrapResponseEnvelope(responseData, fallbackMessage) {
  const envelope =
    responseData?.data && responseData?.code === undefined ? responseData.data : responseData
  const code = Number(envelope?.code)
  if (code === 200) {
    return envelope?.data
  }
  const error = new Error(envelope?.message || fallbackMessage)
  error.businessCode = String(envelope?.businessCode || '').trim()
  error.code = error.businessCode || String(envelope?.code || '').trim()
  throw error
}

const retakeAuthorizeRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/retake/authorize',
  method: 'POST'
})

const retakeSkipRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/retake/skip',
  method: 'POST'
})

export async function requestDiagnosisRetakeAuthorize(payload) {
  const response = await requestWithRetry(
    () => retakeAuthorizeRequester({ payload, timeout: 15000 }),
    { retries: 1, fallbackMessage: '开始补拍失败' }
  )
  return unwrapResponseEnvelope(response?.data, '开始补拍失败')
}

export async function requestDiagnosisRetakeSkip(payload) {
  const response = await requestWithRetry(
    () => retakeSkipRequester({ payload, timeout: 15000 }),
    { retries: 1, fallbackMessage: '跳过补拍失败' }
  )
  return unwrapResponseEnvelope(response?.data, '跳过补拍失败')
}
