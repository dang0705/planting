'use strict'

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const {
  buildPublicRoundResponse: presentDiagnosisRoundResponse,
  buildCompactAnswerRoundResponse: presentDiagnosisAnswerResponse
} = require('../presenters/diagnosis-round-presenter')
const {
  listDiagnosisHistory,
  getResultById,
  saveDiagnosisFeedback
} = require('../services/session-service')
const {
  resolveRequestPrincipal,
  assertAuthenticatedUser,
  runWithQuotaGuard
} = require('../services/request-guard')
const { withQuestionTextConservative } = require('../app/request-normalizers')

const VISUAL_SSE_EVENT_NAMES = new Set([
  'visual_preparing',
  'visual_session_created',
  'visual_input_ready',
  'visual_model_started',
  'visual_model_response_started',
  'visual_model_complete',
  'visual_decision_ready',
  'visual_persisted',
  'visual_extraction_complete'
])
const PUBLIC_SERVICE_ERROR_CODES = new Set(['MODEL_UNAVAILABLE', 'visual_model_unavailable'])

function getRefactorReadiness() {
  return require('../app/refactor-readiness')
}

function getStartRunner() {
  return require('../app/diagnosis-start-runner')
}

function getQuestionStartRunner() {
  return require('../app/diagnosis-question-start-runner')
}

function getAnswerRunner() {
  return require('../app/diagnosis-answer-runner')
}

function getRetakeAuthorization() {
  return require('../app/retake-authorization')
}

function buildFrontendResponse(payload) {
  return require('../app/frontend-response').buildFrontendDiagnosisResponse(payload)
}

function buildFrontendAnswerResponse(payload) {
  return require('../app/frontend-response').buildFrontendAnswerResponse(payload)
}

function buildErrorPayload(error, fallbackMessage = '请求失败') {
  const statusCode = Number(error?.statusCode || 500)
  const isClientError = statusCode >= 400 && statusCode < 500
  const isPublicServiceError = PUBLIC_SERVICE_ERROR_CODES.has(String(error?.code || ''))
  return {
    code: statusCode,
    businessCode:
      (isClientError || isPublicServiceError) && error?.code
        ? String(error.code)
        : 'INTERNAL_ERROR',
    message:
      (isClientError || isPublicServiceError) && error?.message ? error.message : fallbackMessage,
    data: null
  }
}

function createVisualSseEmitter(sse) {
  let terminalEventSent = false
  const buildEvent = (event, data = {}) => ({ event, data: { event, ...data } })

  return {
    send(event, data = {}) {
      if (terminalEventSent || sse.closed || !VISUAL_SSE_EVENT_NAMES.has(event)) {
        return false
      }
      return sse.send(buildEvent(event, data))
    },
    end(event, data = {}) {
      if (terminalEventSent || sse.closed) {
        return false
      }
      terminalEventSent = true
      sse.end(buildEvent(event, data))
      return true
    }
  }
}

async function executeDiagnosisStart(request, payload, principal, onVisualEvent) {
  assertAuthenticatedUser({ ...principal, message: '请先登录' })
  await getRefactorReadiness().ensureDiagnosisStartRefactorReady()
  const executed = await runWithQuotaGuard({
    openid: principal.userInfo?.openid || '',
    task: async () =>
      getStartRunner().runStartDiagnosis({
        payload,
        openid: principal.userInfo?.openid || '',
        ...(typeof onVisualEvent === 'function' ? { onVisualEvent } : {})
      })
  })
  const hydratedResponse = await withQuestionTextConservative(executed.response)
  const publicResponse = presentDiagnosisRoundResponse(hydratedResponse)
  const hydratedPublicResponse = await withQuestionTextConservative(publicResponse)
  const frontendData = buildFrontendResponse(hydratedPublicResponse)
  console.log('diagnosis/start completed:', {
    sessionId: executed.sessionId || frontendData?.diagnosisSessionId || null,
    streamed: typeof onVisualEvent === 'function'
  })
  return frontendData
}

async function handleDiagnosisStartStream(request, context, payload) {
  let sse = null
  try {
    sse = typeof context?.sse === 'function' ? context.sse() : null
  } catch {
    sse = null
  }
  if (!sse) {
    return jsonResponse(501, {
      code: 501,
      businessCode: 'SSE_UNSUPPORTED',
      message: '当前请求不支持 SSE',
      data: null
    })
  }

  const emitter = createVisualSseEmitter(sse)
  emitter.send('visual_preparing')
  try {
    const principal = await resolveRequestPrincipal({ request, context, payload })
    const data = await executeDiagnosisStart(request, payload, principal, (event, eventData) =>
      emitter.send(event, eventData)
    )
    emitter.end('done', { data })
  } catch (error) {
    emitter.end('error', buildErrorPayload(error, '诊断开始失败'))
  }
  return undefined
}

async function handleDiagnosisStart(request, context, payload) {
  payload = payload || {}
  if (payload.streamVisualDecision === true) {
    return handleDiagnosisStartStream(request, context, payload)
  }
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    const data = await executeDiagnosisStart(request, payload, principal)

    return jsonResponse(200, {
      code: 200,
      message: '诊断开始成功',
      data
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '诊断开始失败'))
  }
}

