'use strict'

const { checkAIQuota } = require('/opt/utils/quota')
const { callLLMDiagnose } = require('./utils/llm')
const { parseLLMDiagnosis } = require('./utils/diagnosis-parser')
const { persistDiagnosisSideEffects } = require('./utils/persist')
const { buildSymptomLabelerPrompt } = require('./utils/symptom-labeler-prompt')
const {
  jsonResponse,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo,
  isSkipAuthEnabled
} = require('/opt/utils/http')
const { buildStructuredDiagnosis } = require('/opt/utils/plant-diagnosis')
const { debugLog, buildRecordId } = require('./utils/common')

async function buildUserMessage({ image, concise = true }) {
  let userMessage = await buildSymptomLabelerPrompt()
  if (image) {
    userMessage += `\n\n植物图片：![植物图片](${image})`
  }
  if (concise) {
    userMessage += '\n\n请严格按上面的输出格式返回 JSON。'
  }
  return userMessage
}

function resolveHttpAction(event, requestData) {
  const accept = String(requestData.headers?.accept || '')
  const path = String(requestData.path || '')

  if (event.action) return event.action
  if (requestData.query.action) return requestData.query.action
  if (requestData.body.action) return requestData.body.action
  if (path.includes('/stream/diagnose')) return 'streamDiagnose'
  if (path.includes('/diagnose')) return 'syncDiagnose'
  if (path.includes('/health')) return 'health'
  if (accept.includes('text/event-stream')) return 'streamDiagnose'
  return ''
}

