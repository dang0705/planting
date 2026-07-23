import { httpRequest } from '@/http-functions/core/httpRequest'
import { isDevelopmentAppEnv } from '@/utils/runtime-env'
import { normalizeHistoryDetail, normalizeHistoryList } from './client-history-detail'
import {
  requestDiagnoseStream as requestDiagnoseStreamImpl,
  logDiagnosisStartCompletion
} from './client-stream'

const DEV_H5_DIAGNOSIS_OPENID = 'dev_terminal_diagnosis_h5'

function isH5Runtime() {
  return (
    typeof window !== 'undefined' && (typeof wx === 'undefined' || typeof wx?.cloud === 'undefined')
  )
}

function shouldUseDevBypass() {
  return isH5Runtime() && (Boolean(import.meta.env.DEV) || isDevelopmentAppEnv())
}

function buildDevBypassPayload(payload = {}) {
  if (!shouldUseDevBypass()) {
    return payload
  }

  return {
    ...payload,
    skipAuth: true,
    openid: payload?.openid || DEV_H5_DIAGNOSIS_OPENID
  }
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

function unwrapResponseEnvelope(raw, fallbackMessage = '请求失败') {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  const code = Number(raw.code ?? 200)
  if (code !== 200) {
    const error = new Error(raw.message || fallbackMessage)
    error.businessCode = String(raw.businessCode || '').trim()
    error.code = error.businessCode || String(raw.code || '').trim()
    throw error
  }

  return raw.data ?? null
}

const startDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST'
})

const questionStartDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/question/start',
  method: 'POST'
})

const streamDiagnoseRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST',
  enableChunked: true,
  responseType: 'text',
  headers: {
    Accept: 'text/event-stream'
  }
})

const answerDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/answer',
  method: 'POST'
})

const resultDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/result',
  method: 'GET'
})

const historyDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/history',
  method: 'GET'
})

const feedbackDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/feedback',
  method: 'POST'
})

export async function requestDiagnosisStart(payload) {
  const response = await requestWithRetry(
    () => startDiagnosisRequester({ payload, timeout: 65000 }),
    { retries: 1, fallbackMessage: '发起诊断失败' }
  )
  const data = unwrapResponseEnvelope(response?.data, '发起诊断失败')
  logDiagnosisStartCompletion('buffered', data)
  return data
}

export async function requestDiagnosisQuestionStart(payload) {
  const response = await requestWithRetry(
    () => questionStartDiagnosisRequester({ payload, timeout: 25000 }),
    { retries: 1, fallbackMessage: '初始化问诊失败' }
  )
  return unwrapResponseEnvelope(response?.data, '初始化问诊失败')
}

export async function requestDiagnosisAnswer(payload) {
  const response = await requestWithRetry(
    () => answerDiagnosisRequester({ payload, timeout: 25000 }),
    { retries: 1, fallbackMessage: '提交问诊失败' }
  )
  return unwrapResponseEnvelope(response?.data, '提交问诊失败')
}

export async function requestDiagnosisResult(query) {
  const requestQuery = {
    id: query?.id || query?.sessionId || query?.resultId || ''
  }
  if (query?.skipAuth !== undefined) {
    requestQuery.skipAuth = query.skipAuth
  }
  if (query?.openid) {
    requestQuery.openid = query.openid
  }

  const response = await resultDiagnosisRequester({
    query: requestQuery
  })
  const data = unwrapResponseEnvelope(response?.data, '读取诊断结果失败')
  return normalizeHistoryDetail(data)
}

export async function requestDiagnosisHistory(query = {}) {
  const response = await historyDiagnosisRequester({ query })
  const data = unwrapResponseEnvelope(response?.data, '读取诊断历史失败')
  return normalizeHistoryList(data)
}

export async function requestDiagnosisFeedback(payload) {
  const response = await feedbackDiagnosisRequester({ payload: buildDevBypassPayload(payload) })
  return unwrapResponseEnvelope(response?.data, '提交反馈失败')
}

// 适配既有调用名：同步诊断即发起首轮诊断。
export async function requestDiagnoseSync(payload) {
  return requestDiagnosisStart(payload)
}

export async function requestDiagnoseStream(payload, { onProgress } = {}) {
  return requestDiagnoseStreamImpl(payload, {
    onProgress,
    streamDiagnoseRequester,
    requestWithRetry,
    requestDiagnosisStart
  })
}
