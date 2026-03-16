'use strict'

const { followUpQuestions } = require('./data/questions')
const { diagnosisRules } = require('./data/rules')

function getCandidateRules(candidateRuleIds) {
  return diagnosisRules.filter(rule => candidateRuleIds.includes(rule.id))
}

function computeQuestionImpact(candidateRuleIds, questionId) {
  const rules = getCandidateRules(candidateRuleIds)
  const values = []

  for (const rule of rules) {
    const mapping = rule.conditions?.[questionId]
    if (!mapping) continue
    values.push(...Object.values(mapping))
  }

  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
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

function chooseNextQuestion(userSymptoms, answeredConditions, candidateRuleIds) {
  const available = getTriggeredQuestions(userSymptoms, candidateRuleIds).filter(
    question => answeredConditions[question.id] === undefined
  )

  if (available.length === 0) return null

  const rankedQuestions = available
    .map(question => ({
      question,
      impact: computeQuestionImpact(candidateRuleIds, question.id)
    }))
    .sort((a, b) => {
      if (b.impact !== a.impact) return b.impact - a.impact
      return a.question.options.length - b.question.options.length
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

  const topScore = candidates[0]?.score ?? 0
  const scoreGap = candidates.length >= 2 ? topScore - (candidates[1]?.score ?? 0) : topScore

  if (roundCount === 0) {
    return topScore < 72 || scoreGap < 18
  }

  if (topScore >= 78 && scoreGap >= 20) return false
  if (topScore < 58) return true
  if (scoreGap < 15) return true

  return pendingQuestionCount > 0 && roundCount < 2
}

module.exports = {
  chooseNextQuestion,
  shouldContinueAsking,
  getTriggeredQuestions,
  getRelevantConditionQuestionIds
}
