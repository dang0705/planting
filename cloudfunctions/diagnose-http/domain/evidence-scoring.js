'use strict'

const { clamp01 } = require('../repositories/sql')
const { evidence: evidenceConfig } = require('../constants/scoring')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  inferQuestionTargetDimension,
  isGenericObservedProbeDirectEvidenceDimension
} = require('../utils/question-target-dimension')
const {
  parseSyntheticObservedProbeQuestionKey
} = require('../utils/synthetic-follow-up')
const {
  projectObservedSymptomsFromEvidence,
  projectVisualObservedSymptomsFromEvidence
} = require('./observed-evidence')

const GENERIC_OBSERVED_PROBE_POSITIVE_SCORE_CAP = 0.04

function round(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function buildEdgeIndex(edges = []) {
  const map = new Map()
  for (const edge of edges || []) {
    if (!edge?.problemKey || !edge?.symptomKey) continue
    map.set(`${edge.problemKey}::${edge.symptomKey}`, edge)
  }
  return map
}

function buildSymptomIndex(symptoms = []) {
  const map = new Map()
  for (const item of symptoms || []) {
    if (!item?.symptomKey) continue
    map.set(item.symptomKey, item)
  }
  return map
}

function computeVisualEvidenceScores({
  candidateProblemKeys = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  symptomDictionary = [],
  evidenceEdges = []
} = {}) {
  const effectiveObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectVisualObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms
  const scores = {}
  candidateProblemKeys.forEach(key => {
    scores[key] = 0
  })

  if (!candidateProblemKeys.length || !effectiveObservedSymptoms.length) {
    return scores
  }

  const symptomMap = buildSymptomIndex(symptomDictionary)
  const edgeMap = buildEdgeIndex(evidenceEdges)

  for (const observed of effectiveObservedSymptoms.slice(0, evidenceConfig.maxVisualSymptoms)) {
    const symptomKey = String(observed?.symptomKey || '').trim()
    if (!symptomKey) continue

    const symptomMeta = symptomMap.get(symptomKey)
    const visualConfidence = clamp01(observed?.confidence ?? 0.75)
    const signalReliability = clamp01(symptomMeta?.signalReliability ?? 0.6)

    for (const problemKey of candidateProblemKeys) {
      const edge = edgeMap.get(`${problemKey}::${symptomKey}`)
      if (!edge) continue

      const contribution =
        visualConfidence *
        clamp01(edge.associationStrength) *
        signalReliability *
        clamp01(edge.edgeReliability)

      scores[problemKey] += contribution
    }
  }

  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, round(value)])
  )
}

function indexOptionMappings(optionMappings = []) {
  const map = new Map()
  for (const row of optionMappings || []) {
    if (!row?.questionKey || !row?.optionKey) continue
    map.set(`${row.questionKey}::${row.optionKey}`, row)
  }
  return map
}

function normalizeDirectProblemAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : [])
    .map(item => ({
      problemKey: String(item?.problemKey || '').trim(),
      scoreDelta: Number(item?.scoreDelta || 0)
    }))
    .filter(item => item.problemKey && Number(item.scoreDelta || 0) !== 0)
}

function buildQuestionIndex(questions = []) {
  const map = new Map()
  for (const question of Array.isArray(questions) ? questions : []) {
    const questionKey = String(question?.questionKey || question?.question_key || '').trim()
    if (!questionKey) continue
    map.set(questionKey, question)
  }
  return map
}

function resolveQuestionTargetDimension({
  questionKey = '',
  answer = null,
  question = null
} = {}) {
  const parsed = parseSyntheticObservedProbeQuestionKey(questionKey)
  const parsedDimension = normalizeQuestionTargetDimension(parsed?.targetDimension, '')
  if (parsedDimension) return parsedDimension

  const explicitDimension = normalizeQuestionTargetDimension(
    answer?.targetDimension ||
      answer?.target_dimension ||
      question?.targetDimension ||
      question?.target_dimension ||
      '',
    ''
  )
  if (explicitDimension) return explicitDimension

  return inferQuestionTargetDimension(
    questionKey,
    answer?.targetSymptomKey ||
      answer?.target_symptom_key ||
      question?.targetSymptomKey ||
      question?.target_symptom_key ||
      ''
  )
}

