'use strict'

const { analyzeAndPersistVisualBatch } = require('../services/visual-diagnosis-service')
const { persistRoundRuntime } = require('../services/round-runtime-persistence-service')

function emitStartVisualEvent(onVisualEvent, eventName, payload = {}) {
  if (typeof onVisualEvent !== 'function') {return}
  try {
    onVisualEvent(eventName, payload)
  } catch (error) {
    console.warn('diagnose-http start visual stream event ignored:', error?.message || error)
  }
}

async function extractVisualSymptoms({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText,
  onVisualEvent,
  llmOptions = {}
} = {}) {
  if (!Array.isArray(imageInputs) || !imageInputs.length) {
    return {
      diagnosisText: '',
      observedSymptoms: [],
      visualCallBatchId: null,
      visualBatchTrace: null,
      aggregateResult: null
    }
  }

  return analyzeAndPersistVisualBatch({
    sessionId,
    openid,
    imageInputs,
    originVisualCallBatchId,
    supersedeSource,
    onText,
    onVisualEvent,
    llmOptions
  })
}

async function extractVisualSymptomsSafely({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText,
  onVisualEvent,
  llmOptions = {}
} = {}) {
  try {
    return await extractVisualSymptoms({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId,
      supersedeSource,
      onText,
      onVisualEvent,
      llmOptions
    })
  } catch (error) {
    console.error('diagnose-http visual extraction failed:', {
      code: String(error?.code || '').trim(),
      statusCode: Number(error?.statusCode || 0) || null,
      message: String(error?.message || error || ''),
      visualCallBatchId: String(error?.visualCallBatchId || '').trim(),
      failureSummary: Array.isArray(error?.failureSummary) ? error.failureSummary : []
    })
    throw error
  }
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
  clientContext = null
}) {
  if (skipPersistence) {return}

  const persistencePromise = persistRoundRuntime({
    sessionId,
    openid,
    plantContext,
    response,
    round,
    image,
    description,
    clientContext
  })
  if (!awaitPersistence) {
    persistencePromise.catch(error => {
      console.error('diagnosis-http persist round result failed:', {
        sessionId,
        round,
        message: String(error?.message || error || '')
      })
    })
    return
  }

  await persistencePromise
}

module.exports = {
  emitStartVisualEvent,
  extractVisualSymptoms,
  extractVisualSymptomsSafely,
  persistRoundResult
}
