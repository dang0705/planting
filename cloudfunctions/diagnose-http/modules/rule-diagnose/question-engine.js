'use strict'

const { followUpQuestions } = require('./data/questions')
const { diagnosisRules } = require('./data/rules')

function getCandidateRules(candidateRuleIds) {
  return diagnosisRules.filter(rule => candidateRuleIds.includes(rule.id))
}

function isQuestionTriggered(question, userSymptoms) {
  if (!question?.triggerSymptoms || question.triggerSymptoms.length === 0) return true
  return question.triggerSymptoms.some(symptomId => userSymptoms.includes(symptomId))
}

function getRelevantConditionQuestionIds(candidateRuleIds) {
  const questionIds = new Set()
  const rules = getCandidateRules(candidateRuleIds)

  for (const rule of rules) {
    for (const questionId of Object.keys(rule.conditions || {})) {
      questionIds.add(questionId)
    }
  }

  return [...questionIds]
}

function getTriggeredQuestions(userSymptoms, candidateRuleIds = []) {
  const relevantQuestionIds = new Set(getRelevantConditionQuestionIds(candidateRuleIds))
  if (relevantQuestionIds.size === 0) return []

  return followUpQuestions.filter(question => {
    if (!relevantQuestionIds.has(question.id)) return false
    return isQuestionTriggered(question, userSymptoms)
  })
}

function normalizeCandidateProbabilities(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return []
  const total = candidates.reduce((sum, candidate) => sum + Number(candidate?.score || 0), 0) || 1
  return candidates.map(candidate => ({
    ...candidate,
    probability: Math.max(1e-6, Number(candidate?.score || 0) / total)
  }))
}

function computeEntropy(probabilities = []) {
  const safeProbabilities = probabilities.filter(probability => probability > 0)
  return safeProbabilities.reduce((sum, probability) => sum - probability * Math.log2(probability), 0)
}

function buildOptionDistribution(rule, question) {
  const mapping = rule?.conditions?.[question.id]
  if (!mapping) return null

  const optionWeights = question.options.map(option => Number(mapping?.[option.value] || 0))
  const maxWeight = Math.max(...optionWeights)
  const expWeights = optionWeights.map(weight => Math.exp((weight - maxWeight) / 2))
  const total = expWeights.reduce((sum, weight) => sum + weight, 0) || 1

  return question.options.reduce((result, option, index) => {
    result[option.value] = expWeights[index] / total
    return result
  }, {})
}

function computeExpectedInformationGain(candidates = [], question) {
  const normalizedCandidates = normalizeCandidateProbabilities(candidates)
  if (normalizedCandidates.length === 0) return 0

  const baseEntropy = computeEntropy(normalizedCandidates.map(candidate => candidate.probability))
  if (baseEntropy <= 0) return 0

  const optionPosteriors = new Map()

  for (const candidate of normalizedCandidates) {
    const rule = diagnosisRules.find(item => item.id === candidate.id)
    const optionDistribution = buildOptionDistribution(rule, question)
    if (!optionDistribution) continue

    for (const option of question.options) {
      const answerProbability = optionDistribution[option.value] || 0
      if (answerProbability <= 0) continue

      const bucket = optionPosteriors.get(option.value) || []
      bucket.push({
        id: candidate.id,
        probability: candidate.probability * answerProbability
      })
      optionPosteriors.set(option.value, bucket)
    }
  }

  if (optionPosteriors.size === 0) return 0

  let expectedEntropy = 0
  for (const option of question.options) {
    const bucket = optionPosteriors.get(option.value) || []
    const optionMass = bucket.reduce((sum, item) => sum + item.probability, 0)
    if (optionMass <= 0) continue

    const posterior = bucket.map(item => item.probability / optionMass)
    expectedEntropy += optionMass * computeEntropy(posterior)
  }

  return Math.max(0, baseEntropy - expectedEntropy)
}

function chooseNextQuestion(userSymptoms, answeredConditions, candidates = []) {
  const candidateRuleIds = candidates.map(candidate => candidate.id)
  const available = getTriggeredQuestions(userSymptoms, candidateRuleIds).filter(
    question => answeredConditions[question.id] === undefined
  )

  if (available.length === 0) return null

  const rankedQuestions = available
    .map(question => ({
      question,
      informationGain: computeExpectedInformationGain(candidates, question),
      optionCount: question.options.length
    }))
    .sort((a, b) => {
      if (b.informationGain !== a.informationGain) return b.informationGain - a.informationGain
      return a.optionCount - b.optionCount
    })

  return rankedQuestions[0]?.question || null
}

function getPendingQuestionCount(candidates, answeredConditions = {}) {
  const candidateRuleIds = (candidates || []).map(candidate => candidate.id)
  const relevantQuestionIds = getRelevantConditionQuestionIds(candidateRuleIds)
  return relevantQuestionIds.filter(questionId => answeredConditions[questionId] === undefined)
    .length
}

function shouldContinueAsking(candidates, roundCount, answeredConditions = {}) {
  if (roundCount >= 4) return false
  if (!candidates || candidates.length === 0) return roundCount < 2

  const pendingQuestionCount = getPendingQuestionCount(candidates, answeredConditions)
  if (pendingQuestionCount === 0) return false

  const normalizedCandidates = normalizeCandidateProbabilities(candidates)
  const topProbability = normalizedCandidates[0]?.probability ?? 0
  const secondProbability = normalizedCandidates[1]?.probability ?? 0
  const probabilityGap = topProbability - secondProbability
  const entropy = computeEntropy(normalizedCandidates.map(candidate => candidate.probability))

  if (roundCount === 0) {
    return topProbability < 0.62 || probabilityGap < 0.22
  }

  if (topProbability >= 0.76 && probabilityGap >= 0.3) return false
  if (topProbability < 0.55) return true
  if (probabilityGap < 0.18) return true
  if (entropy > 0.85) return true

  return pendingQuestionCount > 0 && roundCount < 2
}

module.exports = {
  chooseNextQuestion,
  shouldContinueAsking,
  getTriggeredQuestions,
  getRelevantConditionQuestionIds
}
