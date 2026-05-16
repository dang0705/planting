'use strict'

const {
  followUpSelection
} = require('../constants/scoring')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  inferObservedVisualCoveredDimensions
} = require('../utils/question-target-dimension')
const {
  isExplicitObservedEvidenceSourceType
} = require('../utils/explicit-observed-symptom')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
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
    if (!symptomKey) {continue}

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
    if (!symptomKey) {continue}

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
  if (!targetSymptomKey) {return false}

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
    if (!observedCoverage?.strongVisualPresenceCovered) {continue}
    if (observedSymptomKey === targetSymptomKey) {continue}
    if (!observedSymptomMap.has(observedSymptomKey)) {continue}
    if (
      observedCoverage?.coveredDimensions?.has(targetDimension) &&
      isSameMorphologyFamily(observedSymptomKey, targetSymptomKey, symptomMetaMap)
    ) {
      return true
    }
  }

  for (const [candidateSymptomKey, candidateCoverage] of visualCandidateCoverageMap.entries()) {
    if (!candidateCoverage?.strongVisualPresenceCovered) {continue}
    if (candidateSymptomKey === targetSymptomKey) {continue}
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
  if (!targetSymptomKey) {return 0}

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
    if (!observedCoverage?.strongVisualPresenceCovered) {continue}
    if (!observedSymptomMap.has(observedSymptomKey)) {continue}
    if (isSameMorphologyFamily(observedSymptomKey, targetSymptomKey, symptomMetaMap)) {
      return 22
    }
  }

  for (const [candidateSymptomKey, candidateCoverage] of visualCandidateCoverageMap.entries()) {
    if (!candidateCoverage?.strongVisualPresenceCovered) {continue}
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
  if (!targetSymptomKey) {return false}

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return false
  }

  for (const askedQuestion of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const askedTargetSymptomKey = normalizeText(askedQuestion?.targetSymptomKey || '', '')
    if (!askedTargetSymptomKey) {continue}

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
  if (!targetSymptomKey) {return false}

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

module.exports = {
  buildObservedEvidenceCoverageIndex,
  buildVisualCandidateCoverageIndex,
  computeObservedFactCoverageBoost,
  shouldBlockCoveredDimensionQuestion,
  shouldBlockDirectionManagedVisualPresenceQuestion,
  shouldBlockReturnToVisualPresenceQuestion
}
