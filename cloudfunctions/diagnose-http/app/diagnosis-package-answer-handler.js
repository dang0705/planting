'use strict'

const { jsonResponse } = require('/opt/utils/http')
const { assertAuthenticatedUser } = require('../services/request-guard')
const { runDiagnosisPackageAnswer } = require('./diagnosis-package-answer-runner')
const {
  buildCompactAnswerRoundResponse: presentDiagnosisAnswerResponse
} = require('../presenters/diagnosis-round-presenter')
const { buildFrontendAnswerResponse } = require('./frontend-response')

async function handlePackageAnswer({ payload, identity, timing } = {}) {
  const openid = identity?.openid || ''
  assertAuthenticatedUser({ userInfo: identity, message: '请先登录' })

  const executed = await runDiagnosisPackageAnswer({ payload, openid, timing })
  if (!executed) {
    return null
  }

  const publicResponse = presentDiagnosisAnswerResponse(executed.response)
  const data = buildFrontendAnswerResponse(publicResponse)
  timing.mark('response-ready')
  timing.finish({ statusCode: 200, fastPath: 'question_package' })

  return jsonResponse(200, {
    code: 200,
    message: '问诊提交成功',
    data
  })
}

module.exports = { handlePackageAnswer }
