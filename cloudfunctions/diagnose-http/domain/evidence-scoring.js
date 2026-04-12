'use strict'

const { clamp01 } = require('../repositories/sql')
const { evidence: evidenceConfig } = require('../constants/scoring')
const { projectObservedSymptomsFromEvidence } = require('./observed-evidence')

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
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
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

function computeQuestionEvidenceAndPenalty({
  answers = [],
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
  const symptomMap = buildSymptomIndex(symptomDictionary)
  const edgeMap = buildEdgeIndex(evidenceEdges)
  const answerEffects = []

  for (const answer of answers) {
    const questionKey = String(answer?.questionKey || '').trim()
    const optionKey = String(answer?.optionKey || '').trim()
    if (!questionKey || !optionKey) continue

    const mapping = mappingIndex.get(`${questionKey}::${optionKey}`)
    if (!mapping) continue

    const answerValue = Number(mapping.value || 0)
    if (answerValue === 0) {
      answerEffects.push({
        questionKey,
        optionKey,
        value: 0,
        effectType: 'neutral'
      })
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
