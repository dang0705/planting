'use strict'

const { runDiagnosisRound } = require('../domain/diagnosis-engine')
const { getQuestionOptionMappings } = require('../repositories/question-repository')
const { getSessionState, getObservedSymptomsBySession } = require('../services/session-service')
const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('./care-behavior-payload')
const {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerOptionMappings,
  mergePackageAnswerOptionMappings
} = require('./package-answer-ownership-runtime')
const { buildPackageAnswerRuntimeState } = require('./answer-runtime-state')
const { runDeferredAnswerPersistence } = require('./answer-runner-helpers')
const { normalizeRoundFromRoundId, resolveRequestClientContext } = require('./request-normalizers')
const { persistRoundResult } = require('./visual-runtime')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const { createReviewTimingLogger } = require('../repositories/diagnosis-review/review-performance')
const { triggerStaticRepositoryCachePreload } = require('./static-cache-preloader')
const {
  applyConsumedRetakeState,
  isCompleteQuestionPackageSnapshotAnswerSubmit,
  runRetakeImageFollowup
} = require('./diagnosis-answer-retake-runtime')
const { resolveDirectionChoiceRoundResult } = require('./diagnosis-direction-choice-runtime')
const { resolveAnswerInputRuntime } = require('./diagnosis-answer-input-runtime')
const { resolveSpecializedAnswerRoundResults } = require('./diagnosis-answer-outcome-runtime')
const { attachTerminalQuestionPackage } = require('./diagnosis-answer-package-finalizer')
const { buildAnswerRunnerResult } = require('./diagnosis-answer-result-builder')
const { buildSpecificPestQuestionPackage } = require('./pest-question-package')
const { PEST_MODE_KEYS } = require('../domain/diagnosis-mode-registry')

function getSessionQuestionRowRuntime() {
  return require('./session-question-row-runtime')
}

function getSessionAnswerSubmitRuntime() {
  return require('./session-answer-submit-runtime')
}

function getAnswerRevisionRuntime() {
  return require('./answer-revision-runtime')
}

function normalizePackageMode(value = '') {
  return String(value || '').trim()
}

function isSpecificPestQuestionPackage(value = null) {
  if (!value || typeof value !== 'object') {
    return false
  }
  return (
    normalizePackageMode(value.mode) === 'specific_pest_visual' ||
    normalizePackageMode(value.route) === 'specific_pest_visual' ||
    normalizePackageMode(value.sourceMode) === 'visual_specific_pest'
  )
}

function resolvePayloadSpecificPestQuestionPackage(payload = {}) {
  const packageCandidate = payload?.questionPackage || payload?.question_package || null
  if (!isSpecificPestQuestionPackage(packageCandidate)) {
    return null
  }
  const packageQuestions = Array.isArray(packageCandidate.packageQuestions)
    ? packageCandidate.packageQuestions
    : Array.isArray(packageCandidate.package_questions)
      ? packageCandidate.package_questions
      : []
  if (!packageQuestions.length) {
    return null
  }
  return {
    ...packageCandidate,
    mode: 'specific_pest_visual',
    packageQuestions
  }
}

