'use strict'

const {
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const { main } = require('./app/http-router')

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  const schemaEnv = resolveSchemaEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () =>
    runWithSchemaEnv(schemaEnv, () => main(event, context))
  )
}

module.exports.runStartDiagnosis = (...args) =>
  require('./app/diagnosis-start-runner').runStartDiagnosis(...args)
module.exports.runAnswerDiagnosis = (...args) =>
  require('./app/diagnosis-answer-runner').runAnswerDiagnosis(...args)
module.exports.buildFrontendDiagnosisResponse = (...args) =>
  require('./app/frontend-response').buildFrontendDiagnosisResponse(...args)
