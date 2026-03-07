'use strict'

const { checkAIQuota } = require('/opt/utils/quota')
const { callAgentDiagnose } = require('./utils/agent')
const { callLLMDiagnose } = require('./utils/llm')
const { callAIModelFallback } = require('./utils/fallback')
const { parseAgentDiagnosis, parseLLMDiagnosis } = require('./utils/diagnosis-parser')
const { persistDiagnosisSideEffects } = require('./utils/persist')
const {
  jsonResponse,
  getHttpRequestData,
  resolveHttpAction,
  resolveHttpUserInfo
} = require('./utils/http')
const {
  debugLog,
  isSkipAuthEnabled,
  buildRecordId,
  shouldFallbackToModel
} = require('./utils/common')

function buildUserMessage({ image, description, plantName, concise = true }) {
  let userMessage = '请帮我诊断这个植物的健康状况'
  if (plantName) {
    userMessage += `（植物名称：${plantName}）`
  }
  if (description) {
    userMessage += `：${description}`
  }
  if (image) {
    userMessage += `\n\n植物图片：![植物图片](${image})`
  }
  userMessage += '\n\n请告诉我植物可能存在什么问题，以及如何治疗和预防。'
  if (concise) {
    userMessage += '请简洁输出，总字数控制在180字以内。'
  }
  return userMessage
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

  const { plantId, image, description, plantName } = event

  if (!plantId) {
    return { code: 400, message: '缺少必填字段：plantId', data: null }
  }
  if (!image && !description) {
    return { code: 400, message: '需要提供植物图片或描述', data: null }
  }

  if (!isSkipAuth) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      return { code: quotaCheck.code, message: quotaCheck.message, data: null }
    }
  }

  const mode = String(event.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'
  const userMessage = buildUserMessage({ image, description, plantName, concise: true })

  try {
    const diagnosisText =
      mode === 'deep'
        ? await callAgentDiagnose(userMessage, openid || `test_${Date.now()}`)
        : await callLLMDiagnose(image, description, plantName)
    const result = mode === 'deep' ? parseAgentDiagnosis(diagnosisText) : parseLLMDiagnosis(diagnosisText)

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
        timestamp: Date.now()
      }
    }
  } catch (error) {
    console.error('诊断失败:', error)
    if (!shouldFallbackToModel(error)) {
      return { code: 500, message: `诊断失败: ${error.message}`, data: null }
    }

    const fallbackResult = await callAIModelFallback(image, description)
    return {
      code: 200,
      message: '诊断完成（AI模型回退）',
      data: {
        plantId,
        diagnosis: fallbackResult,
        timestamp: Date.now()
      }
    }
  }
}

async function handleStreamDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const query = { ...requestData.query, ...requestData.body }
  const headers = requestData.headers || {}
  const sse = context.sse?.()
  const isSkipAuth = isSkipAuthEnabled(query.skipAuth)

  if (!sse) {
    return jsonResponse(400, { code: 400, message: '当前请求不支持 SSE' })
  }

  debugLog('handleStreamDiagnose 参数:', { query })

  const { plantId, image, description, plantName } = query
  const mode = String(query.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'
  const userInfo = await resolveHttpUserInfo(headers, query)

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
  if (!image && !description) {
    sse.send({ data: JSON.stringify({ type: 'error', code: 400, message: '需要提供植物图片或描述' }) })
    sse.end()
    return ''
  }

  if (!isSkipAuth) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      sse.send({
        data: JSON.stringify({ type: 'error', code: quotaCheck.code, message: quotaCheck.message })
      })
      sse.end()
      return ''
    }
  }

  const userMessage = buildUserMessage({ image, description, plantName, concise: true })

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

    if (mode === 'deep') {
      diagnosisText = await callAgentDiagnose(userMessage, openid, {
        onText: (content, fullText) => {
          sendEvent('reply', { type: 'reply', role: 'assistant', mode, content, fullText })
        }
      })
      result = parseAgentDiagnosis(diagnosisText)
    } else {
      diagnosisText = await callLLMDiagnose(image, description, plantName, {
        onText: (content, fullText) => {
          sendEvent('reply', { type: 'reply', role: 'assistant', mode, content, fullText })
        }
      })
      result = parseLLMDiagnosis(diagnosisText)
    }

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
        description
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
    if (!shouldFallbackToModel(error)) {
      sendEvent('error', { type: 'error', code: 500, message: `诊断失败: ${error.message}` })
      if (!connectionClosed && !sse.closed) sse.end()
      return ''
    }

    try {
      const fallbackResult = await callAIModelFallback(image, description)
      const fallbackText = fallbackResult.summary || fallbackResult.symptoms || '诊断完成'
      sendEvent('done', {
        type: 'done',
        code: 200,
        message: '诊断完成（AI模型回退）',
        fullText: fallbackText,
        data: {
          plantId,
          diagnosis: fallbackResult,
          timestamp: Date.now()
        }
      })
    } catch (fallbackError) {
      sendEvent('error', { type: 'error', code: 500, message: `诊断失败: ${fallbackError.message}` })
    }

    if (!connectionClosed && !sse.closed) {
      sse.end()
    }
    return ''
  }
}

async function handleSyncDiagnose(event, context, requestData = getHttpRequestData(event, context)) {
  const requestPayload = { ...requestData.query, ...requestData.body }
  const userInfo = await resolveHttpUserInfo(requestData.headers, requestPayload)
  if (!userInfo || !userInfo.openid) {
    return jsonResponse(401, { code: 401, message: '需要登录才能使用 AI 诊断功能' })
  }

  const isSkipAuth = isSkipAuthEnabled(requestPayload.skipAuth)
  const openid = userInfo.openid
  const { plantId, image, description, plantName } = requestPayload
  const mode = String(requestPayload.mode || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick'

  if (!plantId) return jsonResponse(400, { code: 400, message: '缺少必填字段：plantId' })
  if (!image && !description) return jsonResponse(400, { code: 400, message: '需要提供植物图片或描述' })

  if (!isSkipAuth) {
    const quotaCheck = await checkAIQuota(openid, 'diagnose')
    if (!quotaCheck.allowed) {
      return jsonResponse(403, { code: quotaCheck.code, message: quotaCheck.message })
    }
  }

  const userMessage = buildUserMessage({ image, description, plantName, concise: true })
  const diagnosisText =
    mode === 'deep'
      ? await callAgentDiagnose(userMessage, openid)
      : await callLLMDiagnose(image, description, plantName)
  const result = mode === 'deep' ? parseAgentDiagnosis(diagnosisText) : parseLLMDiagnosis(diagnosisText)

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
        description
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
      timestamp: Date.now()
    }
  })
}

async function handleHealthCheck() {
  return jsonResponse(200, { status: 'ok', timestamp: Date.now() })
}

module.exports.main = main

