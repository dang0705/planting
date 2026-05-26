'use strict'

const { fromQuestionId } = require('../mappers/public-id-mapper')
const { runDiagnosisRound } = require('../domain/diagnosis-engine')
const { getQuestionOptionMappings } = require('../repositories/question-repository')
const { buildSyntheticFollowUpOptionMappings } = require('../utils/synthetic-follow-up')
const {
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  prepareAnswerRevision,
  getSessionState,
  getObservedSymptomsBySession
} = require('../services/session-service')
const {
  markQueueItemsAnswered,
  invalidateQueueForRound
} = require('../services/question-queue-runtime-service')
const { hasConsumedFollowUpRetakeQuota } = require('../presenters/diagnosis-round-presenter-helpers')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { readQuestionKeyFromRationale, readRoundFromRationale } = require('../services/session-follow-up-service')
const {
  pickQuestionKeysFromQuestionQueue,
  buildAskedQuestionRowsFromFollowUpRows,
  buildRuntimeAnswersFromFollowUpUpdates,
  buildRuntimeUnknownCountByGroup,
  resolveVisualImageInputs,
  stripVisualEvidenceItems,
  normalizeRoundFromRoundId,
  normalizePublicAnswers,
  normalizeRequestMode,
  resolveNextAnswerRevision,
  resolveRequestClientContext
} = require('./request-normalizers')
const { extractVisualSymptomsSafely, persistRoundResult } = require('./visual-runtime')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const {
  createReviewTimingLogger
} = require('../repositories/diagnosis-review/review-performance')
const { triggerStaticRepositoryCachePreload } = require('./static-cache-preloader')

function runDeferredAnswerPersistence(sessionId = '', jobs = []) {
  for (const job of jobs) {
    if (typeof job !== 'function') {continue}
    Promise.resolve()
      .then(job)
      .catch(error => {
        console.error('diagnosis-answer deferred persistence failed:', {
          sessionId,
          message: String(error?.message || error || '')
        })
      })
  }
}

