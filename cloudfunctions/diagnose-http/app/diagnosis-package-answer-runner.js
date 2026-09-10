'use strict'

const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('./care-behavior-payload')
const {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerRuntime
} = require('./package-answer-ownership-runtime')
const { fromQuestionId, fromOptionId } = require('../mappers/public-id-mapper')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const { resolveYellowLeafOutcomeResult } = require('../domain/yellow-leaf-outcome-resolver')
const { normalizeRequestClientContext } = require('./package-answer-request-context')
const {
  verifyQuestionPackageContinuationToken,
  buildQuestionPackageContinuationSessionState
} = require('./question-package-continuation')
const {
  ensurePackageVersionTwo,
  validateAirEnvironmentPackageSidecar
} = require('./air-environment-package')
const { attachTerminalQuestionPackage } = require('./diagnosis-answer-package-finalizer')
const { buildAnswerRunnerResult } = require('./diagnosis-answer-result-builder')
const { persistRoundResult } = require('./round-persistence-runtime')
const { triggerDiagnosisAnswerPackageCachePreload } = require('./static-cache-preloader')

const YELLOW_LEAF_MODES = new Set([
  'yellow_leaf',
  'manual_yellowing_care_environment_frontloaded',
  'yellowing_mode',
  'leaf_yellowing'
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeRequestMode(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeAnswers(answers = []) {
  return (Array.isArray(answers) ? answers : [])
    .map(item => ({
      questionKey:
        fromQuestionId(item?.questionId || '') ||
        normalizeText(item?.questionKey || item?.question_key || item?.questionId),
      optionKey:
        fromOptionId(item?.optionId || '') ||
        normalizeText(item?.optionKey || item?.option_key || item?.optionId).toLowerCase()
    }))
    .filter(item => item.questionKey && item.optionKey)
}

function isYellowLeafPackageSnapshot(snapshot = null) {
  const mode = normalizeText(snapshot?.mode || snapshot?.sourceMode || snapshot?.route).toLowerCase()
  return YELLOW_LEAF_MODES.has(mode)
}

async function runDiagnosisPackageAnswer({ payload = {}, openid = '', timing = null } = {}) {
  const sessionId = normalizeText(payload.diagnosisSessionId || payload.diagnosisId)
  if (!sessionId) {
    throw Object.assign(new Error('缺少 diagnosisSessionId'), { statusCode: 400 })
  }

  const answers = normalizeAnswers(payload.answers)
  const questionPackageContinuation = verifyQuestionPackageContinuationToken({
    token:
      payload.questionPackageContinuationToken || payload.question_package_continuation_token || '',
    openid,
    sessionId
  })
  if (!questionPackageContinuation) {
    return null
  }

  const sessionState = buildQuestionPackageContinuationSessionState(questionPackageContinuation)
  const questionPackageSnapshot = resolveQuestionPackageSnapshot(sessionState)
  if (!isYellowLeafPackageSnapshot(questionPackageSnapshot)) {
    return null
  }

  const ownership = resolvePackageAnswerOwnership({ questionPackageSnapshot, answers })
  if (!ownership.ok) {
    throw Object.assign(new Error('问诊题目或选项不属于当前会话题包'), { statusCode: 400 })
  }

  const packageRuntime = buildPackageAnswerRuntime({ questionPackageSnapshot, answers })
  const runtimeAnswers = packageRuntime.updatedAnswers.map(item => ({
    questionKey: item.questionKey,
    optionKey: item.optionKey
  }))
  const storedRuntimeData = questionPackageSnapshot.questionPackageRuntimeData || null
  const runtimeDataPromise = storedRuntimeData
    ? Promise.resolve(storedRuntimeData)
    : triggerDiagnosisAnswerPackageCachePreload(answers.map(item => item.questionKey), {
        additionalOutcomeKeys: [
          'low_light_growth_weakness',
          'sunburn',
          'overwatering_root_pressure'
        ],
        scope: 'diagnosis-answer-package-fast-path',
        sessionId,
        source: 'answer_request'
      })
  const runtimeCarePayload = resolveRuntimeEnvironmentCarePayload({
    payload,
    sessionState,
    plantContext: sessionState.plantContext || {}
  })
  ensurePackageVersionTwo(questionPackageSnapshot)
  const airEnvironmentPackageRuntime = validateAirEnvironmentPackageSidecar({
    payload,
    answers: runtimeAnswers,
    questionPackageSnapshot
  })
  const routeRuntimeAnswers = [
    ...buildRouteAnswersFromRuntimeEnvironmentCarePayload({
      answers: runtimeAnswers,
      runtimeEnvironmentCarePayload: runtimeCarePayload
    }),
    ...airEnvironmentPackageRuntime.routeAnswers
  ]
  const loadedRuntimeData = await runtimeDataPromise
  const runtimeData =
    loadedRuntimeData && typeof loadedRuntimeData === 'object' ? loadedRuntimeData : null
  const routeAnswerEffects = runtimeData
    ? []
    : await outcomeRouteRepository.getOutcomeAnswerEffects(answers.map(item => item.questionKey))
  const answerRound =
    Number(normalizeText(questionPackageContinuation.roundId).replace('round_', '')) || 1
  const round = answerRound + 1
  const questionPackage = questionPackageContinuation.questionPackage
  const roundResult = await resolveYellowLeafOutcomeResult({
    sessionId,
    round,
    answers: routeRuntimeAnswers,
    questionPackage,
    plantContext: sessionState.plantContext || {},
    careBehaviorTimeline: runtimeCarePayload.careBehaviorTimeline,
    environmentCareContext: runtimeCarePayload.environmentCareContext,
    routeAnswerEffects,
    questionPackageRuntimeData: runtimeData
  })
  if (!roundResult) {
    return null
  }

  roundResult.airEnvironmentByQuestionId = airEnvironmentPackageRuntime.byQuestionId
  roundResult.airEnvironmentSnapshotsByQuestionId =
    airEnvironmentPackageRuntime.snapshotsByQuestionId
  roundResult.airEnvironmentSnapshotSourceByQuestionId =
    airEnvironmentPackageRuntime.sourceByQuestionId
  roundResult.airEnvironmentEvidence = airEnvironmentPackageRuntime.evidence || null
  attachTerminalQuestionPackage({
    roundResult,
    payload: { ...payload, questionPackage },
    questionPackageSnapshot,
    isTerminalQuestionPackageSubmit: true
  })
  timing?.mark('answer-package-fast-path-ready', {
    answerCount: answers.length,
    runtimeDataReady: Boolean(runtimeData)
  })

  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: answerRound,
    image: '',
    description: '',
    awaitPersistence: false,
    clientContext: normalizeRequestClientContext(payload, null),
    sessionQuestionRows: null
  })

  return buildAnswerRunnerResult({
    sessionId,
    refreshedSessionState: sessionState,
    roundResult,
    answerRevision: null,
    uiPatch: null
  })
}

module.exports = { runDiagnosisPackageAnswer }
