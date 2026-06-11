'use strict'

const {
  ROUTE_MODE,
  ROUTE_STATUS,
  CONDITION_RESULT
} = require('../constants/outcome-route')
const { evaluateOutcomeRouteCondition } = require('./outcome-condition-evaluator')
const {
  buildConservativeDecision,
  buildRouteDecisionCause,
  buildRouteEvidenceContext,
  collectVisualRouteSymptomKeys,
  dedupeKeys,
  isConditionContradictedByAnsweredSplit,
  normalizeKey,
  sortCandidateStates
} = require('./outcome-route-planner-helpers')
const {
  filterYellowingCareEnvironmentCandidateOutcomeKeys,
  isDisallowedYellowingCareEnvironmentQuestion,
  isDisabledYellowingFlowQuestion,
  isYellowingFlowSymptomKey
} = require('../utils/yellowing-question-policy')

function shouldApplyYellowingCareOutcomeGuard(routeEvidenceContext = {}) {
  const symptomClassKeySet = routeEvidenceContext?.symptomClassKeySet || new Set()
  if (symptomClassKeySet.has('yellowing_mode')) {
    return true
  }

  const activeSymptomKeys = Array.isArray(routeEvidenceContext?.activeSymptomKeys)
    ? routeEvidenceContext.activeSymptomKeys
    : []
  return Boolean(
    activeSymptomKeys.length &&
    activeSymptomKeys.every(isYellowingFlowSymptomKey)
  )
}

