import { httpRequest } from '@/http-functions/core/httpRequest'
import { DIAGNOSIS_HTTP_BASE_URL } from '@/api/env'
import { normalizeHistoryDetail, normalizeHistoryList } from './client-history-detail'
import { requestDiagnoseStream as requestDiagnoseStreamImpl } from './client-stream'

function isRetryableRequestError(error) {
  if (error?.isRetryable) {
    return true
  }
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
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

const questionStartDiagnosisRequester = httpRequest({
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

const streamDiagnoseRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/start',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  enableChunked: true,
  responseType: 'text',
  // SSE 诊断同样属于写入/扣减链路，必须使用可即时吊销的持久平台会话。
  requirePlatformSession: true,
  headers: {
    Accept: 'text/event-stream'
  }
})

const answerDiagnosisRequester = httpRequest({
  functionPath: 'diagnosis-answer-http/diagnosis/answer',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

const legacyAnswerDiagnosisRequester = httpRequest({
  functionPath: 'diagnose-http/diagnosis/answer',
  method: 'POST',
  baseUrl: DIAGNOSIS_HTTP_BASE_URL,
  requirePlatformSession: true
})

function supportsDedicatedQuestionPackage(payload = {}) {
  return ['yellowing_mode', 'wilting_droop_mode'].includes(
    String(payload?.symptomClassKey || payload?.symptom_class_key || '').trim()
  )
}

function supportsDedicatedYellowLeafAnswer(payload = {}) {
  const questionPackage = payload?.questionPackage || payload?.question_package || {}
  const packageMode = String(
    questionPackage?.mode || questionPackage?.sourceMode || questionPackage?.route || ''
  )
    .trim()
    .toLowerCase()
  return (
    String(payload?.requestMode || payload?.mode || '')
      .trim()
      .toLowerCase() === 'answer_submit' &&
    [
      'yellow_leaf',
      'manual_yellowing_care_environment_frontloaded',
      'yellowing_mode',
      'leaf_yellowing'
    ].includes(packageMode) &&
    String(questionPackage?.answerSubmitMode || questionPackage?.answer_submit_mode || '')
      .trim()
      .toLowerCase() === 'package'
  )
}

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
  return data
}

export async function requestDiagnosisQuestionStart(payload) {
  const response = await requestWithRetry(
    () =>
      (supportsDedicatedQuestionPackage(payload)
        ? questionStartDiagnosisRequester
        : legacyQuestionStartDiagnosisRequester)({ payload, timeout: 25000 }),
    { retries: 1, fallbackMessage: '初始化问诊失败' }
  )
  return unwrapResponseEnvelope(response?.data, '初始化问诊失败')
}

export async function requestDiagnosisAnswer(payload) {
  const response = await requestWithRetry(
    () =>
      (supportsDedicatedYellowLeafAnswer(payload)
        ? answerDiagnosisRequester
        : legacyAnswerDiagnosisRequester)({ payload, timeout: 25000 }),
    { retries: 1, fallbackMessage: '提交问诊失败' }
  )
  return unwrapResponseEnvelope(response?.data, '提交问诊失败')
}

export async function requestDiagnosisResult(query) {
  const requestQuery = {
    id: query?.id || query?.sessionId || query?.resultId || ''
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
  const response = await feedbackDiagnosisRequester({ payload })
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
