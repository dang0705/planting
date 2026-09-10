/* oxlint-disable no-magic-numbers */
import { DIAGNOSIS_HTTP_BASE_URL } from '@/api/env'
import { httpRequest } from '@/http-functions/core/httpRequest'

const startDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

const startQuestionDiagnosisRequester = httpRequest({
  functionPath: 'diagnosis-question-start-http/diagnosis/question/start',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

const legacyQuestionStartDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/question/start',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

function supportsDedicatedQuestionPackage(payload = {}) {
  return ['yellowing_mode', 'wilting_droop_mode'].includes(
    String(payload?.symptomClassKey || payload?.symptom_class_key || '').trim()
  )
}

function unwrapResponseEnvelope(raw, fallbackMessage) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  if (Number(raw.code ?? 200) !== 200) {
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

async function request(requester, payload, timeout, fallbackMessage) {
  let lastError = null

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await requester({ payload, timeout })
      return unwrapResponseEnvelope(response?.data, fallbackMessage)
    } catch (error) {
      lastError = error
      if (attempt === 1 || !isRetryableRequestError(error)) {
        break
      }
    }
  }

  throw normalizeRequestError(lastError, fallbackMessage)
}

export function requestDiagnosisStart(payload) {
  return request(startDiagnosisRequester, payload, 65000, '发起诊断失败')
}

export function requestDiagnosisQuestionStart(payload) {
  return request(
    supportsDedicatedQuestionPackage(payload)
      ? startQuestionDiagnosisRequester
      : legacyQuestionStartDiagnosisRequester,
    payload,
    25000,
    '初始化问诊失败'
  )
}
