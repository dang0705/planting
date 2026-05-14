'use strict'

const {
  ROUTE_MODE,
  ROUTE_STATUS,
  GATE_RESULT,
  ROUTE_FALLBACK_POLICY
} = require('../constants/outcome-route')
const { evaluateOutcomeRouteGate } = require('./outcome-gate-evaluator')

function normalizeKey(value = '') {
  return String(value || '').trim()
}

const ROUTE_SYMPTOM_KEY_ALIASES = {
  yellow_leaf: 'leaf_yellowing',
  yellow_leaves: 'leaf_yellowing'
}

function expandRouteSymptomKeys(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) {return []}

  const candidates = [normalized]
  const alias = ROUTE_SYMPTOM_KEY_ALIASES[normalized]
  if (alias) {
    candidates.push(alias)
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

async function planOutcomeRoutes({
  candidateOutcomeKeys = [],
  routeEvidenceContext = {},
  routeRepository = null,
  maxVisibleOutcomes = 3,
  maxQuestionCount = 1,
  canAskAnotherFollowUpRound = false,
  featureFlags = {}
} = {}) {
  const effectiveRouteRepository = routeRepository || require('../repositories/outcome-route-repository')
  const normalizedCandidateOutcomeKeys = dedupeKeys(candidateOutcomeKeys)
  const rankingIndex = routeEvidenceContext?.rankingIndex || {}
  if (!normalizedCandidateOutcomeKeys.length) {
    return buildFallbackDecision({
      candidateOutcomeKeys: [],
      rankings: [],
      decisionCauseKey: 'route_fallback_no_candidates',
      decisionCauseText: '缺少候选 outcome，转保守不确定输出'
    })
  }

  const routePlanningEnabled = featureFlags.routePlanningEnabled === true
  if (!routePlanningEnabled) {
    return buildFallbackDecision({
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      rankings: Object.entries(rankingIndex)
        .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))
        .map(([problemKey]) => ({ problemKey })),
      decisionCauseKey: 'route_planning_disabled',
      decisionCauseText: 'route 规划未启用，转保守不确定输出'
    })
  }

  try {
    const activeSymptomKeySet = routeEvidenceContext?.activeSymptomKeySet || new Set()
    const routeGroupCandidates = typeof effectiveRouteRepository.getAllActiveOutcomeRouteGroups === 'function'
      ? await effectiveRouteRepository.getAllActiveOutcomeRouteGroups()
      : []
    const symptomMatchedRouteGroups = routeGroupCandidates.filter(group =>
      Array.isArray(group?.entrySymptomKeys) &&
      group.entrySymptomKeys.some(symptomKey => activeSymptomKeySet.has(symptomKey))
    )
    const symptomMatchedOutcomeKeys = dedupeKeys(
      symptomMatchedRouteGroups.flatMap(group => group?.candidateOutcomeKeys || [])
    )
    const expandedCandidateOutcomeKeys = symptomMatchedOutcomeKeys.length
      ? symptomMatchedOutcomeKeys
      : normalizedCandidateOutcomeKeys
    const routes = await effectiveRouteRepository.getOutcomeRoutesByOutcomeKeys(expandedCandidateOutcomeKeys)
    if (!routes.length) {
      return buildFallbackDecision({
        candidateOutcomeKeys: expandedCandidateOutcomeKeys,
        rankings: Object.entries(rankingIndex)
          .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))
          .map(([problemKey]) => ({ problemKey })),
        decisionCauseKey: 'route_fallback_no_routes',
        decisionCauseText: '未命中可用 route，转保守不确定输出'
      })
    }

    const routeKeys = dedupeKeys(routes.map(item => item.routeKey))
    const routeGroupKeys = dedupeKeys(routes.map(item => item.routeGroupKey))
    const [gates, routeQuestions, routeGroups] = await Promise.all([
      effectiveRouteRepository.getOutcomeRouteGates(routeKeys),
      effectiveRouteRepository.getOutcomeRouteQuestions(routeKeys),
      routeGroupCandidates.length
        ? Promise.resolve(routeGroupCandidates.filter(item => routeGroupKeys.includes(normalizeKey(item.routeGroupKey))))
        : effectiveRouteRepository.getOutcomeRouteGroupsByKeys(routeGroupKeys)
    ])

    const gateResults = gates.map(gate =>
      evaluateOutcomeRouteGate({
        gate,
        routeEvidenceContext,
        canAskAnotherFollowUpRound
      })
    )
    const gateResultsByRouteKey = new Map()
    for (const gateResult of gateResults) {
      const routeKey = normalizeKey(gateResult.routeKey)
      if (!routeKey) {continue}
      if (!gateResultsByRouteKey.has(routeKey)) {
        gateResultsByRouteKey.set(routeKey, [])
      }
      gateResultsByRouteKey.get(routeKey).push(gateResult)
    }

    const routeQuestionsByRouteKey = new Map()
    for (const row of routeQuestions) {
      const routeKey = normalizeKey(row.routeKey)
      if (!routeKey) {continue}
      if (!routeQuestionsByRouteKey.has(routeKey)) {
        routeQuestionsByRouteKey.set(routeKey, [])
      }
      routeQuestionsByRouteKey.get(routeKey).push(row)
    }
    const answeredQuestionKeySet = routeEvidenceContext?.answeredQuestionKeySet || new Set()

    const routeGroupMap = new Map(routeGroups.map(item => [normalizeKey(item.routeGroupKey), item]))
    const candidateOutcomeStates = []
    const blockedOutcomeKeys = []
    const visibleOutcomeKeys = []
    const nextQuestionCandidates = []
    const routeTrace = []
    const conflictingOutcomePairs = []
    const visibleActionProfileByOutcome = new Map()
    const visibleActionConflictGroupByOutcome = new Map()

    for (const outcomeKey of expandedCandidateOutcomeKeys) {
      const matchedRoutes = routes.filter(item => normalizeKey(item.outcomeKey) === outcomeKey)
      const matchedRouteKeys = dedupeKeys(matchedRoutes.map(item => item.routeKey))
      const matchedGates = gates.filter(gate => matchedRouteKeys.includes(normalizeKey(gate.routeKey)))
      const matchedGateResults = matchedRouteKeys.flatMap(routeKey => gateResultsByRouteKey.get(routeKey) || [])
      const hasContradictedSplit = matchedGates.some(gate =>
        isGateContradictedByAnsweredSplit(gate, routeEvidenceContext)
      )
      const hasBlocker =
        hasContradictedSplit ||
        matchedGateResults.some(item => item.result === GATE_RESULT.BLOCK)
      const hasPass = matchedGateResults.some(item => item.result === GATE_RESULT.PASS)
      const hasNeedMoreInfo = matchedGateResults.some(item => item.result === GATE_RESULT.NEED_MORE_INFO)
      const missingGateKeys = dedupeKeys(
        matchedGateResults
          .filter(item => item.result === GATE_RESULT.NEED_MORE_INFO || item.result === GATE_RESULT.FAIL)
          .map(item => item.gateKey)
      )
      const candidateQuestions = matchedRouteKeys.flatMap(routeKey => {
        const routeQuestionRows = routeQuestionsByRouteKey.get(routeKey) || []
        const relevantRows = routeQuestionRows.filter(item => {
          const gateKey = normalizeKey(item.gateKey)
          return !gateKey || missingGateKeys.includes(gateKey)
        })
        const rowsToUse = relevantRows.length ? relevantRows : routeQuestionRows
        return rowsToUse.map(item => ({
          questionKey: normalizeKey(item.questionKey),
          routeKey,
          gateKey: normalizeKey(item.gateKey),
          outcomeKey,
          questionRole: normalizeKey(item.questionRole),
          askPriority: Number(item.askPriority || 0),
          stepNo: Number(item.stepNo || 0),
          requiredForClosure: Boolean(item.requiredForClosure)
        })).filter(item => item.questionKey && !answeredQuestionKeySet.has(item.questionKey))
      })

      if (hasNeedMoreInfo && !hasBlocker) {
        nextQuestionCandidates.push(...candidateQuestions)
      }

      const state = hasBlocker
        ? ROUTE_STATUS.BLOCKED
        : hasNeedMoreInfo
          ? ROUTE_STATUS.NEEDS_QUESTION
          : hasPass
            ? ROUTE_STATUS.DISPLAY_ELIGIBLE
            : ROUTE_STATUS.CANDIDATE

      if (hasBlocker) {
        blockedOutcomeKeys.push(outcomeKey)
      } else if (hasPass) {
        visibleOutcomeKeys.push(outcomeKey)
        const passedRouteKeySet = new Set(
          matchedGateResults
            .filter(item => item.result === GATE_RESULT.PASS)
            .map(item => normalizeKey(item.routeKey))
            .filter(Boolean)
        )
        const actionSourceRoutes = matchedRoutes.filter(route =>
          passedRouteKeySet.has(normalizeKey(route.routeKey))
        )
        const matchedActionRoutes = actionSourceRoutes.length ? actionSourceRoutes : matchedRoutes
        for (const matchedRoute of matchedRoutes) {
          const actionProfileKey = normalizeKey(matchedRoute.actionProfileKey)
          const actionConflictGroup = normalizeKey(matchedRoute.actionConflictGroup)
          if (
            actionProfileKey &&
            !visibleActionProfileByOutcome.has(outcomeKey) &&
            matchedActionRoutes.some(route => normalizeKey(route.routeKey) === normalizeKey(matchedRoute.routeKey))
          ) {
            visibleActionProfileByOutcome.set(outcomeKey, actionProfileKey)
          }
          if (
            actionConflictGroup &&
            !visibleActionConflictGroupByOutcome.has(outcomeKey) &&
            matchedActionRoutes.some(route => normalizeKey(route.routeKey) === normalizeKey(matchedRoute.routeKey))
          ) {
            visibleActionConflictGroupByOutcome.set(outcomeKey, actionConflictGroup)
          }
        }
      }

      candidateOutcomeStates.push({
        outcomeKey,
        state,
        routeKeys: matchedRouteKeys,
        missingGateKeys,
        nextQuestionKeys: dedupeKeys(candidateQuestions.map(item => item.questionKey))
      })

      routeTrace.push({
        outcomeKey,
        routeKeys: matchedRouteKeys,
        gateResults: matchedGateResults.map(item => ({
          gateKey: item.gateKey,
          gateRole: item.gateRole,
          result: item.result
        }))
      })
    }

    for (const gate of gates) {
      const conflictOutcomeKeys = dedupeKeys(gate.conflictOutcomeKeys)
      if (conflictOutcomeKeys.length < 2) {continue}
      conflictingOutcomePairs.push(conflictOutcomeKeys.slice(0, 2))
    }

    const nextQuestions = nextQuestionCandidates
      .sort((a, b) => {
        const priorityA = Number(a.askPriority || 0)
        const priorityB = Number(b.askPriority || 0)
        if (priorityA !== priorityB) {return priorityB - priorityA}
        if (Boolean(a.requiredForClosure) !== Boolean(b.requiredForClosure)) {
          return a.requiredForClosure ? -1 : 1
        }
        const stepA = Number(a.stepNo || 0)
        const stepB = Number(b.stepNo || 0)
        if (stepA !== stepB) {return stepA - stepB}
        const rankA = Number(rankingIndex[a.outcomeKey] || Number.MAX_SAFE_INTEGER)
        const rankB = Number(rankingIndex[b.outcomeKey] || Number.MAX_SAFE_INTEGER)
        if (rankA !== rankB) {return rankA - rankB}
        return String(a.questionKey || '').localeCompare(String(b.questionKey || ''))
      })
      .filter((item, index, list) =>
        index === list.findIndex(candidate => candidate.questionKey === item.questionKey)
      )
      .slice(0, Math.max(0, Number(maxQuestionCount || 1)))
    const nextQuestionKeys = dedupeKeys(nextQuestions.map(item => item.questionKey)).slice(
      0,
      Math.max(0, Number(maxQuestionCount || 1))
    )
    const sortedStates = sortCandidateStates(candidateOutcomeStates, rankingIndex)
    const sortedVisibleOutcomeKeys = dedupeKeys(visibleOutcomeKeys).sort((a, b) => {
      const rankA = Number(rankingIndex[a] || Number.MAX_SAFE_INTEGER)
      const rankB = Number(rankingIndex[b] || Number.MAX_SAFE_INTEGER)
      if (rankA !== rankB) {return rankA - rankB}
      return a.localeCompare(b)
    })
    const groupVisibleLimit = routeGroups.length
      ? Math.max(
          1,
          Math.min(
            ...routeGroups
              .map(item => Number(item.maxVisibleOutcomes || maxVisibleOutcomes))
              .filter(value => Number.isFinite(value) && value > 0)
          )
        )
      : Number(maxVisibleOutcomes || 3)
    const limitedVisibleOutcomeKeys = sortedVisibleOutcomeKeys.slice(
      0,
      Math.max(1, Math.min(groupVisibleLimit, Number(maxVisibleOutcomes || 3)))
    )

    const limitedActionConflictGroups = limitedVisibleOutcomeKeys
      .map(outcomeKey => visibleActionConflictGroupByOutcome.get(outcomeKey))
      .filter(Boolean)
    const hasActionConflict = dedupeKeys(limitedActionConflictGroups).length > 1
    const primaryOutcomeKey = hasActionConflict ? null : (limitedVisibleOutcomeKeys[0] || null)
    const secondaryOutcomeKeys = hasActionConflict ? [] : limitedVisibleOutcomeKeys.slice(1, 3)
    const limitedVisibleOutcomeCount = limitedVisibleOutcomeKeys.length
    const hasRequiredNextQuestion = nextQuestions.some(item => Boolean(item?.requiredForClosure))
    const requiresFollowUp = Boolean(
      canAskAnotherFollowUpRound &&
      nextQuestionKeys.length &&
      (hasRequiredNextQuestion || limitedVisibleOutcomeCount < 1 || hasActionConflict)
    )

    const activeRouteGroupKeys = dedupeKeys(
      routes
        .map(item => item.routeGroupKey)
        .filter(routeGroupKey => routeGroupMap.has(routeGroupKey))
    )

    return {
      mode: ROUTE_MODE.MULTI_OUTCOME_ROUTE,
      candidateOutcomeStates: sortedStates,
      activeRouteGroupKeys,
      visibleOutcomeKeys: limitedVisibleOutcomeKeys,
      primaryOutcomeKey,
      secondaryOutcomeKeys,
      requiresFollowUp,
      nextQuestionKeys: requiresFollowUp ? nextQuestionKeys : [],
      nextQuestions: requiresFollowUp ? nextQuestions : [],
      gateResults,
      blockedOutcomeKeys: dedupeKeys(blockedOutcomeKeys),
      conflictingOutcomePairs: dedupeKeys(conflictingOutcomePairs.map(item => item.join('::')))
        .map(item => item.split('::'))
        .filter(item => item.length === 2),
      visibleActionProfileKeys: dedupeKeys(limitedVisibleOutcomeKeys
        .map(outcomeKey => visibleActionProfileByOutcome.get(outcomeKey))
        .filter(Boolean)
      ),
      visibleActionConflictGroups: dedupeKeys(limitedActionConflictGroups),
      routeTrace,
      fallbackPolicy: '',
      decisionCause: buildRouteDecisionCause({
        decisionCauseKey: hasActionConflict
          ? 'route_action_conflict_unresolved'
          : limitedVisibleOutcomeCount < 1
            ? 'route_no_visible_outcomes_for_route'
            : 'route_visible_outcomes_ready',
        decisionCauseText: hasActionConflict
          ? (
              requiresFollowUp
                ? '候选方向的行动建议存在冲突，先继续追问分流。'
                : '候选方向的行动建议存在冲突，当前改为不确定并给出保守建议。'
            )
          : limitedVisibleOutcomeCount < 1
            ? '当前未命中可展示候选 outcome，需继续追问以收窄范围。'
            : 'route 已形成可展示 outcome。',
        details: {
          routeCount: routes.length,
          gateCount: gates.length,
          routeGroupCount: activeRouteGroupKeys.length,
          actionConflictGroups: dedupeKeys(limitedActionConflictGroups),
          symptomMatchedRouteGroupKeys: dedupeKeys(
            symptomMatchedRouteGroups.map(item => item?.routeGroupKey || '')
          )
        }
      }),
      lowConfidenceOverride: null
    }
  } catch {
    return buildFallbackDecision({
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      rankings: Object.entries(rankingIndex)
        .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))
        .map(([problemKey]) => ({ problemKey })),
      decisionCauseKey: 'route_query_error_fallback',
      decisionCauseText: 'route 查询失败，转保守不确定输出'
    })
  }
}

module.exports = {
  buildRouteEvidenceContext,
  collectVisualRouteSymptomKeys,
  planOutcomeRoutes,
  buildRouteDecisionCause
}
