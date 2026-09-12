'use strict'

const crypto = require('crypto')
const { getSessionState, upsertDiagnosisSession } = require('../services/session-service')
const {
  buildRetakeAuthorization,
  assertRetakeAuthorizationActive
} = require('../domain/diagnosis-mode-router')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

const pendingRetakeAuthorizations = new Map()

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeState(state = null) {
  return state && typeof state === 'object' ? state : null
}

function buildAuthorizationId({ diagnosisSessionId = '', openid = '', now = Date.now() } = {}) {
  const digest = crypto
    .createHash('sha1')
    .update(`${diagnosisSessionId}:${openid}:${now}:${Math.random()}`)
    .digest('hex')
    .slice(0, 20)
  return `retake_${digest}`
}

function hasRetakeBeenUsed(state = null) {
  const current = normalizeState(state)
  if (!current) {
    return false
  }
  return ['active', 'consumed', 'ended_retake_timeout', 'skipped_unknown'].includes(
    normalizeText(current.status).toLowerCase()
  )
}

function isRetakeSkippedUnknown(state = null) {
  return normalizeText(normalizeState(state)?.status || '').toLowerCase() === 'skipped_unknown'
}

function assertSessionAwaitingRetake(sessionState = {}) {
  const snapshot = sessionState.runtimeSnapshot || {}
  const retakeRequest =
    snapshot.retakeRequest && typeof snapshot.retakeRequest === 'object'
      ? snapshot.retakeRequest
      : null
  const sessionStatus = normalizeText(sessionState.sessionStatus || sessionState.status || '')
  if (sessionStatus !== 'awaiting_retake' || !retakeRequest) {
    throw Object.assign(new Error('当前诊断不需要补拍'), {
      statusCode: 409,
      code: 'RETAKE_NOT_REQUESTED'
    })
  }
  return retakeRequest
}

function assertRequestedCaptureRegionMatches({
  requestedCaptureRegion = '',
  plannedCaptureRegion = ''
} = {}) {
  const clientCaptureRegion = normalizeCaptureRegion(requestedCaptureRegion || plannedCaptureRegion)
  if (clientCaptureRegion !== plannedCaptureRegion) {
    throw Object.assign(new Error('补拍区域与当前诊断不匹配'), {
      statusCode: 409,
      code: 'RETAKE_REGION_MISMATCH'
    })
  }
}

function buildRetakeAuthorizationResponse(state = {}) {
  return {
    diagnosisSessionId: state.diagnosisSessionId,
    retakeAuthorizationId: state.retakeAuthorizationId,
    retakeStartedAt: state.retakeStartedAt,
    retakeExpiresAt: state.retakeExpiresAt,
    serverNow: state.serverNow,
    requestedCaptureRegion: state.requestedCaptureRegion,
    originVisualCallBatchId: state.originVisualCallBatchId,
    status: state.status
  }
}

function buildRetakePersistenceResponse({ sessionState = {}, retakeAuthorizationState = {} } = {}) {
  const snapshot = sessionState.runtimeSnapshot || {}
  const isExpired = retakeAuthorizationState.status === 'ended_retake_timeout'
  const isSkippedUnknown = retakeAuthorizationState.status === 'skipped_unknown'
  const isTerminal = isExpired || isSkippedUnknown
  const terminalStopReason = isExpired ? 'ended_retake_timeout' : 'retake_skipped_unknown'
  const terminalSummary = isExpired
    ? '补拍时间已过，本次诊断已结束。请重新开始诊断。'
    : '已跳过这次补拍，本次诊断暂不能继续判断。可以重新开始诊断。'
  const retakeRequest =
    snapshot.retakeRequest && typeof snapshot.retakeRequest === 'object'
      ? {
          ...snapshot.retakeRequest,
          ...(isSkippedUnknown
            ? {
                status: 'skipped_unknown',
                answerValue: retakeAuthorizationState.answerValue || 'unknown'
              }
            : {})
        }
      : null
  return {
    diagnosisSessionId: sessionState.sessionId,
    roundId: snapshot.roundId || sessionState.currentRoundId || 'round_1',
    plantContext: sessionState.plantContext || {},
    routePrimaryAction: 'request_followup_capture',
    questionRequired: false,
    questions: [],
    outcomeType: isTerminal ? 'uncertain' : sessionState.outcomeType || '',
    sessionStatus: isTerminal ? 'completed' : 'awaiting_retake',
    stopReason: isTerminal ? terminalStopReason : '',
    visualBatchTrace: sessionState.visualBatchTrace || null,
    visualAggregateSummary: sessionState.visualAggregateSummary || null,
    observedEvidenceSet: sessionState.observedEvidenceSet || [],
    retakeAuthorizationState,
    retakeRequest,
    finalResult: isTerminal
      ? {
          resultId: `${sessionState.sessionId || 'diagnosis'}_${
            isExpired ? 'retake_timeout' : 'retake_skipped_unknown'
          }`,
          summary: terminalSummary,
          outcomeType: 'uncertain',
          visibleOutcomes: []
        }
      : null,
    visibleOutcomes: []
  }
}