async function planOutcomeRoutes({
  candidateOutcomeKeys = [],
  routeEvidenceContext = {},
  routeRepository = null,
  maxVisibleOutcomes = 3,
  maxQuestionCount = 1,
  featureFlags = {}
} = {}) {
  const effectiveRouteRepository = routeRepository || require('../repositories/outcome-route-repository')
  const rawCandidateOutcomeKeys = dedupeKeys(candidateOutcomeKeys)
  const normalizedCandidateOutcomeKeys = shouldApplyYellowingCareOutcomeGuard(routeEvidenceContext)
    ? filterYellowingCareEnvironmentCandidateOutcomeKeys(rawCandidateOutcomeKeys)
    : rawCandidateOutcomeKeys
  const candidateOutcomeOrderMap = new Map(
    normalizedCandidateOutcomeKeys.map((outcomeKey, index) => [outcomeKey, index])
  )
  if (!normalizedCandidateOutcomeKeys.length) {
    return buildConservativeDecision({
      candidateOutcomeKeys: [],
      candidateOutcomes: [],
      decisionCauseKey: 'route_conservative_no_candidates',
      decisionCauseText: '缺少候选 outcome，转保守不确定输出'
    })
  }

  const routePlanningEnabled = featureFlags.routePlanningEnabled === true
  if (!routePlanningEnabled) {
    return buildConservativeDecision({
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
      return buildConservativeDecision({
        candidateOutcomeKeys: expandedCandidateOutcomeKeys,
        candidateOutcomes: expandedCandidateOutcomeKeys.map(problemKey => ({ problemKey })),
        decisionCauseKey: 'route_conservative_no_routes',
        decisionCauseText: '未命中可用 route，转保守不确定输出'
      })
    }

    const routeKeys = dedupeKeys(routes.map(item => item.routeKey))
    const routeGroupKeys = dedupeKeys(routes.map(item => item.routeGroupKey))
    const [conditions, routeQuestions, routeGroups] = await Promise.all([
      effectiveRouteRepository.getOutcomeRouteConditions(routeKeys),
      effectiveRouteRepository.getOutcomeRouteQuestions(routeKeys),
      routeGroupCandidates.length
        ? Promise.resolve(routeGroupCandidates.filter(item => routeGroupKeys.includes(normalizeKey(item.routeGroupKey))))
        : effectiveRouteRepository.getOutcomeRouteGroupsByKeys(routeGroupKeys)
    ])

    const conditionResults = conditions.map(condition =>
      evaluateOutcomeRouteCondition({
        condition,
        routeEvidenceContext
      })
    )
    const conditionResultsByRouteKey = new Map()
    for (const conditionResult of conditionResults) {
      const routeKey = normalizeKey(conditionResult.routeKey)
      if (!routeKey) {continue}
      if (!conditionResultsByRouteKey.has(routeKey)) {
        conditionResultsByRouteKey.set(routeKey, [])
      }
      conditionResultsByRouteKey.get(routeKey).push(conditionResult)
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
      const matchedConditions = conditions.filter(condition => matchedRouteKeys.includes(normalizeKey(condition.routeKey)))
      const matchedConditionResults = matchedRouteKeys.flatMap(routeKey => conditionResultsByRouteKey.get(routeKey) || [])
      const routeConditionStates = matchedRouteKeys.map(routeKey => {
        const routeConditionResults = conditionResultsByRouteKey.get(routeKey) || []
        const routeConditions = matchedConditions.filter(condition => normalizeKey(condition.routeKey) === routeKey)
        const hasContradictedSplit = routeConditions.some(condition =>
          isConditionContradictedByAnsweredSplit(condition, routeEvidenceContext)
        )
        const hasRawBlocker =
          hasContradictedSplit ||
          routeConditionResults.some(item => item.result === CONDITION_RESULT.BLOCK)
        const hasPass = routeConditionResults.some(item => item.result === CONDITION_RESULT.PASS)
        return {
          routeKey,
          hasRawBlocker,
          hasPass
        }
      })
      const passedRouteKeys = routeConditionStates
        .filter(item => item.hasPass && !item.hasRawBlocker)
        .map(item => item.routeKey)
      const hasRawBlocker = routeConditionStates.some(item => item.hasRawBlocker)
      const hasPass = passedRouteKeys.length > 0
      const hasBlocker = hasRawBlocker && !hasPass
      const missingConditionKeys = dedupeKeys(
        matchedConditionResults
          .filter(item => item.result === CONDITION_RESULT.FAIL)
          .map(item => item.conditionKey)
      )
      const candidateQuestions = matchedRouteKeys.flatMap(routeKey => {
        const routeQuestionRows = routeQuestionsByRouteKey.get(routeKey) || []
        const relevantRows = routeQuestionRows.filter(item => {
          const conditionKey = normalizeKey(item.conditionKey)
          return !conditionKey || missingConditionKeys.includes(conditionKey)
        })
        const rowsToUse = relevantRows.length ? relevantRows : routeQuestionRows
        return rowsToUse.map(item => ({
          questionKey: normalizeKey(item.questionKey),
          packageTopic: normalizeKey(item.packageTopic || item.package_topic),
          targetSymptomKey: normalizeKey(item.targetSymptomKey || item.target_symptom_key),
          questionTextUserCn: normalizeKey(item.questionTextUserCn || item.question_text_user_cn),
          routeKey,
          conditionKey: normalizeKey(item.conditionKey),
          outcomeKey,
          routePackageRole: normalizeKey(item.routePackageRole),
          askPriority: Number(item.askPriority || 0),
          stepNo: Number(item.stepNo || 0),
          requiredForClosure: Boolean(item.requiredForClosure)
        })).filter(item =>
          item.questionKey &&
          !answeredQuestionKeySet.has(item.questionKey) &&
          !isDisabledYellowingFlowQuestion(item) &&
          !isDisallowedYellowingCareEnvironmentQuestion(item)
        )
      })

      if (missingConditionKeys.length && !hasBlocker) {
        nextQuestionCandidates.push(...candidateQuestions)
      }

      const state = hasBlocker
        ? ROUTE_STATUS.BLOCKED
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
        missingConditionKeys,
        nextQuestionKeys: [],
        questionEvidenceKeys: dedupeKeys(candidateQuestions.map(item => item.questionKey))
      })

      routeTrace.push({
        outcomeKey,
        routeKeys: matchedRouteKeys,
        conditionResults: matchedConditionResults.map(item => ({
          conditionKey: item.conditionKey,
          conditionRole: item.conditionRole,
          result: item.result
        }))
      })
    }

    for (const condition of conditions) {
      const conflictOutcomeKeys = dedupeKeys(condition.conflictOutcomeKeys)
      if (conflictOutcomeKeys.length < 2) {continue}
      conflictingOutcomePairs.push(conflictOutcomeKeys.slice(0, 2))
    }

    const rankedQuestionEvidence = nextQuestionCandidates
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
    const requiresQuestion = false

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
      requiresQuestion,
      nextQuestionKeys: [],
      nextQuestions: [],
      questionEvidenceKeys: dedupeKeys(rankedQuestionEvidence.map(item => item.questionKey)),
      conditionResults,
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
      conservativePolicy: '',
      decisionCause: buildRouteDecisionCause({
        decisionCauseKey: hasActionConflict
          ? 'route_action_conflict_unresolved'
          : limitedVisibleOutcomeCount < 1
            ? 'route_no_visible_outcomes_for_route'
            : 'route_visible_outcomes_ready',
        decisionCauseText: hasActionConflict
          ? (
              '候选方向的行动建议存在冲突，当前改为不确定并给出保守建议。'
            )
          : limitedVisibleOutcomeCount < 1
            ? '当前未命中可展示候选 outcome，按保守不确定输出。'
            : 'route 已形成可展示 outcome。',
        details: {
          routeCount: routes.length,
          conditionCount: conditions.length,
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
    return buildConservativeDecision({
      candidateOutcomeKeys: normalizedCandidateOutcomeKeys,
      candidateOutcomes: normalizedCandidateOutcomeKeys.map(problemKey => ({ problemKey })),
      decisionCauseKey: 'route_query_error_conservative',
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