async function handleDiagnosisQuestionStart(request, context, payload, resolvedPrincipal = null) {
  payload = payload || {}
  const principal =
    resolvedPrincipal && typeof resolvedPrincipal === 'object'
      ? resolvedPrincipal
      : await resolveRequestPrincipal({ request, context, payload })
  const timing = resolvedPrincipal?.timing || null
  timing?.mark('handler-ready')

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await getRefactorReadiness().ensureRefactorReady({
      strict: false,
      allowStale: true,
      refreshTimeoutMs: 0,
      source: 'diagnosis-question-start'
    })
    timing?.mark('readiness-ready')
    const executed = await runWithQuotaGuard({
      openid: principal.userInfo?.openid || '',
      quotaUserSnapshot: principal.userInfo?.quotaUserSnapshot || null,
      quotaUserSnapshotFresh: principal.userInfo?.quotaUserSnapshotFresh === true,
      timing,
      deferQuotaConsumption: true,
      task: async () =>
        getQuestionStartRunner().runQuestionStartDiagnosis({
          payload,
          openid: principal.userInfo?.openid || '',
          timing
        })
    })
    timing?.mark('quota-and-runner-ready')
    const hydratedResponse = await withQuestionTextConservative(executed.response)
    const hydratedPublicResponse = await withQuestionTextConservative({
      ...hydratedResponse,
      userPlantId: executed.userPlantId || hydratedResponse.userPlantId || null,
      plantId: executed.plantId || hydratedResponse.plantId || '',
      plantCatalogId: executed.plantCatalogId || hydratedResponse.plantCatalogId || null,
      plantIdentityId: executed.plantIdentityId || hydratedResponse.plantIdentityId || '',
      latestVisualCallBatchId:
        executed.latestVisualCallBatchId ?? hydratedResponse.latestVisualCallBatchId ?? null
      })
    timing?.mark('response-ready')
    timing?.finish({ statusCode: 200 })

    return jsonResponse(200, {
      code: 200,
      message: '问诊初始化成功',
      data: buildFrontendResponse(hydratedPublicResponse)
    })
  } catch (error) {
    timing?.finish({ statusCode: Number(error?.statusCode || 500), failed: true })
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '问诊初始化失败'))
  }
}

async function handleDiagnosisAnswer(request, context, payload, resolvedPrincipal = null) {
  payload = payload || {}
  const principal =
    resolvedPrincipal && typeof resolvedPrincipal === 'object'
      ? resolvedPrincipal
      : await resolveRequestPrincipal({ request, context, payload })
  const timing = resolvedPrincipal?.timing || null
  timing?.mark('handler-ready')

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await getRefactorReadiness().ensureRefactorReady({
      strict: false,
      allowStale: true,
      refreshTimeoutMs: 0,
      source: 'diagnosis-answer'
    })
    timing?.mark('readiness-ready')
    const executed = await getAnswerRunner().runAnswerDiagnosis({
      payload,
      openid: principal.userInfo?.openid || '',
      timing
    })
    timing?.mark('answer-runner-ready')
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
    timing?.mark('response-ready')
    timing?.finish({ statusCode: 200 })

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data
    })
  } catch (error) {
    timing?.finish({ statusCode: Number(error?.statusCode || 500), failed: true })
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '问诊提交失败'))
  }
}

async function handleDiagnosisRetakeAuthorize(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    const data = await getRetakeAuthorization().authorizeRetakeForSession({
      diagnosisSessionId: payload.diagnosisSessionId || payload.diagnosisId || '',
      openid: principal.userInfo?.openid || '',
      requestedCaptureRegion:
        payload.requestedCaptureRegion || payload.requested_capture_region || ''
    })

    return jsonResponse(200, {
      code: 200,
      message: '补拍授权已开始',
      data
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '补拍授权失败'))
  }
}

async function handleDiagnosisRetakeSkip(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    const skippedResponse = await getRetakeAuthorization().skipRetakeForSession({
      diagnosisSessionId: payload.diagnosisSessionId || payload.diagnosisId || '',
      openid: principal.userInfo?.openid || '',
      requestedCaptureRegion:
        payload.requestedCaptureRegion || payload.requested_capture_region || ''
    })
    const publicResponse = presentDiagnosisAnswerResponse(skippedResponse)

    return jsonResponse(200, {
      code: 200,
      message: '已跳过补拍',
      data: buildFrontendAnswerResponse(publicResponse)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '跳过补拍失败'))
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

  const publicResponse = presentDiagnosisRoundResponse(result)
  const hydratedPublicResponse = await withQuestionTextConservative(publicResponse)
  return jsonResponse(200, {
    code: 200,
    data: buildFrontendResponse(hydratedPublicResponse)
  })
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

    if (data?.ok === false) {
      return jsonResponse(503, {
        code: 503,
        businessCode: data.errorCode || 'DIAGNOSIS_FEEDBACK_STORAGE_UNAVAILABLE',
        message: data.message || '反馈暂未保存，请稍后重试。',
        data: null
      })
    }

    return jsonResponse(200, { code: 200, data })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '提交反馈失败'))
  }
}

module.exports = {
  handleDiagnosisStart,
  handleDiagnosisQuestionStart,
  handleDiagnosisAnswer,
  handleDiagnosisRetakeAuthorize,
  handleDiagnosisRetakeSkip,
  handleDiagnosisResult,
  handleDiagnosisHistory,
  handleDiagnosisFeedback,
  _test: { buildErrorPayload }
}
