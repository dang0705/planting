'use strict'

const {
  jsonResponse,
  notFound,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')

function buildDeprecatedResponse(path = '') {
  return jsonResponse(410, {
    code: 410,
    message: 'diagnosis-history-http 已下线，请改用 diagnose-http 统一诊断链路',
    data: {
      deprecatedFunction: 'diagnosis-history-http',
      replacementFunction: 'diagnose-http',
      requestedPath: path,
      replacements: {
        history: 'diagnose-http/diagnosis/history',
        result: 'diagnose-http/diagnosis/result',
        feedback: 'diagnose-http/diagnosis/feedback'
      }
    }
  })
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')

  try {
    if (path.includes('/diagnosis/history/health')) {
      return jsonResponse(200, {
        code: 200,
        data: {
          status: 'deprecated',
          functionName: 'diagnosis-history-http',
          replacementFunction: 'diagnose-http',
          timestamp: Date.now()
        }
      })
    }

    if (
      path.includes('/diagnosis/history') ||
      path.includes('/diagnosis/history/detail') ||
      path.includes('/diagnosis/history/feedback') ||
      path.includes('/diagnosis/decision')
    ) {
      return buildDeprecatedResponse(path)
    }

    return notFound(path)
  } catch (error) {
    console.error('diagnosis-history-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
