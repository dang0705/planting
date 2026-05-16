'use strict'

const {
  ROUTE_MODE,
  ROUTE_STATUS,
  ROUTE_FALLBACK_POLICY
} = require('../constants/outcome-route')

function normalizeKey(value = '') {
  return String(value || '').trim()
}

const ROUTE_SYMPTOM_KEY_ALIASES = {
  yellow_leaf: ['leaf_yellowing'],
  yellow_leaves: ['leaf_yellowing'],
  wilting_wet_soil: ['wilting', 'soil_wet'],
  wilting_dry_soil: ['wilting', 'soil_dry']
}

function expandRouteSymptomKeys(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) {return []}

  const candidates = [normalized]
  const aliases = ROUTE_SYMPTOM_KEY_ALIASES[normalized]
  if (Array.isArray(aliases)) {
    candidates.push(...aliases)
  } else if (aliases) {
    candidates.push(aliases)
  }
  if (normalized.startsWith('problematic_')) {
    candidates.push(normalized.slice('problematic_'.length))
  }
  if (normalized.startsWith('symptom_')) {
    candidates.push(normalized.slice('symptom_'.length))
  }
  return dedupeKeys(candidates)
}

function dedupeKeys(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(item => normalizeKey(item)).filter(Boolean))
  )
}

function collectVisualRouteSymptomKeys(visualAggregateResult = null) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return []
  }

  const aggregatedSymptomCandidates = Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
    ? visualAggregateResult.aggregated_symptom_candidates
    : Array.isArray(visualAggregateResult?.aggregatedSymptomCandidates)
      ? visualAggregateResult.aggregatedSymptomCandidates
      : []
  const admissionRecords = Array.isArray(visualAggregateResult?.admission_records)
    ? visualAggregateResult.admission_records
    : Array.isArray(visualAggregateResult?.admissionRecords)
      ? visualAggregateResult.admissionRecords
      : []
  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : Array.isArray(visualAggregateResult?.outOfPoolSymptomHints)
      ? visualAggregateResult.outOfPoolSymptomHints
      : []

  return dedupeKeys([
    ...aggregatedSymptomCandidates.flatMap(item =>
      expandRouteSymptomKeys(item?.symptom_key || item?.symptomKey || item?.key || '')
    ),
    ...admissionRecords
      .filter(item => {
        const admissionResult = normalizeKey(item?.admission_result || item?.admissionResult || '')
        return !admissionResult || admissionResult === 'candidate_retained' || admissionResult === 'admitted'
      })
      .flatMap(item =>
        expandRouteSymptomKeys(
          item?.object_key ||
            item?.objectKey ||
            item?.candidate?.symptom_key ||
            item?.candidate?.symptomKey ||
            ''
        )
      ),
    ...outOfPoolHints.flatMap(item =>
      expandRouteSymptomKeys(
        item?.symptom_key ||
          item?.symptomKey ||
          item?.closest_symptom_key_hint ||
          item?.closestSymptomKeyHint ||
          ''
      )
    )
  ])
}

function buildFallbackDecision({
  candidateOutcomeKeys = [],
  rankings = [],
  decisionCauseKey = 'route_fallback',
  decisionCauseText = 'route 未形成权威闭合，转保守不确定输出'
} = {}) {
  const rankedOutcomeKeys = dedupeKeys((Array.isArray(rankings) ? rankings : []).map(item => item.problemKey))
  const outcomeKeys = rankedOutcomeKeys.length ? rankedOutcomeKeys : candidateOutcomeKeys

  return {
    mode: ROUTE_MODE.MULTI_OUTCOME_ROUTE,
    candidateOutcomeStates: outcomeKeys.map(outcomeKey => ({
      outcomeKey,
      state: ROUTE_STATUS.CANDIDATE,
      routeKeys: [],
      missingGateKeys: [],
      nextQuestionKeys: []
    })),
    activeRouteGroupKeys: [],
    visibleOutcomeKeys: [],
    primaryOutcomeKey: null,
    secondaryOutcomeKeys: [],
    requiresFollowUp: false,
    nextQuestionKeys: [],
    nextQuestions: [],
    gateResults: [],
    blockedOutcomeKeys: [],
    conflictingOutcomePairs: [],
    visibleActionProfileKeys: [],
    visibleActionConflictGroups: [],
    routeTrace: [],
    fallbackPolicy: ROUTE_FALLBACK_POLICY.UNCERTAIN,
    decisionCause: {
      decisionCauseKey,
      decisionCauseCategory: 'route_fallback',
      decisionCauseText,
      decisionCauseDetails: {}
    },
    lowConfidenceOverride: null
  }
}

