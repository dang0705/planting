'use strict'

const { jsonResponse } = require('/opt/utils/http')
const { assertAuthenticatedUser } = require('../services/request-guard')
const { runAnswerDiagnosis } = require('./diagnosis-answer-runner')
const { withQuestionTextConservative } = require('./request-normalizers')
const {
  buildCompactAnswerRoundResponse: presentDiagnosisAnswerResponse
} = require('../presenters/diagnosis-round-presenter')
const { buildFrontendAnswerResponse } = require('./frontend-response')

async function handleAnswer({ payload, identity, timing } = {}) {
  const openid = identity?.openid || ''
  assertAuthenticatedUser({ userInfo: identity, message: '请先登录' })

  const executed = await runAnswerDiagnosis({
    payload,
    openid,
    timing
  })
  timing.mark('answer-runner-ready')

  const hydratedResponse = executed.response?.questionRequired
    ? await withQuestionTextConservative(executed.response)
    : executed.response
  const publicResponse = presentDiagnosisAnswerResponse(hydratedResponse)
  const data = buildFrontendAnswerResponse(publicResponse)
  if (executed.answerRevision) {
    data.answerRevision = executed.answerRevision
  }
  if (executed.uiPatch) {
    data.uiPatch = executed.uiPatch
  }
  timing.mark('response-ready')
  timing.finish({ statusCode: 200 })

  return jsonResponse(200, {
    code: 200,
    message: '问诊提交成功',
    data
  })
}

module.exports = { handleAnswer }
