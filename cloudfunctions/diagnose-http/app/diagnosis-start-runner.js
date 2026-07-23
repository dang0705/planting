'use strict'

const { adaptObservedSymptoms } = require('../mappers/diagnosis-rule-adapter')
const { runDiagnosisRound } = require('../domain/diagnosis-engine')
const { buildSessionId } = require('../services/session-service')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { resolveRequestClientContext, resolveVisualImageInputs } = require('./request-normalizers')
const {
  emitStartVisualEvent,
  extractVisualSymptomsSafely,
  persistRoundResult
} = require('./visual-runtime')
const { buildPestRouteResponse } = require('./pest-visual-orchestrator')

function buildAnonymousLockedPlantContext({ latestVisualCallBatchId = '' } = {}) {
  return {
    userPlantId: null,
    plantId: null,
    plantDisplayName: '未知植物',
    plantIdentityId: '',
    identityResolutionStatus: 'unresolved',
    latestVisualCallBatchId,
    genus: '',
    family: '',
    category: '',
    watering: null,
    fertilization: null,
    sunning: null,
    ventilation: null,
    temperatureMin: null,
    temperatureMax: null,
    humidityMin: null,
    humidityMax: null,
    careAuditStatus: '',
    varianceLevel: ''
  }
}

async function runStartDiagnosis({
  payload,
  openid,
  skipPersistence = false,
  onText,
  onVisualEvent
} = {}) {
  payload = payload || {}
  const clientContext = resolveRequestClientContext(payload, null)
  const requestPlantId = payload.plantId || null
  const plantCatalogId = payload.plantCatalogId || payload.catalogPlantId || null
  const userPlantId = payload.userPlantId || null
  const plantId = plantCatalogId || requestPlantId
  const allowsAnonymousPlantContext = clientContext?.entrySource === 'diagnose_tab'
  if (!userPlantId && !plantId && !allowsAnonymousPlantContext) {
    throw Object.assign(new Error('缺少 userPlantId 或 plantCatalogId'), { statusCode: 400 })
  }
  const anonymousLockedPlantContext =
    allowsAnonymousPlantContext && !userPlantId && !plantId
      ? buildAnonymousLockedPlantContext()
      : null
  const runtimePlantId = plantId || null

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
      llmOptions: {
        diagnosisProfile: clientContext?.diagnosisProfile || payload.diagnosisProfile || 'full',
        entrySource: clientContext?.entrySource || payload.entrySource || 'diagnose_tab',
        analysisRound: 'initial',
        plantContext: anonymousLockedPlantContext || {
          plantId: runtimePlantId,
          userPlantId,
          plantCatalogId
        },
        originVisualCallBatchId
      },
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

  const pestRouteResult = visualExtraction?.aggregateResult
    ? await buildPestRouteResponse({
        sessionId,
        round: 1,
        plantContext: anonymousLockedPlantContext
          ? buildAnonymousLockedPlantContext({
              latestVisualCallBatchId: visualExtraction?.visualCallBatchId || ''
            })
          : {
              plantId: runtimePlantId,
              userPlantId,
              plantCatalogId,
              latestVisualCallBatchId: visualExtraction?.visualCallBatchId || ''
            },
        aggregateResult: visualExtraction.aggregateResult,
        diagnosisProfile: clientContext?.diagnosisProfile || payload.diagnosisProfile || 'full'
      })
    : null

  if (pestRouteResult) {
    if (visualExtraction?.visualCallBatchId) {
      pestRouteResult.latestVisualCallBatchId = visualExtraction.visualCallBatchId
    }
    if (visualExtraction?.visualBatchTrace) {
      pestRouteResult.visualBatchTrace = visualExtraction.visualBatchTrace
    }
    await persistRoundResult({
      sessionId,
      openid,
      plantContext: pestRouteResult.plantContext,
      response: pestRouteResult,
      round: 1,
      image: images[0] || '',
      description: payload.description || '',
      skipPersistence,
      clientContext
    })

    return {
      sessionId,
      userPlantId: userPlantId || null,
      plantId: userPlantId || runtimePlantId || '',
      plantCatalogId: pestRouteResult?.plantContext?.plantId || null,
      plantIdentityId: pestRouteResult?.plantContext?.plantIdentityId || '',
      latestVisualCallBatchId: resolveLatestVisualCallBatchId(
        pestRouteResult,
        pestRouteResult?.plantContext
      ),
      diagnosisText,
      visualUsage: visualExtraction?.usageSummary || null,
      aiDebug: visualExtraction?.aiDebug || [],
      response: pestRouteResult
    }
  }

  const roundResult = await runDiagnosisRound({
    openid,
    plantId: runtimePlantId,
    userPlantId,
    lockedPlantContext: anonymousLockedPlantContext,
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
      runtimePlantId ||
      '',
    plantCatalogId: roundResult?.plantContext?.plantId || runtimePlantId || null,
    plantIdentityId: roundResult?.plantContext?.plantIdentityId || '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(roundResult, roundResult?.plantContext),
    diagnosisText,
    visualUsage: visualExtraction?.usageSummary || null,
    aiDebug: visualExtraction?.aiDebug || [],
    response: roundResult
  }
}

module.exports = {
  runStartDiagnosis
}
