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
  return {
    code: statusCode,
    businessCode: error?.code ? String(error.code) : '',
    message: error?.message || fallbackMessage,
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
    request,
    openid: principal.userInfo?.openid || '',
    skipAuth: principal.skipAuth,
    task: async () =>
      getStartRunner().runStartDiagnosis({
        payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence,
        ...(typeof onVisualEvent === 'function' ? { onVisualEvent } : {})
      })
  })
  const hydratedResponse = await withQuestionTextConservative(executed.response)
  const publicResponse = presentDiagnosisRoundResponse(hydratedResponse)
  const hydratedPublicResponse = await withQuestionTextConservative(publicResponse)
  const frontendData = buildFrontendResponse(hydratedPublicResponse)
  const data = {
    ...frontendData,
    ...(executed.visualUsage ? { aiUsage: executed.visualUsage } : {}),
    ...(Array.isArray(executed.aiDebug) ? { aiDebug: executed.aiDebug } : {})
  }
  const finalLog = {
    sessionId: executed.sessionId || data?.diagnosisSessionId || null,
    streamed: typeof onVisualEvent === 'function',
    data,
    usage: executed.visualUsage || null,
    aiDebug: executed.aiDebug || []
  }
  console.log('diagnosis/start final response:', finalLog)
  console.log('diagnosis/start final response json:', JSON.stringify(finalLog))
  for (const item of Array.isArray(executed.aiDebug) ? executed.aiDebug : []) {
    console.log(`diagnosis/start ai[${item.imageIndex}] formatted prompt:\n${item.formattedPrompt}`)
    console.log(
      `diagnosis/start ai[${item.imageIndex}] raw model data:`,
      JSON.stringify({
        imageId: item.imageId,
        rawTextOutput: item.rawTextOutput,
        rawStructuredOutput: item.rawStructuredOutput,
        usage: item.usage,
        adapterMeta: item.adapterMeta
      })
    )
  }
  return data
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

async function handleDiagnosisQuestionStart(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await getRefactorReadiness().ensureRefactorReady({
      strict: false,
      allowStale: true,
      refreshTimeoutMs: 0,
      source: 'diagnosis-question-start'
    })
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () =>
        getQuestionStartRunner().runQuestionStartDiagnosis({
          payload,
          openid: principal.userInfo?.openid || '',
          skipPersistence: principal.skipPersistence
        })
    })
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

    return jsonResponse(200, {
      code: 200,
      message: '问诊初始化成功',
      data: buildFrontendResponse(hydratedPublicResponse)
    })
  } catch (error) {
    return jsonResponse(error.statusCode || 500, buildErrorPayload(error, '问诊初始化失败'))
  }
}

async function handleDiagnosisAnswer(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  try {
    assertAuthenticatedUser({ ...principal, message: '请先登录' })
    await getRefactorReadiness().ensureRefactorReady({
      strict: false,
      allowStale: true,
      refreshTimeoutMs: 0,
      source: 'diagnosis-answer'
    })
    const executed = await getAnswerRunner().runAnswerDiagnosis({
      payload,
      openid: principal.userInfo?.openid || '',
      skipPersistence: principal.skipPersistence
    })
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

    return jsonResponse(200, {
      code: 200,
      message: '问诊提交成功',
      data
    })
  } catch (error) {
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
  handleDiagnosisFeedback
}
