'use strict'

const {
  ranking: rankingConfig,
  unknownFlow,
  followUpSelection
} = require('../constants/scoring')
const { projectObservedSymptomsFromEvidence } = require('./observed-evidence')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  inferObservedVisualCoveredDimensions
} = require('../utils/question-target-dimension')
const {
  OBSERVED_SYMPTOM_BRIDGE_TARGETS
} = require('../utils/question-symptom-bridge')
const {
  isExplicitObservedEvidenceSourceType
} = require('../utils/explicit-observed-symptom')
const {
  computeDiagnosisDirectionQuestionBoost
} = require('../utils/diagnosis-directions')

function ensureUnknownOption(options = []) {
  const list = Array.isArray(options) ? [...options] : []
  const hasUnknown = list.some(item => String(item.optionKey || '').toLowerCase() === 'unknown')
  if (!hasUnknown) {
    list.push({
      questionKey: list[0]?.questionKey || '',
      optionKey: 'unknown',
      optionTextCn: '看不出/不确定',
      optionTextUserCn: '看不出/不确定',
      mapsToSymptomKey: '',
      value: 0,
      associationStrength: 0,
      answerEffectCn: '不加分不减分',
      dataStatus: 'partial',
      reviewStatus: 'synthetic'
    })
  }
  return list
}

