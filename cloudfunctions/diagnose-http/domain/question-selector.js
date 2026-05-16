'use strict'

const {
  ranking: rankingConfig,
  unknownFlow,
  followUpSelection
} = require('../constants/scoring')
const { projectObservedSymptomsFromEvidence } = require('./observed-evidence')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension
} = require('../utils/question-target-dimension')
const {
  computeDiagnosisDirectionQuestionBoost
} = require('../utils/diagnosis-directions')
const {
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
} = require('./question-selector-helpers')

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
    if (!row?.questionKey) {continue}
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
    if (!symptomKey) {continue}
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
    if (!question) {continue}
    if (normalizeText(question?.reviewStatus || '', 'audited') !== 'audited') {
      continue
    }
    if (askedSet.has(question.questionKey)) {continue}

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
    defaultOptionKey: item.defaultOptionKey || '',
    uiVariant: item.uiVariant || '',
    renderMode: item.renderMode || '',
    targetDimension: normalizeQuestionTargetDimension(
      item.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    ),
    routingScope: normalizeText(item.routingScope || '', ''),
    questionType: item.questionType || 'single_choice',
    options: ensureUnknownOption(optionMap.get(item.questionKey) || []).map(opt => ({
      optionKey: opt.optionKey,
      text: opt.optionTextUserCn || opt.optionTextCn || opt.optionKey,
      description: opt.optionDescriptionUserCn || '',
      isDefault: Boolean(opt.isDefault)
    })),
    whyThisQuestion: item.whyThisQuestionCn || ''
  }))
}

module.exports = {
  selectFollowUpQuestions,
  shouldAllowSecondaryObservedSymptomProbe
}