async function persistRetakeAuthorizationState({
  openid = '',
  sessionState = {},
  state = {}
} = {}) {
  const response = buildRetakePersistenceResponse({
    sessionState,
    retakeAuthorizationState: state
  })
  await upsertDiagnosisSession({
    sessionId: sessionState.sessionId,
    openid,
    plantContext: sessionState.plantContext || {},
    response,
    round: Number(sessionState.currentRoundIndex || 1),
    reliabilityScore: 0,
    mode: 'new_v13',
    image: '',
    description: '',
    clientContext: sessionState.runtimeSnapshot?.clientContext || null
  })
  return response
}

function buildAuthorizationSingleFlightKey({ diagnosisSessionId = '', openid = '' } = {}) {
  return `${normalizeText(openid, 'anonymous')}::${normalizeText(diagnosisSessionId)}`
}

async function withRetakeAuthorizationSingleFlight(key = '', task) {
  if (pendingRetakeAuthorizations.has(key)) {
    return pendingRetakeAuthorizations.get(key)
  }
  const pending = Promise.resolve()
    .then(task)
    .finally(() => pendingRetakeAuthorizations.delete(key))
  pendingRetakeAuthorizations.set(key, pending)
  return pending
}

async function authorizeRetakeForSessionUnlocked({
  diagnosisSessionId = '',
  openid = '',
  requestedCaptureRegion = '',
  now = Date.now()
} = {}) {
  const sessionState = await getSessionState(openid, diagnosisSessionId)
  if (!sessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }
  const existingState = normalizeState(sessionState.runtimeSnapshot?.retakeAuthorizationState)
  if (isRetakeSkippedUnknown(existingState)) {
    throw Object.assign(new Error('本次补拍已跳过，不能再开始补拍'), {
      statusCode: 409,
      code: 'RETAKE_ALREADY_SKIPPED'
    })
  }
  const retakeRequest = assertSessionAwaitingRetake(sessionState)
  const plannedCaptureRegion = normalizeCaptureRegion(
    retakeRequest.requestedCaptureRegion || '',
    'other_local'
  )
  assertRequestedCaptureRegionMatches({ requestedCaptureRegion, plannedCaptureRegion })
  if (normalizeText(existingState?.status || '').toLowerCase() === 'active') {
    assertRequestedCaptureRegionMatches({
      requestedCaptureRegion: existingState.requestedCaptureRegion,
      plannedCaptureRegion
    })
    return buildRetakeAuthorizationResponse({ ...existingState, serverNow: now })
  }
  if (hasRetakeBeenUsed(existingState)) {
    throw Object.assign(new Error('本次会话的补拍机会已使用'), { statusCode: 409 })
  }
  const originVisualCallBatchId = normalizeText(
    retakeRequest.originVisualCallBatchId || '',
    sessionState.latestVisualCallBatchId || sessionState.plantContext?.latestVisualCallBatchId || ''
  )
  const authorization = buildRetakeAuthorization({
    authorizationId: buildAuthorizationId({ diagnosisSessionId, openid, now }),
    now,
    originVisualCallBatchId,
    requestedCaptureRegion: plannedCaptureRegion
  })
  const state = {
    ...authorization,
    diagnosisSessionId,
    openid,
    consumedAt: 0
  }
  await persistRetakeAuthorizationState({ openid, sessionState, state })
  return buildRetakeAuthorizationResponse(state)
}

async function authorizeRetakeForSession(options = {}) {
  return withRetakeAuthorizationSingleFlight(buildAuthorizationSingleFlightKey(options), () =>
    authorizeRetakeForSessionUnlocked(options)
  )
}

