'use strict'

const {
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const { main, _test: routerTest } = require('./app/http-router')
const { triggerQuestionPackageCachePreload } = require('./app/static-cache-preloader')

// 固定题包的首个数据库题目只读且按 schema 缓存。进程加载时提前预热，
// 首个 question/start 到达时会复用缓存或加入同一个进行中的查询，避免把冷查询串在首屏响应中。
triggerQuestionPackageCachePreload({
  scope: 'diagnose-http-startup',
  source: 'module_load'
})

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
