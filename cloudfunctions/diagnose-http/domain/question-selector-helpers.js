'use strict'

const {
  routeSelection: questionSelectionConfig,
  questionSelection
} = require('../constants/scoring')
const {
  QUESTION_PACKAGE_TOPICS,
  normalizeQuestionPackageTopic
} = require('../utils/question-package-topic')
const {
  OBSERVED_SYMPTOM_BRIDGE_TARGETS
} = require('../utils/question-symptom-bridge')
const {
  buildObservedEvidenceCoverageIndex,
  buildVisualCandidateCoverageIndex,
  computeObservedFactCoverageBoost,
  shouldBlockCoveredDimensionQuestion,
  shouldBlockDirectionManagedVisualPresenceQuestion,
  shouldBlockReturnToVisualPresenceQuestion
} = require('./question-selector-coverage')

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function buildObservedMetaSets(observedSymptomMap = new Map()) {
  const locationKeys = new Set()
  const patternKeys = new Set()
  const distributionKeys = new Set()

  for (const item of observedSymptomMap.values()) {
    if (item?.locationKey) {locationKeys.add(String(item.locationKey || '').trim())}
    if (item?.patternKey) {patternKeys.add(String(item.patternKey || '').trim())}
    if (item?.distributionKey) {distributionKeys.add(String(item.distributionKey || '').trim())}
  }

  return {
    locationKeys,
    patternKeys,
    distributionKeys
  }
}

const ROUTE_HINT_PRIORITY_KEYWORDS = [
  '环境',
  '暴晒',
  '光照',
  '浇水',
  '通风',
  '湿度',
  '分布',
  '老叶',
  '新叶',
  '叶背',
  '根部',
  '根颈',
  '茎',
  '盆土'
]

const OBSERVED_CONTEXT_DIMENSION_PRIORITY_BY_SYMPTOM = {
  leaf_yellowing: [
    QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
    QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE,
    QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT,
    QUESTION_PACKAGE_TOPICS.FERTILIZATION_CONTEXT,
    QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
    QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE,
    QUESTION_PACKAGE_TOPICS.PROGRESSION
  ]
}

function collectRouteHintKeywords({ visualRouteHints = [], suggestedFollowupCapture = [] } = {}) {
  const combinedText = [
    ...(Array.isArray(visualRouteHints) ? visualRouteHints : []).flatMap(item => [
      String(item?.type || '').trim(),
      String(item?.reason || '').trim()
    ]),
    ...(Array.isArray(suggestedFollowupCapture) ? suggestedFollowupCapture : []).map(item =>
      String(item || '').trim()
    )
  ]
    .filter(Boolean)
    .join(' ')

  return ROUTE_HINT_PRIORITY_KEYWORDS.filter(keyword => combinedText.includes(keyword))
}

function isSameMorphologyFamily(
  baseSymptomKey = '',
  candidateSymptomKey = '',
  symptomMetaMap = new Map()
) {
  const normalizedBaseSymptomKey = normalizeText(baseSymptomKey || '', '')
  const normalizedCandidateSymptomKey = normalizeText(candidateSymptomKey || '', '')

  if (!normalizedBaseSymptomKey || !normalizedCandidateSymptomKey) {
    return false
  }

  const baseMeta = symptomMetaMap.get(normalizedBaseSymptomKey) || {}
  const candidateMeta = symptomMetaMap.get(normalizedCandidateSymptomKey) || {}
  const baseLocationKey = normalizeText(baseMeta?.locationKey || '', '')
  const candidateLocationKey = normalizeText(candidateMeta?.locationKey || '', '')
  const basePatternKey = normalizeText(baseMeta?.patternKey || '', '')
  const candidatePatternKey = normalizeText(candidateMeta?.patternKey || '', '')
  const baseDistributionKey = normalizeText(baseMeta?.distributionKey || '', '')
  const candidateDistributionKey = normalizeText(candidateMeta?.distributionKey || '', '')

  if (!baseLocationKey || !candidateLocationKey || baseLocationKey !== candidateLocationKey) {
    return false
  }
  if (!basePatternKey || !candidatePatternKey || basePatternKey !== candidatePatternKey) {
    return false
  }

  if (!baseDistributionKey || !candidateDistributionKey) {
    return true
  }

  return baseDistributionKey === candidateDistributionKey
}

function getObservedBridgeTargetSymptomBoost(
  targetSymptomKey = '',
  observedSymptomMap = new Map(),
  symptomMetaMap = new Map()
) {
  const normalizedTargetSymptomKey = normalizeText(targetSymptomKey || '', '')
  if (!normalizedTargetSymptomKey || !observedSymptomMap.size) {
    return 0
  }

  for (const observedSymptomKey of observedSymptomMap.keys()) {
    const bridgeTargets = OBSERVED_SYMPTOM_BRIDGE_TARGETS[observedSymptomKey] || []
    if (bridgeTargets.includes(normalizedTargetSymptomKey)) {
      return 52
    }

    if (
      bridgeTargets.length &&
      isSameMorphologyFamily(
        observedSymptomKey,
        normalizedTargetSymptomKey,
        symptomMetaMap
      )
    ) {
      return 18
    }
  }

  return 0
}

