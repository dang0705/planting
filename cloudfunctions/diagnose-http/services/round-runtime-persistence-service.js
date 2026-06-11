'use strict'

const {
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  saveFinalDiagnosisSnapshot
} = require('./session-service')
const { upsertStopState } = require('../repositories/stop-state-repository')
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
  sessionQuestionRows = null,
  questionPackageSnapshotOnly = false
} = {}) {
  const isInitialRound = Number(round || 1) <= 1
  const persistenceResponse = questionPackageSnapshotOnly
    ? {
        ...response,
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
      upsertStopState({
        sessionId,
        openid,
        stopState: persistenceResponse?.stopState || null,
        outputEligibility: persistenceResponse?.outputEligibility || null
      })
  ]
  if (isInitialRound) {
    deferredPersistenceJobs.push(
      () => replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
      () => replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
    )
  }

  if (questionPackageSnapshotOnly || shouldWriteSessionQuestionRows(response)) {
    if (!questionPackageSnapshotOnly) {
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
    runDeferredPersistenceJobs
  }
}
