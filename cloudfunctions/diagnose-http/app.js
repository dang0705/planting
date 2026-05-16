'use strict'

const {
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('./db/schema-resolver')
const { main } = require('./app/http-router')
const { runStartDiagnosis } = require('./app/diagnosis-start-runner')
const { runAnswerDiagnosis } = require('./app/diagnosis-answer-runner')
const { buildFrontendDiagnosisResponse } = require('./app/frontend-response')

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  const schemaEnv = resolveSchemaEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () =>
    runWithSchemaEnv(schemaEnv, () => main(event, context))
  )
}

module.exports.runStartDiagnosis = runStartDiagnosis
module.exports.runAnswerDiagnosis = runAnswerDiagnosis
module.exports.buildFrontendDiagnosisResponse = buildFrontendDiagnosisResponse
