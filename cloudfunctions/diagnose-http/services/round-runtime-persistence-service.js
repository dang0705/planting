'use strict'

const {
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  saveFinalDiagnosisSnapshot
} = require('./session-service')
const { upsertStopState } = require('../repositories/stop-state-repository')
const { saveDiagnosisWeatherEvidenceReference } = require('../repositories/weather-repository')
const {
  shouldWriteSessionQuestionRows,
  writeSessionRoundQuestionRows
} = require('./round-question-row-adapter')

function buildQuestionPackageSnapshot(response = {}) {
  const questionPackage = response?.questionPackage || {}
  const packageQuestions = Array.isArray(response?.packageQuestions)
    ? response.packageQuestions
    : Array.isArray(response?.questions)
      ? response.questions
      : Array.isArray(questionPackage?.packageQuestions)
        ? questionPackage.packageQuestions
        : Array.isArray(questionPackage?.questions)
          ? questionPackage.questions
          : []
  return {
    mode: questionPackage.mode || '',
    route: questionPackage.route || '',
    sourceMode: questionPackage.sourceMode || '',
    packageVersion: Number(questionPackage.packageVersion || 1),
    answerSubmitMode: questionPackage.answerSubmitMode || '',
    questionDisplayMode: questionPackage.questionDisplayMode || '',
    fixedQuestionPackage: Boolean(questionPackage.fixedQuestionPackage),
    dynamicQuestionPackage: Boolean(questionPackage.dynamicQuestionPackage),
    candidateModes: Array.isArray(questionPackage.candidateModes)
      ? questionPackage.candidateModes
      : [],
    hiddenPrefilledEvidence: Array.isArray(questionPackage.hiddenPrefilledEvidence)
      ? questionPackage.hiddenPrefilledEvidence
      : [],
    outcomePolicy:
      questionPackage.outcomePolicy && typeof questionPackage.outcomePolicy === 'object'
        ? questionPackage.outcomePolicy
        : null,
    packageQuestions
  }
}

function mergeQuestionPackageRuntimeData(snapshot = null, runtimeData = null) {
  if (!runtimeData || typeof runtimeData !== 'object') {
    return snapshot
  }
  return {
    ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    questionPackageRuntimeData: {
      answerEffects: Array.isArray(runtimeData.answerEffects) ? runtimeData.answerEffects : [],
      diagnosisOutcomes: Array.isArray(runtimeData.diagnosisOutcomes)
        ? runtimeData.diagnosisOutcomes
        : [],
      actionProfiles: Array.isArray(runtimeData.actionProfiles) ? runtimeData.actionProfiles : []
    }
  }
}

function shouldPersistQuestionPackageSnapshot(response = {}, explicitSnapshotOnly = false) {
  if (explicitSnapshotOnly || response?.questionPackageSnapshot) {
    return true
  }
  const questionPackage = response?.questionPackage || {}
  const packageQuestions = Array.isArray(response?.questions)
    ? response.questions
    : Array.isArray(questionPackage?.packageQuestions)
      ? questionPackage.packageQuestions
      : []
  return Boolean(
    questionPackage &&
    typeof questionPackage === 'object' &&
    questionPackage.answerSubmitMode === 'package' &&
    packageQuestions.length
  )
}

function runDeferredPersistenceJobs(sessionId = '', jobs = []) {
  const schedule = typeof setImmediate === 'function' ? setImmediate : queueMicrotask
  for (const job of jobs) {
    if (typeof job !== 'function') {
      continue
    }
    schedule(() => {
      Promise.resolve()
        .then(job)
        .catch(error => {
          console.error('diagnosis-http deferred persistence failed:', {
            sessionId,
            message: String(error?.message || error || '')
          })
        })
    })
  }
}

async function persistRoundRuntime({
  sessionId,
  openid,
  plantContext,
  response,
  round,
  image,
  description,
  clientContext = null,
  sessionQuestionRows = null,
  questionPackageSnapshotOnly = false,
  questionPackageRuntimeData = null
} = {}) {
  const isInitialRound = Number(round || 1) <= 1
  const shouldWriteQuestionPackageSnapshot = shouldPersistQuestionPackageSnapshot(
    response,
    questionPackageSnapshotOnly
  )
  const persistenceResponse = shouldWriteQuestionPackageSnapshot
    ? {
        ...response,
        questionPackageSnapshot: mergeQuestionPackageRuntimeData(
          response?.questionPackageSnapshot || buildQuestionPackageSnapshot(response),
          questionPackageRuntimeData
        )
      }
    : response
  // 固定题包的完整提交会携带 questionPackage，并由 answer runner 从会话快照校验题目归属。
  // 此时再同步写入逐题 follow-up 行只增加一次串行数据库写入，既不参与首屏展示，也不是
  // answer_submit 的必要数据。保留会话快照作为唯一运行时来源，避免 start 接口等待这次写入。
  const shouldWriteSessionQuestionRowsForRound =
    shouldWriteSessionQuestionRows(response) && !questionPackageSnapshotOnly
  await upsertDiagnosisSession({
    sessionId,
    openid,
    plantContext,
    response: persistenceResponse,
    round,
    reliabilityScore: persistenceResponse?.metrics?.reliabilityScore || 0,
    mode: 'new_v13',
    image,
    description,
    clientContext
  })

  const deferredPersistenceJobs = [
    () =>
      upsertVisualSupervisionRecords({
        sessionId,
        openid,
        response: persistenceResponse
      }),
    () =>
      upsertStopState({
        sessionId,
        openid,
        stopState: persistenceResponse?.stopState || null,
        outputEligibility: persistenceResponse?.outputEligibility || null
      }),
    () =>
      saveDiagnosisWeatherEvidenceReference({
        sessionId,
        response: persistenceResponse
      })
  ]
  if (isInitialRound) {
    deferredPersistenceJobs.push(
      () => replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
      () => replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
    )
  }

  if (shouldWriteQuestionPackageSnapshot || shouldWriteSessionQuestionRowsForRound) {
    if (shouldWriteSessionQuestionRowsForRound) {
      await writeSessionRoundQuestionRows({
        sessionId,
        round,
        response,
        isInitialRound
      })
    }
    runDeferredPersistenceJobs(sessionId, deferredPersistenceJobs)
    return
  }

  await saveFinalDiagnosisSnapshot({
    sessionId,
    openid,
    plantContext,
    response,
    questionRows: sessionQuestionRows
  })
  runDeferredPersistenceJobs(sessionId, deferredPersistenceJobs)
}

module.exports = {
  persistRoundRuntime,
  _test: {
    buildQuestionPackageSnapshot,
    shouldPersistQuestionPackageSnapshot,
    mergeQuestionPackageRuntimeData,
    runDeferredPersistenceJobs
  }
}
