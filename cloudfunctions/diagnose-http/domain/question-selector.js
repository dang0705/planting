'use strict'

const { ranking: rankingConfig, unknownFlow } = require('../constants/scoring')

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
      dataStatus: 'partial'
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

function selectFollowUpQuestions({
  rankings = [],
  strategies = [],
  questions = [],
  optionMappings = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const askedSet = new Set((askedQuestionKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  const questionMap = new Map((questions || []).map(item => [item.questionKey, item]))
  const optionMap = groupByQuestion(optionMappings)
  const scoreMap = new Map((rankings || []).map(item => [item.problemKey, Number(item.finalScore || item.baseScore || 0)]))

  const candidates = new Map()
  for (const strategy of strategies || []) {
    const question = questionMap.get(strategy.questionKey)
    if (!question) continue
    if (askedSet.has(question.questionKey)) continue

    const groupKey = question.questionGroupKey || strategy.questionGroupKey || '__default__'
    const unknownCount = Number(unknownCountByGroup[groupKey] || 0)
    const groupPenalty = unknownCount >= unknownFlow.groupUnknownThreshold ? 100 : 0

    const candidateScore =
      Number(strategy.priorityScore || 0) +
      Number(scoreMap.get(strategy.problemKey) || 0) * 100 -
      groupPenalty

    const existing = candidates.get(question.questionKey)
    if (!existing || candidateScore > existing.candidateScore) {
      candidates.set(question.questionKey, {
        ...question,
        candidateScore,
        questionGroupKey: groupKey,
        strategyProblemKey: strategy.problemKey
      })
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.candidateScore - a.candidateScore)
    .slice(0, Math.max(1, Number(maxQuestions || 3)))
    .map(item => ({
      questionKey: item.questionKey,
      questionText: item.questionTextUserCn || item.questionTextCn,
      helpText: item.helpTextCn || '',
      questionGroupKey: item.questionGroupKey,
      questionType: item.questionType || 'single_choice',
      options: ensureUnknownOption(optionMap.get(item.questionKey) || []).map(opt => ({
        optionKey: opt.optionKey,
        text: opt.optionTextUserCn || opt.optionTextCn || opt.optionKey
      })),
      whyThisQuestion: item.whyThisQuestionCn || ''
    }))
}

module.exports = {
  selectFollowUpQuestions
}
