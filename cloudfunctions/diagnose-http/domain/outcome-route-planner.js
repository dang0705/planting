'use strict'

const {
  ROUTE_MODE,
  ROUTE_STATUS,
  GATE_RESULT
} = require('../constants/outcome-route')
const { evaluateOutcomeRouteGate } = require('./outcome-gate-evaluator')
const {
  buildFallbackDecision,
  buildRouteDecisionCause,
  buildRouteEvidenceContext,
  collectVisualRouteSymptomKeys,
  dedupeKeys,
  isGateContradictedByAnsweredSplit,
  normalizeKey,
  sortCandidateStates
} = require('./outcome-route-planner-helpers')
const {
  isDisabledYellowingFlowQuestion
} = require('../utils/yellowing-question-policy')

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
  const candidateOutcomeOrderMap = new Map(
    normalizedCandidateOutcomeKeys.map((outcomeKey, index) => [outcomeKey, index])
  )
  if (!normalizedCandidateOutcomeKeys.length) {
    return buildFallbackDecision({
      candidateOutcomeKeys: [],
      candidateOutcomes: [],
      decisionCauseKey: 'route_fallback_no_candidates',
      decisionCauseText: '缺少候选 outcome，转保守不确定输出'
    })
  }

  const routePlanningEnabled = featureFlags.routePlanningEnabled === true
  if (!routePlanningEnabled) {
    return buildFallbackDecision({
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      candidateOutcomes: normalizedCandidateOutcomeKeys.map(problemKey => ({ problemKey })),
      decisionCauseKey: 'route_planning_disabled',
      decisionCauseText: 'route 规划未启用，转保守不确定输出'
    })
  }

  try {
    const activeSymptomKeySet = routeEvidenceContext?.activeSymptomKeySet || new Set()
    const skipRouteGroupExpansion = featureFlags.skipRouteGroupExpansion === true
    const routeGroupCandidates = !skipRouteGroupExpansion &&
      typeof effectiveRouteRepository.getAllActiveOutcomeRouteGroups === 'function'
      ? await effectiveRouteRepository.getAllActiveOutcomeRouteGroups()
      : []
    const symptomMatchedRouteGroups = skipRouteGroupExpansion
      ? []
      : routeGroupCandidates.filter(group =>
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
        candidateOutcomes: expandedCandidateOutcomeKeys.map(problemKey => ({ problemKey })),
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
      const routeGateStates = matchedRouteKeys.map(routeKey => {
        const routeGateResults = gateResultsByRouteKey.get(routeKey) || []
        const routeGates = matchedGates.filter(gate => normalizeKey(gate.routeKey) === routeKey)
        const hasContradictedSplit = routeGates.some(gate =>
          isGateContradictedByAnsweredSplit(gate, routeEvidenceContext)
        )
        const hasRawBlocker =
          hasContradictedSplit ||
          routeGateResults.some(item => item.result === GATE_RESULT.BLOCK)
        const hasPass = routeGateResults.some(item => item.result === GATE_RESULT.PASS)
        return {
          routeKey,
          hasRawBlocker,
          hasPass
        }
      })
      const passedRouteKeys = routeGateStates
        .filter(item => item.hasPass && !item.hasRawBlocker)
        .map(item => item.routeKey)
      const hasRawBlocker = routeGateStates.some(item => item.hasRawBlocker)
      const hasPass = passedRouteKeys.length > 0
      const hasBlocker = hasRawBlocker && !hasPass
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
          targetDimension: normalizeKey(item.targetDimension || item.target_dimension),
          targetSymptomKey: normalizeKey(item.targetSymptomKey || item.target_symptom_key),
          questionTextUserCn: normalizeKey(item.questionTextUserCn || item.question_text_user_cn),
          routeKey,
          gateKey: normalizeKey(item.gateKey),
          outcomeKey,
          questionRole: normalizeKey(item.questionRole),
          askPriority: Number(item.askPriority || 0),
          stepNo: Number(item.stepNo || 0),
          requiredForClosure: Boolean(item.requiredForClosure)
        })).filter(item =>
          item.questionKey &&
          !answeredQuestionKeySet.has(item.questionKey) &&
          !isDisabledYellowingFlowQuestion(item)
        )
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
        const passedRouteKeySet = new Set(passedRouteKeys)
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
        const orderA = Number(candidateOutcomeOrderMap.get(a.outcomeKey) ?? Number.MAX_SAFE_INTEGER)
        const orderB = Number(candidateOutcomeOrderMap.get(b.outcomeKey) ?? Number.MAX_SAFE_INTEGER)
        if (orderA !== orderB) {return orderA - orderB}
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
    const sortedStates = sortCandidateStates(candidateOutcomeStates, candidateOutcomeOrderMap)
    const sortedVisibleOutcomeKeys = dedupeKeys(visibleOutcomeKeys).sort((a, b) => {
      const orderA = Number(candidateOutcomeOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER)
      const orderB = Number(candidateOutcomeOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER)
      if (orderA !== orderB) {return orderA - orderB}
      return a.localeCompare(b)
    })
    const activeRouteGroupVisibleLimits = routeGroups
      .map(item => Number(item.maxVisibleOutcomes || maxVisibleOutcomes))
      .filter(value => Number.isFinite(value) && value > 0)
    const groupVisibleLimit = activeRouteGroupVisibleLimits.length
      ? Math.max(...activeRouteGroupVisibleLimits)
      : Number(maxVisibleOutcomes || 3)
    const limitedVisibleOutcomeKeys = sortedVisibleOutcomeKeys.slice(
      0,
      Math.max(1, Math.min(groupVisibleLimit, Number(maxVisibleOutcomes || 3)))
    )

    const limitedActionConflictGroups = limitedVisibleOutcomeKeys
      .map(outcomeKey => visibleActionConflictGroupByOutcome.get(outcomeKey))
      .filter(Boolean)
    const hasActionConflict = dedupeKeys(limitedActionConflictGroups).length > 1
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
  } catch (error) {
    console.error('diagnose-http outcome route planning failed:', {
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      message: String(error?.message || error || ''),
      stack: String(error?.stack || '')
    })
    return buildFallbackDecision({
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      candidateOutcomes: normalizedCandidateOutcomeKeys.map(problemKey => ({ problemKey })),
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
