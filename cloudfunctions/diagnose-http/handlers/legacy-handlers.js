'use strict'

const { jsonResponse } = require('/opt/utils/http')
const {
  isLegacyFollowUpPayload,
  buildLegacyFollowUpPayload,
  buildLegacyStartPayload
} = require('../mappers/legacy-diagnose-request-mapper')
const {
  buildPublicRoundResponse: presentDiagnosisRoundResponse
} = require('../presenters/diagnosis-round-presenter')
const { buildLegacyHttpSuccess } = require('../presenters/legacy-diagnose-presenter')
const { resolveRequestPrincipal, assertAuthenticatedUser, runWithQuotaGuard } = require('../services/request-guard')
const { ensureRefactorReady } = require('../app/refactor-readiness')
const { runStartDiagnosis } = require('../app/diagnosis-start-runner')
const { runAnswerDiagnosis } = require('../app/diagnosis-answer-runner')
const { withQuestionTextFallback } = require('../app/request-normalizers')
const { buildFrontendDiagnosisResponse } = require('../app/frontend-response')

async function handleLegacyDiagnose(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })

  const isFollowUp = isLegacyFollowUpPayload(payload)

  try {
    assertAuthenticatedUser({ ...principal, message: '需要登录才能使用 AI 诊断功能' })
    await ensureRefactorReady()

    const executed = isFollowUp
      ? await runAnswerDiagnosis({
          payload: buildLegacyFollowUpPayload(payload),
          openid: principal.userInfo?.openid || '',
          skipPersistence: principal.skipPersistence
        })
      : await runWithQuotaGuard({
          request,
          openid: principal.userInfo?.openid || '',
          skipAuth: principal.skipAuth,
          enabled: true,
          task: async () => runStartDiagnosis({
            payload: buildLegacyStartPayload(payload),
            openid: principal.userInfo?.openid || '',
            skipPersistence: principal.skipPersistence
          })
        })

    return jsonResponse(200, buildLegacyHttpSuccess({
      sessionId: executed.sessionId,
      plantId: executed.plantId,
      roundResult: executed.response,
      diagnosisText: executed.diagnosisText
    }))
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
      code: error.statusCode || 500,
      message: error.message || '诊断失败',
      data: null
    })
  }
}

function createSseEmitter(sse) {
  let closed = false
  let eventId = 0

  if (typeof sse.on === 'function') {
    sse.on('close', () => {
      closed = true
    })
  }

  return {
    send(eventName, payload) {
      if (closed || sse.closed) {return}
      eventId += 1
      sse.send({
        event: eventName,
        id: String(eventId),
        data: JSON.stringify({
          id: String(eventId),
          event: eventName,
          ...payload
        })
      })
    },
    end() {
      if (!closed && !sse.closed) {
        sse.end()
      }
    }
  }
}

function requestWantsDiagnosisStartSse(request = {}, payload = {}) {
  const headers = request.headers || {}
  const accept = String(headers.accept || headers.Accept || '').toLowerCase()
  return (
    accept.includes('text/event-stream') ||
    payload?.streamVisualDecision === true ||
    payload?.stream_visual_decision === true
  )
}

