'use strict'

const {
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const { main, _test: routerTest } = require('./app/http-router')

module.exports.main = async (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  const schemaEnv = resolveSchemaEnv(request.headers, request.query, request.body)
  try {
    return await runWithRequestAppEnv(appEnv, () =>
      runWithSchemaEnv(schemaEnv, () => main(event, context))
    )
  } catch (error) {
    // 某些 functions-framework 版本会绕过内层 Promise 的 reject 处理；
    // 在导出边界再兜底一次，确保鉴权/参数错误不会被包装成 500。
    const publicError = routerTest?.publicRouteError?.(error)
    if (publicError) {
      return publicError
    }
    throw error
  }
}

module.exports.runStartDiagnosis = (...args) =>
  require('./app/diagnosis-start-runner').runStartDiagnosis(...args)
module.exports.runAnswerDiagnosis = (...args) =>
  require('./app/diagnosis-answer-runner').runAnswerDiagnosis(...args)
module.exports.buildFrontendDiagnosisResponse = (...args) =>
  require('./app/frontend-response').buildFrontendDiagnosisResponse(...args)