function normalizeDirectProblemScoreDeltaForQuestion(
  questionKey = '',
  scoreDelta = 0,
  targetDimensionOverride = ''
) {
  const normalizedScoreDelta = Number(scoreDelta || 0)
  if (normalizedScoreDelta <= 0) {
    return normalizedScoreDelta
  }

  const { targetDimension } = parseSyntheticObservedProbeQuestionKey(questionKey)
  const normalizedTargetDimension =
    normalizeQuestionTargetDimension(targetDimensionOverride, '') ||
    normalizeQuestionTargetDimension(targetDimension, '') ||
    inferQuestionTargetDimension(questionKey)
  if (!isGenericObservedProbeDirectEvidenceDimension(normalizedTargetDimension)) {
    return normalizedScoreDelta
  }

  return Math.min(normalizedScoreDelta, GENERIC_OBSERVED_PROBE_POSITIVE_SCORE_CAP)
}

function computeQuestionEvidenceAndPenalty({
  answers = [],
  questions = [],
  optionMappings = [],
  candidateProblemKeys = [],
  symptomDictionary = [],
  evidenceEdges = []
} = {}) {
  const questionScores = {}
  const penalties = {}
  candidateProblemKeys.forEach(key => {
    questionScores[key] = 0
    penalties[key] = 0
  })

  if (!answers.length || !candidateProblemKeys.length) {
    return { questionScores, penalties, answerEffects: [] }
  }

  const mappingIndex = indexOptionMappings(optionMappings)
  const questionIndex = buildQuestionIndex(questions)
  const symptomMap = buildSymptomIndex(symptomDictionary)
  const edgeMap = buildEdgeIndex(evidenceEdges)
  const answerEffects = []

  for (const answer of answers) {
    const questionKey = String(answer?.questionKey || '').trim()
    const optionKey = String(answer?.optionKey || '').trim()
    if (!questionKey || !optionKey) continue

    const mapping = mappingIndex.get(`${questionKey}::${optionKey}`)
    if (!mapping) continue
    const question = questionIndex.get(questionKey) || null
    const targetDimension = resolveQuestionTargetDimension({
      questionKey,
      answer,
      question
    })

    const answerValue = Number(mapping.value || 0)
    const directProblemAdjustments = normalizeDirectProblemAdjustments(
      mapping.directProblemAdjustments
    )

    if (directProblemAdjustments.length) {
      for (const adjustment of directProblemAdjustments) {
        if (!candidateProblemKeys.includes(adjustment.problemKey)) continue

        const effectiveScoreDelta = normalizeDirectProblemScoreDeltaForQuestion(
          questionKey,
          adjustment.scoreDelta,
          targetDimension
        )

        if (effectiveScoreDelta > 0) {
          questionScores[adjustment.problemKey] += effectiveScoreDelta
        } else {
          penalties[adjustment.problemKey] += Math.abs(effectiveScoreDelta)
        }

        answerEffects.push({
          questionKey,
          optionKey,
          problemKey: adjustment.problemKey,
          value: round(effectiveScoreDelta),
          rawValue: round(adjustment.scoreDelta),
          targetDimension,
          isGenericObservedProbeDirectPositive:
            effectiveScoreDelta > 0 &&
            isGenericObservedProbeDirectEvidenceDimension(targetDimension),
          effectType: effectiveScoreDelta > 0 ? 'direct_problem_positive' : 'direct_problem_negative'
        })
      }
    }

    if (answerValue === 0) {
      if (!directProblemAdjustments.length) {
        answerEffects.push({
          questionKey,
          optionKey,
          value: 0,
          targetDimension,
          effectType: 'neutral'
        })
      }
      continue
    }

    const mappedSymptomKey = String(mapping.mapsToSymptomKey || '').trim()
    if (!mappedSymptomKey) continue

    const symptomMeta = symptomMap.get(mappedSymptomKey)
    const signalReliability = clamp01(symptomMeta?.signalReliability ?? 0.6)
    const mappingStrength = clamp01(mapping.associationStrength)

    for (const problemKey of candidateProblemKeys) {
      const edge = edgeMap.get(`${problemKey}::${mappedSymptomKey}`)
      if (!edge) continue

      const contribution =
        Math.abs(answerValue) *
        mappingStrength *
        clamp01(edge.associationStrength) *
        signalReliability *
        clamp01(edge.edgeReliability)

      if (answerValue > 0) {
        questionScores[problemKey] += contribution
      } else {
        penalties[problemKey] += contribution
      }
    }

    answerEffects.push({
      questionKey,
      optionKey,
      mappedSymptomKey,
      value: answerValue,
      targetDimension,
      effectType: answerValue > 0 ? 'positive' : 'negative'
    })
  }

  return {
    questionScores: Object.fromEntries(
      Object.entries(questionScores).map(([key, value]) => [key, round(value)])
    ),
    penalties: Object.fromEntries(
      Object.entries(penalties).map(([key, value]) => [key, round(value)])
    ),
    answerEffects
  }
}

module.exports = {
  computeVisualEvidenceScores,
  computeQuestionEvidenceAndPenalty
}
