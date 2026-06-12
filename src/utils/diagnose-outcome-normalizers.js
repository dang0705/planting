import { normalizeOutcomeType, normalizeStringList } from './diagnose-flow-shared.js'

export function normalizeRouteDecisionCause(routeDecisionCause = null) {
  if (!routeDecisionCause || typeof routeDecisionCause !== 'object') {
    return null
  }

  return {
    decisionCauseKey: String(
      routeDecisionCause?.decisionCauseKey || routeDecisionCause?.key || ''
    ).trim(),
    decisionCauseCategory: String(
      routeDecisionCause?.decisionCauseCategory || routeDecisionCause?.category || ''
    ).trim(),
    decisionCauseText: String(
      routeDecisionCause?.decisionCauseText || routeDecisionCause?.text || ''
    ).trim(),
    decisionCauseDetails:
      routeDecisionCause?.decisionCauseDetails &&
      typeof routeDecisionCause.decisionCauseDetails === 'object'
        ? routeDecisionCause.decisionCauseDetails
        : null
  }
}

export function normalizeOutcomeEntry(outcome = null) {
  if (!outcome || typeof outcome !== 'object') {
    return null
  }

  const outcomeKey = String(outcome?.outcomeKey || outcome?.problemKey || '').trim()
  if (!outcomeKey) {
    return null
  }

  return {
    outcomeKey,
    problemKey: String(outcome?.problemKey || outcomeKey).trim(),
    outcomeType: String(outcome?.outcomeType || '').trim(),
    outcomeCategory: String(outcome?.outcomeCategory || '').trim(),
    displayNameCn: String(
      outcome?.displayNameCn || outcome?.displayName || outcome?.title || outcomeKey
    ).trim(),
    summary: String(outcome?.summary || '').trim(),
    severity: String(outcome?.severity || '').trim(),
    urgency: String(outcome?.urgency || '').trim(),
    firstAid: String(outcome?.firstAid || '').trim(),
    avoid: String(outcome?.avoid || '').trim(),
    actionAdviceItems: normalizeStringList(outcome?.actionAdviceItems),
    avoidAdviceItems: normalizeStringList(outcome?.avoidAdviceItems),
    reassurance: String(outcome?.reassurance || '').trim()
  }
}

export function normalizeOutcomeList(outcomes = []) {
  return (Array.isArray(outcomes) ? outcomes : []).map(normalizeOutcomeEntry).filter(Boolean)
}

export function normalizeActionAdvice(actionAdvice = null) {
  if (!actionAdvice || typeof actionAdvice !== 'object') {
    return null
  }

  return {
    todayActions: normalizeStringList(actionAdvice?.todayActions),
    threeDayActions: normalizeStringList(actionAdvice?.threeDayActions),
    sevenDayObserve: normalizeStringList(actionAdvice?.sevenDayObserve),
    avoidActions: normalizeStringList(actionAdvice?.avoidActions),
    retakeOrEscalate: normalizeStringList(actionAdvice?.retakeOrEscalate),
    conflictDetected: Boolean(actionAdvice?.conflictDetected)
  }
}

export function normalizeRouteDecision(routeDecision = null) {
  if (!routeDecision || typeof routeDecision !== 'object') {
    return null
  }

  return {
    mode: String(routeDecision?.mode || '').trim(),
    visibleOutcomeKeys: normalizeStringList(routeDecision?.visibleOutcomeKeys),
    activeRouteGroupKeys: normalizeStringList(routeDecision?.activeRouteGroupKeys),
    decisionCause: normalizeRouteDecisionCause(routeDecision?.decisionCause)
  }
}

function resolveOutcomeIdentityKey(outcome = null, index = 0) {
  if (!outcome || typeof outcome !== 'object') {
    return `outcome_${index}`
  }
  return String(
    outcome.outcomeKey ||
      outcome.problemKey ||
      outcome.problemId ||
      `outcome_${index}`
  ).trim()
}

function isUncertainOutcome(outcome = null) {
  if (!outcome || typeof outcome !== 'object') {
    return false
  }
  const outcomeKey = String(outcome.outcomeKey || outcome.problemKey || '').trim()
  const outcomeType = String(outcome.outcomeType || '').trim()
  return outcomeType === 'uncertain' || outcomeKey === 'uncertain_observation'
}

function suppressUncertainWhenConcreteOutcomeExists(outcomes = []) {
  const safeOutcomes = (Array.isArray(outcomes) ? outcomes : []).filter(Boolean)
  const hasConcreteOutcome = safeOutcomes.some(outcome => !isUncertainOutcome(outcome))
  return hasConcreteOutcome
    ? safeOutcomes.filter(outcome => !isUncertainOutcome(outcome))
    : safeOutcomes
}