function computeRouteHintQuestionBoost(
  question = {},
  { visualRoutePrimaryAction = '', routeHintKeywords = [] } = {}
) {
  let boost = 0

  if (String(visualRoutePrimaryAction || '').trim() === 'ask_first') {
    boost += 5
  }

  const haystack = [
    question?.questionTextUserCn,
    question?.questionTextCn,
    question?.helpTextCn,
    question?.whyThisQuestionCn
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(' ')

  if (!haystack) {return boost}

  for (const keyword of routeHintKeywords) {
    if (haystack.includes(keyword)) {
      boost += 20
    }
  }

  return boost
}

function computeObservedContextDimensionBoost(
  question = {},
  {
    observedSymptomMap = new Map()
  } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey || !observedSymptomMap.size) {
    return 0
  }

  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )
  let bestBoost = 0

  for (const observedSymptomKey of observedSymptomMap.keys()) {
    const preferredTopics =
      OBSERVED_CONTEXT_DIMENSION_PRIORITY_BY_SYMPTOM[observedSymptomKey] || []
    if (!preferredTopics.length) {continue}

    const bridgeTargets = OBSERVED_SYMPTOM_BRIDGE_TARGETS[observedSymptomKey] || []
    if (
      observedSymptomKey !== targetSymptomKey &&
      !bridgeTargets.includes(targetSymptomKey)
    ) {
      continue
    }

    const dimensionIndex = preferredTopics.indexOf(packageTopic)
    if (dimensionIndex < 0) {continue}

    const bridgeHostBonus =
      observedSymptomKey !== targetSymptomKey &&
      packageTopic === QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION
        ? 22
        : 0

    bestBoost = Math.max(
      bestBoost,
      Math.max(0, 28 - dimensionIndex * 4) + bridgeHostBonus
    )
  }

  return bestBoost
}

function computeQuestionTargetRelevance(question = {}, { observedSymptomMap = new Map(), symptomMetaMap = new Map() } = {}) {
  if (!observedSymptomMap.size) {return 0}

  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) {return 0}

  if (observedSymptomMap.has(targetSymptomKey)) {
    return 120
  }

  const targetSymptomMeta = symptomMetaMap.get(targetSymptomKey) || {}
  const targetLocationKey = normalizeText(targetSymptomMeta?.locationKey || '', '')
  const targetPatternKey = normalizeText(targetSymptomMeta?.patternKey || '', '')
  const targetDistributionKey = normalizeText(targetSymptomMeta?.distributionKey || '', '')
  const observedMetaSets = buildObservedMetaSets(observedSymptomMap)

  const hasLocationMatch =
    targetLocationKey && observedMetaSets.locationKeys.has(targetLocationKey)
  const hasPatternMatch =
    targetPatternKey && observedMetaSets.patternKeys.has(targetPatternKey)
  const hasDistributionMatch =
    targetDistributionKey && observedMetaSets.distributionKeys.has(targetDistributionKey)

  let score = 0
  if (hasLocationMatch) {score += 10}
  if (hasPatternMatch) {score += 24}
  if (hasDistributionMatch) {score += 6}

  if (targetLocationKey && observedMetaSets.locationKeys.size && !hasLocationMatch) {
    score -= 18
  }
  if (targetPatternKey && observedMetaSets.patternKeys.size && !hasPatternMatch) {
    score -= 40
  }
  if (
    targetDistributionKey &&
    observedMetaSets.distributionKeys.size &&
    !hasDistributionMatch
  ) {
    score -= 6
  }

  if (!hasLocationMatch && !hasPatternMatch && !hasDistributionMatch) {
    score -= 20
  }

  score += getObservedBridgeTargetSymptomBoost(
    targetSymptomKey,
    observedSymptomMap,
    symptomMetaMap
  )

  return score
}

function shouldAllowSecondaryObservedSymptomProbe(
  symptomKey = '',
  {
    observedSymptomMap = new Map(),
    previouslyProbedNonVisualSymptomKeys = new Set(),
    symptomMetaMap = new Map()
  } = {}
) {
  const normalizedSymptomKey = normalizeText(symptomKey || '', '')
  if (!normalizedSymptomKey) {return false}
  if (!previouslyProbedNonVisualSymptomKeys.size) {return true}
  if (previouslyProbedNonVisualSymptomKeys.has(normalizedSymptomKey)) {return true}

  const observed = observedSymptomMap.get(normalizedSymptomKey)
  if (
    !observed ||
    Number(observed?.confidence || 0) < questionSelection.visualLockThreshold ||
    Number(observed?.signalReliability || 0) < questionSelection.highSpecificityThreshold
  ) {
    return false
  }

  for (const previousSymptomKey of previouslyProbedNonVisualSymptomKeys) {
    if (
      isSameMorphologyFamily(previousSymptomKey, normalizedSymptomKey, symptomMetaMap)
    ) {
      return false
    }
  }

  return true
}

