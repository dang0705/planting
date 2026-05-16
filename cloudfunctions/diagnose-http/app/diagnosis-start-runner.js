'use strict'

const { adaptObservedSymptoms } = require('../mappers/legacy-rule-adapter')
const { runDiagnosisRound } = require('../domain/diagnosis-engine')
const { buildSessionId } = require('../services/session-service')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  resolveRequestClientContext,
  resolveVisualImageInputs
} = require('./request-normalizers')
const {
  emitStartVisualEvent,
  extractVisualSymptomsSafely,
  persistRoundResult
} = require('./visual-runtime')

async function runStartDiagnosis({
  payload,
  openid,
  skipPersistence = false,
  onText,
  onVisualEvent
} = {}) {
  payload = payload || {}
  const clientContext = resolveRequestClientContext(payload, null)
  const legacyPlantId = payload.plantId || null
  const plantCatalogId = payload.plantCatalogId || payload.catalogPlantId || null
  const userPlantId = payload.userPlantId || null
  const plantId = plantCatalogId || legacyPlantId
  if (!userPlantId && !plantId) {
    throw Object.assign(new Error('缺少 userPlantId 或 plantCatalogId'), { statusCode: 400 })
  }

  const sessionId = buildSessionId()
  const imageInputs = resolveVisualImageInputs(payload)
  const images = imageInputs.map(item => item.imageRef)
  emitStartVisualEvent(onVisualEvent, 'visual_session_created', {
    sessionId,
    imageCount: imageInputs.length
  })
  const originVisualCallBatchId =
    payload.latestVisualCallBatchId ||
    payload.visualBatchTrace?.current_visual_call_batch_id ||
    payload.visualBatchTrace?.currentVisualCallBatchId ||
    null
  const observedEvidenceSet = Array.isArray(payload.observedEvidenceSet)
    ? payload.observedEvidenceSet
    : []
  let observedSymptoms = observedEvidenceSet.length
    ? []
    : adaptObservedSymptoms(payload.observedSymptoms || [])
  let diagnosisText = ''
  let visualExtraction = null

  if (!observedSymptoms.length && imageInputs.length) {
    visualExtraction = await extractVisualSymptomsSafely({
      sessionId,
      openid,
      imageInputs,
      originVisualCallBatchId,
      supersedeSource: 'diagnosis_start',
      onText,
      onVisualEvent
    })
    diagnosisText = visualExtraction.diagnosisText
    observedSymptoms = visualExtraction?.aggregateResult
      ? []
      : adaptObservedSymptoms(visualExtraction.observedSymptoms || [])
    emitStartVisualEvent(onVisualEvent, 'visual_extraction_complete', {
      sessionId,
      visualCallBatchId: visualExtraction?.visualCallBatchId || null,
      observedSymptomCount: Array.isArray(visualExtraction?.observedSymptoms)
        ? visualExtraction.observedSymptoms.length
        : 0,
      hasAggregateResult: Boolean(visualExtraction?.aggregateResult)
    })
  }

  const roundResult = await runDiagnosisRound({
    openid,
    plantId,
    userPlantId,
    observedSymptoms,
    observedEvidenceSet,
    visualAggregateResult: visualExtraction?.aggregateResult || null,
    answers: [],
    askedQuestionKeys: [],
    unknownCountByGroup: {},
    symptomClassState: null,
    round: 1,
    stage: 'preliminary',
    sessionId
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

  await persistRoundResult({
    sessionId,
    openid,
    plantContext: roundResult.plantContext,
    response: roundResult,
    round: 1,
    image: images[0] || '',
    description: payload.description || '',
    skipPersistence,
    clientContext
  })

  return {
    sessionId,
    userPlantId: roundResult?.plantContext?.userPlantId || userPlantId || null,
    plantId:
      roundResult?.plantContext?.userPlantId ||
      roundResult?.plantContext?.plantId ||
      plantId ||
      '',
    plantCatalogId: roundResult?.plantContext?.plantId || plantId || null,
    plantIdentityId: roundResult?.plantContext?.plantIdentityId || '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      roundResult,
      roundResult?.plantContext
    ),
    diagnosisText,
    response: roundResult
  }
}

module.exports = {
  runStartDiagnosis
}
