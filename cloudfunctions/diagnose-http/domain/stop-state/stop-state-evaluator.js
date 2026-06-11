'use strict'

const crypto = require('crypto')

const FINAL_STOP_REASONS = new Set([
  'problematic_output_ready',
  'non_problematic_output_ready',
  'uncertain_output_ready',
  'route_visible_outcomes_ready',
  'route_uncertain_with_candidates'
])

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeRoundIndex(roundId = '', conservative = 1) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) {return Number(conservative || 1) || 1}
  return Number(match[1] || conservative || 1) || 1
}

function buildStopStateId(sessionId = '', roundId = '') {
  const hash = crypto
    .createHash('sha1')
    .update(`${normalizeText(sessionId)}::${normalizeText(roundId)}`)
    .digest('hex')
    .slice(0, 24)

  return `stop_${hash}`
}

function resolveStopReasonType({
  outcomeType = '',
  stopReason = '',
  decisionCauseKey = ''
} = {}) {
  const normalizedOutcomeType = normalizeText(outcomeType)
  const normalizedDecisionCauseKey = normalizeText(decisionCauseKey)
  if (normalizedOutcomeType === 'uncertain' && normalizedDecisionCauseKey) {
    return `uncertain_${normalizedDecisionCauseKey}`
  }
  if (normalizedOutcomeType === 'non_problematic') {return 'non_problematic_converged'}
  if (normalizedOutcomeType === 'uncertain') {return 'uncertain_converged'}
  if (normalizedOutcomeType === 'problematic') {return 'problematic_converged'}

  const normalizedStopReason = normalizeText(stopReason)
  if (normalizedStopReason === 'route_visible_outcomes_ready') {return 'route_visible_outcomes_ready'}
  if (normalizedStopReason === 'route_uncertain_with_candidates') {return 'route_uncertain_with_candidates'}
  if (normalizedStopReason.includes('uncertain')) {return 'uncertain_converged'}
  if (normalizedStopReason.includes('non_problematic')) {return 'non_problematic_converged'}
  if (normalizedStopReason.includes('problematic')) {return 'problematic_converged'}

  return 'system_limited'
}

function resolveStopExplanation({
  response = {}
} = {}) {
  const summaryText =
    normalizeText(response?.finalResult?.summary) ||
    normalizeText(response?.topProblem?.summary) ||
    normalizeText(response?.explanation?.whatToCheckNext)

  if (summaryText) {
    return summaryText
  }

  return '当前轮次已完成停止判定。'
}

function hasPendingQuestions(response = {}) {
  const terminalQuestioningState = response?.terminalQuestioningState
  if (terminalQuestioningState && typeof terminalQuestioningState === 'object') {
    return Number(terminalQuestioningState?.requiresQuestion || 0) === 1
  }
  return Array.isArray(response?.questions) && response.questions.length > 0
}

function evaluateStopState({ response = {} } = {}) {
  const sessionId = normalizeText(response?.diagnosisSessionId)
  const roundId = normalizeText(response?.roundId, 'round_1')
  const pendingQuestions = hasPendingQuestions(response)
  const outcomeType = normalizeText(response?.outcomeType)
  const outcomeLocked = normalizeText(response?.stopDecision?.outcomeLocked || response?.outcomeLocked)
  const uncertainLegalityReason = normalizeText(
    response?.stopDecision?.uncertainLegalityReason || response?.uncertainLegalityReason
  )
  const stopReason = normalizeText(response?.stopDecision?.stopReason || response?.stopReason)
  const stopReasonDetail = normalizeText(
    response?.stopDecision?.stopReasonDetail || response?.stopReasonDetail
  )
  const decisionCause =
    response?.stopDecision?.decisionCause && typeof response.stopDecision.decisionCause === 'object'
      ? response.stopDecision.decisionCause
      : response?.decisionCause && typeof response.decisionCause === 'object'
        ? response.decisionCause
        : null
  const decisionCauseKey = normalizeText(
    decisionCause?.decisionCauseKey || stopReasonDetail
  )
  const stage = normalizeText(response?.stage)
  const hasFormalOutcome = ['problematic', 'non_problematic', 'uncertain'].includes(outcomeType)
  const hasExplicitStopDecision = Boolean(outcomeLocked || stopReason || uncertainLegalityReason)
  const canStopCurrentOutcome =
    outcomeType === 'uncertain'
      ? Boolean(uncertainLegalityReason)
      : hasExplicitStopDecision
  const isStopped =
    stage === 'final' &&
    !pendingQuestions &&
    hasFormalOutcome &&
    hasExplicitStopDecision &&
    FINAL_STOP_REASONS.has(stopReason) &&
    canStopCurrentOutcome
      ? 1
      : 0
  const finalOutputRef = isStopped
    ? normalizeText(response?.finalResult?.resultId || response?.resultId, null)
    : null

  return {
    stopStateId: buildStopStateId(sessionId, roundId),
    sessionId,
    roundId,
    roundIndex: normalizeRoundIndex(roundId, response?.currentRoundIndex || 1),
    isStopped,
    stopReasonType: resolveStopReasonType({
      outcomeType,
      stopReason,
      decisionCauseKey
    }),
    outcomeLocked,
    uncertainLegalityReason,
    stopReason: normalizeText(
      stopReason,
      pendingQuestions ? 'question_package_questions_pending' : ''
    ),
    stopReasonDetail: decisionCauseKey,
    stopReasonText: resolveStopExplanation({ response }),
    decisionCauseKey,
    decisionCauseCategory: normalizeText(decisionCause?.decisionCauseCategory),
    decisionCauseText: normalizeText(decisionCause?.decisionCauseText),
    decisionCauseDetails:
      decisionCause?.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
        ? decisionCause.decisionCauseDetails
        : null,
    finalOutputRef,
    allowMoreQuestions: 0
  }
}

module.exports = {
  evaluateStopState
}