export function synthesizeVisibleOutcomes({
  visibleOutcomes = [],
  sessionPrimaryOutcome = null,
  sessionSecondaryOutcomes = []
} = {}) {
  const merged = []
  const seen = new Set()
  for (const outcome of [
    ...normalizeOutcomeList(visibleOutcomes),
    ...[normalizeOutcomeEntry(sessionPrimaryOutcome)].filter(Boolean),
    ...normalizeOutcomeList(sessionSecondaryOutcomes)
  ]) {
    const identityKey = resolveOutcomeIdentityKey(outcome, merged.length)
    if (seen.has(identityKey)) {continue}
    seen.add(identityKey)
    merged.push(outcome)
  }
  return suppressUncertainWhenConcreteOutcomeExists(merged)
}

export function normalizeOutcomeModeText(value = '', visibleOutcomes = []) {
  const normalized = String(value || '').trim()
  if (['primary_with_secondary', 'primary_only'].includes(normalized)) {
    return Array.isArray(visibleOutcomes) && visibleOutcomes.length ? 'visible_outcomes' : ''
  }
  return normalized
}

export function resolveScientificName(diagnosis = {}) {
  return (
    diagnosis?.scientificName ||
    diagnosis?.plantScientificName ||
    diagnosis?.plantProfile?.scientificName ||
    ''
  )
}

export function resolveMainIssueText({
  finalResult = null,
  summaryCard = null,
  outcomeType = '',
  hasActiveQuestions = false
} = {}) {
  if (finalResult?.displayNameCn) {
    return finalResult.displayNameCn
  }

  if (finalResult?.displayName) {
    return finalResult.displayName
  }

  if (summaryCard?.title) {
    return summaryCard.title
  }

  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)
  if (hasActiveQuestions) {return '待进一步确认'}
  if (normalizedOutcomeType === 'non_problematic') {return '暂未见明显问题'}
  if (normalizedOutcomeType === 'uncertain') {return '暂不能稳定判断'}
  return '待进一步确认'
}

export function resolveSummaryText({
  finalResult = null,
  summaryCard = null,
  explanation = {},
  outcomeType = ''
} = {}) {
  if (finalResult?.summary) {
    return finalResult.summary
  }

  if (summaryCard?.subtitle) {
    return summaryCard.subtitle
  }

  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)
  if (normalizedOutcomeType === 'uncertain') {
    return (
      explanation?.whatToCheckNext ||
      explanation?.whyItHappens ||
      '当前证据还不够稳定，建议继续补充观察信息。'
    )
  }

  if (normalizedOutcomeType === 'non_problematic') {
    return (
      explanation?.reassurance ||
      explanation?.whyItHappens ||
      '当前暂未看到明确问题信号。'
    )
  }

  return explanation?.whyItHappens || ''
}

export function normalizeDiagnosisAdviceSteps(diagnosis = {}, explanation = {}) {
  const directSteps = Array.isArray(diagnosis.nextSteps) ? diagnosis.nextSteps : []
  const actionAdvice = diagnosis.actionAdvice || diagnosis.finalResult?.actionAdvice || {}
  const actionStepTexts = normalizeStringList([
    ...(Array.isArray(actionAdvice?.todayActions) ? actionAdvice.todayActions : []),
    ...(Array.isArray(actionAdvice?.threeDayActions) ? actionAdvice.threeDayActions : []),
    ...(Array.isArray(actionAdvice?.sevenDayObserve) ? actionAdvice.sevenDayObserve : [])
  ])
  const texts = normalizeStringList([
    ...actionStepTexts,
    ...directSteps.map(item =>
      typeof item === 'string'
        ? item
        : item?.text || item?.title || item?.label || ''
    ),
    diagnosis.treatmentText,
    diagnosis.treatment,
    explanation?.firstAid
  ])

  return texts.map((text, index) => ({
    stepId: directSteps[index]?.stepId || `advice_${index + 1}`,
    text,
    type: directSteps[index]?.type || ''
  }))
}

export function normalizeDiagnosisAvoidAdvice(diagnosis = {}, explanation = {}) {
  const actionAdvice = diagnosis.actionAdvice || diagnosis.finalResult?.actionAdvice || {}
  const actionAvoidTexts = normalizeStringList([
    ...(Array.isArray(actionAdvice?.avoidActions) ? actionAdvice.avoidActions : []),
    ...(actionAdvice?.conflictDetected && Array.isArray(actionAdvice?.retakeOrEscalate)
      ? actionAdvice.retakeOrEscalate
      : [])
  ])
  return normalizeStringList([
    ...actionAvoidTexts,
    ...(Array.isArray(diagnosis.whatToAvoid)
      ? diagnosis.whatToAvoid.map(item =>
          typeof item === 'string'
            ? item
            : item?.text || item?.title || item?.label || ''
        )
      : []),
    diagnosis.preventionText,
    diagnosis.prevention,
    explanation?.avoid
  ])
}