function buildVisualProgressContent(eventName, payload = {}) {
  const decision = payload?.decision || {}
  const counts = decision?.counts || {}
  const phase = String(eventName || '').trim()
  if (phase === 'visual_session_created') {
    return '已建立诊断会话，准备分析图片。'
  }
  if (phase === 'visual_input_ready') {
    const count = Number(payload?.imageCount || 0)
    return count > 1 ? `已接收 ${count} 张图片，开始逐张视觉分析。` : '已接收图片，开始视觉分析。'
  }
  if (phase === 'visual_model_started') {
    return '视觉模型正在读取图片证据。'
  }
  if (phase === 'visual_model_complete') {
    return '视觉模型已完成图片读取，正在结构化裁决证据。'
  }
  if (phase === 'visual_decision_ready') {
    const symptomCandidates = Array.isArray(decision?.symptomCandidates)
      ? decision.symptomCandidates
      : Array.isArray(decision?.aggregatedSymptomCandidates)
        ? decision.aggregatedSymptomCandidates
        : []
    const observedSymptoms = Array.isArray(decision?.observedSymptoms)
      ? decision.observedSymptoms
      : []
    const outOfPoolSymptomCandidates = Array.isArray(decision?.outOfPoolSymptomCandidates)
      ? decision.outOfPoolSymptomCandidates
      : []
    const symptomCount = Number(
      counts.symptomCandidates ||
        symptomCandidates.length ||
        counts.observedSymptoms ||
        observedSymptoms.length ||
        0
    )
    const outOfPoolCount = Number(
      counts.outOfPoolSymptomCandidates || outOfPoolSymptomCandidates.length || 0
    )
    const primaryCandidate =
      symptomCandidates[0] || observedSymptoms[0] || outOfPoolSymptomCandidates[0] || null
    const primaryLabel = String(
      primaryCandidate?.symptomCn ||
        primaryCandidate?.rawVisualNameCn ||
        primaryCandidate?.symptomKey ||
        primaryCandidate?.rawVisualNameEn ||
        ''
    ).trim()
    const suffix = primaryLabel ? `，主要证据：${primaryLabel}` : ''
    if (symptomCount > 0 && outOfPoolCount > 0) {
      return `视觉裁决完成：发现 ${symptomCount} 个池内候选，并记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    if (symptomCount > 0) {
      return `视觉裁决完成：发现 ${symptomCount} 个池内候选证据${suffix}。`
    }
    if (outOfPoolCount > 0) {
      return `视觉裁决完成：记录 ${outOfPoolCount} 个池外可见异常${suffix}。`
    }
    return '视觉裁决完成：未形成稳定的池内候选证据。'
  }
  if (phase === 'visual_persisted') {
    return '视觉裁决已记录，正在进入问诊决策。'
  }
  if (phase === 'visual_extraction_complete') {
    return '视觉证据裁决完成，正在生成下一步问诊或结果。'
  }
  return ''
}

function createVisualStreamBridge(emitter, { emitRawReply = false } = {}) {
  let lastProgressContent = ''

  function sendProgress(eventName, payload = {}) {
    const content = buildVisualProgressContent(eventName, payload)
    if (!content || content === lastProgressContent) {return}
    lastProgressContent = content
    emitter.send('visual_progress', {
      type: 'visual_progress',
      phase: eventName,
      content
    })
  }

  return {
    onText: (chunk, fullText) => {
      if (!emitRawReply) {return}
      emitter.send('reply', {
        type: 'reply',
        role: 'assistant',
        content: chunk,
        fullText
      })
    },
    onVisualEvent: (eventName, visualPayload = {}) => {
      const payload = visualPayload && typeof visualPayload === 'object' ? visualPayload : {}
      emitter.send(eventName, {
        type: eventName,
        phase: eventName,
        ...payload
      })
      sendProgress(eventName, payload)
    }
  }
}

async function handleDiagnosisStartStream(
  event,
  context,
  request,
  payload,
  { legacyPayload = false, legacyDoneData = false, emitRawReply = false } = {}
) {
  payload = payload || {}
  const sse = context.sse?.()
  if (!sse) {
    return jsonResponse(400, { code: 400, message: '当前请求不支持 SSE', data: null })
  }

  const emitter = createSseEmitter(sse)
  emitter.send('prompt', {
    type: 'prompt',
    role: 'user',
    content: '开始诊断'
  })

  const principal = await resolveRequestPrincipal({ request, context, payload })
  const streamBridge = createVisualStreamBridge(emitter, { emitRawReply })

  try {
    assertAuthenticatedUser({ ...principal, message: '需要登录才能使用 AI 诊断功能' })
    await ensureRefactorReady()
    const executed = await runWithQuotaGuard({
      request,
      openid: principal.userInfo?.openid || '',
      skipAuth: principal.skipAuth,
      task: async () => runStartDiagnosis({
        payload: legacyPayload ? buildLegacyStartPayload(payload) : payload,
        openid: principal.userInfo?.openid || '',
        skipPersistence: principal.skipPersistence,
        onText: streamBridge.onText,
        onVisualEvent: streamBridge.onVisualEvent
      })
    })
    let finalData
    if (legacyDoneData) {
      finalData = buildLegacyHttpSuccess({
        sessionId: executed.sessionId,
        plantId: executed.plantId,
        roundResult: executed.response,
        diagnosisText: executed.diagnosisText
      }).data
    } else {
      const hydratedResponse = await withQuestionTextFallback(executed.response)
      const publicResponse = presentDiagnosisRoundResponse(hydratedResponse)
      const hydratedPublicResponse = await withQuestionTextFallback(publicResponse)
      finalData = buildFrontendDiagnosisResponse(hydratedPublicResponse)
    }

    emitter.send('done', {
      type: 'done',
      code: 200,
      message: '诊断完成',
      fullText: executed.diagnosisText || executed.response?.topProblem?.summary || '',
      data: finalData
    })
    emitter.end()
    return ''
  } catch (error) {
    emitter.send('error', {
      type: 'error',
      code: error.statusCode || 500,
      message: error.message || '诊断失败'
    })
    emitter.end()
    return ''
  }
}

async function handleLegacyDiagnoseStream(event, context, request, payload) {
  return handleDiagnosisStartStream(event, context, request, payload, {
    legacyPayload: true,
    legacyDoneData: true,
    emitRawReply: true
  })
}

module.exports = {
  handleLegacyDiagnose,
  createSseEmitter,
  requestWantsDiagnosisStartSse,
  buildVisualProgressContent,
  createVisualStreamBridge,
  handleDiagnosisStartStream,
  handleLegacyDiagnoseStream
}
