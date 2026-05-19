'use strict'

const {
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  appendFollowUpQuestions,
  saveFinalDiagnosisSnapshot
} = require('./session-service')
const { replaceQueueForRound } = require('../repositories/question-queue-repository')
const { upsertStopState } = require('../repositories/stop-state-repository')

function runDeferredPersistenceJobs(sessionId = '', jobs = []) {
  for (const job of jobs) {
    if (typeof job !== 'function') {continue}
    void Promise.resolve()
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
  followUpRows = null
} = {}) {
  const isInitialRound = Number(round || 1) <= 1
  await upsertDiagnosisSession({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    reliabilityScore: response?.metrics?.reliabilityScore || 0,
    mode: 'new_v13',
    image,
    description,
    clientContext
  })

  const deferredPersistenceJobs = [
    () => upsertVisualSupervisionRecords({
      sessionId,
      openid,
      response
    }),
    () => replaceQueueForRound({
      sessionId,
      openid,
      questionQueue: response?.questionQueue || null
    }),
    () => upsertStopState({
      sessionId,
      openid,
      stopState: response?.stopState || null,
      outputEligibility: response?.outputEligibility || null
    })
  ]
  if (isInitialRound) {
    deferredPersistenceJobs.push(
      () => replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
      () => replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
    )
  }

  if (response?.followUpRequired) {
    await appendFollowUpQuestions(sessionId, round, response?.followUps || [], {
      questionQueue: response?.questionQueue || null,
      assumeNoExisting: isInitialRound
    })
    runDeferredPersistenceJobs(sessionId, deferredPersistenceJobs)
    return
  }

  await saveFinalDiagnosisSnapshot({
    sessionId,
    openid,
    plantContext,
    response,
    followUpRows
  })
  runDeferredPersistenceJobs(sessionId, deferredPersistenceJobs)
}

module.exports = {
  persistRoundRuntime,
  _test: {
    runDeferredPersistenceJobs
  }
}