function buildRouteEvidenceContext({
  plantContext = {},
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  symptomClassRuntime = null,
  answerEffects = [],
  routeAnswerEffects = [],
  answers = [],
  askedQuestionKeys = [],
  visualAggregateResult = null,
  routeHints = [],
  rankings = []
} = {}) {
  const safeObservedEvidenceSet = Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []
  const safeDerivedEvidenceSet = Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : []
  const safeDiagnosisDirections = Array.isArray(diagnosisDirections) ? diagnosisDirections : []
  const safeAnswerEffects = Array.isArray(answerEffects) ? answerEffects : []
  const safeAnswers = Array.isArray(answers) ? answers : []

  const visualRouteSymptomKeys = collectVisualRouteSymptomKeys(visualAggregateResult)
  const activeSymptomKeys = dedupeKeys([
    ...safeObservedEvidenceSet
      .filter(item =>
        Number(item?.enteredRuntime ?? item?.entered_runtime ?? 1) === 1 &&
        normalizeKey(item?.currentStatus || item?.current_status || 'active') !== 'superseded'
      )
      .flatMap(item => expandRouteSymptomKeys(item?.symptomKey || item?.symptom_key || '')),
    ...visualRouteSymptomKeys
  ])
  const derivedEvidenceKeys = dedupeKeys(
    safeDerivedEvidenceSet.map(item => item?.derivedSymptomKey || item?.symptomKey || item?.key || '')
  )
  const diagnosisDirectionKeys = dedupeKeys(
    safeDiagnosisDirections.map(item => item?.directionKey || item?.direction_key || item?.key || '')
  )
  const answeredQuestionKeys = dedupeKeys([
    ...safeAnswers.map(item => item?.questionKey || item?.question_key || ''),
    ...(Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
  ])
  const answeredOptionKeys = dedupeKeys(
    safeAnswers.map(item => item?.optionKey || item?.option_key || '')
  )
  const answeredQuestionOptionPairs = dedupeKeys(
    safeAnswers.map(item => {
      const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
      const optionKey = normalizeKey(item?.optionKey || item?.option_key || '')
      return questionKey && optionKey ? `${questionKey}:${optionKey}` : ''
    })
  )
  const answeredQuestionOptionPairSet = new Set(answeredQuestionOptionPairs)
  const matchedRouteAnswerEffects = dedupeKeys(
    (Array.isArray(routeAnswerEffects) ? routeAnswerEffects : [])
      .filter(item => {
        const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
        const optionKey = normalizeKey(item?.optionKey || item?.option_key || '')
        if (!questionKey || !optionKey) {return false}
        return answeredQuestionOptionPairSet.has(`${questionKey}:${optionKey}`)
      })
      .map(item =>
        JSON.stringify({
          questionKey: normalizeKey(item?.questionKey || item?.question_key || ''),
          optionKey: normalizeKey(item?.optionKey || item?.option_key || ''),
          outcomeKey: normalizeKey(item?.outcomeKey || item?.outcome_key || ''),
          routeKey: normalizeKey(item?.routeKey || item?.route_key || ''),
          effectType: normalizeKey(item?.effectType || item?.effect_type || '').toLowerCase()
        })
      )
  ).map(item => JSON.parse(item))
  const answerEffectTypeSet = new Set(
    dedupeKeys([
      ...safeAnswerEffects.map(item => normalizeKey(item?.effectType || '').toLowerCase()),
      ...matchedRouteAnswerEffects.map(item => normalizeKey(item?.effectType || '').toLowerCase())
    ])
  )
  const rankingIndex = Object.fromEntries(
    (Array.isArray(rankings) ? rankings : [])
      .map((item, index) => [normalizeKey(item?.problemKey || ''), index + 1])
      .filter(([key]) => Boolean(key))
  )

  return {
    plantContext,
    activeSymptomKeys,
    activeSymptomKeySet: new Set(activeSymptomKeys),
    derivedEvidenceKeys,
    derivedEvidenceKeySet: new Set(derivedEvidenceKeys),
    diagnosisDirectionKeys,
    diagnosisDirectionKeySet: new Set(diagnosisDirectionKeys),
    symptomClassKeySet: new Set(
      dedupeKeys([
        symptomClassRuntime?.currentClassKey,
        symptomClassRuntime?.primaryClass?.classKey,
        symptomClassRuntime?.classGateDecision?.currentClassKey
      ])
    ),
    answerEffects: safeAnswerEffects,
    routeAnswerEffects: matchedRouteAnswerEffects,
    answeredQuestionKeys,
    answeredQuestionKeySet: new Set(answeredQuestionKeys),
    answeredOptionKeys,
    answeredOptionKeySet: new Set(answeredOptionKeys),
    answeredQuestionOptionPairs,
    answeredQuestionOptionPairSet,
    answerEffectTypeSet,
    routeAnswerEffectOutcomeKeySet: new Set(
      dedupeKeys(matchedRouteAnswerEffects.map(item => item.outcomeKey))
    ),
    routeAnswerEffectRouteKeySet: new Set(
      dedupeKeys(matchedRouteAnswerEffects.map(item => item.routeKey))
    ),
    visualRouteHints: Array.isArray(routeHints) ? routeHints : [],
    visualRouteSymptomKeys,
    visualAggregateResult,
    rankingIndex
  }
}

function buildRouteDecisionCause({
  decisionCauseKey = '',
  decisionCauseText = '',
  details = {}
} = {}) {
  return {
    decisionCauseKey: normalizeKey(decisionCauseKey),
    decisionCauseCategory: 'outcome_route',
    decisionCauseText: String(decisionCauseText || '').trim(),
    decisionCauseDetails: details && typeof details === 'object' ? details : {}
  }
}

function normalizeQuestionOptionPairs(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeKey(item)).filter(Boolean)
  }
  if (!value && value !== 0) {return []}
  return String(value)
    .split(',')
    .map(item => normalizeKey(item))
    .filter(Boolean)
}

