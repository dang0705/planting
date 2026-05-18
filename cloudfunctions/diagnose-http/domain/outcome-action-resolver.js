'use strict'

const { buildCareGuidance } = require('../utils/care-baseline-guidance')
const {
  normalizeRouteDecisionCause,
  isAuthoritativeRouteDecision
} = require('../utils/outcome-route-contract')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeKey(value = '') {
  return normalizeText(value)
}

function uniqKeys(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(item => normalizeKey(item)).filter(Boolean))
  )
}

function buildActionProfileMap(actionProfiles = []) {
  const map = new Map()
  for (const profile of Array.isArray(actionProfiles) ? actionProfiles : []) {
    const key = normalizeKey(profile?.actionProfileKey || '')
    if (key) {
      map.set(key, profile)
    }
  }
  return map
}

function buildActionAdviceItems(actionProfile = null) {
  if (!actionProfile || typeof actionProfile !== 'object') {return []}
  return uniqKeys([
    ...(Array.isArray(actionProfile.todayActions) ? actionProfile.todayActions : []),
    ...(Array.isArray(actionProfile.threeDayActions) ? actionProfile.threeDayActions : []),
    ...(Array.isArray(actionProfile.sevenDayObserve) ? actionProfile.sevenDayObserve : [])
  ])
}

function buildAvoidAdviceItems(actionProfile = null) {
  if (!actionProfile || typeof actionProfile !== 'object') {return []}
  return uniqKeys([
    ...(Array.isArray(actionProfile.avoidActions) ? actionProfile.avoidActions : []),
    ...(Array.isArray(actionProfile.retakeOrEscalate) ? actionProfile.retakeOrEscalate : [])
  ])
}

function mapSeverity(problem = null) {
  return (problem?.severityHintCn || '中').includes('高') ? 'high' : 'medium'
}

function mapUrgency(problem = null) {
  return (problem?.urgencyHintCn || '中').includes('高') ? 'high' : 'medium'
}

function buildOutcomeSummary(routeOutcome = null, problem = null, explanation = null) {
  return normalizeText(
    explanation?.resultSummaryCn ||
      explanation?.whyItHappensCn ||
      routeOutcome?.userDefinitionCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      ''
  )
}

function resolveDisplayName(routeOutcome, problem, explanation, fallbackOutcomeKey = '') {
  return normalizeText(
    routeOutcome?.displayNameCn ||
      routeOutcome?.outcomeNameCn ||
      problem?.displayNameCn ||
      problem?.problemCn ||
      explanation?.displayNameCn ||
      '',
    ''
  ) || normalizeText(fallbackOutcomeKey)
}

function resolveOutcomeSummary(routeOutcome, problem, explanation) {
  return buildOutcomeSummary(routeOutcome, problem, explanation)
}

function buildRouteSafeSummary(primaryOutcome = null) {
  const displayNameCn = normalizeText(primaryOutcome?.displayNameCn || '')
  if (!displayNameCn) {
    return '当前路径已收敛到单一方向，建议按该方向处理并持续观察变化。'
  }
  return `当前路径已收敛到“${displayNameCn}”方向，建议按该路径处理并持续观察变化。`
}

function buildOutcomeEntry({
  outcomeKey = '',
  routeOutcome = null,
  problem = null,
  explanation = null,
  actionProfile = null
} = {}) {
  const normalizedOutcomeKey = normalizeKey(outcomeKey)
  if (!normalizedOutcomeKey) {
    return null
  }

  const fallbackDisplayName = resolveDisplayName(
    routeOutcome,
    problem,
    explanation,
    normalizedOutcomeKey
  )

  const actionAdviceItems = buildActionAdviceItems(actionProfile)
  const avoidAdviceItems = buildAvoidAdviceItems(actionProfile)

  return {
    outcomeKey: normalizedOutcomeKey,
    problemKey: normalizedOutcomeKey,
    actionProfileKey: normalizeText(routeOutcome?.actionProfileKey || actionProfile?.actionProfileKey || ''),
    outcomeType: normalizeText(routeOutcome?.outcomeType || ''),
    outcomeCategory: normalizeText(routeOutcome?.outcomeCategory || ''),
    displayNameCn: normalizeText(fallbackDisplayName),
    summary: resolveOutcomeSummary(routeOutcome, problem, explanation),
    severity: mapSeverity(problem || routeOutcome),
    urgency: mapUrgency(problem || routeOutcome),
    firstAid: normalizeText(
      explanation?.firstAidCn || problem?.userActionCn || problem?.defaultAction || ''
    ),
    avoid: normalizeText(
      explanation?.avoidCn || problem?.userPreventionCn || problem?.defaultPrevention || ''
    ),
    actionAdviceItems,
    avoidAdviceItems,
    reassurance: normalizeText(explanation?.reassuranceCn || '')
  }
}

