'use strict'

const { toResultId } = require('../mappers/public-id-mapper')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const {
  YELLOW_LEAF_PACKAGE_MODE,
  YELLOWING_PACKAGE_SOURCE_MODE
} = require('../app/question-package-response')
const { OUTCOME_EFFECT_TYPE } = require('../constants/outcome-route')
const { filterYellowingCareEnvironmentCandidateOutcomeKeys } = require('../utils/yellowing-question-policy')

const LIGHT_CONTEXT_QUESTION_KEY = 'q_observed_probe__leaf_yellowing__light_change_context'
const LIGHT_HEALTH_ROUTE_BY_DIRECTION = {
  low: {
    outcomeKey: 'low_light_growth_weakness',
    routeKey: 'yellowing_low_light_route'
  },
  strong: {
    outcomeKey: 'sunburn',
    routeKey: 'yellowing_sunburn_route'
  }
}
const BUILTIN_LIGHT_OUTCOMES = {
  low_light_growth_weakness: {
    outcomeKey: 'low_light_growth_weakness',
    sourceProblemKey: 'low_light_growth_weakness',
    outcomeType: 'problematic',
    outcomeCategory: 'light',
    displayNameCn: '光照不足/生长偏弱',
    userDefinitionCn: '当前更像长期光照不足引起的徒长与偏弱。',
    actionProfileKey: 'action_low_light_basic',
    riskLevel: 'low'
  },
  sunburn: {
    outcomeKey: 'sunburn',
    sourceProblemKey: 'sunburn',
    outcomeType: 'problematic',
    outcomeCategory: 'light',
    displayNameCn: '晒伤/强光刺激',
    userDefinitionCn: '当前更像暴晒或强光刺激后的组织灼伤。',
    actionProfileKey: 'action_sunburn_basic',
    riskLevel: 'medium'
  }
}
const BUILTIN_LIGHT_ACTION_PROFILES = {
  action_low_light_basic: {
    actionProfileKey: 'action_low_light_basic',
    todayActions: ['把植株移到更稳定明亮散射光处'],
    threeDayActions: [],
    sevenDayObserve: ['观察新叶颜色和徒长是否缓解。'],
    avoidActions: ['不要突然暴晒。'],
    retakeOrEscalate: []
  },
  action_sunburn_basic: {
    actionProfileKey: 'action_sunburn_basic',
    todayActions: ['先移离正午直射光', '保持通风稳定'],
    threeDayActions: ['3 天内观察灼伤边界是否继续扩大'],
    sevenDayObserve: ['7 天内观察新叶是否恢复正常'],
    avoidActions: ['不要马上重肥或重药'],
    retakeOrEscalate: ['若灼伤持续扩大，补拍叶面与摆放位置']
  }
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeMode(value = '') {
  return normalizeText(value).toLowerCase()
}

function isYellowLeafQuestionPackage(questionPackage = {}) {
  const mode = normalizeMode(
    questionPackage?.mode || questionPackage?.diagnosisMode || questionPackage?.sourceMode
  )
  return [
    YELLOW_LEAF_PACKAGE_MODE,
    YELLOWING_PACKAGE_SOURCE_MODE,
    'yellowing_mode',
    'leaf_yellowing'
  ].includes(mode)
}

function collectMatchedAnswerEffects(routeAnswerEffects = [], answers = []) {
  const answerPairSet = new Set(
    (Array.isArray(answers) ? answers : [])
      .map(item => `${normalizeText(item?.questionKey)}::${normalizeText(item?.optionKey)}`)
      .filter(item => item !== '::')
  )

  return (Array.isArray(routeAnswerEffects) ? routeAnswerEffects : []).filter(item =>
    answerPairSet.has(`${normalizeText(item?.questionKey)}::${normalizeText(item?.optionKey)}`)
  )
}

function normalizeOutcomeKey(value = '') {
  const normalized = normalizeText(value)
  return normalized === 'low_light' ? 'low_light_growth_weakness' : normalized
}

function hasValidLightHealthEvidence(environmentCareContext = null) {
  const evidence = environmentCareContext?.outputs?.lightHealthEvidence
  const score = Number(environmentCareContext?.outputs?.lightHealthScore)
  return Boolean(evidence && typeof evidence === 'object' && Number.isFinite(score))
}

function buildLightHealthOutcomeEffects(environmentCareContext = null) {
  if (!hasValidLightHealthEvidence(environmentCareContext)) {
    return []
  }
  const evidence = environmentCareContext.outputs.lightHealthEvidence
  const direction = normalizeText(evidence.direction)
  const target = LIGHT_HEALTH_ROUTE_BY_DIRECTION[direction]
  if (!target) {
    return []
  }
  const score = Number(environmentCareContext.outputs.lightHealthScore)
  const severityBoost = score < 40 ? 2.4 : score < 65 ? 2 : 1.55
  return [
    {
      questionKey: 'light_health_evidence',
      optionKey: direction,
      outcomeKey: target.outcomeKey,
      routeKey: target.routeKey,
      effectType: OUTCOME_EFFECT_TYPE.SUPPORT,
      effectStrength: severityBoost,
      evidenceDimension: 'light_health',
      evidence
    }
  ]
}

const HYDRATION_OUTCOME_KEY = 'overwatering_root_pressure'
const HYDRATION_ROUTE_KEY = 'watering_root_pressure_route'

function hasValidHydrationEvidence(environmentCareContext = null) {
  const summary = environmentCareContext?.behaviorSummary10d
  if (!summary || typeof summary !== 'object') {
    return false
  }
  const wetPressureLoad = Number(summary.wetPressureLoad)
  return Number.isFinite(wetPressureLoad)
}

/**
 * 基于 behaviorSummary10d 的湿压指标对 overwatering_root_pressure 注入 SUPPORT/WEAKEN effect。
 * 与 buildLightHealthOutcomeEffects 同构：直接累加 effectStrength 进入 buildOutcomeScoreMap。
 */
function buildHydrationOutcomeEffects(environmentCareContext = null) {
  if (!hasValidHydrationEvidence(environmentCareContext)) {
    return []
  }
  const summary = environmentCareContext.behaviorSummary10d
  const wetPressureLoad = Number(summary.wetPressureLoad ?? 0)
  const thoroughCount = Number(summary.thoroughWateringCount10d ?? 0)
  const lastEffectiveDaysAgo = Number(summary.lastEffectiveRootWateredDaysAgo ?? 0)

  if (wetPressureLoad >= 0.7 && thoroughCount >= 2) {
    return [
      {
        questionKey: 'hydration_evidence',
        optionKey: 'thorough_wet_pressure',
        outcomeKey: HYDRATION_OUTCOME_KEY,
        routeKey: HYDRATION_ROUTE_KEY,
        effectType: OUTCOME_EFFECT_TYPE.SUPPORT,
        effectStrength: 2.0,
        evidenceDimension: 'hydration_pressure',
        evidence: { wetPressureLoad, thoroughWateringCount10d: thoroughCount }
      }
    ]
  }
  if (wetPressureLoad >= 0.5 && thoroughCount >= 1) {
    return [
      {
        questionKey: 'hydration_evidence',
        optionKey: 'moderate_wet_pressure',
        outcomeKey: HYDRATION_OUTCOME_KEY,
        routeKey: HYDRATION_ROUTE_KEY,
        effectType: OUTCOME_EFFECT_TYPE.SUPPORT,
        effectStrength: 1.5,
        evidenceDimension: 'hydration_pressure',
        evidence: { wetPressureLoad, thoroughWateringCount10d: thoroughCount }
      }
    ]
  }
  if (wetPressureLoad <= 0.2 && lastEffectiveDaysAgo >= 7) {
    return [
      {
        questionKey: 'hydration_evidence',
        optionKey: 'dry_low_pressure',
        outcomeKey: HYDRATION_OUTCOME_KEY,
        routeKey: HYDRATION_ROUTE_KEY,
        effectType: OUTCOME_EFFECT_TYPE.WEAKEN,
        effectStrength: 0.5,
        evidenceDimension: 'hydration_pressure',
        evidence: { wetPressureLoad, lastEffectiveRootWateredDaysAgo: lastEffectiveDaysAgo }
      }
    ]
  }
  return []
}

function shouldUseAnswerEffect(effect = {}, hasLightHealthEvidence = false) {
  if (!hasLightHealthEvidence) {
    return true
  }
  const questionKey = normalizeText(effect?.questionKey || effect?.question_key || '')
  return questionKey !== LIGHT_CONTEXT_QUESTION_KEY
}

function buildOutcomeScoreMap(matchedEffects = []) {
  const scoreMap = new Map()

  for (const effect of Array.isArray(matchedEffects) ? matchedEffects : []) {
    const effectType = normalizeMode(effect?.effectType || effect?.effect_type || '')
    const redirectedOutcomeKey = normalizeText(
      effect?.redirectOutcomeKey || effect?.redirect_outcome_key || ''
    )
    const baseOutcomeKey = normalizeOutcomeKey(effect?.outcomeKey || effect?.outcome_key || '')
    const outcomeKey =
      effectType === OUTCOME_EFFECT_TYPE.REDIRECT && redirectedOutcomeKey
        ? normalizeOutcomeKey(redirectedOutcomeKey)
        : baseOutcomeKey
    if (!outcomeKey) {
      continue
    }

    const current = scoreMap.get(outcomeKey) || {
      outcomeKey,
      score: 0,
      excluded: false,
      routeKeys: new Set()
    }
    const effectStrength = Number(effect?.effectStrength || effect?.effect_strength || 0) || 0

    if (effectType === OUTCOME_EFFECT_TYPE.EXCLUDE) {
      current.excluded = true
    } else if (effectType === OUTCOME_EFFECT_TYPE.WEAKEN) {
      current.score -= effectStrength > 0 ? effectStrength : 0.1
    } else if (
      effectType === OUTCOME_EFFECT_TYPE.SUPPORT ||
      effectType === OUTCOME_EFFECT_TYPE.REDIRECT
    ) {
      current.score += effectStrength > 0 ? effectStrength : 1
    }

    const routeKey = normalizeText(effect?.routeKey || effect?.route_key || '')
    if (routeKey) {
      current.routeKeys.add(routeKey)
    }
    scoreMap.set(outcomeKey, current)
  }

  return Array.from(scoreMap.values())
    .filter(item => !item.excluded && item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.outcomeKey.localeCompare(right.outcomeKey)
    )
}

function mergeBuiltinLightOutcomes(outcomeKeys = [], diagnosisOutcomes = []) {
  const result = new Map(
    (Array.isArray(diagnosisOutcomes) ? diagnosisOutcomes : [])
      .map(item => [normalizeText(item?.outcomeKey), item])
      .filter(([key]) => key)
  )
  for (const outcomeKey of Array.isArray(outcomeKeys) ? outcomeKeys : []) {
    const normalizedOutcomeKey = normalizeOutcomeKey(outcomeKey)
    if (!result.has(normalizedOutcomeKey) && BUILTIN_LIGHT_OUTCOMES[normalizedOutcomeKey]) {
      result.set(normalizedOutcomeKey, BUILTIN_LIGHT_OUTCOMES[normalizedOutcomeKey])
    }
  }
  return Array.from(result.values())
}

function mergeBuiltinLightActionProfiles(actionProfileKeys = [], actionProfiles = []) {
  const result = new Map(
    (Array.isArray(actionProfiles) ? actionProfiles : [])
      .map(item => [normalizeText(item?.actionProfileKey), item])
      .filter(([key]) => key)
  )
  for (const actionProfileKey of Array.isArray(actionProfileKeys) ? actionProfileKeys : []) {
    const normalizedActionProfileKey = normalizeText(actionProfileKey)
    if (
      !result.has(normalizedActionProfileKey) &&
      BUILTIN_LIGHT_ACTION_PROFILES[normalizedActionProfileKey]
    ) {
      result.set(
        normalizedActionProfileKey,
        BUILTIN_LIGHT_ACTION_PROFILES[normalizedActionProfileKey]
      )
    }
  }
  return Array.from(result.values())
}

function buildVisibleOutcome(outcome = {}, actionProfile = null) {
  return {
    outcomeKey: normalizeText(outcome?.outcomeKey),
    problemKey: normalizeText(outcome?.sourceProblemKey || outcome?.outcomeKey),
    outcomeType: normalizeText(outcome?.outcomeType || 'problematic') || 'problematic',
    outcomeCategory: normalizeText(outcome?.outcomeCategory || 'yellow_leaf_route'),
    displayNameCn: normalizeText(
      outcome?.displayNameCn || outcome?.outcomeNameCn || outcome?.outcomeKey
    ),
    summary: normalizeText(outcome?.userDefinitionCn),
    severity: normalizeText(outcome?.riskLevel || 'medium'),
    urgency: '',
    actionAdviceItems: Array.isArray(actionProfile?.todayActions) ? actionProfile.todayActions : [],
    avoidAdviceItems: Array.isArray(actionProfile?.avoidActions) ? actionProfile.avoidActions : []
  }
}

async function resolveYellowLeafOutcomeResult({
  sessionId = '',
  round = 1,
  answers = [],
  questionPackage = null,
  plantContext = {},
  careBehaviorTimeline = null,
  environmentCareContext = null,
  routeAnswerEffects = []
} = {}) {
  if (!isYellowLeafQuestionPackage(questionPackage)) {
    return null
  }

  const hasLightHealthEvidence = hasValidLightHealthEvidence(environmentCareContext)
  const matchedEffects = [
    ...buildLightHealthOutcomeEffects(environmentCareContext),
    ...buildHydrationOutcomeEffects(environmentCareContext),
    ...collectMatchedAnswerEffects(routeAnswerEffects, answers).filter(effect =>
      shouldUseAnswerEffect(effect, hasLightHealthEvidence)
    )
  ]
  const rawRankedOutcomeScores = buildOutcomeScoreMap(matchedEffects)
  const allowedOutcomeKeySet = new Set(
    filterYellowingCareEnvironmentCandidateOutcomeKeys(
      rawRankedOutcomeScores.map(item => item.outcomeKey)
    )
  )
  const rankedOutcomeScores = rawRankedOutcomeScores.filter(item =>
    allowedOutcomeKeySet.has(item.outcomeKey)
  )
  const matchedOutcomeKeys = rankedOutcomeScores.map(item => item.outcomeKey)
  const repositoryDiagnosisOutcomes = matchedOutcomeKeys.length
    ? await outcomeRouteRepository.getDiagnosisOutcomesByKeys(matchedOutcomeKeys)
    : []
  const diagnosisOutcomes = mergeBuiltinLightOutcomes(
    matchedOutcomeKeys,
    repositoryDiagnosisOutcomes
  )
  const actionProfileKeys = Array.from(
    new Set(diagnosisOutcomes.map(item => normalizeText(item?.actionProfileKey)).filter(Boolean))
  )
  const repositoryActionProfiles = actionProfileKeys.length
    ? await outcomeRouteRepository.getOutcomeActionProfiles(actionProfileKeys)
    : []
  const actionProfiles = mergeBuiltinLightActionProfiles(
    actionProfileKeys,
    repositoryActionProfiles
  )
  const actionProfileMap = new Map(
    actionProfiles.map(item => [normalizeText(item?.actionProfileKey), item])
  )
  const diagnosisOutcomeMap = new Map(
    diagnosisOutcomes.map(item => [normalizeText(item?.outcomeKey), item])
  )

  const visibleOutcomes = rankedOutcomeScores
    .map(item =>
      buildVisibleOutcome(
        diagnosisOutcomeMap.get(item.outcomeKey),
        actionProfileMap.get(
          normalizeText(diagnosisOutcomeMap.get(item.outcomeKey)?.actionProfileKey)
        )
      )
    )
    .filter(item => item.outcomeKey)

  const primaryOutcome = visibleOutcomes[0] || null
  const todayActions = Array.from(
    new Set(visibleOutcomes.flatMap(item => item.actionAdviceItems || []))
  )
  const avoidActions = Array.from(
    new Set(visibleOutcomes.flatMap(item => item.avoidAdviceItems || []))
  )
  const hasVisibleOutcomes = visibleOutcomes.length > 0
  const outcomeType = hasVisibleOutcomes ? 'problematic' : 'uncertain'
  const summaryText = hasVisibleOutcomes
    ? `已根据黄叶题包答案收敛到 ${visibleOutcomes.length} 个处理方向。`
    : '当前题包答案尚未形成可直接闭合的黄叶处理方向。'

  return {
    diagnosisSessionId: sessionId,
    resultId: toResultId(sessionId || 'yellow_leaf', round || 1),
    roundId: `round_${Number(round || 1)}`,
    roundIndex: Number(round || 1),
    currentRoundIndex: Number(round || 1),
    currentRoundId: `round_${Number(round || 1)}`,
    stage: 'final',
    status: 'closed',
    sessionStatus: 'closed',
    routePrimaryAction: 'finalize',
    stopReason: hasVisibleOutcomes
      ? 'yellow_leaf_route_package_completed'
      : 'yellow_leaf_route_package_uncertain',
    outcomeType,
    outcomeMode: hasVisibleOutcomes ? 'visible_outcomes' : 'uncertain',
    plantId: plantContext?.userPlantId || plantContext?.plantId || '',
    plantIdentityId: plantContext?.plantIdentityId || '',
    identityResolutionStatus: plantContext?.identityResolutionStatus || '',
    questions: [],
    finalResult: {
      resultId: toResultId(sessionId || 'yellow_leaf', round || 1),
      problemKey: normalizeText(primaryOutcome?.problemKey || 'yellow_leaf_action_list'),
      displayName: normalizeText(primaryOutcome?.displayNameCn || '黄叶处理建议'),
      problemName: normalizeText(primaryOutcome?.displayNameCn || '黄叶处理建议'),
      summary: normalizeText(primaryOutcome?.summary || summaryText),
      outcomeType,
      visibleOutcomes,
      outcomeMode: hasVisibleOutcomes ? 'visible_outcomes' : 'uncertain',
      actionAdvice: {
        todayActions,
        threeDayActions: [],
        sevenDayObserve: hasVisibleOutcomes ? ['连续观察 3-5 天，记录黄叶是否继续扩大。'] : [],
        avoidActions,
        retakeOrEscalate: [],
        conflictDetected: false
      }
    },
    summaryCard: {
      title: normalizeText(primaryOutcome?.displayNameCn || '黄叶处理建议'),
      subtitle: normalizeText(primaryOutcome?.summary || summaryText),
      severity: normalizeText(primaryOutcome?.severity || 'normal'),
      statusText: hasVisibleOutcomes ? '已完成问诊' : '仍需补充判断'
    },
    actionAdvice: {
      todayActions,
      threeDayActions: [],
      sevenDayObserve: hasVisibleOutcomes ? ['连续观察 3-5 天，记录黄叶是否继续扩大。'] : [],
      avoidActions,
      retakeOrEscalate: [],
      conflictDetected: false
    },
    visibleOutcomes,
    blockedActionExplanations: [],
    highRiskWarning: '',
    observationPeriod: hasVisibleOutcomes ? '建议连续观察 3-5 天。' : '',
    routeDecisionCause: {
      decisionCauseKey: hasVisibleOutcomes
        ? 'yellow_leaf_route_package_completed'
        : 'yellow_leaf_route_package_uncertain',
      decisionCauseText: hasVisibleOutcomes
        ? hasLightHealthEvidence
          ? '黄叶固定题包已完成，按光照健康度 evidence 与 route answer effects 收敛 outcome。'
          : '黄叶固定题包已完成，按 route answer effects 直接收敛 outcome。'
        : '黄叶固定题包已完成，但 route answer effects 未形成可展示 outcome。'
    },
    questionPackage: {
      ...questionPackage,
      mode: YELLOW_LEAF_PACKAGE_MODE
    },
    careBehaviorTimeline,
    environmentCareContext,
    plantContext
  }
}

module.exports = {
  resolveYellowLeafOutcomeResult,
  _test: {
    isYellowLeafQuestionPackage,
    collectMatchedAnswerEffects,
    buildOutcomeScoreMap,
    buildLightHealthOutcomeEffects,
    hasValidLightHealthEvidence,
    buildHydrationOutcomeEffects,
    hasValidHydrationEvidence,
    mergeBuiltinLightActionProfiles,
    mergeBuiltinLightOutcomes
  }
}