function splitQuestionOptionPair(pair = '') {
  const [questionKey, ...optionParts] = String(pair || '').split(':')
  return {
    questionKey: normalizeKey(questionKey),
    optionKey: normalizeKey(optionParts.join(':'))
  }
}

function isGateContradictedByAnsweredSplit(gate = {}, routeEvidenceContext = {}) {
  const answeredQuestionKeySet = routeEvidenceContext?.answeredQuestionKeySet || new Set()
  const answeredQuestionOptionPairSet = routeEvidenceContext?.answeredQuestionOptionPairSet || new Set()
  const requiredPairs = normalizeQuestionOptionPairs(gate?.requiredAnswerEffects?.questionOptionPairs)

  return requiredPairs.some(pair => {
    const { questionKey } = splitQuestionOptionPair(pair)
    return questionKey &&
      answeredQuestionKeySet.has(questionKey) &&
      !answeredQuestionOptionPairSet.has(pair)
  })
}

function sortCandidateStates(states = [], rankingIndex = {}) {
  const safeStates = Array.isArray(states) ? states : []
  return safeStates.sort((a, b) => {
    const rankA = Number(rankingIndex[a.outcomeKey] || Number.MAX_SAFE_INTEGER)
    const rankB = Number(rankingIndex[b.outcomeKey] || Number.MAX_SAFE_INTEGER)
    if (rankA !== rankB) {return rankA - rankB}
    return String(a.outcomeKey || '').localeCompare(String(b.outcomeKey || ''))
  })
}

module.exports = {
  buildFallbackDecision,
  buildRouteDecisionCause,
  buildRouteEvidenceContext,
  collectVisualRouteSymptomKeys,
  dedupeKeys,
  isGateContradictedByAnsweredSplit,
  normalizeKey,
  sortCandidateStates
}
