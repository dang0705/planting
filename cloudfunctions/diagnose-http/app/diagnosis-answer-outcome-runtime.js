'use strict'

const { resolveWiltingDroopOutcomeResult } = require('../domain/wilting-droop-outcome-resolver')
const { resolveYellowLeafOutcomeResult } = require('../domain/yellow-leaf-outcome-resolver')
const {
  resolvePestVisualRouteRoundResult,
  resolveSpecificPestRoundResult
} = require('./diagnosis-answer-retake-runtime')
const { loadActionProfilesByMode } = require('./action-guidance-loader')

async function resolveSpecializedAnswerRoundResults({
  isTerminalQuestionPackageSubmit = false,
  sessionId = '',
  answerRound = 1,
  round = 2,
  routeRuntimeAnswers = [],
  questionPackageSnapshot = null,
  payload = {},
  refreshedSessionState = {},
  sessionState = {},
  runtimeCarePayload = {},
  runtimeRouteAnswerEffects = [],
  questionPackageRuntimeData = null,
  visualExtraction = null,
  clientContext = {}
} = {}) {
  const plantContext = refreshedSessionState.plantContext || sessionState.plantContext || {}
  const questionPackage =
    payload.questionPackage || questionPackageSnapshot?.questionPackage || null
  const visualAggregateResult =
    refreshedSessionState.visualAggregateResult ||
    refreshedSessionState.visualAggregateSummary ||
    refreshedSessionState.runtimeSnapshot?.visualAggregateSummary ||
    questionPackageSnapshot?.visualAggregateSummary ||
    sessionState.visualAggregateResult ||
    sessionState.visualAggregateSummary ||
    sessionState.runtimeSnapshot?.visualAggregateSummary ||
    null
  const wiltingDroopRoundResult = isTerminalQuestionPackageSubmit
    ? resolveWiltingDroopOutcomeResult({
        sessionId,
        round,
        answers: routeRuntimeAnswers,
        questionPackage,
        plantContext,
        careBehaviorTimeline: runtimeCarePayload.careBehaviorTimeline,
        environmentCareContext: runtimeCarePayload.environmentCareContext
      })
    : null
  const yellowLeafRoundResult =
    isTerminalQuestionPackageSubmit && !wiltingDroopRoundResult
      ? await resolveYellowLeafOutcomeResult({
          sessionId,
          round,
          answers: routeRuntimeAnswers,
          questionPackage,
          plantContext,
          careBehaviorTimeline: runtimeCarePayload.careBehaviorTimeline,
          environmentCareContext: runtimeCarePayload.environmentCareContext,
          routeAnswerEffects: runtimeRouteAnswerEffects,
          questionPackageRuntimeData,
          visualAggregateResult
      })
      : null
  const specificPestModeKeys = [
    ...(Array.isArray(questionPackage?.candidateModes) ? questionPackage.candidateModes : []),
    ...(Array.isArray(questionPackageSnapshot?.candidateModes)
      ? questionPackageSnapshot.candidateModes
      : [])
  ]
  const specificPestRoundResult = resolveSpecificPestRoundResult({
    isTerminalQuestionPackageSubmit,
    wiltingDroopRoundResult,
    yellowLeafRoundResult,
    questionPackageSnapshot,
    questionPackage,
    routeRuntimeAnswers,
    sessionId,
    answerRound,
    round,
    refreshedSessionState,
    sessionState,
    actionProfilesByMode: await loadActionProfilesByMode(specificPestModeKeys)
  })
  const pestVisualRouteRoundResult = await resolvePestVisualRouteRoundResult({
    visualExtraction,
    sessionId,
    round,
    refreshedSessionState,
    sessionState,
    clientContext
  })
  return {
    wiltingDroopRoundResult,
    yellowLeafRoundResult,
    specificPestRoundResult,
    pestVisualRouteRoundResult
  }
}

module.exports = {
  resolveSpecializedAnswerRoundResults
}
