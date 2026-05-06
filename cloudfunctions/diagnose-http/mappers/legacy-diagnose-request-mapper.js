'use strict'

const { adaptLegacyFollowUpAnswers } = require('./legacy-rule-adapter')

function isLegacyFollowUpPayload(payload = {}) {
  return String(payload?.mode || '').toLowerCase() === 'follow_up' ||
    Array.isArray(payload?.followUpAnswers)
}

function buildLegacyFollowUpPayload(payload = {}) {
  return {
    diagnosisSessionId: payload?.diagnosisId,
    roundId: payload?.roundId || '',
    followUpAnswers: adaptLegacyFollowUpAnswers(payload?.followUpAnswers || [])
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
  isLegacyFollowUpPayload,
  buildLegacyFollowUpPayload,
  buildLegacyStartPayload
}