function groupByQuestion(optionMappings = []) {
  const map = new Map()
  for (const row of optionMappings || []) {
    if (!row?.questionKey) continue
    const list = map.get(row.questionKey) || []
    list.push(row)
    map.set(row.questionKey, list)
  }
  return map
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function buildObservedSymptomIndex(observedSymptoms = []) {
  const map = new Map()
  for (const item of observedSymptoms || []) {
    const symptomKey = String(item?.symptomKey || '').trim()
    if (!symptomKey) continue
    map.set(symptomKey, {
      confidence: Number(item?.confidence || 0),
      signalReliability: Number(item?.signalReliability || 0),
      locationKey: normalizeText(item?.locationKey || '', ''),
      patternKey: normalizeText(item?.patternKey || '', ''),
      distributionKey: normalizeText(item?.distributionKey || '', '')
    })
  }
  return map
}

function buildSymptomMetaMap(symptomDictionary = []) {
  return new Map(
    (Array.isArray(symptomDictionary) ? symptomDictionary : [])
      .map(item => [String(item?.symptomKey || '').trim(), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )
}

function mergeObservedSymptomContext(projectedObservedSymptoms = [], providedObservedSymptoms = []) {
  const providedMap = new Map(
    (Array.isArray(providedObservedSymptoms) ? providedObservedSymptoms : [])
      .map(item => [String(item?.symptomKey || '').trim(), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )

  return (Array.isArray(projectedObservedSymptoms) ? projectedObservedSymptoms : []).map(item => {
    const symptomKey = String(item?.symptomKey || '').trim()
    const provided = providedMap.get(symptomKey) || {}
    return {
      ...provided,
      ...item,
      signalReliability:
        item?.signalReliability ?? provided?.signalReliability ?? 0,
      locationKey: item?.locationKey || provided?.locationKey || '',
      patternKey: item?.patternKey || provided?.patternKey || '',
      distributionKey: item?.distributionKey || provided?.distributionKey || ''
    }
  })
}

function buildObservedMetaSets(observedSymptomMap = new Map()) {
  const locationKeys = new Set()
  const patternKeys = new Set()
  const distributionKeys = new Set()

  for (const item of observedSymptomMap.values()) {
    if (item?.locationKey) locationKeys.add(String(item.locationKey || '').trim())
    if (item?.patternKey) patternKeys.add(String(item.patternKey || '').trim())
    if (item?.distributionKey) distributionKeys.add(String(item.distributionKey || '').trim())
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
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
    QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
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

  if (!haystack) return boost

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

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  let bestBoost = 0

  for (const observedSymptomKey of observedSymptomMap.keys()) {
    const preferredDimensions =
      OBSERVED_CONTEXT_DIMENSION_PRIORITY_BY_SYMPTOM[observedSymptomKey] || []
    if (!preferredDimensions.length) continue

    const bridgeTargets = OBSERVED_SYMPTOM_BRIDGE_TARGETS[observedSymptomKey] || []
    if (
      observedSymptomKey !== targetSymptomKey &&
      !bridgeTargets.includes(targetSymptomKey)
    ) {
      continue
    }

    const dimensionIndex = preferredDimensions.indexOf(targetDimension)
    if (dimensionIndex < 0) continue

    const bridgeHostBonus =
      observedSymptomKey !== targetSymptomKey &&
      targetDimension === QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
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
  if (!observedSymptomMap.size) return 0

  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) return 0

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
  if (hasLocationMatch) score += 10
  if (hasPatternMatch) score += 24
  if (hasDistributionMatch) score += 6

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
  if (!normalizedSymptomKey) return false
  if (!previouslyProbedNonVisualSymptomKeys.size) return true
  if (previouslyProbedNonVisualSymptomKeys.has(normalizedSymptomKey)) return true

  const observed = observedSymptomMap.get(normalizedSymptomKey)
  if (
    !observed ||
    Number(observed?.confidence || 0) < followUpSelection.visualLockThreshold ||
    Number(observed?.signalReliability || 0) < followUpSelection.highSpecificityThreshold
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

function buildObservedEvidenceCoverageIndex(observedEvidenceSet = [], symptomMetaMap = new Map()) {
  const map = new Map()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const symptomKey = normalizeText(item?.symptomKey || '', '')
    if (!symptomKey) continue

    const symptomMeta = symptomMetaMap.get(symptomKey) || {}
    const current = map.get(symptomKey) || {
      symptomKey,
      locationKey: normalizeText(symptomMeta?.locationKey || '', ''),
      patternKey: normalizeText(symptomMeta?.patternKey || '', ''),
      distributionKey: normalizeText(symptomMeta?.distributionKey || '', ''),
      strongVisualPresenceCovered: false,
      explicitObservedCovered: false,
      coveredDimensions: new Set()
    }

    const sourceType = normalizeText(item?.sourceType || item?.source_type || '', '')
    const confidence = Number(item?.confidence || 0)
    const isActive = normalizeText(item?.currentStatus || item?.current_status || 'active', 'active') === 'active'
    const isVisualAdmission =
      sourceType === 'visual_admitted' ||
      sourceType === 'visual_admission' ||
      String(item?.parentEvidenceKey || '').startsWith('visual_admission:')

    if (isActive && isVisualAdmission && confidence >= followUpSelection.visualLockThreshold) {
      current.strongVisualPresenceCovered = true
      for (const targetDimension of inferObservedVisualCoveredDimensions({
        symptomKey,
        patternKey: current.patternKey,
        locationKey: current.locationKey
      })) {
        current.coveredDimensions.add(targetDimension)
      }
    }

    if (isActive && isExplicitObservedEvidenceSourceType(sourceType)) {
      current.explicitObservedCovered = true
      current.coveredDimensions.add(QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE)
    }

    map.set(symptomKey, current)
  }

  return map
}

function hasStrongVisualCandidateCoverage(item = {}) {
  const confidenceBand = normalizeText(item?.confidenceBand || '', 'low')
  const strengthLevel = normalizeText(item?.strengthLevel || '', 'weak')
  const admissionReadiness = normalizeText(item?.admissionReadiness || '', 'cautious')
  const signalReliability = Number(item?.signalReliability || 0)
  const supportCount = Number(item?.supportCount || 0)

  if (confidenceBand === 'high' && ['medium', 'strong'].includes(strengthLevel)) {
    return true
  }
  if (strengthLevel === 'strong' && signalReliability >= followUpSelection.highSpecificityThreshold) {
    return true
  }
  if (confidenceBand === 'high' && admissionReadiness === 'ready') {
    return true
  }
  if (confidenceBand === 'high' && supportCount >= 2) {
    return true
  }

  return false
}

function buildVisualCandidateCoverageIndex(visualCandidateSymptoms = [], symptomMetaMap = new Map()) {
  const map = new Map()

  for (const item of Array.isArray(visualCandidateSymptoms) ? visualCandidateSymptoms : []) {
    const symptomKey = normalizeText(item?.symptomKey || '', '')
    if (!symptomKey) continue

    const symptomMeta = symptomMetaMap.get(symptomKey) || {}
    const locationKey = normalizeText(item?.locationKey || symptomMeta?.locationKey || '', '')
    const patternKey = normalizeText(item?.patternKey || symptomMeta?.patternKey || '', '')
    const strongVisualPresenceCovered = hasStrongVisualCandidateCoverage(item)
    map.set(symptomKey, {
      symptomKey,
      locationKey,
      patternKey,
      distributionKey: normalizeText(item?.distributionKey || symptomMeta?.distributionKey || '', ''),
      strongVisualPresenceCovered,
      coveredDimensions: new Set(
        strongVisualPresenceCovered
          ? inferObservedVisualCoveredDimensions({
              symptomKey,
              patternKey,
              locationKey
            })
          : []
      )
    })
  }

  return map
}

function isDedicatedVisualPresenceConfirmQuestion(question = {}) {
  const questionKey = normalizeText(question?.questionKey || '', '')
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )

  if (!questionKey || !targetSymptomKey) {
    return false
  }

  if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return false
  }

  return questionKey === `q_${targetSymptomKey}_confirm`
}

function shouldBlockCoveredDimensionQuestion(
  question = {},
  {
    observedSymptomMap = new Map(),
    observedEvidenceCoverageMap = new Map(),
    visualCandidateCoverageMap = new Map(),
    symptomMetaMap = new Map()
  } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) return false

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  const targetCoverage = observedEvidenceCoverageMap.get(targetSymptomKey)
  const targetCandidateCoverage = visualCandidateCoverageMap.get(targetSymptomKey)
  if (
    targetCoverage?.coveredDimensions?.has(targetDimension) ||
    (
      targetCandidateCoverage?.coveredDimensions?.has(targetDimension) &&
      !isDedicatedVisualPresenceConfirmQuestion(question)
    )
  ) {
    return true
  }

  for (const [observedSymptomKey, observedCoverage] of observedEvidenceCoverageMap.entries()) {
    if (!observedCoverage?.strongVisualPresenceCovered) continue
    if (observedSymptomKey === targetSymptomKey) continue
    if (!observedSymptomMap.has(observedSymptomKey)) continue
    if (
      observedCoverage?.coveredDimensions?.has(targetDimension) &&
      isSameMorphologyFamily(observedSymptomKey, targetSymptomKey, symptomMetaMap)
    ) {
      return true
    }
  }

  for (const [candidateSymptomKey, candidateCoverage] of visualCandidateCoverageMap.entries()) {
    if (!candidateCoverage?.strongVisualPresenceCovered) continue
    if (candidateSymptomKey === targetSymptomKey) continue
    if (
      candidateCoverage?.coveredDimensions?.has(targetDimension) &&
      isSameMorphologyFamily(candidateSymptomKey, targetSymptomKey, symptomMetaMap)
    ) {
      return true
    }
  }

  return false
}

function computeObservedFactCoverageBoost(
  question = {},
  {
    observedSymptomMap = new Map(),
    observedEvidenceCoverageMap = new Map(),
    visualCandidateCoverageMap = new Map(),
    symptomMetaMap = new Map()
  } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) return 0

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  if (
    targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE &&
    observedSymptomMap.has(targetSymptomKey)
  ) {
    return 48
  }
  if (targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return 0
  }

  if (observedSymptomMap.has(targetSymptomKey)) {
    return 28
  }

  const targetCandidateCoverage = visualCandidateCoverageMap.get(targetSymptomKey)
  if (targetCandidateCoverage?.strongVisualPresenceCovered) {
    return 28
  }

  for (const [observedSymptomKey, observedCoverage] of observedEvidenceCoverageMap.entries()) {
    if (!observedCoverage?.strongVisualPresenceCovered) continue
    if (!observedSymptomMap.has(observedSymptomKey)) continue
    if (isSameMorphologyFamily(observedSymptomKey, targetSymptomKey, symptomMetaMap)) {
      return 22
    }
  }

  for (const [candidateSymptomKey, candidateCoverage] of visualCandidateCoverageMap.entries()) {
    if (!candidateCoverage?.strongVisualPresenceCovered) continue
    if (isSameMorphologyFamily(candidateSymptomKey, targetSymptomKey, symptomMetaMap)) {
      return 22
    }
  }

  return 0
}

function shouldBlockReturnToVisualPresenceQuestion(
  question = {},
  {
    askedQuestions = [],
    symptomMetaMap = new Map()
  } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) return false

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return false
  }

  for (const askedQuestion of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const askedTargetSymptomKey = normalizeText(askedQuestion?.targetSymptomKey || '', '')
    if (!askedTargetSymptomKey) continue

    const askedTargetDimension = normalizeQuestionTargetDimension(
      askedQuestion?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    )
    if (askedTargetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
      continue
    }

    if (askedTargetSymptomKey === targetSymptomKey) {
      return true
    }

    if (isSameMorphologyFamily(askedTargetSymptomKey, targetSymptomKey, symptomMetaMap)) {
      return true
    }
  }

  return false
}

function shouldBlockDirectionManagedVisualPresenceQuestion(
  question = {},
  { diagnosisDirections = [] } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  if (!targetSymptomKey) return false

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return false
  }

  if (isDedicatedVisualPresenceConfirmQuestion(question)) {
    return false
  }

  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const matchedSymptomKeys = new Set(
      [
        ...(Array.isArray(direction?.matchedSymptomKeys) ? direction.matchedSymptomKeys : []),
        ...(Array.isArray(direction?.matchedCandidateSymptomKeys)
          ? direction.matchedCandidateSymptomKeys
          : [])
      ]
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
    if (!matchedSymptomKeys.has(targetSymptomKey)) {
      continue
    }

    const preferredQuestionDimensions = (Array.isArray(direction?.preferredQuestionDimensions)
      ? direction.preferredQuestionDimensions
      : []
    )
      .map(item =>
        normalizeQuestionTargetDimension(item, QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE)
      )
      .filter(item => item !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE)

    if (preferredQuestionDimensions.length > 0) {
      return true
    }
  }

  return false
}

