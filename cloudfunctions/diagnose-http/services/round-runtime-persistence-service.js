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

async function persistRoundRuntime({
  sessionId,
  openid,
  plantContext,
  response,
  round,
  image,
  description,
  clientContext = null
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

  const persistenceJobs = [
    upsertVisualSupervisionRecords({
      sessionId,
      openid,
      response
    }),
    replaceQueueForRound({
      sessionId,
      openid,
      questionQueue: response?.questionQueue || null
    }),
    upsertStopState({
      sessionId,
      openid,
      stopState: response?.stopState || null,
      outputEligibility: response?.outputEligibility || null
    })
  ]
  if (isInitialRound) {
    persistenceJobs.push(
      replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
      replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
    )
  }

  if (response?.followUpRequired) {
    persistenceJobs.push(
      appendFollowUpQuestions(sessionId, round, response?.followUps || [], {
        questionQueue: response?.questionQueue || null
      })
    )
    await Promise.all(persistenceJobs)
    return
  }

  persistenceJobs.push(
    saveFinalDiagnosisSnapshot({
      sessionId,
      openid,
      plantContext,
      response
    })
  )
  await Promise.all(persistenceJobs)
}

module.exports = {
  persistRoundRuntime
}