async function assertRetakeUploadAuthorized({
  diagnosisSessionId = '',
  openid = '',
  authorizationId = '',
  requestedCaptureRegion = '',
  originVisualCallBatchId = '',
  now = Date.now()
} = {}) {
  const sessionState = await getSessionState(openid, diagnosisSessionId)
  if (!sessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }
  const state = normalizeState(sessionState.runtimeSnapshot?.retakeAuthorizationState)
  if (!state || !authorizationId || state.retakeAuthorizationId !== authorizationId) {
    throw Object.assign(new Error('缺少有效补拍授权'), {
      statusCode: 409,
      code: 'RETAKE_AUTH_REQUIRED'
    })
  }
  if (state.diagnosisSessionId !== diagnosisSessionId || state.openid !== openid) {
    throw Object.assign(new Error('补拍授权不属于当前会话'), { statusCode: 409 })
  }
  if (state.status === 'consumed') {
    throw Object.assign(new Error('本次会话的补拍机会已使用'), { statusCode: 409 })
  }
  try {
    assertRetakeAuthorizationActive(state, now)
  } catch (error) {
    const expiredState = { ...state, status: 'ended_retake_timeout', serverNow: now }
    await persistRetakeAuthorizationState({ openid, sessionState, state: expiredState })
    throw error
  }
  const requestedRegion = normalizeCaptureRegion(
    requestedCaptureRegion,
    state.requestedCaptureRegion
  )
  if (requestedRegion !== state.requestedCaptureRegion) {
    throw Object.assign(new Error('补拍区域与授权不匹配'), { statusCode: 409 })
  }
  const originBatch = normalizeText(originVisualCallBatchId, state.originVisualCallBatchId)
  if (
    originBatch &&
    state.originVisualCallBatchId &&
    originBatch !== state.originVisualCallBatchId
  ) {
    throw Object.assign(new Error('补拍来源批次与授权不匹配'), { statusCode: 409 })
  }
  return { sessionState, retakeAuthorizationState: state }
}

function consumeRetakeAuthorization(state = {}, now = Date.now()) {
  return {
    ...state,
    status: 'consumed',
    consumedAt: now,
    serverNow: now
  }
}

async function skipRetakeForSession({
  diagnosisSessionId = '',
  openid = '',
  requestedCaptureRegion = '',
  now = Date.now()
} = {}) {
  const sessionState = await getSessionState(openid, diagnosisSessionId)
  if (!sessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }
  const existingState = normalizeState(sessionState.runtimeSnapshot?.retakeAuthorizationState)
  if (isRetakeSkippedUnknown(existingState)) {
    return buildRetakePersistenceResponse({
      sessionState,
      retakeAuthorizationState: existingState
    })
  }
  if (hasRetakeBeenUsed(existingState)) {
    throw Object.assign(
      new Error(
        isRetakeSkippedUnknown(existingState) ? '本次补拍已跳过' : '补拍已开始或已结束，不能再跳过'
      ),
      {
        statusCode: 409,
        code: isRetakeSkippedUnknown(existingState)
          ? 'RETAKE_ALREADY_SKIPPED'
          : 'RETAKE_ALREADY_USED'
      }
    )
  }
  const retakeRequest = assertSessionAwaitingRetake(sessionState)
  const plannedCaptureRegion = normalizeCaptureRegion(
    retakeRequest.requestedCaptureRegion || '',
    'other_local'
  )
  assertRequestedCaptureRegionMatches({ requestedCaptureRegion, plannedCaptureRegion })
  const originVisualCallBatchId = normalizeText(
    retakeRequest.originVisualCallBatchId || '',
    sessionState.latestVisualCallBatchId || sessionState.plantContext?.latestVisualCallBatchId || ''
  )
  const state = {
    diagnosisSessionId,
    openid,
    status: 'skipped_unknown',
    answerValue: retakeRequest.skipAnswerValue || 'unknown',
    skippedAt: now,
    serverNow: now,
    requestedCaptureRegion: plannedCaptureRegion,
    originVisualCallBatchId,
    skipReason: 'user_declined_risky_retake'
  }
  return persistRetakeAuthorizationState({ openid, sessionState, state })
}

module.exports = {
  authorizeRetakeForSession,
  skipRetakeForSession,
  assertRetakeUploadAuthorized,
  consumeRetakeAuthorization,
  _test: {
    hasRetakeBeenUsed,
    isRetakeSkippedUnknown,
    buildAuthorizationSingleFlightKey,
    assertSessionAwaitingRetake,
    buildRetakePersistenceResponse
  }
}
