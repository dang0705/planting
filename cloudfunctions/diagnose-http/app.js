'use strict'

const { checkAIQuota } = require('/opt/utils/quota')
const { callLLMDiagnose } = require('./utils/llm')
const { parseLLMDiagnosis } = require('./utils/diagnosis-parser')
const { persistDiagnosisSideEffects } = require('./utils/persist')
const { buildSymptomLabelerPrompt } = require('./utils/symptom-labeler-prompt')
const {
  jsonResponse,
  getHttpRequestData,
  resolveHttpUserInfo,
  isSkipAuthEnabled
} = require('/opt/utils/http')
const { buildStructuredDiagnosis } = require('/opt/utils/plant-diagnosis')
const {
  debugLog,
  buildRecordId
} = require('./utils/common')

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
      return await handleCloudFunctionProxy(event, context)
    }

    const action = resolveHttpAction(event, requestData)
    if (action === 'streamDiagnose') return handleStreamDiagnose(event, context, requestData)
    if (action === 'syncDiagnose') return handleSyncDiagnose(event, context, requestData)
    if (action === 'health') return handleHealthCheck()

    return { code: 404, message: '接口不存在', data: null }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return { code: 500, message: `服务器错误: ${error.message}`, data: null }
  }
}

async function handleCloudFunctionProxy(event, context) {
  const isSkipAuth = isSkipAuthEnabled(event.skipAuth)
  const openid = context.OPENID

  if (!openid && !isSkipAuth) {
    return { code: 401, message: '需要登录才能使用 AI 诊断功能', data: null }
  }

  const { plantId, image, description } = event

  if (!plantId) {
    return { code: 400, message: '缺少必填字段：plantId', data: null }
  }
  if (!image) {
    return { code: 400, message: '首轮诊断必须提供植物图片', data: null }
  }

  if (!isSkipAuth) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      return { code: quotaCheck.code, message: quotaCheck.message, data: null }
    }
  }

  const mode = String(event.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'
  const userMessage = await buildUserMessage({ image, concise: true })

  try {
    const diagnosisText = await callLLMDiagnose(image)
    const parsedResult = parseLLMDiagnosis(diagnosisText)
    const result = await finalizeDiagnosisResult({
      openid,
      userPlantId: plantId,
      description,
      diagnosisText,
      baseResult: parsedResult,
      mode
    })

    let recordId = null
    if (!isSkipAuth) {
      recordId = buildRecordId()
      await persistDiagnosisSideEffects({
        recordId,
        plantId,
        openid,
        result,
        image,
        description
      })
    }

    return {
      code: 200,
      message: '诊断完成',
      data: {
        recordId: isSkipAuth ? `test_${Date.now()}` : recordId,
        plantId,
        diagnosis: result,
        problemCausality: Array.isArray(result.problemCausality) ? result.problemCausality : [],
        timestamp: Date.now()
      }
    }
  } catch (error) {
    console.error('诊断失败:', error)
    return { code: 500, message: `诊断失败: ${error.message}`, data: null }
  }
}

async function handleStreamDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const query = { ...requestData.query, ...requestData.body }
  const headers = requestData.headers || {}
  const sse = context.sse?.()
  const isSkipAuth = isSkipAuthEnabled(query.skipAuth)
  const followUpRound = isFollowUpRound(query)
  const followUpAnswers = normalizeArrayInput(query.followUpAnswers)
  const observedSymptoms = normalizeArrayInput(query.observedSymptoms)

  if (!sse) {
    return jsonResponse(400, { code: 400, message: '当前请求不支持 SSE' })
  }

  debugLog('handleStreamDiagnose 参数:', { query })

  const { plantId, image, description } = query
  const mode = String(query.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'
  const userInfo = await resolveHttpUserInfo(headers, query, context)

  if (!userInfo || !userInfo.openid) {
    sse.send({ data: JSON.stringify({ type: 'error', code: 401, message: '需要登录才能使用 AI 诊断功能' }) })
    sse.end()
    return ''
  }

  const openid = userInfo.openid
  if (!plantId) {
    sse.send({ data: JSON.stringify({ type: 'error', code: 400, message: '缺少必填字段：plantId' }) })
    sse.end()
    return ''
  }
  if (!followUpRound && !image) {
    sse.send({ data: JSON.stringify({ type: 'error', code: 400, message: '首轮诊断必须提供植物图片' }) })
    sse.end()
    return ''
  }
  if (followUpRound && !observedSymptoms.length && !followUpAnswers.length) {
    sse.send({ data: JSON.stringify({ type: 'error', code: 400, message: '缺少问诊症状或问诊答案' }) })
    sse.end()
    return ''
  }

  if (!isSkipAuth && !followUpRound) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      sse.send({
        data: JSON.stringify({ type: 'error', code: quotaCheck.code, message: quotaCheck.message })
      })
      sse.end()
      return ''
    }
  }

  const userMessage = followUpRound
    ? '根据问诊补充答案重新计算诊断结果'
    : await buildUserMessage({ image, concise: true })

  let connectionClosed = false
  let eventId = 0
  if (typeof sse.on === 'function') {
    sse.on('close', () => {
      connectionClosed = true
      debugLog('SSE连接关闭')
    })
  }

  const sendEvent = (eventName, payload) => {
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
  }

  sendEvent('prompt', {
    type: 'prompt',
    role: 'user',
    mode,
    content: userMessage
  })

  try {
    let diagnosisText = ''
    let result

    if (followUpRound) {
      diagnosisText = Array.isArray(observedSymptoms)
        ? observedSymptoms.map(item => item.symptomCn || item.symptomKey || '').filter(Boolean).join('、')
        : ''
      result = {
        healthScore: null,
        healthStatus: null,
        mainIssue: null,
        symptoms: diagnosisText,
        treatment: '',
        prevention: '',
        summary: diagnosisText || '基于问诊答案重新计算'
      }
    } else {
      diagnosisText = await callLLMDiagnose(image, {
        onText: (content, fullText) => {
          sendEvent('reply', { type: 'reply', role: 'assistant', mode, content, fullText })
        }
      })
      result = parseLLMDiagnosis(diagnosisText)
    }

    result = await finalizeDiagnosisResult({
      openid,
      userPlantId: plantId,
      description,
      diagnosisText,
      baseResult: result,
      mode: followUpRound ? 'follow_up' : mode,
      observedSymptomsInput: observedSymptoms,
      followUpAnswers,
      skipAIExtraction: followUpRound
    })

    let recordId = null
    if (!isSkipAuth) {
      recordId = buildRecordId()
    }

    // 先返回 done，DB 写入/扣配额异步执行，减少前端等待。
    sendEvent('done', {
      type: 'done',
      code: 200,
      message: '诊断完成',
      fullText: diagnosisText,
      data: {
        recordId: isSkipAuth ? `test_${Date.now()}` : recordId,
        plantId,
        diagnosis: result,
        problemCausality: Array.isArray(result.problemCausality) ? result.problemCausality : [],
        timestamp: Date.now()
      }
    })

    if (!isSkipAuth) {
      persistDiagnosisSideEffects({
        recordId,
        plantId,
        openid,
        result,
        image,
        description,
        sourceDiagnosisId: query.diagnosisId || null,
        followUpAnswers,
        skipQuotaDeduction: followUpRound
      }).catch(error => {
        console.warn('异步保存诊断结果失败:', error.message)
      })
    }

    if (!connectionClosed && !sse.closed) {
      sse.end()
    }
    return ''
  } catch (error) {
    console.error('流式诊断失败:', error)
    sendEvent('error', { type: 'error', code: 500, message: `诊断失败: ${error.message}` })
    if (!connectionClosed && !sse.closed) {
      sse.end()
    }
    return ''
  }
}

