'use strict'

const {
  ranking: rankingConfig,
  unknownFlow,
  followUpSelection
} = require('../constants/scoring')
const { projectObservedSymptomsFromEvidence } = require('./observed-evidence')

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

function buildObservedSymptomIndex(observedSymptoms = []) {
  const map = new Map()
  for (const item of observedSymptoms || []) {
    const symptomKey = String(item?.symptomKey || '').trim()
    if (!symptomKey) continue
    map.set(symptomKey, {
      confidence: Number(item?.confidence || 0),
      signalReliability: Number(item?.signalReliability || 0)
    })
  }
  return map
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

function selectFollowUpQuestions({
  rankings = [],
  strategies = [],
  questions = [],
  optionMappings = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  askedQuestionKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const effectiveObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms
  const askedSet = new Set((askedQuestionKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  const questionMap = new Map((questions || []).map(item => [item.questionKey, item]))
  const optionMap = groupByQuestion(optionMappings)
  const scoreMap = new Map((rankings || []).map(item => [item.problemKey, Number(item.finalScore || item.baseScore || 0)]))
  const observedSymptomMap = buildObservedSymptomIndex(effectiveObservedSymptoms)
  const blockedGroups = new Set(
    Object.entries(unknownCountByGroup || {})
      .filter(([, unknownCount]) => Number(unknownCount || 0) >= unknownFlow.groupUnknownThreshold)
      .map(([groupKey]) => String(groupKey || '').trim())
      .filter(Boolean)
  )
  const routeHintKeywords = collectRouteHintKeywords({
    visualRouteHints,
    suggestedFollowupCapture
  })

  const candidates = new Map()
  for (const strategy of strategies || []) {
    const question = questionMap.get(strategy.questionKey)
    if (!question) continue
    if (askedSet.has(question.questionKey)) continue

    const groupKey = question.questionGroupKey || strategy.questionGroupKey || '__default__'
    if (blockedGroups.has(groupKey)) {
      continue
    }
    const observedTarget = observedSymptomMap.get(String(question.targetSymptomKey || '').trim())
    const strongVisualLock =
      observedTarget &&
      observedTarget.confidence >= followUpSelection.visualLockThreshold &&
      observedTarget.signalReliability >= followUpSelection.highSpecificityThreshold
    const weakVisualOverlap = observedTarget && !strongVisualLock
    const nonRedundancyFactor = strongVisualLock
      ? 1 - followUpSelection.strongOverlapPenalty
      : weakVisualOverlap
        ? 1 - followUpSelection.weakOverlapPenalty
        : 1

    const candidateScore =
      (
        Number(strategy.priorityScore || 0) +
        Number(scoreMap.get(strategy.problemKey) || 0) * 100
      ) * nonRedundancyFactor +
      computeRouteHintQuestionBoost(question, {
        visualRoutePrimaryAction,
        routeHintKeywords
      })

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
      targetSymptomKey: item.targetSymptomKey || '',
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
