'use strict'

const {
  normalizePublicObservedEvidenceSet
} = require('./session-runtime-snapshot-codec')
const {
  normalizeNullableSqlNumber,
  normalizeNullableSqlText,
  normalizeNullableSqlDateTime
} = require('./session-state-write-service')
const {
  replaceObservedSymptomsRows,
  replaceObservedEvidenceSetRows
} = require('../repositories/session-runtime-write-repository')

async function replaceObservedSymptoms(sessionId, observedSymptoms = []) {
  const list = (Array.isArray(observedSymptoms) ? observedSymptoms : []).filter(item => item?.symptomKey)
  await replaceObservedSymptomsRows(
    sessionId,
    list.map(item => ({
      symptomKey: item.symptomKey,
      symptomCn: item.symptomCn || item.symptomKey,
      source: item.source || 'mixed',
      confidence: Number(item.confidence || 0)
    }))
  )
}

async function replaceObservedEvidenceSet(sessionId, openid, observedEvidenceSet = []) {
  const list = normalizePublicObservedEvidenceSet(observedEvidenceSet)
  await replaceObservedEvidenceSetRows({
    sessionId,
    openid,
    list: list.map(item => ({
      observedEvidenceSetId: item.observedEvidenceSetId,
      evidenceKey: item.evidenceKey,
      evidenceType: item.evidenceType || 'symptom',
      symptomKey: item.symptomKey,
      symptomCn: item.symptomCn || item.symptomKey,
      confidence: normalizeNullableSqlNumber(item.confidence),
      sourceType: item.sourceType || '',
      currentStatus: item.currentStatus || 'active',
      targetLayer: item.targetLayer || 'observed_evidence_set',
      parentEvidenceKey: normalizeNullableSqlText(item.parentEvidenceKey),
      sourceRecordId: normalizeNullableSqlText(item.sourceRecordId),
      originVisualCallBatchId: normalizeNullableSqlText(item.originVisualCallBatchId),
      supersededByBatchId: normalizeNullableSqlText(item.supersededByBatchId),
      independenceGroupIdsJson: JSON.stringify(item.independenceGroupIds || []),
      conflictEvidenceKeysJson: JSON.stringify(item.conflictEvidenceKeys || []),
      conflictLevel: normalizeNullableSqlText(item.conflictLevel),
      conflictResolved: Number(item.conflictResolved || 0) ? 1 : 0,
      firstSeenStage: normalizeNullableSqlText(item.firstSeenStage),
      lastUpdatedAt: normalizeNullableSqlDateTime(item.lastUpdatedAt),
      enteredRuntime: Number(item.enteredRuntime || 0) ? 1 : 0,
      isKeyEvidence: Number(item.isKeyEvidence || 0) ? 1 : 0,
      enteredExplanation: Number(item.enteredExplanation || 0) ? 1 : 0
    }))
  })
}

module.exports = {
  replaceObservedSymptoms,
  replaceObservedEvidenceSet
}