function buildActionAdviceFallback({
  actionProfiles = [],
  careGuidance = {},
  primaryOutcome = null
} = {}) {
  const hasProfileAdvice = Array.isArray(actionProfiles) && actionProfiles.some(profile => {
    return (
      (Array.isArray(profile?.todayActions) && profile.todayActions.length) ||
      (Array.isArray(profile?.threeDayActions) && profile.threeDayActions.length) ||
      (Array.isArray(profile?.sevenDayObserve) && profile.sevenDayObserve.length) ||
      (Array.isArray(profile?.avoidActions) && profile.avoidActions.length) ||
      (Array.isArray(profile?.retakeOrEscalate) && profile.retakeOrEscalate.length)
    )
  })
  const hasCareGuidance =
    Array.isArray(careGuidance?.nextSteps) && careGuidance.nextSteps.length

  if (hasProfileAdvice || hasCareGuidance) {
    return null
  }

  const firstAid = normalizeText(primaryOutcome?.firstAid || '')
  const avoid = normalizeText(primaryOutcome?.avoid || '')

  return {
    todayActions: uniqKeys(firstAid ? [firstAid] : ['先保持当前浇水和光照节奏，避免同时调整多项参数。']),
    threeDayActions: ['观察 3-7 天症状变化，确认是新叶/老叶扩展规律。'],
    sevenDayObserve: ['保留近期叶片新旧对比照片，便于下一轮确认。'],
    avoidActions: uniqKeys(avoid ? [avoid] : ['避免大幅改变量，尤其避免一次性重施肥或大范围停浇。']),
    retakeOrEscalate: ['建议补拍新老叶重点部位并继续问诊后再收敛。'],
    conflictDetected: false
  }
}

function resolveOutcomeMode({
  authoritativeRouteDecision = false,
  followUpRequired = false,
  primaryOutcome = null,
  secondaryOutcomes = [],
  visibleOutcomes = []
} = {}) {
  if (followUpRequired) {return 'follow_up_required'}
  if (!authoritativeRouteDecision) {return 'route_fallback_uncertain'}
  if (!primaryOutcome && visibleOutcomes.length) {return 'uncertain_visible'}
  if (primaryOutcome && secondaryOutcomes.length) {return 'primary_with_secondary'}
  if (primaryOutcome) {return 'primary_only'}
  return 'uncertain_only'
}

