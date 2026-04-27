'use strict'

const {
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  replaceProblemRankings,
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

  await replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || [])
  await replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
  await replaceProblemRankings(sessionId, response?.rankings || [])
  await upsertVisualSupervisionRecords({
    sessionId,
    openid,
    response
  })
  await replaceQueueForRound({
    sessionId,
    openid,
    questionQueue: response?.questionQueue || null
  })
  await upsertStopState({
    sessionId,
    openid,
    stopState: response?.stopState || null,
    outputEligibility: response?.outputEligibility || null
  })

  if (response?.followUpRequired) {
    await appendFollowUpQuestions(sessionId, round, response?.followUps || [], {
      questionQueue: response?.questionQueue || null
    })
    return
  }

  await saveFinalDiagnosisSnapshot({
    sessionId,
    openid,
    plantContext,
    response
  })
}

module.exports = {
  persistRoundRuntime
}
