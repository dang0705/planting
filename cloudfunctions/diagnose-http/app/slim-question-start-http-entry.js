'use strict'

const {
  getRequest,
  jsonResponse,
  resolveStartMode,
  handleFastQuestionStart
} = require('./slim-question-start-fast-handler')
const { resolveSlimHttpIdentity } = require('./slim-http-identity')

function isPerformanceLogEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DIAGNOSIS_PERF_LOG || '')
      .trim()
      .toLowerCase()
  )
}

function logTiming(timing) {
  if (isPerformanceLogEnabled()) {
    console.log(
      JSON.stringify({
        event: 'diagnosis_fast_path_timing',
        functionName: 'diagnosis-question-start-http',
        ...timing
      })
    )
  }
}

async function main(event, context) {
  const startedAt = Date.now()
  const request = getRequest(event, context)
  if (!request.path.includes('/diagnosis/question/start')) {
    return jsonResponse(404, { code: 404, message: `接口不存在: ${request.path}`, data: null })
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      code: 405,
      message: `不支持的请求方法: ${request.method}`,
      data: null
    })
  }

  const mode = resolveStartMode(request.body)
  if (!mode) {
    return jsonResponse(400, {
      code: 400,
      businessCode: 'UNSUPPORTED_QUESTION_PACKAGE_MODE',
      message: '该问诊类型应由主问诊接口处理',
      data: null
    })
  }
  const identityStartedAt = Date.now()
  const identity = await resolveSlimHttpIdentity({
    headers: request.headers,
    payload: request.body,
    context
  })
  const identityMs = Date.now() - identityStartedAt
  if (!identity) {
    return jsonResponse(401, {
      code: 401,
      businessCode: 'INVALID_CREDENTIALS',
      message: '登录会话无效，请重新登录后重试',
      data: null
    })
  }

  try {
    const handlerStartedAt = Date.now()
    const result = await handleFastQuestionStart({ request, payload: request.body, identity })
    logTiming({
      path: 'fast_question_start',
      identitySource: identity.source || 'persistent-platform-session',
      requestParseMs: identityStartedAt - startedAt,
      identityMs,
      handlerMs: Date.now() - handlerStartedAt,
      totalHandlerMs: Date.now() - startedAt
    })
    return result
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500)
    const clientError = statusCode >= 400 && statusCode < 500
    return jsonResponse(statusCode, {
      code: statusCode,
      businessCode: clientError && error?.code ? String(error.code) : 'INTERNAL_ERROR',
      message: clientError && error?.message ? error.message : '问诊初始化失败',
      data: null
    })
  }
}

module.exports = { main }
