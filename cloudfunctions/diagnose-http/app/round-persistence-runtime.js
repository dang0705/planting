'use strict'

const { upsertDiagnosisSession } = require('../services/session-state-write-service')
const {
  replaceObservedEvidenceSet,
  replaceObservedSymptoms
} = require('../services/session-runtime-write-service')
const { upsertVisualSupervisionRecords } = require('../services/session-supervision-service')
const { upsertStopState } = require('../repositories/stop-state-repository')
const { saveDiagnosisWeatherEvidenceReference } = require('../repositories/weather-repository')

function scheduleDeferredPersistence(sessionId, jobs = []) {
  const schedule = typeof setImmediate === 'function' ? setImmediate : queueMicrotask
  for (const job of jobs) {
    schedule(() => {
      Promise.resolve()
        .then(job)
        .catch(error => {
          console.error('diagnosis-http package deferred persistence failed:', {
            sessionId,
            message: String(error?.message || error || '')
          })
        })
    })
  }
}

async function persistPackageRoundRuntime({
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
  scheduleDeferredPersistence(sessionId, [
    () => upsertVisualSupervisionRecords({ sessionId, openid, response }),
    () =>
      upsertStopState({
        sessionId,
        openid,
        stopState: response?.stopState || null,
        outputEligibility: response?.outputEligibility || null
      }),
    () => saveDiagnosisWeatherEvidenceReference({ sessionId, response }),
    () => replaceObservedEvidenceSet(sessionId, openid, response?.observedEvidenceSet || []),
    () => replaceObservedSymptoms(sessionId, response?.observedSymptoms || [])
  ])
}

async function persistRoundResult({
  sessionId,
  openid,
  plantContext,
  response,
  round,
  image,
  description,
  skipPersistence = false,
  awaitPersistence = true,
  clientContext = null,
  sessionQuestionRows = null,
  questionRows = null
} = {}) {
  if (skipPersistence) {
    return
  }

  if (!awaitPersistence) {
    const runPersistence = () => {
      persistPackageRoundRuntime({
        sessionId,
        openid,
        plantContext,
        response,
        round,
        image,
        description,
        clientContext,
        sessionQuestionRows: sessionQuestionRows || questionRows
      }).catch(error => {
        console.error('diagnosis-http persist round result failed:', {
          sessionId,
          round,
          message: String(error?.message || error || '')
        })
      })
    }
    const schedule = typeof setImmediate === 'function' ? setImmediate : queueMicrotask
    schedule(runPersistence)
    return
  }

  await persistPackageRoundRuntime({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    image,
    description,
    clientContext,
    sessionQuestionRows: sessionQuestionRows || questionRows
  })
}

module.exports = { persistRoundResult }
