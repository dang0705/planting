'use strict'

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const {
  buildPublicRoundResponse: presentDiagnosisRoundResponse,
  buildCompactAnswerRoundResponse: presentDiagnosisAnswerResponse
} = require('../presenters/diagnosis-round-presenter')
const { listDiagnosisHistory, getResultById, saveDiagnosisFeedback } = require('../services/session-service')
const { resolveRequestPrincipal, assertAuthenticatedUser, runWithQuotaGuard } = require('../services/request-guard')
const { ensureRefactorReady } = require('../app/refactor-readiness')
const { runStartDiagnosis } = require('../app/diagnosis-start-runner')
const { runQuestionStartDiagnosis } = require('../app/diagnosis-question-start-runner')
const { runAnswerDiagnosis } = require('../app/diagnosis-answer-runner')
const { withQuestionTextFallback } = require('../app/request-normalizers')
const { buildFrontendDiagnosisResponse } = require('../app/frontend-response')

async function handleDiagnosisStart(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runStartDiagnosis({
        payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence
      })
    })
    const hydratedResponse = await withQuestionTextFallback(executed.response)
    const publicResponse = presentDiagnosisRoundResponse(hydratedResponse)
    const hydratedPublicResponse = await withQuestionTextFallback(publicResponse)

    return jsonResponse(200, {
      code: 200,
      message: '诊断开始成功',
      data: buildFrontendDiagnosisResponse(hydratedPublicResponse)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '诊断开始失败',
      data: null
    })
  }
}

async function handleDiagnosisQuestionStart(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runQuestionStartDiagnosis({
        payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence
      })
    })
    const hydratedResponse = await withQuestionTextFallback(executed.response)
    const publicResponse = presentDiagnosisRoundResponse(hydratedResponse)
    const hydratedPublicResponse = await withQuestionTextFallback(publicResponse)

    return jsonResponse(200, {
      code: 200,
      message: '问诊初始化成功',
      data: buildFrontendDiagnosisResponse(hydratedPublicResponse)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '问诊初始化失败',
      data: null
    })
  }
}

async function handleDiagnosisAnswer(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await ensureRefactorReady()
    const executed = await runAnswerDiagnosis({
      payload,
      openid: principal.userInfo?.openid || '',
      skipPersistence: principal.skipPersistence
    })
    const hydratedResponse = await withQuestionTextFallback(executed.response)
    const publicResponse = presentDiagnosisAnswerResponse(hydratedResponse)
    const data = buildFrontendDiagnosisResponse(publicResponse)
    if (executed.answerRevision) {
      data.answerRevision = executed.answerRevision
    }
    if (executed.uiPatch) {
      data.uiPatch = executed.uiPatch
    }

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '问诊提交失败',
      data: null
    })
  }
}

async function handleDiagnosisResult(request, context, query) {
  const userInfo = await resolveHttpUserInfo(request.headers, query, context)
  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  const result = await getResultById(userInfo.openid, {
    resultId: query.id || query.resultId || '',
    sessionId: query.sessionId || ''
  })

  if (!result) {
    return jsonResponse(404, { code: 404, message: '结果不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data: result })
}

async function handleDiagnosisHistory(request, context, query) {
  const userInfo = await resolveHttpUserInfo(request.headers, query, context)
  if (!userInfo?.openid) {
    return jsonResponse(401, { code: 401, message: '请先登录', data: null })
  }

  const data = await listDiagnosisHistory(userInfo.openid, {
    userPlantId: query.userPlantId || query.plantId || null,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 20)
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisFeedback(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    const data = await saveDiagnosisFeedback(principal.userInfo?.openid || '', {
      resultId: payload.resultId || payload.diagnosisSessionId || '',
      feedback: payload.feedback || {}
    })

    return jsonResponse(200, { code: 200, data })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '提交反馈失败',
      data: null
    })
  }
}

module.exports = {
  handleDiagnosisStart,
  handleDiagnosisQuestionStart,
  handleDiagnosisAnswer,
  handleDiagnosisResult,
  handleDiagnosisHistory,
  handleDiagnosisFeedback
}