function buildAskedDimensionsByTargetSymptom(askedQuestions = []) {
  const map = new Map()

  for (const askedQuestion of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const targetSymptomKey = normalizeText(askedQuestion?.targetSymptomKey || '', '')
    if (!targetSymptomKey) {continue}

    const packageTopic = normalizeQuestionPackageTopic(
      askedQuestion?.packageTopic,
      QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
    )
    const current = map.get(targetSymptomKey) || new Set()
    current.add(packageTopic)
    map.set(targetSymptomKey, current)
  }

  return map
}

function buildQuestionDimensionBucketKey(question = {}) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  return targetSymptomKey || '__global__'
}

function selectDiversifiedCandidateItems(candidateItems = [], maxQuestions = questionSelectionConfig.maxQuestionsPerRound) {
  const selected = []
  const deferred = []
  const usedGroups = new Set()
  const usedTopicsByBucket = new Map()
  const safeMaxQuestions = Math.max(1, Math.min(1, Number(maxQuestions || 1)))
  const sorted = Array.from(candidateItems || []).sort((a, b) => b.candidateScore - a.candidateScore)

  for (const item of sorted) {
    const normalizedGroupKey = String(item?.questionGroupKey || '').trim() || '__default__'
    if (normalizedGroupKey !== '__default__' && usedGroups.has(normalizedGroupKey)) {
      continue
    }

    const dimensionBucketKey = buildQuestionDimensionBucketKey(item)
    const packageTopic = normalizeQuestionPackageTopic(
      item?.packageTopic,
      QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
    )
    const usedTopics = usedTopicsByBucket.get(dimensionBucketKey) || new Set()

    if (usedTopics.has(packageTopic)) {
      deferred.push(item)
      continue
    }

    selected.push(item)
    usedTopics.add(packageTopic)
    usedTopicsByBucket.set(dimensionBucketKey, usedTopics)
    if (normalizedGroupKey !== '__default__') {
      usedGroups.add(normalizedGroupKey)
    }

    if (selected.length >= safeMaxQuestions) {
      return selected
    }
  }

  for (const item of deferred) {
    const normalizedGroupKey = String(item?.questionGroupKey || '').trim() || '__default__'
    if (normalizedGroupKey !== '__default__' && usedGroups.has(normalizedGroupKey)) {
      continue
    }

    selected.push(item)
    if (normalizedGroupKey !== '__default__') {
      usedGroups.add(normalizedGroupKey)
    }

    if (selected.length >= safeMaxQuestions) {
      break
    }
  }

  return selected
}

function resolveClassFitFactor({
  strategy = {},
  symptomClassRuntime = null
} = {}) {
  if (!symptomClassRuntime || !symptomClassRuntime.enabled) {
    return 1
  }

  const strategyClassKey = normalizeText(strategy.classKey || '')
  if (!strategyClassKey) {
    return 1
  }

  const currentClassKey = normalizeText(symptomClassRuntime.currentClassKey)
  if (!currentClassKey) {
    return symptomClassRuntime.primaryClass?.classKey === strategyClassKey ? 0.85 : 0.55
  }
  if (strategyClassKey === currentClassKey) {
    return 1
  }

  const primaryClassKey = normalizeText(symptomClassRuntime.primaryClass?.classKey)
  if (strategyClassKey === primaryClassKey) {
    return 0.85
  }

  const secondaryClassKeys = new Set(
    (Array.isArray(symptomClassRuntime.secondaryClasses)
      ? symptomClassRuntime.secondaryClasses
      : []
    ).map(item => normalizeText(item?.classKey || ''))
      .filter(Boolean)
  )
  if (secondaryClassKeys.has(strategyClassKey)) {
    return 0.7
  }

  return 0.45
}

module.exports = {
  collectRouteHintKeywords,
  computeObservedContextDimensionBoost,
  computeObservedFactCoverageBoost,
  computeQuestionTargetRelevance,
  computeRouteHintQuestionBoost,
  buildAskedDimensionsByTargetSymptom,
  buildObservedEvidenceCoverageIndex,
  buildVisualCandidateCoverageIndex,
  resolveClassFitFactor,
  selectDiversifiedCandidateItems,
  shouldAllowSecondaryObservedSymptomProbe,
  shouldBlockCoveredDimensionQuestion,
  shouldBlockDirectionManagedVisualPresenceQuestion,
  shouldBlockReturnToVisualPresenceQuestion
}
