'use strict'

const { handleYellowLeafAnswer } = require('./diagnosis-yellow-leaf-answer-fast-handler')
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
        functionName: 'diagnosis-answer-http',
        ...timing
      })
    )
  }
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-transform'
    },
    body: JSON.stringify(payload)
  }
}

function normalizeHeaders(value = {}) {
  return Object.fromEntries(
    Object.entries(value && typeof value === 'object' ? value : {}).map(([key, item]) => [
      String(key).toLowerCase(),
      Array.isArray(item) ? item[0] : item
    ])
  )
}

function parseQuery(rawPath = '') {
  const queryIndex = String(rawPath || '').indexOf('?')
  if (queryIndex < 0) {
    return {}
  }
  return Object.fromEntries(
    String(rawPath)
      .slice(queryIndex + 1)
      .split('&')
      .filter(Boolean)
      .map(pair => {
        const separator = pair.indexOf('=')
        const rawKey = separator < 0 ? pair : pair.slice(0, separator)
        const rawValue = separator < 0 ? '' : pair.slice(separator + 1)
        try {
          return [decodeURIComponent(rawKey), decodeURIComponent(rawValue)]
        } catch {
          return [rawKey, rawValue]
        }
      })
      .filter(([key]) => String(key || '').trim())
  )
}

function parseBody(event = {}) {
  const body = event?.body
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body
  }
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  // functions-framework 会把 JSON 请求体直接作为 event 传入；原生 HTTP
  // server 则保留在 event.body。两种运行时必须解析为同一份业务载荷。
  return event && typeof event === 'object' && !Array.isArray(event) ? event : {}
}

function getRequest(event = {}, context = {}) {
  const httpContext = context?.httpContext || {}
  const rawPath =
    httpContext.path ||
    httpContext.url ||
    httpContext.rawPath ||
    httpContext.reqUrl ||
    event?.path ||
    ''
  const body = parseBody(event)
  const headers = normalizeHeaders({
    ...(event?.headers && typeof event.headers === 'object' ? event.headers : {}),
    ...(httpContext.headers && typeof httpContext.headers === 'object' ? httpContext.headers : {})
  })
  const query = {
    ...parseQuery(rawPath),
    ...(httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {}),
    ...(event?.query && typeof event.query === 'object' ? event.query : {})
  }
  const method = String(
    httpContext.httpMethod || httpContext.method || event?.httpMethod || event?.requestContext?.http?.method || 'POST'
  ).toUpperCase()
  return { headers, method, path: String(rawPath), query, body }
}

function isPackageAnswerRequest(payload = {}) {
  const questionPackage = payload.questionPackage || payload.question_package
  const packageMode = String(
    questionPackage?.mode || questionPackage?.sourceMode || questionPackage?.route || ''
  )
    .trim()
    .toLowerCase()
  return (
    String(payload.requestMode || payload.mode || '')
      .trim()
      .toLowerCase() === 'answer_submit' &&
    Array.isArray(payload.answers) &&
    payload.answers.length > 0 &&
    Boolean(
      String(
        payload.questionPackageContinuationToken ||
          payload.question_package_continuation_token ||
          ''
      ).trim()
    ) &&
    questionPackage &&
    typeof questionPackage === 'object' &&
    [
      'yellow_leaf',
      'manual_yellowing_care_environment_frontloaded',
      'yellowing_mode',
      'leaf_yellowing'
    ].includes(packageMode) &&
    String(questionPackage.answerSubmitMode || questionPackage.answer_submit_mode || '')
      .trim()
      .toLowerCase() === 'package'
  )
}

async function main(event, context) {
  const startedAt = Date.now()
  const request = getRequest(event, context)
  const payload = request.body
  if (!request.path.includes('/diagnosis/answer')) {
    return jsonResponse(404, { code: 404, message: `接口不存在: ${request.path}`, data: null })
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      code: 405,
      message: `不支持的请求方法: ${request.method}`,
      data: null
    })
  }
  if (!isPackageAnswerRequest(payload)) {
    return jsonResponse(400, {
      code: 400,
      businessCode: 'UNSUPPORTED_ANSWER_MODE',
      message: '该问诊类型应由主问诊接口处理',
      data: null
    })
  }
  const identityStartedAt = Date.now()
  const identity = await resolveSlimHttpIdentity({
    headers: request.headers,
    payload,
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
    const result = await handleYellowLeafAnswer({ payload, identity })
    logTiming({
      path: 'fast_yellow_leaf_answer',
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
      message: clientError && error?.message ? error.message : '问诊提交失败',
      data: null
    })
  }
}

module.exports = { main, _test: { isPackageAnswerRequest } }
