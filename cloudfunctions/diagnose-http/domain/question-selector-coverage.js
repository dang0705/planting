'use strict'

const {
  questionSelection
} = require('../constants/scoring')
const {
  QUESTION_PACKAGE_TOPICS,
  normalizeQuestionPackageTopic,
  inferObservedVisualCoveredTopics
} = require('../utils/question-package-topic')
const {
  isExplicitObservedEvidenceSourceType
} = require('../utils/explicit-observed-symptom')

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
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
      coveredTopics: new Set()
    }

    const sourceType = normalizeText(item?.sourceType || item?.source_type || '', '')
    const confidence = Number(item?.confidence || 0)
    const isActive = normalizeText(item?.currentStatus || item?.current_status || 'active', 'active') === 'active'
    const isVisualAdmission =
      sourceType === 'visual_admitted' ||
      sourceType === 'visual_admission' ||
      String(item?.parentEvidenceKey || '').startsWith('visual_admission:')

    if (isActive && isVisualAdmission && confidence >= questionSelection.visualLockThreshold) {
      current.strongVisualPresenceCovered = true
      for (const packageTopic of inferObservedVisualCoveredTopics({
        symptomKey,
        patternKey: current.patternKey,
        locationKey: current.locationKey
      })) {
        current.coveredTopics.add(packageTopic)
      }
    }

    if (isActive && isExplicitObservedEvidenceSourceType(sourceType)) {
      current.explicitObservedCovered = true
      current.coveredTopics.add(QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE)
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
  if (strengthLevel === 'strong' && signalReliability >= questionSelection.highSpecificityThreshold) {
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
      coveredTopics: new Set(
        strongVisualPresenceCovered
          ? inferObservedVisualCoveredTopics({
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
  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )

  if (!questionKey || !targetSymptomKey) {
    return false
  }

  if (packageTopic !== QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
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

  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )
  const targetCoverage = observedEvidenceCoverageMap.get(targetSymptomKey)
  const targetCandidateCoverage = visualCandidateCoverageMap.get(targetSymptomKey)
  if (
    targetCoverage?.coveredTopics?.has(packageTopic) ||
    (
      targetCandidateCoverage?.coveredTopics?.has(packageTopic) &&
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
      observedCoverage?.coveredTopics?.has(packageTopic) &&
      isSameMorphologyFamily(observedSymptomKey, targetSymptomKey, symptomMetaMap)
    ) {
      return true
    }
  }

  for (const [candidateSymptomKey, candidateCoverage] of visualCandidateCoverageMap.entries()) {
    if (!candidateCoverage?.strongVisualPresenceCovered) {continue}
    if (candidateSymptomKey === targetSymptomKey) {continue}
    if (
      candidateCoverage?.coveredTopics?.has(packageTopic) &&
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

  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )
  if (
    packageTopic === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE &&
    observedSymptomMap.has(targetSymptomKey)
  ) {
    return 48
  }
  if (packageTopic === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
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

  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )
  if (packageTopic !== QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
    return false
  }

  for (const askedQuestion of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const askedTargetSymptomKey = normalizeText(askedQuestion?.targetSymptomKey || '', '')
    if (!askedTargetSymptomKey) {continue}

    const askedPackageTopic = normalizeQuestionPackageTopic(
      askedQuestion?.packageTopic,
      QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
    )
    if (askedPackageTopic === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
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

  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic,
    QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
  )
  if (packageTopic !== QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
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
        normalizeQuestionPackageTopic(item, QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE)
      )
      .filter(item => item !== QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE)

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