function resolveRouteOutcomePayload({
  routeDecision = null,
  problems = [],
  explanations = [],
  routeOutcomes = [],
  actionProfiles = [],
  plantContext = {},
  observedEvidenceSet = [],
  outcomeType = '',
  followUpRequired = false
} = {}) {
  const problemMap = new Map((Array.isArray(problems) ? problems : []).map(item => [item.problemKey, item]))
  const explanationMap = new Map(
    (Array.isArray(explanations) ? explanations : []).map(item => [item.problemKey, item])
  )
  const routeOutcomeMap = new Map(
    (Array.isArray(routeOutcomes) ? routeOutcomes : []).map(item => [item.outcomeKey, item])
  )
  const authoritativeRouteDecision = isAuthoritativeRouteDecision(routeDecision)
  const routeVisibleOutcomeKeys = authoritativeRouteDecision
    ? uniqKeys(routeDecision?.visibleOutcomeKeys)
    : []
  const primaryOutcomeKey = authoritativeRouteDecision
    ? normalizeKey(routeDecision?.primaryOutcomeKey)
    : ''
  const secondaryOutcomeKeys = authoritativeRouteDecision
    ? uniqKeys(routeDecision?.secondaryOutcomeKeys)
    : []
  const visibleOutcomeKeys = routeVisibleOutcomeKeys
  const primaryKey = primaryOutcomeKey
  const safeActionProfiles = Array.isArray(actionProfiles) ? actionProfiles : []
  const actionProfileMap = buildActionProfileMap(safeActionProfiles)
  const buildOutcomeEntryWithProfile = outcomeKey => {
    const routeOutcome = routeOutcomeMap.get(outcomeKey)
    return buildOutcomeEntry({
      outcomeKey,
      routeOutcome,
      problem: problemMap.get(outcomeKey),
      explanation: explanationMap.get(outcomeKey),
      actionProfile: actionProfileMap.get(normalizeKey(routeOutcome?.actionProfileKey || '')) || null
    })
  }

  const primaryOutcome = buildOutcomeEntryWithProfile(primaryKey)
  const secondaryOutcomes = secondaryOutcomeKeys
    .map(outcomeKey => buildOutcomeEntryWithProfile(outcomeKey))
    .filter(Boolean)
    .slice(0, 2)
  const visibleOutcomes = visibleOutcomeKeys
    .map(outcomeKey => buildOutcomeEntryWithProfile(outcomeKey))
    .filter(Boolean)
    .slice(0, 3)
  const visibleActionConflictGroups = uniqKeys(routeDecision?.visibleActionConflictGroups)
  const hasActionConflict = visibleActionConflictGroups.length > 1
  const careGuidance = buildCareGuidance({
    plantContext,
    observedEvidenceSet,
    primaryProblemKey: primaryOutcome?.problemKey || '',
    outcomeType
  })
  const mergedActionAdvice = hasActionConflict
    ? {
        todayActions: [],
        threeDayActions: [],
        sevenDayObserve: [],
        avoidActions: [
          '当前多个方向的处理建议可能冲突，先不要同时做大幅浇水、施肥或用药调整。'
        ],
        retakeOrEscalate: [
          '先补充关键分流信息，再决定具体处理动作。'
        ],
        conflictDetected: true
      }
    : {
        todayActions: uniqKeys([
          ...safeActionProfiles.flatMap(item => item?.todayActions || []),
          ...(careGuidance.nextSteps || []).map(item => item?.text || '')
        ]),
        threeDayActions: uniqKeys(
          safeActionProfiles.flatMap(item => item?.threeDayActions || [])
        ),
        sevenDayObserve: uniqKeys(
          safeActionProfiles.flatMap(item => item?.sevenDayObserve || [])
        ),
        avoidActions: uniqKeys([
          ...safeActionProfiles.flatMap(item => item?.avoidActions || []),
          ...(careGuidance.whatToAvoid || [])
        ]),
        retakeOrEscalate: uniqKeys(
          safeActionProfiles.flatMap(item => item?.retakeOrEscalate || [])
        ),
        conflictDetected: false
      }

  const actionAdviceFallback = buildActionAdviceFallback({
    actionProfiles: safeActionProfiles,
    careGuidance,
    primaryOutcome
  })

  const actionAdvice = hasActionConflict || !actionAdviceFallback
    ? mergedActionAdvice
    : {
        ...mergedActionAdvice,
        ...actionAdviceFallback
      }

  return {
    authoritativeRouteDecision,
    primaryOutcome,
    secondaryOutcomes,
    visibleOutcomes,
    outcomeMode: resolveOutcomeMode({
      authoritativeRouteDecision,
      followUpRequired,
      primaryOutcome,
      secondaryOutcomes,
      visibleOutcomes
    }),
    routeDecisionCause: normalizeRouteDecisionCause(routeDecision?.decisionCause),
    routeSafeSummary: buildRouteSafeSummary(primaryOutcome),
    careGuidance,
    actionAdvice
  }
}

module.exports = {
  resolveRouteOutcomePayload,
  buildOutcomeEntry,
  buildRouteSafeSummary
}