function normalizeArrayInput(value) {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function isFollowUpRound(payload = {}) {
  const observedSymptoms = normalizeArrayInput(payload.observedSymptoms)
  const followUpAnswers = normalizeArrayInput(payload.followUpAnswers)
  return Boolean(
    followUpAnswers.length || (Boolean(payload.skipAIExtraction) && observedSymptoms.length)
  )
}

function resolveMode(value) {
  return String(value || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'
}

async function finalizeDiagnosisResult({
  openid,
  userPlantId,
  description,
  diagnosisText,
  baseResult,
  mode,
  observedSymptomsInput = [],
  followUpAnswers = [],
  skipAIExtraction = false
}) {
  if (!openid || !userPlantId) {
    return {
      ...baseResult,
      diagnosisMode: mode,
      reliabilityScore: baseResult.reliabilityScore || 0,
      needsFollowUp: Boolean(baseResult.needsFollowUp)
    }
  }

  try {
    return await buildStructuredDiagnosis({
      openid,
      userPlantId,
      description,
      diagnosisText,
      baseResult,
      mode,
      observedSymptomsInput,
      followUpAnswers,
      skipAIExtraction
    })
  } catch (error) {
    console.warn('基于新知识库构建结构化诊断失败:', error.message)
    return {
      ...baseResult,
      diagnosisMode: mode,
      reliabilityScore: baseResult.reliabilityScore || 0,
      needsFollowUp: Boolean(baseResult.needsFollowUp)
    }
  }
}

async function resolveDiagnoseContext({ event, context, requestData, isHttpCall }) {
  const payload = isHttpCall ? { ...requestData.query, ...requestData.body } : { ...event }
  const followUpRound = isFollowUpRound(payload)
  const followUpAnswers = normalizeArrayInput(payload.followUpAnswers)
  const observedSymptoms = normalizeArrayInput(payload.observedSymptoms)
  const mode = followUpRound ? 'follow_up' : resolveMode(payload.mode)
  const isSkipAuth = isSkipAuthEnabled(payload.skipAuth)

  let userInfo = null
  if (isHttpCall) {
    userInfo = await resolveHttpUserInfo(requestData.headers, payload, context)
  } else {
    userInfo = context?.OPENID ? { openid: context.OPENID } : null
  }

  return {
    isHttpCall,
    isSkipAuth,
    followUpRound,
    followUpAnswers,
    observedSymptoms,
    mode,
    payload,
    headers: requestData?.headers || {},
    openid: userInfo?.openid || '',
    plantId: payload.plantId,
    image: payload.image,
    description: payload.description || '',
    diagnosisId: payload.diagnosisId || null
  }
}

function validateDiagnoseContext(resolved) {
  if (!resolved.isSkipAuth && !resolved.openid) {
    return { code: 401, message: '需要登录才能使用 AI 诊断功能' }
  }
  if (!resolved.plantId) {
    return { code: 400, message: '缺少必填字段：plantId' }
  }
  if (!resolved.followUpRound && !resolved.image) {
    return { code: 400, message: '首轮诊断必须提供植物图片' }
  }
  if (
    resolved.followUpRound &&
    !resolved.observedSymptoms.length &&
    !resolved.followUpAnswers.length
  ) {
    return { code: 400, message: '缺少问诊症状或问诊答案' }
  }
  return null
}

async function ensureDiagnoseQuota(resolved) {
  if (resolved.isSkipAuth || resolved.followUpRound) {
    return null
  }

  const quotaCheck = await checkAIQuota(resolved.openid, 'diagnose')
  if (quotaCheck.allowed) {
    return null
  }

  return {
    code: quotaCheck.code,
    message: quotaCheck.message
  }
}

async function buildPromptPreview(resolved) {
  if (resolved.followUpRound) {
    return '根据问诊补充答案重新计算诊断结果'
  }
  return buildUserMessage({ image: resolved.image, concise: true })
}

function buildFollowUpBaseResult(observedSymptoms = []) {
  const diagnosisText = Array.isArray(observedSymptoms)
    ? observedSymptoms
        .map(item => item.symptomCn || item.symptomKey || '')
        .filter(Boolean)
        .join('、')
    : ''

  return {
    diagnosisText,
    baseResult: {
      healthScore: null,
      healthStatus: null,
      mainIssue: null,
      symptoms: diagnosisText,
      treatment: '',
      prevention: '',
      summary: diagnosisText || '基于问诊答案重新计算'
    }
  }
}

async function runDiagnosisModel(resolved, { onReply } = {}) {
  if (resolved.followUpRound) {
    return buildFollowUpBaseResult(resolved.observedSymptoms)
  }

  const diagnosisText = await callLLMDiagnose(resolved.image, {
    onText: onReply
  })

  return {
    diagnosisText,
    baseResult: parseLLMDiagnosis(diagnosisText)
  }
}

function buildSuccessData({ resolved, result, recordId }) {
  return {
    recordId: resolved.isSkipAuth ? `test_${Date.now()}` : recordId,
    plantId: resolved.plantId,
    diagnosis: result,
    problemCausality: Array.isArray(result.problemCausality) ? result.problemCausality : [],
    timestamp: Date.now()
  }
}

function createPersistencePayload({ resolved, result, recordId }) {
  if (resolved.isSkipAuth || !recordId) {
    return null
  }

  return {
    recordId,
    plantId: resolved.plantId,
    openid: resolved.openid,
    result,
    image: resolved.image,
    description: resolved.description,
    sourceDiagnosisId: resolved.diagnosisId,
    followUpAnswers: resolved.followUpAnswers,
    skipQuotaDeduction: resolved.followUpRound
  }
}

async function executeDiagnoseCore(resolved, { onReply } = {}) {
  const quotaError = await ensureDiagnoseQuota(resolved)
  if (quotaError) {
    return { error: quotaError }
  }

  const { diagnosisText, baseResult } = await runDiagnosisModel(resolved, { onReply })
  const result = await finalizeDiagnosisResult({
    openid: resolved.openid,
    userPlantId: resolved.plantId,
    description: resolved.description,
    diagnosisText,
    baseResult,
    mode: resolved.mode,
    observedSymptomsInput: resolved.observedSymptoms,
    followUpAnswers: resolved.followUpAnswers,
    skipAIExtraction: resolved.followUpRound
  })

  const recordId = resolved.isSkipAuth ? null : buildRecordId()
  return {
    diagnosisText,
    result,
    recordId,
    responseData: buildSuccessData({ resolved, result, recordId }),
    persistencePayload: createPersistencePayload({ resolved, result, recordId })
  }
}

async function persistDiagnosis(persistencePayload, { asyncMode = false } = {}) {
  if (!persistencePayload) {
    return null
  }

  if (asyncMode) {
    persistDiagnosisSideEffects(persistencePayload).catch(error => {
      console.warn('异步保存诊断结果失败:', error.message)
    })
    return persistencePayload.recordId
  }

  await persistDiagnosisSideEffects(persistencePayload)
  return persistencePayload.recordId
}

function createSseEmitter(sse) {
  let connectionClosed = false
  let eventId = 0

  if (typeof sse.on === 'function') {
    sse.on('close', () => {
      connectionClosed = true
      debugLog('SSE连接关闭')
    })
  }

  return {
    send(eventName, payload) {
      if (connectionClosed || sse.closed) return
      eventId += 1
      sse.send({
        event: eventName,
        id: String(eventId),
        data: JSON.stringify({
          id: String(eventId),
          event: eventName,
          ...payload
        })
      })
    },
    end() {
      if (!connectionClosed && !sse.closed) {
        sse.end()
      }
    }
  }
}

async function handleEventDiagnose(event, context) {
  console.warn('handleEventDiagnose 为兼容旧事件函数保留，当前前端主链不应再调用此入口')

  const resolved = await resolveDiagnoseContext({
    event,
    context,
    requestData: null,
    isHttpCall: false
  })
  const validationError = validateDiagnoseContext(resolved)
  if (validationError) {
    return { code: validationError.code, message: validationError.message, data: null }
  }

  const executed = await executeDiagnoseCore(resolved)
  if (executed.error) {
    return { code: executed.error.code, message: executed.error.message, data: null }
  }

  await persistDiagnosis(executed.persistencePayload)

  return {
    code: 200,
    message: '诊断完成',
    data: executed.responseData
  }
}

async function handleStreamDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const sse = context.sse?.()
  if (!sse) {
    return jsonResponse(400, { code: 400, message: '当前请求不支持 SSE' })
  }

  const emitter = createSseEmitter(sse)
  const resolved = await resolveDiagnoseContext({
    event,
    context,
    requestData,
    isHttpCall: true
  })

  debugLog('handleStreamDiagnose 参数:', { payload: resolved.payload })

  const validationError = validateDiagnoseContext(resolved)
  if (validationError) {
    emitter.send('error', { type: 'error', code: validationError.code, message: validationError.message })
    emitter.end()
    return ''
  }

  emitter.send('prompt', {
    type: 'prompt',
    role: 'user',
    mode: resolved.mode,
    content: await buildPromptPreview(resolved)
  })

  try {
    const executed = await executeDiagnoseCore(resolved, {
      onReply: (content, fullText) => {
        emitter.send('reply', {
          type: 'reply',
          role: 'assistant',
          mode: resolved.mode,
          content,
          fullText
        })
      }
    })

    if (executed.error) {
      emitter.send('error', {
        type: 'error',
        code: executed.error.code,
        message: executed.error.message
      })
      emitter.end()
      return ''
    }

    emitter.send('done', {
      type: 'done',
      code: 200,
      message: '诊断完成',
      fullText: executed.diagnosisText,
      data: executed.responseData
    })

    await persistDiagnosis(executed.persistencePayload, { asyncMode: true })
    emitter.end()
    return ''
  } catch (error) {
    console.error('流式诊断失败:', error)
    emitter.send('error', { type: 'error', code: 500, message: `诊断失败: ${error.message}` })
    emitter.end()
    return ''
  }
}

async function handleSyncDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const resolved = await resolveDiagnoseContext({
    event,
    context,
    requestData,
    isHttpCall: true
  })
  const validationError = validateDiagnoseContext(resolved)
  if (validationError) {
    return jsonResponse(validationError.code, validationError)
  }

  const executed = await executeDiagnoseCore(resolved)
  if (executed.error) {
    return jsonResponse(executed.error.code, executed.error)
  }

  await persistDiagnosis(executed.persistencePayload)

  return jsonResponse(200, {
    code: 200,
    message: '诊断完成',
    fullText: executed.diagnosisText,
    data: executed.responseData
  })
}

async function handleHealthCheck() {
  return jsonResponse(200, { status: 'ok', timestamp: Date.now() })
}

async function main(event, context) {
  try {
    const requestData = getHttpRequestData(event, context)
    console.log('云函数调用:', {
      action: event.action,
      method: requestData.method,
      path: requestData.path
    })
    debugLog('云函数调用详情:', {
      query: requestData.query,
      body: requestData.body
    })

    const isHttpCall = context.httpContext !== undefined
    if (!isHttpCall) {
      return await handleEventDiagnose(event, context)
    }

    const action = resolveHttpAction(event, requestData)
    if (action === 'streamDiagnose') return handleStreamDiagnose(event, context, requestData)
    if (action === 'syncDiagnose') return handleSyncDiagnose(event, context, requestData)
    if (action === 'health') return handleHealthCheck()

    return jsonResponse(404, { code: 404, message: '接口不存在', data: null })
  } catch (error) {
    console.error('云函数执行错误:', error)
    return jsonResponse(500, { code: 500, message: `服务器错误: ${error.message}`, data: null })
  }
}

module.exports.main = (event, context) => {
  const requestData = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(requestData.headers, requestData.query, requestData.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