function safeJsonParse(value = '', fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function normalizeRowRound(row = {}) {
  const rationale = safeJsonParse(row?.rationale || '{}')
  return Number(rationale.round || rationale.r || 1) || 1
}

function normalizeRowQuestionKey(row = {}) {
  const rationale = safeJsonParse(row?.rationale || '{}')
  return String(rationale.questionKey || rationale.qk || row?.symptom_key || '').trim()
}

function normalizeRowTargetMode(row = {}) {
  const rationale = safeJsonParse(row?.rationale || '{}')
  const modeKey = String(rationale.targetSymptomKey || rationale.tsk || row?.targetSymptomKey || '')
    .trim()
    .toLowerCase()
  return PEST_MODE_KEYS.includes(modeKey) ? modeKey : ''
}

function resolveSpecificPestQuestionPackageFromRows({
  rows = [],
  answerRound = 1,
  hiddenPrefilledEvidence = []
} = {}) {
  const packageRows = (Array.isArray(rows) ? rows : [])
    .filter(row => {
      const questionKey = normalizeRowQuestionKey(row)
      return (
        normalizeRowRound(row) === Number(answerRound || 1) &&
        questionKey.startsWith('q_specific_pest__')
      )
    })
    .sort((a, b) => Number(a?.question_order || 0) - Number(b?.question_order || 0))
  if (!packageRows.length) {
    return null
  }
  const candidateModes = Array.from(
    new Set(packageRows.map(normalizeRowTargetMode).filter(Boolean))
  )
  const rebuiltPackage = buildSpecificPestQuestionPackage({
    candidateModes,
    hiddenPrefilledEvidence
  })
  if (!rebuiltPackage?.packageQuestions?.length) {
    return null
  }
  const rebuiltByQuestionKey = new Map(
    rebuiltPackage.packageQuestions.map(question => [question.questionKey, question])
  )
  const packageQuestions = packageRows
    .map(row => rebuiltByQuestionKey.get(normalizeRowQuestionKey(row)))
    .filter(Boolean)
  if (!packageQuestions.length) {
    return null
  }
  return {
    ...rebuiltPackage,
    questionCount: packageQuestions.length,
    packageTopics: packageQuestions.map(question => question.packageTopic).filter(Boolean),
    candidateModes,
    hiddenPrefilledEvidence: Array.isArray(hiddenPrefilledEvidence) ? hiddenPrefilledEvidence : [],
    packageQuestions
  }
}

async function runAnswerDiagnosis({ payload, openid, skipPersistence = false } = {}) {
  payload = payload || {}
  const sessionId = payload.diagnosisSessionId || payload.diagnosisId
  if (!sessionId) {
    throw Object.assign(new Error('缺少 diagnosisSessionId'), { statusCode: 400 })
  }
  const timing = createReviewTimingLogger('diagnosis-answer', {
    sessionId,
    skipPersistence: Boolean(skipPersistence)
  })

  const sessionState = await getSessionState(openid, sessionId)
  if (!sessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }
  timing.mark('session-state-loaded', {
    hasAnswers:
      Array.isArray(sessionState?.answeredAnswers) && sessionState.answeredAnswers.length > 0
  })
  triggerStaticRepositoryCachePreload({
    scope: 'diagnosis-answer',
    sessionId,
    openid,
    source: 'answer_runner'
  })
  timing.mark('static-cache-preload-triggered')

  const {
    answers,
    imageInputs,
    hasAnswers,
    hasImageInputs,
    requestMode,
    hasDirectionChoice,
    isAnswerRevision,
    payloadQuestionPackageSubmit,
    dirtyQuestionKey
  } = resolveAnswerInputRuntime(payload)
  let answerRevision = null
  let uiPatch = null

  const observedSymptoms =
    Array.isArray(sessionState.observedEvidenceSet) && sessionState.observedEvidenceSet.length
      ? []
      : await getObservedSymptomsBySession(sessionId)
  if (observedSymptoms.length) {
    timing.mark('observed-symptoms-loaded', {
      count: observedSymptoms.length
    })
  }
  const roundFromClient = normalizeRoundFromRoundId(payload.roundId)
  const expectedRound = Math.max(1, Number(sessionState.nextRound || 2) - 1)
  const clientContext = resolveRequestClientContext(
    payload,
    sessionState?.runtimeSnapshot?.clientContext || null
  )

  if (!isAnswerRevision && roundFromClient && roundFromClient !== expectedRound) {
    throw Object.assign(new Error('问诊轮次已失效，请使用当前轮题目重新提交'), { statusCode: 400 })
  }

  const answerRound = roundFromClient || expectedRound
  let refreshedSessionState = sessionState
  const storedQuestionPackageSnapshot = resolveQuestionPackageSnapshot(refreshedSessionState)
  const payloadSpecificPestQuestionPackage = resolvePayloadSpecificPestQuestionPackage(payload)
  let questionPackageSnapshot = storedQuestionPackageSnapshot || payloadSpecificPestQuestionPackage
  let hasSpecificPestQuestionPackageSnapshot =
    questionPackageSnapshot?.mode === 'specific_pest_visual'
  let isTerminalQuestionPackageSubmit =
    payloadQuestionPackageSubmit ||
    isCompleteQuestionPackageSnapshotAnswerSubmit({
      requestMode,
      questionPackageSnapshot,
      answers
    })
  let visualExtraction = null
  let runtimeAnswers = answers
  const runtimeCarePayload = resolveRuntimeEnvironmentCarePayload({
    payload,
    sessionState: refreshedSessionState,
    plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {}
  })
  let runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
  let runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
  let runtimeAnsweredQuestionGroupKeys = refreshedSessionState.answeredQuestionGroupKeys || []
  let runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup
  const needsSessionQuestionState =
    !isTerminalQuestionPackageSubmit || hasImageInputs || hasSpecificPestQuestionPackageSnapshot
  const sessionQuestionState = needsSessionQuestionState
    ? getSessionQuestionRowRuntime().resolveSessionQuestionState(refreshedSessionState)
    : { rows: [], progress: null }
  const sessionQuestionRowsForSession = sessionQuestionState.rows
  const sessionQuestionProgress = sessionQuestionState.progress
  const rowSpecificPestQuestionPackage = resolveSpecificPestQuestionPackageFromRows({
    rows: sessionQuestionRowsForSession,
    answerRound,
    hiddenPrefilledEvidence: questionPackageSnapshot?.hiddenPrefilledEvidence || []
  })
  if (
    rowSpecificPestQuestionPackage &&
    (!questionPackageSnapshot ||
      rowSpecificPestQuestionPackage.packageQuestions.length >
        (Array.isArray(questionPackageSnapshot.packageQuestions)
          ? questionPackageSnapshot.packageQuestions.length
          : 0))
  ) {
    questionPackageSnapshot = rowSpecificPestQuestionPackage
  }
  hasSpecificPestQuestionPackageSnapshot = questionPackageSnapshot?.mode === 'specific_pest_visual'
  const completeQuestionPackageSnapshotSubmit = isCompleteQuestionPackageSnapshotAnswerSubmit({
    requestMode,
    questionPackageSnapshot,
    answers
  })
  isTerminalQuestionPackageSubmit = hasSpecificPestQuestionPackageSnapshot
    ? completeQuestionPackageSnapshotSubmit
    : payloadQuestionPackageSubmit || completeQuestionPackageSnapshotSubmit
  let runtimeAnswerOptionMappings = []
  let runtimeRouteAnswerEffects = []
  let retakeAuthorizationRuntime = null
  let sessionQuestionRowsForRound = sessionQuestionRowsForSession
  let runtimeAskedQuestionRows = []
  const requiredAnswerPersistenceTasks = []
  const deferredAnswerPersistenceJobs = []

  if (hasAnswers) {
    const questionKeys = Array.from(new Set(answers.map(item => item.questionKey).filter(Boolean)))
    const sessionAnsweredSessionQuestionKeys = isTerminalQuestionPackageSubmit
      ? []
      : getSessionQuestionRowRuntime().collectAnsweredSessionQuestionKeys(
          sessionQuestionRowsForSession
        )
    const routeAnswerEffectQuestionKeys = Array.from(
      new Set([
        ...questionKeys,
        ...(isTerminalQuestionPackageSubmit ? [] : sessionAnsweredSessionQuestionKeys),
        ...(Array.isArray(refreshedSessionState.answeredAnswers)
          ? refreshedSessionState.answeredAnswers
              .map(item => String(item?.questionKey || '').trim())
              .filter(Boolean)
          : [])
      ])
    )
    const optionMappingPromise = questionKeys.length
      ? getQuestionOptionMappings(questionKeys)
      : Promise.resolve([])
    const routeAnswerEffectsPromise = routeAnswerEffectQuestionKeys.length
      ? outcomeRouteRepository.getOutcomeAnswerEffects(routeAnswerEffectQuestionKeys)
      : Promise.resolve([])
    const [ownership, questionOptionMappingsFromStore, routeAnswerEffectsFromStore] =
      isAnswerRevision
        ? await Promise.all([
            Promise.resolve(null),
            optionMappingPromise,
            routeAnswerEffectsPromise
          ])
        : isTerminalQuestionPackageSubmit
          ? await Promise.all([
              Promise.resolve(
                resolvePackageAnswerOwnership({
                  questionPackageSnapshot,
                  answers
                })
              ),
              optionMappingPromise,
              routeAnswerEffectsPromise
            ])
          : await Promise.all([
              getSessionAnswerSubmitRuntime().validateSessionAnswerOwnership({
                sessionId,
                answers,
                answerRound,
                sessionState,
                rows: sessionQuestionRowsForSession
              }),
              optionMappingPromise,
              routeAnswerEffectsPromise
            ])
    runtimeRouteAnswerEffects = Array.isArray(routeAnswerEffectsFromStore)
      ? routeAnswerEffectsFromStore
      : []
    if (!isAnswerRevision) {
      if (!ownership.ok) {
        throw Object.assign(new Error('问诊题目不属于当前会话轮次'), { statusCode: 400 })
      }
    }
    timing.mark('answer-ownership-ready', {
      answerCount: answers.length,
      answerRound
    })

    const optionMappings =
      isTerminalQuestionPackageSubmit || hasSpecificPestQuestionPackageSnapshot
        ? mergePackageAnswerOptionMappings(
            questionOptionMappingsFromStore,
            buildPackageAnswerOptionMappings(questionPackageSnapshot)
          )
        : getSessionAnswerSubmitRuntime().buildSessionAnswerOptionMappings(
            questionKeys,
            questionOptionMappingsFromStore
          )
    runtimeAnswerOptionMappings = optionMappings
    sessionQuestionRowsForRound = getSessionQuestionRowRuntime().resolveSessionOwnershipRows(
      ownership,
      sessionQuestionRowsForSession
    )
    runtimeAskedQuestionRows = isTerminalQuestionPackageSubmit
      ? []
      : getSessionQuestionRowRuntime().buildAskedSessionQuestionRows(sessionQuestionRowsForRound)
    const validPairs = new Set(optionMappings.map(item => `${item.questionKey}::${item.optionKey}`))
    const invalidPairs = answers.filter(
      item => !validPairs.has(`${item.questionKey}::${item.optionKey}`)
    )

    if (invalidPairs.length) {
      throw Object.assign(new Error('问诊选项不属于当前问题'), { statusCode: 400 })
    }

    if (isAnswerRevision) {
      const revisionRuntime = await getAnswerRevisionRuntime().applyAnswerRevisionRuntime({
        sessionId,
        openid,
        sessionState,
        payload,
        answers,
        dirtyQuestionKey,
        optionMappings,
        sessionQuestionRows: sessionQuestionRowsForSession,
        expectedRound,
        sessionQuestionProgress
      })
      answerRevision = revisionRuntime.answerRevision
      uiPatch = revisionRuntime.uiPatch
      refreshedSessionState = revisionRuntime.refreshedSessionState
      runtimeAnswers = revisionRuntime.runtimeAnswers
      runtimeObservedEvidenceSet = revisionRuntime.runtimeObservedEvidenceSet
      runtimeAskedQuestionKeys = revisionRuntime.runtimeAskedQuestionKeys
      runtimeAnsweredQuestionGroupKeys = revisionRuntime.runtimeAnsweredQuestionGroupKeys
      runtimeUnknownCountByGroup = revisionRuntime.runtimeUnknownCountByGroup
      sessionQuestionRowsForRound = revisionRuntime.sessionQuestionRowsForRound
      runtimeAskedQuestionRows = revisionRuntime.runtimeAskedQuestionRows
    } else if (isTerminalQuestionPackageSubmit) {
      const packageRuntimeState = buildPackageAnswerRuntimeState({
        sessionState: refreshedSessionState,
        questionPackageSnapshot,
        answers,
        optionMappings
      })
      runtimeAnswers = packageRuntimeState.runtimeAnswers
      runtimeAskedQuestionKeys = packageRuntimeState.runtimeAskedQuestionKeys
      runtimeAnsweredQuestionGroupKeys = packageRuntimeState.runtimeAnsweredQuestionGroupKeys
      runtimeUnknownCountByGroup = packageRuntimeState.runtimeUnknownCountByGroup
      runtimeAskedQuestionRows = packageRuntimeState.runtimeAskedQuestionRows
    } else {
      const sessionSubmitRuntime =
        await getSessionAnswerSubmitRuntime().applySessionAnswerSubmitRuntime({
          sessionId,
          openid,
          answerRound,
          answers,
          optionMappings,
          sessionQuestionProgress,
          sessionState: refreshedSessionState,
          rows: sessionQuestionRowsForRound,
          deferredJobs: deferredAnswerPersistenceJobs,
          timing
        })
      const markResult = sessionSubmitRuntime.markResult
      if (Array.isArray(markResult?.pendingWrites)) {
        requiredAnswerPersistenceTasks.push(...markResult.pendingWrites)
      }
      runtimeAnswers = sessionSubmitRuntime.runtimeAnswers
      runtimeAskedQuestionKeys = sessionSubmitRuntime.runtimeAskedQuestionKeys
      runtimeAnsweredQuestionGroupKeys = sessionSubmitRuntime.runtimeAnsweredQuestionGroupKeys
      runtimeUnknownCountByGroup = sessionSubmitRuntime.runtimeUnknownCountByGroup
      sessionQuestionRowsForRound = sessionSubmitRuntime.rowSnapshot
      runtimeAskedQuestionRows = sessionSubmitRuntime.askedQuestionRows
    }
  }

  if (hasImageInputs) {
    const followupRuntime = await runRetakeImageFollowup({
      payload,
      sessionId,
      openid,
      answerRound,
      imageInputs,
      sessionQuestionProgress,
      refreshedSessionState,
      sessionState,
      clientContext
    })
    retakeAuthorizationRuntime = followupRuntime.retakeAuthorizationRuntime
    visualExtraction = followupRuntime.visualExtraction

    runtimeAnswers = []
    runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
    runtimeAskedQuestionKeys = []
    runtimeAnsweredQuestionGroupKeys = []
    runtimeUnknownCountByGroup = {}
    runtimeAskedQuestionRows = []
  }

  const routeRuntimeAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
    answers: runtimeAnswers,
    runtimeEnvironmentCarePayload: runtimeCarePayload
  })
  const round = answerRound + 1

  timing.mark('round-starting', {
    round,
    hasImageInputs: Boolean(hasImageInputs),
    answerCount: Array.isArray(routeRuntimeAnswers) ? routeRuntimeAnswers.length : 0,
    askedQuestionCount: Array.isArray(runtimeAskedQuestionKeys)
      ? runtimeAskedQuestionKeys.length
      : 0
  })
  const {
    wiltingDroopRoundResult,
    yellowLeafRoundResult,
    specificPestRoundResult,
    pestVisualRouteRoundResult
  } = await resolveSpecializedAnswerRoundResults({
    isTerminalQuestionPackageSubmit,
    questionPackageSnapshot,
    payload,
    routeRuntimeAnswers,
    sessionId,
    answerRound,
    round,
    refreshedSessionState,
    sessionState,
    runtimeCarePayload,
    runtimeRouteAnswerEffects,
    visualExtraction,
    clientContext
  })
  const directionChoiceRoundResult = hasDirectionChoice
    ? await resolveDirectionChoiceRoundResult({
        payload,
        openid,
        sessionId,
        round,
        refreshedSessionState,
        sessionState
      })
    : null
  const roundResult =
    directionChoiceRoundResult ||
    wiltingDroopRoundResult ||
    yellowLeafRoundResult ||
    specificPestRoundResult ||
    pestVisualRouteRoundResult ||
    (await runDiagnosisRound({
      openid,
      userPlantId: refreshedSessionState.userPlantId,
      plantId: refreshedSessionState.plantId,
      lockedPlantContext: refreshedSessionState.plantContext,
      observedSymptoms: hasImageInputs ? [] : observedSymptoms,
      observedEvidenceSet: runtimeObservedEvidenceSet,
      visualAggregateResult:
        visualExtraction?.aggregateResult || refreshedSessionState.visualAggregateResult || null,
      answers: routeRuntimeAnswers,
      askedQuestionKeys: runtimeAskedQuestionKeys,
      answeredQuestionGroupKeys: runtimeAnsweredQuestionGroupKeys,
      unknownCountByGroup: runtimeUnknownCountByGroup,
      symptomClassState: refreshedSessionState.symptomClassRuntime || null,
      round,
      stage: 'question',
      sessionId,
      answerOptionMappings: runtimeAnswerOptionMappings,
      storedQuestionRows: isTerminalQuestionPackageSubmit ? [] : sessionQuestionRowsForRound,
      preloadedAskedQuestionRows: runtimeAskedQuestionRows,
      preloadedRouteAnswerEffects: runtimeRouteAnswerEffects,
      terminalQuestioningState: isTerminalQuestionPackageSubmit,
      perfLogger: timing
    }))

  if (visualExtraction?.visualCallBatchId) {
    roundResult.latestVisualCallBatchId = visualExtraction.visualCallBatchId
  }
  if (visualExtraction?.aggregateResult) {
    roundResult.visualAggregateResult = visualExtraction.aggregateResult
  }
  if (visualExtraction?.visualBatchTrace) {
    roundResult.visualBatchTrace = visualExtraction.visualBatchTrace
  }
  applyConsumedRetakeState(roundResult, retakeAuthorizationRuntime)

  if (answerRevision) {
    roundResult.answerRevision = answerRevision
  }
  if (uiPatch) {
    roundResult.uiPatch = uiPatch
  }
  if (runtimeCarePayload.careBehaviorTimeline) {
    roundResult.careBehaviorTimeline = runtimeCarePayload.careBehaviorTimeline
  }
  if (runtimeCarePayload.environmentCareContext) {
    roundResult.environmentCareContext = runtimeCarePayload.environmentCareContext
  }
  attachTerminalQuestionPackage({
    roundResult,
    payload,
    questionPackageSnapshot,
    isTerminalQuestionPackageSubmit
  })

  if (!roundResult.visualBatchTrace && refreshedSessionState.visualBatchTrace) {
    roundResult.visualBatchTrace = refreshedSessionState.visualBatchTrace
  }
  if (!roundResult.visualAggregateSummary && refreshedSessionState.visualAggregateSummary) {
    roundResult.visualAggregateSummary = refreshedSessionState.visualAggregateSummary
  }
  if (!roundResult.shadowCompareSummary && refreshedSessionState.shadowCompareSummary) {
    roundResult.shadowCompareSummary = refreshedSessionState.shadowCompareSummary
  }
  timing.mark('round-result-ready', {
    answerRevision: Boolean(answerRevision),
    hasImageInputs: Boolean(hasImageInputs)
  })

  const shouldReturnBeforeRoundPersistence =
    isTerminalQuestionPackageSubmit && !hasImageInputs && !isAnswerRevision
  if (shouldReturnBeforeRoundPersistence) {
    for (const task of requiredAnswerPersistenceTasks) {
      if (task && typeof task.then === 'function') {
        task.catch(error => {
          console.error('diagnosis-answer deferred required persistence failed:', {
            sessionId,
            message: String(error?.message || error || '')
          })
        })
      }
    }
  } else {
    await Promise.all(requiredAnswerPersistenceTasks)
  }
  const persistenceRound = roundResult?.reuseAnswerRoundForQuestionPackage ? answerRound : round
  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: persistenceRound,
    image: '',
    description: '',
    skipPersistence,
    awaitPersistence: !shouldReturnBeforeRoundPersistence,
    clientContext,
    sessionQuestionRows: isTerminalQuestionPackageSubmit ? null : sessionQuestionRowsForRound
  })
  runDeferredAnswerPersistence(sessionId, deferredAnswerPersistenceJobs)

  const answerResult = buildAnswerRunnerResult({
    sessionId,
    refreshedSessionState,
    roundResult,
    answerRevision,
    uiPatch
  })
  timing.finish({
    answerRevision: Boolean(answerRevision),
    hasImageInputs: Boolean(hasImageInputs)
  })
  return answerResult
}

module.exports = {
  runAnswerDiagnosis,
  _test: {
    runDeferredAnswerPersistence,
    isCompleteQuestionPackageSnapshotAnswerSubmit,
    resolvePayloadSpecificPestQuestionPackage,
    resolveSpecificPestQuestionPackageFromRows
  }
}