async function handleSyncDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const requestPayload = { ...requestData.query, ...requestData.body }
  const followUpRound = isFollowUpRound(requestPayload)
  const followUpAnswers = normalizeArrayInput(requestPayload.followUpAnswers)
  const observedSymptoms = normalizeArrayInput(requestPayload.observedSymptoms)
  const userInfo = await resolveHttpUserInfo(requestData.headers, requestPayload, context)
  if (!userInfo || !userInfo.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用 AI 诊断功能' })
  }

  const isSkipAuth = isSkipAuthEnabled(requestPayload.skipAuth)
  const openid = userInfo.openid
  const { plantId, image, description } = requestPayload
  const mode = String(requestPayload.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'

  if (!plantId) return jsonResponse(400, { code: 400, message: '缺少必填字段：plantId' })
  if (!followUpRound && !image) {
    return jsonResponse(400, { code: 400, message: '首轮诊断必须提供植物图片' })
  }
  if (followUpRound && !observedSymptoms.length && !followUpAnswers.length) {
    return jsonResponse(400, { code: 400, message: '缺少问诊症状或问诊答案' })
  }

  if (!isSkipAuth && !followUpRound) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      return jsonResponse(403, { code: quotaCheck.code, message: quotaCheck.message })
    }
  }

  const userMessage = followUpRound
    ? '根据问诊补充答案重新计算诊断结果'
    : await buildUserMessage({ image, concise: true })
  const diagnosisText = followUpRound
    ? observedSymptoms.map(item => item.symptomCn || item.symptomKey || '').filter(Boolean).join('、')
    : await callLLMDiagnose(image)
  const parsedResult = followUpRound
    ? {
        healthScore: null,
        healthStatus: null,
        mainIssue: null,
        symptoms: diagnosisText,
        treatment: '',
        prevention: '',
        summary: diagnosisText || '基于问诊答案重新计算'
      }
    : parseLLMDiagnosis(diagnosisText)
  const result = await finalizeDiagnosisResult({
    openid,
    userPlantId: plantId,
    description,
    diagnosisText,
    baseResult: parsedResult,
    mode: followUpRound ? 'follow_up' : mode,
    observedSymptomsInput: observedSymptoms,
    followUpAnswers,
    skipAIExtraction: followUpRound
  })

  let recordId = null
  if (!isSkipAuth) {
    recordId = buildRecordId()
    try {
      await persistDiagnosisSideEffects({
        recordId,
        plantId,
        openid,
        result,
        image,
        description,
        sourceDiagnosisId: requestPayload.diagnosisId || null,
        followUpAnswers,
        skipQuotaDeduction: followUpRound
      })
    } catch (error) {
      console.warn('保存诊断记录失败:', error.message)
      recordId = null
    }
  }

  return jsonResponse(200, {
    code: 200,
    message: '诊断完成',
    fullText: diagnosisText,
    data: {
      recordId: isSkipAuth ? `test_${Date.now()}` : recordId,
      plantId,
      diagnosis: result,
      problemCausality: Array.isArray(result.problemCausality) ? result.problemCausality : [],
      timestamp: Date.now()
    }
  })
}

async function handleHealthCheck() {
  return jsonResponse(200, { status: 'ok', timestamp: Date.now() })
}

module.exports.main = main

