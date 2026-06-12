'use strict'

const { fromQuestionId } = require('../mappers/public-id-mapper')
const { runDiagnosisRound } = require('../domain/diagnosis-engine')
const { getQuestionOptionMappings } = require('../repositories/question-repository')
const { getSessionState, getObservedSymptomsBySession } = require('../services/session-service')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('./care-behavior-payload')
const { isQuestionPackageAnswerSubmitPayload } = require('./question-package-response')
const { resolveWiltingDroopOutcomeResult } = require('../domain/wilting-droop-outcome-resolver')
const { resolveYellowLeafOutcomeResult } = require('../domain/yellow-leaf-outcome-resolver')
const {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerOptionMappings,
  mergePackageAnswerOptionMappings
} = require('./package-answer-ownership-runtime')
const { buildPackageAnswerRuntimeState } = require('./answer-runtime-state')
const { runDeferredAnswerPersistence } = require('./answer-runner-helpers')
const {
  resolveVisualImageInputs,
  stripVisualEvidenceItems,
  normalizeRoundFromRoundId,
  normalizePublicAnswers,
  normalizeRequestMode,
  resolveRequestClientContext
} = require('./request-normalizers')
const { extractVisualSymptomsSafely, persistRoundResult } = require('./visual-runtime')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const { createReviewTimingLogger } = require('../repositories/diagnosis-review/review-performance')
const { triggerStaticRepositoryCachePreload } = require('./static-cache-preloader')
const { getQuestionPackageByMode, buildQuestionPackageUiHints } = require('./question-package-response')

function getSessionQuestionRowRuntime() {
  return require('./session-question-row-runtime')
}

function getSessionAnswerSubmitRuntime() {
  return require('./session-answer-submit-runtime')
}

function getAnswerRevisionRuntime() {
  return require('./answer-revision-runtime')
}

function getSessionImageInputRuntime() {
  return require('./session-image-input-runtime')
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

  const answers = normalizePublicAnswers(payload.answers || [])
  const imageInputs = resolveVisualImageInputs(payload)
  const hasAnswers = answers.length > 0
  const hasImageInputs = imageInputs.length > 0
  const requestMode = normalizeRequestMode(payload.requestMode || payload.mode || '')
  const isAnswerRevision = requestMode === 'answer_revision'
  const isTerminalQuestionPackageSubmit = isQuestionPackageAnswerSubmitPayload({
    payload,
    answers,
    requestMode
  })
  const dirtyQuestionKey = isAnswerRevision
    ? fromQuestionId(payload.dirtyFromQuestionId || '') ||
      String(
        payload.dirtyFromQuestionKey ||
          payload.dirtyQuestionKey ||
          payload.dirtyFromQuestionId ||
          ''
      ).trim()
    : ''
  let answerRevision = null
  let uiPatch = null

  if (!hasAnswers && !hasImageInputs) {
    throw Object.assign(new Error('缺少 answers 或 images'), { statusCode: 400 })
  }

  if (isAnswerRevision && hasImageInputs) {
    throw Object.assign(new Error('answer_revision 不支持同时提交补图'), { statusCode: 400 })
  }

  if (isAnswerRevision && !dirtyQuestionKey) {
    throw Object.assign(new Error('缺少 dirtyFromQuestionId'), { statusCode: 400 })
  }

  if (hasAnswers && hasImageInputs) {
    throw Object.assign(new Error('题包答案与补图必须分开提交'), { statusCode: 400 })
  }

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
  const needsSessionQuestionState = !isTerminalQuestionPackageSubmit || hasImageInputs
  const sessionQuestionState = needsSessionQuestionState
    ? getSessionQuestionRowRuntime().resolveSessionQuestionState(refreshedSessionState)
    : { rows: [], progress: null }
  const sessionQuestionRowsForSession = sessionQuestionState.rows
  const sessionQuestionProgress = sessionQuestionState.progress
  const questionPackageSnapshot = resolveQuestionPackageSnapshot(refreshedSessionState)
  let runtimeAnswerOptionMappings = []
  let runtimeRouteAnswerEffects = []
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

    const optionMappings = isTerminalQuestionPackageSubmit
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
    await getSessionImageInputRuntime().prepareSessionImageInputRuntime({
      sessionId,
      openid,
      answerRound,
      sessionQuestionProgress,
      visualBatchTrace: refreshedSessionState.visualBatchTrace || null
    })

    visualExtraction = await extractVisualSymptomsSafely({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId:
        refreshedSessionState.latestVisualCallBatchId ||
        refreshedSessionState?.plantContext?.latestVisualCallBatchId ||
        '',
      supersedeSource: 'diagnosis_package_image'
    })

    runtimeAnswers = []
    runtimeObservedEvidenceSet = stripVisualEvidenceItems(
      refreshedSessionState.observedEvidenceSet || []
    )
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
  const wiltingDroopRoundResult = isTerminalQuestionPackageSubmit
    ? resolveWiltingDroopOutcomeResult({
        sessionId,
        round,
        answers: routeRuntimeAnswers,
        questionPackage:
          payload.questionPackage || questionPackageSnapshot?.questionPackage || null,
        plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
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
          questionPackage:
            payload.questionPackage || questionPackageSnapshot?.questionPackage || null,
          plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
          careBehaviorTimeline: runtimeCarePayload.careBehaviorTimeline,
          environmentCareContext: runtimeCarePayload.environmentCareContext,
          routeAnswerEffects: runtimeRouteAnswerEffects
        })
      : null
  const roundResult =
    wiltingDroopRoundResult ||
    yellowLeafRoundResult ||
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
  if (isTerminalQuestionPackageSubmit) {
    const terminalQuestionPackage =
      payload.questionPackage ||
      questionPackageSnapshot?.questionPackage ||
      getQuestionPackageByMode(questionPackageSnapshot?.mode || '', {
        questionCount: Array.isArray(questionPackageSnapshot?.packageQuestions)
          ? questionPackageSnapshot.packageQuestions.length
          : 0,
        sourceMode: questionPackageSnapshot?.sourceMode || ''
      }) ||
      null
    if (terminalQuestionPackage) {
      roundResult.questionPackage = terminalQuestionPackage
      roundResult.uiHints = buildQuestionPackageUiHints(
        roundResult.uiHints || {},
        terminalQuestionPackage,
        Number(terminalQuestionPackage.questionCount || 0)
      )
    }
  }

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
  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round,
    image: '',
    description: '',
    skipPersistence,
    awaitPersistence: !shouldReturnBeforeRoundPersistence,
    clientContext,
    sessionQuestionRows: isTerminalQuestionPackageSubmit ? null : sessionQuestionRowsForRound
  })
  runDeferredAnswerPersistence(sessionId, deferredAnswerPersistenceJobs)

  const answerResult = {
    sessionId,
    userPlantId: refreshedSessionState.userPlantId || null,
    plantId: refreshedSessionState.userPlantId || refreshedSessionState.plantId,
    plantCatalogId: refreshedSessionState.plantId || null,
    plantIdentityId:
      refreshedSessionState?.plantContext?.plantIdentityId ||
      roundResult?.plantContext?.plantIdentityId ||
      '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(roundResult, refreshedSessionState),
    diagnosisText: roundResult?.topProblem?.summary || '',
    response: roundResult,
    answerRevision,
    uiPatch
  }
  timing.finish({
    answerRevision: Boolean(answerRevision),
    hasImageInputs: Boolean(hasImageInputs)
  })
  return answerResult
}

module.exports = {
  runAnswerDiagnosis,
  _test: {
    runDeferredAnswerPersistence
  }
}
