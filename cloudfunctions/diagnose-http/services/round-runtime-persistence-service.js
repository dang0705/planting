'use strict'

const {
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  saveFinalDiagnosisSnapshot
} = require('./session-service')
const { replaceQueueForRound } = require('../repositories/question-queue-repository')
const { upsertStopState } = require('../repositories/stop-state-repository')
const {
  shouldWriteLegacyQuestionRows,
  writeLegacyRoundQuestionRows
} = require('./legacy-round-question-row-adapter')

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
    answerSubmitMode: questionPackage.answerSubmitMode || '',
    questionDisplayMode: questionPackage.questionDisplayMode || '',
    packageQuestions
  }
}

function runDeferredPersistenceJobs(sessionId = '', jobs = []) {
  for (const job of jobs) {
    if (typeof job !== 'function') {
      continue
    }
    Promise.resolve()
      .then(job)
      .catch(error => {
        console.error('diagnosis-http deferred persistence failed:', {
          sessionId,
          message: String(error?.message || error || '')
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
  legacyQuestionRows = null,
  questionPackageSnapshotOnly = false
} = {}) {
  const isInitialRound = Number(round || 1) <= 1
  const persistenceResponse = questionPackageSnapshotOnly
    ? {
        ...response,
        questionQueue: null,
        questionPackageSnapshot: buildQuestionPackageSnapshot(response)
      }
    : response
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
      replaceQueueForRound({
        sessionId,
        openid,
        questionQueue: persistenceResponse?.questionQueue || null
      }),
    () =>
      upsertStopState({
        sessionId,
        openid,
        stopState: persistenceResponse?.stopState || null,
        outputEligibility: persistenceResponse?.outputEligibility || null
      })
  ]
  if (questionPackageSnapshotOnly) {
    deferredPersistenceJobs.splice(1, 1)
  }
  if (isInitialRound) {
    deferredPersistenceJobs.push(
      () => replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
      () => replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
    )
  }

  if (questionPackageSnapshotOnly || shouldWriteLegacyQuestionRows(response)) {
    if (!questionPackageSnapshotOnly) {
      await writeLegacyRoundQuestionRows({
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
    questionRows: legacyQuestionRows
  })
  runDeferredPersistenceJobs(sessionId, deferredPersistenceJobs)
}

module.exports = {
  persistRoundRuntime,
  _test: {
    buildQuestionPackageSnapshot,
    runDeferredPersistenceJobs
  }
}
