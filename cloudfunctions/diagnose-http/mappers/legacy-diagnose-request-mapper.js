'use strict'

const { adaptLegacyQuestionAnswers } = require('./legacy-rule-adapter')

function isLegacyQuestionPayload(payload = {}) {
  return String(payload?.mode || '').toLowerCase() === 'follow_up' ||
    Array.isArray(payload?.questionAnswers)
}

function buildLegacyQuestionPayload(payload = {}) {
  return {
    diagnosisSessionId: payload?.diagnosisId,
    roundId: payload?.roundId || '',
    questionAnswers: adaptLegacyQuestionAnswers(payload?.questionAnswers || [])
  }
}

function buildLegacyStartPayload(payload = {}) {
  return {
    plantId: payload?.plantId,
    userPlantId: payload?.userPlantId,
    plantCatalogId: payload?.plantCatalogId || payload?.catalogPlantId,
    image: payload?.image,
    images: payload?.images,
    imageInputs: payload?.imageInputs,
    imageIds: payload?.imageIds,
    observedSymptoms: payload?.observedSymptoms,
    observedEvidenceSet: payload?.observedEvidenceSet,
    latestVisualCallBatchId: payload?.latestVisualCallBatchId,
    visualBatchTrace: payload?.visualBatchTrace,
    description: payload?.description || ''
  }
}

module.exports = {
  isLegacyQuestionPayload,
  buildLegacyQuestionPayload,
  buildLegacyStartPayload
}
