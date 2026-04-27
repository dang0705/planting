'use strict'

const crypto = require('crypto')
const { summarizeQuestionQueue } = require('../question-queue/question-queue-invalidator')

const FINAL_STOP_REASONS = new Set([
  'problematic_output_ready',
  'non_problematic_output_ready',
  'uncertain_output_ready'
])

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeRoundIndex(roundId = '', fallback = 1) {
  const match = String(roundId || '').match(/round_(\d+)/i)
  if (!match) return Number(fallback || 1) || 1
  return Number(match[1] || fallback || 1) || 1
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
  followUpRequired = false,
  outcomeType = '',
  stopReason = '',
  decisionCauseKey = ''
} = {}) {
  if (followUpRequired) return 'pending_follow_up'

  const normalizedOutcomeType = normalizeText(outcomeType)
  const normalizedDecisionCauseKey = normalizeText(decisionCauseKey)
  if (normalizedOutcomeType === 'uncertain' && normalizedDecisionCauseKey) {
    return `uncertain_${normalizedDecisionCauseKey}`
  }
  if (normalizedOutcomeType === 'non_problematic') return 'non_problematic_converged'
  if (normalizedOutcomeType === 'uncertain') return 'uncertain_converged'
  if (normalizedOutcomeType === 'problematic') return 'problematic_converged'

  const normalizedStopReason = normalizeText(stopReason)
  if (normalizedStopReason.includes('uncertain')) return 'uncertain_converged'
  if (normalizedStopReason.includes('non_problematic')) return 'non_problematic_converged'
  if (normalizedStopReason.includes('problematic')) return 'problematic_converged'

  return followUpRequired ? 'pending_follow_up' : 'system_limited'
}

function resolveStopExplanation({
  response = {},
  questionQueueSummary = {}
} = {}) {
  if (response?.followUpRequired) {
    return questionQueueSummary.activeItemCount > 0
      ? '当前轮次仍存在高价值问题可问，停止条件尚未成立。'
      : '当前轮次仍需 follow-up，但高价值问题队列为空，需要保守阻断输出。'
  }

  const summaryText =
    normalizeText(response?.finalResult?.summary) ||
    normalizeText(response?.topProblem?.summary) ||
    normalizeText(response?.explanation?.whatToCheckNext)

  if (summaryText) {
    return summaryText
  }

  return '当前轮次已完成停止判定。'
}

function evaluateStopState({ response = {}, questionQueue = null } = {}) {
  const sessionId = normalizeText(response?.diagnosisSessionId)
  const roundId = normalizeText(response?.roundId, 'round_1')
  const questionQueueSummary = summarizeQuestionQueue(questionQueue || {})
  const followUpRequired = Boolean(response?.followUpRequired)
  const hasActiveQueueItems = questionQueueSummary.activeItemCount > 0
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
    !followUpRequired &&
    !hasActiveQueueItems &&
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
      followUpRequired: followUpRequired || hasActiveQueueItems,
      outcomeType,
      stopReason,
      decisionCauseKey
    }),
    outcomeLocked,
    uncertainLegalityReason,
    stopReason: normalizeText(
      stopReason,
      followUpRequired || hasActiveQueueItems ? 'pending_follow_up' : ''
    ),
    stopReasonDetail: decisionCauseKey,
    stopReasonText: resolveStopExplanation({ response, questionQueueSummary }),
    decisionCauseKey,
    decisionCauseCategory: normalizeText(decisionCause?.decisionCauseCategory),
    decisionCauseText: normalizeText(decisionCause?.decisionCauseText),
    decisionCauseDetails:
      decisionCause?.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
        ? decisionCause.decisionCauseDetails
        : null,
    finalOutputRef,
    allowMoreQuestions: followUpRequired || hasActiveQueueItems ? 1 : 0
  }
}

module.exports = {
  evaluateStopState
}
