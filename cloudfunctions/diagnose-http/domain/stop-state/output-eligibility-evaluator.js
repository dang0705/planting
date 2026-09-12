'use strict'

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
}

function resolveOutputConservatism(response = {}) {
  if (normalizeText(response?.outcomeType) === 'uncertain') {return 'high'}
  if (normalizeText(response?.outcomeType) === 'non_problematic') {return 'guarded'}
  if (response?.highSpecificityFastConvergence?.applied) {return 'guarded'}
  return 'standard'
}

function resolveConclusionStatus(response = {}, stopState = null) {
  if (stopState?.isStopped !== 1) {return 'pending_stop_judgment'}
  if (normalizeText(stopState?.stopReason) === 'route_visible_outcomes_ready') {
    return 'route_visible_outcomes_ready'
  }
  if (normalizeText(stopState?.stopReason) === 'route_uncertain_with_candidates') {
    return 'route_uncertain_with_candidates'
  }

  const outcomeType = normalizeText(response?.outcomeType)
  if (outcomeType === 'problematic') {return 'problematic_ready'}
  if (outcomeType === 'non_problematic') {return 'non_problematic_ready'}
  if (outcomeType === 'uncertain') {return 'uncertain_ready'}
  return 'pending'
}

function resolveUnresolvedRisks(response = {}) {
  const risks = []

  const confidenceReasons = normalizeStringList(response?.confidenceReasons)
  risks.push(...confidenceReasons)

  const whatToCheckNext = normalizeText(
    response?.explanation?.whatToCheckNext || response?.resultExplanation?.whatToCheckNext
  )
  if (whatToCheckNext && normalizeText(response?.outcomeType) === 'uncertain') {
    risks.push(whatToCheckNext)
  }

  return Array.from(new Set(risks)).filter(Boolean)
}

function resolveNextStepHints(response = {}) {
  const hints = []
  for (const item of Array.isArray(response?.nextSteps) ? response.nextSteps : []) {
    const text = normalizeText(item?.text || item)
    if (text) {hints.push(text)}
  }

  const whatToCheckNext = normalizeText(
    response?.explanation?.whatToCheckNext || response?.resultExplanation?.whatToCheckNext
  )
  if (whatToCheckNext) {
    hints.push(whatToCheckNext)
  }

  return Array.from(new Set(hints)).filter(Boolean)
}

function hasPendingQuestions(response = {}) {
  const terminalQuestioningState = response?.terminalQuestioningState
  if (terminalQuestioningState && typeof terminalQuestioningState === 'object') {
    return Number(terminalQuestioningState?.requiresQuestion || 0) === 1
  }
  return Array.isArray(response?.questions) && response.questions.length > 0
}

function evaluateOutputEligibility({ response = {}, stopState = null } = {}) {
  const outcomeType = normalizeText(response?.outcomeType)
  const hasFormalOutcome = ['problematic', 'non_problematic', 'uncertain'].includes(outcomeType)
  const hasFormalStopDecision = Boolean(
    stopState?.outcomeLocked ||
    stopState?.uncertainLegalityReason ||
    normalizeText(response?.stopDecision?.stopReason || response?.stopReason)
  )
  const eligible =
    normalizeText(response?.stage) === 'final' &&
    stopState?.isStopped === 1 &&
    !hasPendingQuestions(response) &&
    hasFormalStopDecision &&
    hasFormalOutcome
      ? 1
      : 0

  return {
    eligible,
    judgment: eligible ? 'eligible' : 'blocked_pending_output',
    conclusionType: outcomeType,
    conclusionStatus: resolveConclusionStatus(response, stopState),
    outputConservatism: resolveOutputConservatism(response),
    decisionCauseKey: normalizeText(
      stopState?.decisionCauseKey || response?.decisionCause?.decisionCauseKey
    ),
    decisionCauseCategory: normalizeText(
      stopState?.decisionCauseCategory || response?.decisionCause?.decisionCauseCategory
    ),
    keyEvidenceSummary: normalizeText(
      response?.finalResult?.summary ||
      response?.topProblem?.summary ||
      response?.explanation?.whyItHappens ||
      response?.resultExplanation?.whyItHappens
    ),
    unresolvedRisks: resolveUnresolvedRisks(response),
    nextStepHints: resolveNextStepHints(response)
  }
}

module.exports = {
  evaluateOutputEligibility
}