function buildAskedDimensionsByTargetSymptom(askedQuestions = []) {
  const map = new Map()

  for (const askedQuestion of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const targetSymptomKey = normalizeText(askedQuestion?.targetSymptomKey || '', '')
    if (!targetSymptomKey) continue

    const targetDimension = normalizeQuestionTargetDimension(
      askedQuestion?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    )
    const current = map.get(targetSymptomKey) || new Set()
    current.add(targetDimension)
    map.set(targetSymptomKey, current)
  }

  return map
}

function buildQuestionDimensionBucketKey(question = {}) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  return targetSymptomKey || '__global__'
}

function selectDiversifiedCandidateItems(candidateItems = [], maxQuestions = rankingConfig.maxQuestionsPerRound) {
  const selected = []
  const deferred = []
  const usedGroups = new Set()
  const usedDimensionsByBucket = new Map()
  const safeMaxQuestions = Math.max(1, Number(maxQuestions || 3))
  const sorted = Array.from(candidateItems || []).sort((a, b) => b.candidateScore - a.candidateScore)

  for (const item of sorted) {
    const normalizedGroupKey = String(item?.questionGroupKey || '').trim() || '__default__'
    if (normalizedGroupKey !== '__default__' && usedGroups.has(normalizedGroupKey)) {
      continue
    }

    const dimensionBucketKey = buildQuestionDimensionBucketKey(item)
    const targetDimension = normalizeQuestionTargetDimension(
      item?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    )
    const usedDimensions = usedDimensionsByBucket.get(dimensionBucketKey) || new Set()

    if (usedDimensions.has(targetDimension)) {
      deferred.push(item)
      continue
    }

    selected.push(item)
    usedDimensions.add(targetDimension)
    usedDimensionsByBucket.set(dimensionBucketKey, usedDimensions)
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

function selectFollowUpQuestions({
  rankings = [],
  strategies = [],
  questions = [],
  optionMappings = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualCandidateSymptoms = [],
  askedQuestions = [],
  symptomDictionary = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  diagnosisDirections = [],
  blockedTargetSymptomKeys = [],
  symptomClassRuntime = null,
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const projectedObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms
  const effectiveObservedSymptoms = mergeObservedSymptomContext(
    projectedObservedSymptoms,
    observedSymptoms
  )
  const askedSet = new Set((askedQuestionKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  const questionMap = new Map((questions || []).map(item => [item.questionKey, item]))
  const optionMap = groupByQuestion(optionMappings)
  const scoreMap = new Map((rankings || []).map(item => [item.problemKey, Number(item.finalScore || item.baseScore || 0)]))
  const observedSymptomMap = buildObservedSymptomIndex(effectiveObservedSymptoms)
  const symptomMetaMap = buildSymptomMetaMap(symptomDictionary)
  const observedEvidenceCoverageMap = buildObservedEvidenceCoverageIndex(
    observedEvidenceSet,
    symptomMetaMap
  )
  const askedDimensionsByTargetSymptom = buildAskedDimensionsByTargetSymptom(askedQuestions)
  const visualCandidateCoverageMap = buildVisualCandidateCoverageIndex(
    visualCandidateSymptoms,
    symptomMetaMap
  )
  const blockedTargetSymptomSet = new Set(
    (Array.isArray(blockedTargetSymptomKeys) ? blockedTargetSymptomKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const blockedGroups = new Set(
    Object.entries(unknownCountByGroup || {})
      .filter(([, unknownCount]) => Number(unknownCount || 0) >= unknownFlow.groupUnknownThreshold)
      .map(([groupKey]) => String(groupKey || '').trim())
      .filter(Boolean)
  )
  for (const groupKey of answeredQuestionGroupKeys || []) {
    const normalizedGroupKey = String(groupKey || '').trim()
    if (normalizedGroupKey && normalizedGroupKey !== '__default__') {
      blockedGroups.add(normalizedGroupKey)
    }
  }
  const routeHintKeywords = collectRouteHintKeywords({
    visualRouteHints,
    suggestedFollowupCapture
  })

  const candidates = new Map()
  for (const strategy of strategies || []) {
    if (normalizeText(strategy?.reviewStatus || '', 'audited') !== 'audited') {
      continue
    }

    const question = questionMap.get(strategy.questionKey)
    if (!question) continue
    if (normalizeText(question?.reviewStatus || '', 'audited') !== 'audited') {
      continue
    }
    if (askedSet.has(question.questionKey)) continue

    const targetSymptomKey = normalizeText(question.targetSymptomKey || '', '')
    const targetDimension = normalizeQuestionTargetDimension(
      question?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    )
    if (targetSymptomKey && blockedTargetSymptomSet.has(targetSymptomKey)) {
      continue
    }
    if (
      targetSymptomKey &&
      askedDimensionsByTargetSymptom.get(targetSymptomKey)?.has(targetDimension)
    ) {
      continue
    }

    if (shouldBlockCoveredDimensionQuestion(question, {
      observedSymptomMap,
      observedEvidenceCoverageMap,
      visualCandidateCoverageMap,
      symptomMetaMap
    })) {
      continue
    }
    if (shouldBlockReturnToVisualPresenceQuestion(question, {
      askedQuestions,
      symptomMetaMap
    })) {
      continue
    }
    if (shouldBlockDirectionManagedVisualPresenceQuestion(question, { diagnosisDirections })) {
      continue
    }

    const groupKey = question.questionGroupKey || strategy.questionGroupKey || '__default__'
    if (blockedGroups.has(groupKey)) {
      continue
    }

    const observedTarget = observedSymptomMap.get(targetSymptomKey)
    const strongVisualLock = Boolean(
      observedTarget &&
      observedTarget.confidence >= followUpSelection.visualLockThreshold &&
      observedTarget.signalReliability >= followUpSelection.highSpecificityThreshold
    )
    const weakVisualOverlap = Boolean(observedTarget && !strongVisualLock)
    const nonRedundancyFactor =
      targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
        ? strongVisualLock
          ? 1 - followUpSelection.strongOverlapPenalty
          : weakVisualOverlap
            ? 1 - followUpSelection.weakOverlapPenalty
            : 1
        : 1

    const targetRelevanceScore = computeQuestionTargetRelevance(question, {
      observedSymptomMap,
      symptomMetaMap
    })

    if (effectiveObservedSymptoms.length && targetRelevanceScore <= -20) {
      continue
    }

    const candidateScore =
      (
        Number(strategy.priorityScore || 0) +
        Number(scoreMap.get(strategy.problemKey) || 0) * 100
      ) * nonRedundancyFactor +
      computeObservedFactCoverageBoost(question, {
        observedSymptomMap,
        observedEvidenceCoverageMap,
        visualCandidateCoverageMap,
        symptomMetaMap
      }) +
      computeObservedContextDimensionBoost(question, {
        observedSymptomMap
      }) +
      computeRouteHintQuestionBoost(question, {
        visualRoutePrimaryAction,
        routeHintKeywords
      }) +
      computeDiagnosisDirectionQuestionBoost(question, {
        strategyProblemKey: strategy.problemKey,
        diagnosisDirections
      }) +
      targetRelevanceScore
    const classFitFactor = resolveClassFitFactor({ strategy, symptomClassRuntime })

    const existing = candidates.get(question.questionKey)
    if (!existing || candidateScore > existing.candidateScore) {
      candidates.set(question.questionKey, {
        ...question,
        candidateScore: candidateScore * classFitFactor,
        questionGroupKey: groupKey,
        strategyProblemKey: strategy.problemKey,
        classFitFactor
      })
    }
  }

  const selected = selectDiversifiedCandidateItems(
    Array.from(candidates.values()),
    maxQuestions
  )

  return selected.map(item => ({
    questionKey: item.questionKey,
    targetSymptomKey: item.targetSymptomKey || '',
    questionText: item.questionTextUserCn || item.questionTextCn,
    helpText: item.helpTextCn || '',
    questionGroupKey: item.questionGroupKey,
    targetDimension: normalizeQuestionTargetDimension(
      item.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    ),
    routingScope: normalizeText(item.routingScope || '', ''),
    questionType: item.questionType || 'single_choice',
    options: ensureUnknownOption(optionMap.get(item.questionKey) || []).map(opt => ({
      optionKey: opt.optionKey,
      text: opt.optionTextUserCn || opt.optionTextCn || opt.optionKey
    })),
    whyThisQuestion: item.whyThisQuestionCn || ''
  }))
}

module.exports = {
  selectFollowUpQuestions,
  shouldAllowSecondaryObservedSymptomProbe
}