function collectAnsweredQuestionKeysFromFollowUpRows(rows = []) {
  const answeredRows = Array.isArray(rows) ? rows : []
  const keys = new Set()
  for (const row of answeredRows) {
    if (Number(row?.asked || 0) !== 1) {
      continue
    }

    const questionKey = readQuestionKeyFromRationale(row?.rationale || '') ||
      String(row?.symptom_key || '').trim()
    if (questionKey) {
      keys.add(questionKey)
    }
  }

  return Array.from(keys)
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
    hasAnswers: Array.isArray(sessionState?.answeredAnswers) && sessionState.answeredAnswers.length > 0,
    hasFollowUpRows: Array.isArray(sessionState?.followUpRows) && sessionState.followUpRows.length > 0
  })
  triggerStaticRepositoryCachePreload({
    scope: 'diagnosis-answer',
    sessionId,
    openid,
    source: 'answer_runner'
  })
  timing.mark('static-cache-preload-triggered')

  const answers = normalizePublicAnswers(payload.answers || payload.followUpAnswers || [])
  const imageInputs = resolveVisualImageInputs(payload)
  const hasAnswers = answers.length > 0
  const hasImageInputs = imageInputs.length > 0
  const requestMode = normalizeRequestMode(payload.requestMode || payload.mode || '')
  const isAnswerRevision = requestMode === 'answer_revision'
  const dirtyQuestionKey = isAnswerRevision
    ? fromQuestionId(payload.dirtyFromQuestionId || '') ||
      String(payload.dirtyFromQuestionKey || payload.dirtyQuestionKey || payload.dirtyFromQuestionId || '').trim()
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
    throw Object.assign(new Error('follow-up 阶段答题与补图必须分开提交'), { statusCode: 400 })
  }

  const observedSymptoms = Array.isArray(sessionState.observedEvidenceSet) &&
    sessionState.observedEvidenceSet.length
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
  let runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
  let runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
  let runtimeAnsweredQuestionGroupKeys = refreshedSessionState.answeredQuestionGroupKeys || []
  let runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup
  const runtimeSessionFollowUpRows = Array.isArray(refreshedSessionState.followUpRows)
    ? refreshedSessionState.followUpRows
    : []
  const sessionAnsweredFollowUpQuestionKeys = collectAnsweredQuestionKeysFromFollowUpRows(
    runtimeSessionFollowUpRows
  )
  const currentQuestionQueue = refreshedSessionState.questionQueue || null
  let runtimeAnswerOptionMappings = []
  let runtimeRouteAnswerEffects = []
  let runtimeFollowUpRowsForRound = runtimeSessionFollowUpRows
  let runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeSessionFollowUpRows)
  const requiredAnswerPersistenceTasks = []
  const deferredAnswerPersistenceJobs = []

  if (hasAnswers) {
    const questionKeys = Array.from(new Set(answers.map(item => item.questionKey).filter(Boolean)))
    const routeAnswerEffectQuestionKeys = Array.from(new Set([
      ...questionKeys,
      ...sessionAnsweredFollowUpQuestionKeys,
      ...(Array.isArray(refreshedSessionState.answeredAnswers)
        ? refreshedSessionState.answeredAnswers
          .map(item => String(item?.questionKey || '').trim())
          .filter(Boolean)
        : [])
    ]))
    const optionMappingPromise = questionKeys.length
      ? getQuestionOptionMappings(questionKeys)
      : Promise.resolve([])
    const routeAnswerEffectsPromise = routeAnswerEffectQuestionKeys.length
      ? outcomeRouteRepository.getOutcomeAnswerEffects(routeAnswerEffectQuestionKeys)
      : Promise.resolve([])
    const questionQueueKeysForValidation = Number(answerRound || 1) === Number(sessionState?.questionQueue?.roundIndex || 0)
      ? pickQuestionKeysFromQuestionQueue(sessionState.questionQueue)
      : new Set(
        runtimeSessionFollowUpRows
          .filter(row => {
            const normalizedRound = Number(readRoundFromRationale(row?.rationale || '') || 1)
            const asked = Number(row?.asked || 0) === 0
            const questionKey = readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim()
            return normalizedRound === Number(answerRound || 1) && asked && questionKey
          })
          .map(row =>
            readQuestionKeyFromRationale(row?.rationale || '') ||
            String(row?.symptom_key || '').trim()
          )
      )
    const [ownership, questionOptionMappingsFromStore, routeAnswerEffectsFromStore] = isAnswerRevision
      ? await Promise.all([Promise.resolve(null), optionMappingPromise, routeAnswerEffectsPromise])
      : await Promise.all([
        validateFollowUpAnswerOwnership(sessionId, answers, answerRound, {
          followUpRows: runtimeSessionFollowUpRows,
          queuedQuestionKeys: questionQueueKeysForValidation
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

    const optionMappings = [
      ...questionOptionMappingsFromStore,
      ...buildSyntheticFollowUpOptionMappings(questionKeys)
    ]
    runtimeAnswerOptionMappings = optionMappings
    runtimeFollowUpRowsForRound = Array.isArray(ownership?.followUpRows)
      ? ownership.followUpRows
      : runtimeSessionFollowUpRows
    runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    const validPairs = new Set(
      optionMappings.map(item => `${item.questionKey}::${item.optionKey}`)
    )
    const invalidPairs = answers.filter(
      item => !validPairs.has(`${item.questionKey}::${item.optionKey}`)
    )

    if (invalidPairs.length) {
      throw Object.assign(new Error('问诊选项不属于当前问题'), { statusCode: 400 })
    }

    if (isAnswerRevision) {
      const nextAnswerRevision = resolveNextAnswerRevision(sessionState, payload.baseAnswerRevision)
      const answerRevisionBefore = Math.max(
        Number(sessionState?.runtimeSnapshot?.answerRevision || 0),
        Number(payload.baseAnswerRevision || 0)
      )
      const revision = await prepareAnswerRevision({
        sessionId,
        openid,
        answers,
        dirtyQuestionKey,
        optionMappings,
        followUpRows: runtimeSessionFollowUpRows,
        answerRevisionBefore,
        answerRevisionAfter: nextAnswerRevision
      })
      if (!revision.ok) {
        throw Object.assign(new Error('改写题目不属于当前会话'), { statusCode: 400 })
      }

      const invalidationStartRound = Number(revision.dirtyRound || 1)
      const invalidationEndRound = Number(expectedRound || 1)
      const staleRoundCount = Math.max(invalidationEndRound - invalidationStartRound + 1, 0)
      await Promise.all(
        Array.from({ length: staleRoundCount }, (_, index) => {
          const staleRound = invalidationStartRound + index
          return invalidateQueueForRound(sessionId, openid, staleRound, 'answer_revision', {
            questionQueue:
              Number(staleRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
                ? currentQuestionQueue
                : null
          })
        })
      )
      await markQueueItemsAnswered(
        sessionId,
        openid,
        revision.dirtyRound,
        revision.effectiveAnswers,
        {
          questionQueue:
            Number(revision.dirtyRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
              ? currentQuestionQueue
              : null
        }
      )
      answerRevision = nextAnswerRevision
      uiPatch = {
        keepUntilQuestionId: revision.keepUntilQuestionId,
        invalidatedFromQuestionId: revision.invalidatedFromQuestionId
      }
      refreshedSessionState = await getSessionState(openid, sessionId)
      if (!refreshedSessionState) {
        throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
      }

      runtimeAnswers = Array.isArray(refreshedSessionState.answeredAnswers) &&
        refreshedSessionState.answeredAnswers.length
          ? refreshedSessionState.answeredAnswers
          : answers
      runtimeObservedEvidenceSet = refreshedSessionState.observedEvidenceSet || []
      runtimeAskedQuestionKeys = refreshedSessionState.askedQuestionKeys
      runtimeAnsweredQuestionGroupKeys = refreshedSessionState.answeredQuestionGroupKeys || []
      runtimeUnknownCountByGroup = refreshedSessionState.unknownCountByGroup
      runtimeFollowUpRowsForRound = Array.isArray(refreshedSessionState.followUpRows)
        ? refreshedSessionState.followUpRows
        : runtimeFollowUpRowsForRound
      runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    } else {
      const markResultPromise = markFollowUpAnswers(sessionId, answers, {
        optionMappings,
        answerRound,
        followUpRows: runtimeFollowUpRowsForRound,
        awaitPersistence: false
      })
      deferredAnswerPersistenceJobs.push(() => markQueueItemsAnswered(
          sessionId,
          openid,
          answerRound,
          answers,
          {
            questionQueue:
              Number(answerRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
                ? currentQuestionQueue
                : null
          }
      ))
      const markResult = await markResultPromise
      if (Array.isArray(markResult?.pendingWrites)) {
        requiredAnswerPersistenceTasks.push(...markResult.pendingWrites)
      }
      timing.mark('follow-up-answers-marked', {
        updatedAnswerCount: Array.isArray(markResult?.updatedAnswers)
          ? markResult.updatedAnswers.length
          : 0
      })
      timing.mark('question-queue-marked', {
        answerRound
      })
      const updatedFollowUpAnswers = Array.isArray(markResult?.updatedAnswers)
        ? markResult.updatedAnswers
        : []
      runtimeAnswers = buildRuntimeAnswersFromFollowUpUpdates(
        refreshedSessionState.answeredAnswers || [],
        updatedFollowUpAnswers
      )
      runtimeAskedQuestionKeys = Array.from(new Set([
        ...(Array.isArray(refreshedSessionState.askedQuestionKeys)
          ? refreshedSessionState.askedQuestionKeys
          : []),
        ...updatedFollowUpAnswers.map(item => String(item?.questionKey || '').trim()).filter(Boolean)
      ]))
      runtimeAnsweredQuestionGroupKeys = Array.from(new Set([
        ...(Array.isArray(refreshedSessionState.answeredQuestionGroupKeys)
          ? refreshedSessionState.answeredQuestionGroupKeys
          : []),
        ...updatedFollowUpAnswers
          .map(item => String(item?.questionGroupKey || '').trim())
          .filter(item => item && item !== '__default__')
      ]))
      runtimeUnknownCountByGroup = buildRuntimeUnknownCountByGroup(
        refreshedSessionState.unknownCountByGroup,
        updatedFollowUpAnswers
      )
      runtimeFollowUpRowsForRound = markResult?.followUpRows || runtimeFollowUpRowsForRound
      runtimeAskedQuestionRows = buildAskedQuestionRowsFromFollowUpRows(runtimeFollowUpRowsForRound)
    }
  }

  if (hasImageInputs) {
    await invalidateQueueForRound(sessionId, openid, answerRound, 'retake_branch', {
      questionQueue:
        Number(answerRound || 1) === Number(currentQuestionQueue?.roundIndex || 0)
          ? currentQuestionQueue
          : null
    })
    if (hasConsumedFollowUpRetakeQuota(refreshedSessionState.visualBatchTrace || null)) {
      throw Object.assign(new Error('follow-up 阶段补图次数已达上限'), { statusCode: 400 })
    }

    visualExtraction = await extractVisualSymptomsSafely({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId:
        refreshedSessionState.latestVisualCallBatchId ||
        refreshedSessionState?.plantContext?.latestVisualCallBatchId ||
        '',
      supersedeSource: 'diagnosis_followup_image'
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

  const round = answerRound + 1

  timing.mark('round-starting', {
    round,
    hasImageInputs: Boolean(hasImageInputs),
    answerCount: Array.isArray(runtimeAnswers) ? runtimeAnswers.length : 0,
    askedQuestionCount: Array.isArray(runtimeAskedQuestionKeys) ? runtimeAskedQuestionKeys.length : 0
  })
  const roundResult = await runDiagnosisRound({
    openid,
    userPlantId: refreshedSessionState.userPlantId,
    plantId: refreshedSessionState.plantId,
    lockedPlantContext: refreshedSessionState.plantContext,
    observedSymptoms: hasImageInputs ? [] : observedSymptoms,
    observedEvidenceSet: runtimeObservedEvidenceSet,
    visualAggregateResult:
      visualExtraction?.aggregateResult ||
      refreshedSessionState.visualAggregateResult ||
      null,
    answers: runtimeAnswers,
    askedQuestionKeys: runtimeAskedQuestionKeys,
    answeredQuestionGroupKeys: runtimeAnsweredQuestionGroupKeys,
    unknownCountByGroup: runtimeUnknownCountByGroup,
    symptomClassState: refreshedSessionState.symptomClassRuntime || null,
    round,
    stage: 'followup',
    sessionId,
    answerOptionMappings: runtimeAnswerOptionMappings,
    storedFollowUpRows: runtimeFollowUpRowsForRound,
    preloadedAskedQuestionRows: runtimeAskedQuestionRows,
    preloadedRouteAnswerEffects: runtimeRouteAnswerEffects,
    perfLogger: timing
  })

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

  await Promise.all(requiredAnswerPersistenceTasks)
  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round,
    image: '',
    description: '',
    skipPersistence,
    awaitPersistence: true,
    clientContext,
    followUpRows: runtimeFollowUpRowsForRound
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
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      roundResult,
      refreshedSessionState
    ),
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
