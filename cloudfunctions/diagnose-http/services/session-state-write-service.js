'use strict'

const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { normalizeStoredNullableText } = require('../utils/stored-value')
const { normalizePersistedImageUrl } = require('./session-service-helpers')
const {
  upsertDiagnosisSessionRecord
} = require('../repositories/diagnosis-session-repository')
const {
  resolveSessionIdentityStatus,
  resolveSessionRoute,
  resolveSessionStatus,
  buildOutcomePayload,
  buildRuntimeSnapshotPayload
} = require('./session-runtime-snapshot-codec')

function toNullableDateTimeString(value) {
  if (value === null || value === undefined || value === '') {return ''}
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {return ''}
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeNullableSqlText(value) {
  return normalizeStoredNullableText(value, null)
}

function normalizeNullableSqlNumber(value) {
  if (value === null || value === undefined || value === '') {return null}
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeNullableSqlInteger(value) {
  const num = normalizeNullableSqlNumber(value)
  return num === null ? null : Math.trunc(num)
}

function normalizeNullableSqlDateTime(value) {
  const normalized = toNullableDateTimeString(value)
  return normalized || null
}

function normalizeAdviceText(value = '') {
  return String(value || '').trim()
}

function pickAdviceTextFromSteps(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const text = typeof item === 'string'
      ? normalizeAdviceText(item)
      : normalizeAdviceText(item?.text || item?.title || item?.label || '')
    if (text) {return text}
  }
  return ''
}

function pickAdviceTextFromStrings(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const text = normalizeAdviceText(item)
    if (text) {return text}
  }
  return ''
}

function resolvePersistedAdviceTexts(response = {}) {
  const explanation = response?.resultExplanation || response?.explanation || {}
  const actionAdvice = response?.actionAdvice || response?.finalResult?.actionAdvice || {}
  const actionTreatment = pickAdviceTextFromStrings([
    ...(Array.isArray(actionAdvice?.todayActions) ? actionAdvice.todayActions : []),
    ...(Array.isArray(actionAdvice?.threeDayActions) ? actionAdvice.threeDayActions : []),
    ...(Array.isArray(actionAdvice?.sevenDayObserve) ? actionAdvice.sevenDayObserve : [])
  ])
  const actionPrevention = pickAdviceTextFromStrings([
    ...(Array.isArray(actionAdvice?.avoidActions) ? actionAdvice.avoidActions : []),
    ...(actionAdvice?.conflictDetected && Array.isArray(actionAdvice?.retakeOrEscalate)
      ? actionAdvice.retakeOrEscalate
      : [])
  ])

  return {
    treatment: normalizeAdviceText(
      response?.treatmentText ||
        response?.treatment ||
        actionTreatment ||
        pickAdviceTextFromSteps(response?.nextSteps) ||
        explanation?.firstAid
    ),
    prevention: normalizeAdviceText(
      response?.preventionText ||
        response?.prevention ||
        actionPrevention ||
        pickAdviceTextFromSteps(response?.whatToAvoid) ||
        explanation?.avoid
    )
  }
}

async function upsertDiagnosisSession({
  sessionId,
  openid,
  plantContext,
  response,
  round = 1,
  reliabilityScore = 0,
  mode = 'new_v13',
  image = '',
  description = '',
  clientContext = null
}) {
  const topRanking = Array.isArray(response?.rankings) ? response.rankings[0] : null
  const topProblem = response?.topProblem || null
  const topProblemRanking = (Array.isArray(response?.rankings) ? response.rankings : []).find(
    item => String(item?.problemId || '').trim() === String(topProblem?.problemId || '').trim() ||
      String(item?.problemKey || '').trim() === String(topProblem?.problemKey || '').trim()
  ) || null
  const finalResult = response?.finalResult || null
  const routePrimaryAction = resolveSessionRoute(response)
  const identityResolutionStatus = resolveSessionIdentityStatus({ plantContext, response })
  const sessionStatus = resolveSessionStatus(response)
  const outcomeType = response?.outcomeType || null
  const isProblematicOutcome = outcomeType === 'problematic'
  const shouldMarkEnded = sessionStatus === 'completed'
  const outcomePayloadJson = buildOutcomePayload(response)
  const persistedAdvice = resolvePersistedAdviceTexts(response)
  const normalizedTopProblemScore = normalizeNullableSqlNumber(
    topProblemRanking?.finalScore ?? topRanking?.finalScore
  )
  const normalizedUserPlantId = normalizeNullableSqlInteger(plantContext?.userPlantId)
  const resolvedLatestVisualCallBatchId = resolveLatestVisualCallBatchId(response, plantContext)
  const runtimeSnapshotJson = buildRuntimeSnapshotPayload({
    sessionId,
    plantContext,
    response,
    round,
    clientContext
  })

  await upsertDiagnosisSessionRecord({
    diagnosisId: sessionId,
    sessionId,
    openid,
    userPlantIdValue: normalizedUserPlantId === null ? 0 : normalizedUserPlantId,
    userPlantIdHasValue: normalizedUserPlantId === null ? 0 : 1,
    plantId: normalizeNullableSqlText(plantContext?.plantId),
    diagnosisMode: mode,
    plantGenus: plantContext?.genus || '',
    plantFamily: plantContext?.family || '',
    plantCategory: plantContext?.category || '',
    currentPlantIdentityId: normalizeNullableSqlText(
      plantContext?.plantIdentityId || response?.plantIdentityId
    ),
    currentIdentityResolutionStatus: identityResolutionStatus,
    currentRoutePrimaryAction: routePrimaryAction,
    currentRoundId: response?.roundId || `round_${Number(round || 1)}`,
    currentRoundIndex: Number(round || 1),
    latestVisualCallBatchIdValue: resolvedLatestVisualCallBatchId || '',
    latestVisualCallBatchIdHasValue: resolvedLatestVisualCallBatchId ? 1 : 0,
    imageUrl: normalizePersistedImageUrl(image || ''),
    userDescription: description || '',
    aiSummary: finalResult?.summary || topProblem?.summary || '',
    healthStatus:
      response?.followUpRequired
        ? (topProblem ? 'warning' : 'unknown')
        : (isProblematicOutcome && topProblem ? 'warning' : 'unknown'),
    topProblemKey: topProblem?.problemId || null,
    topProblemScoreValue: normalizedTopProblemScore === null ? 0 : normalizedTopProblemScore,
    topProblemScoreHasValue: normalizedTopProblemScore === null ? 0 : 1,
    reliabilityScore: Number(reliabilityScore || 0),
    followUpRound: Number(round || 1),
    needsFollowUp: response?.followUpRequired ? 1 : 0,
    outcomeType: normalizeNullableSqlText(outcomeType),
    outcomePayloadJson,
    stopReason: normalizeNullableSqlText(response?.stopReason),
    sessionStatus,
    runtimeSnapshotJson,
    finalProblemKey: normalizeNullableSqlText(
      !response?.followUpRequired && isProblematicOutcome
        ? (finalResult?.problemId || topProblem?.problemId)
        : null
    ),
    finalProblemCn: normalizeNullableSqlText(
      !response?.followUpRequired
        ? (finalResult?.displayName || topProblem?.displayName)
        : null
    ),
    treatment: persistedAdvice.treatment,
    prevention: persistedAdvice.prevention,
    endedAtFlag: shouldMarkEnded ? 1 : 0
  })
}

module.exports = {
  upsertDiagnosisSession,
  normalizeNullableSqlNumber,
  normalizeNullableSqlText,
  normalizeNullableSqlDateTime,
  _test: {
    resolvePersistedAdviceTexts
  }
}
