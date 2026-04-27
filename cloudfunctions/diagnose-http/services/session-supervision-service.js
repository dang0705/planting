'use strict'

const crypto = require('crypto')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { normalizeStoredNullableText } = require('../utils/stored-value')
const {
  listVisualAdmissionRowsBySession,
  upsertVisualSupervisionRows
} = require('../repositories/session-supervision-repository')
const {
  normalizeVisualBatchTraceForSupervision,
  normalizeAnswerEffectsForSupervision,
  resolveQuestionCorrectionScopeForSymptom
} = require('./session-service-helpers')
const {
  normalizePublicObservedEvidenceSet
} = require('./session-runtime-snapshot-codec')

function buildVisualSupervisionRecordId(sessionId = '', visualAdmissionRecordId = '') {
  const hash = crypto
    .createHash('sha1')
    .update(`${String(sessionId || '').trim()}::${String(visualAdmissionRecordId || '').trim()}`)
    .digest('hex')
    .slice(0, 24)

  return `vissup_${hash}`
}

async function upsertVisualSupervisionRecords({
  sessionId,
  openid,
  response
} = {}) {
  const admissionRows = await listVisualAdmissionRowsBySession(sessionId)
  if (!admissionRows.length) {
    return
  }

  const observedEvidenceSet = normalizePublicObservedEvidenceSet(response?.observedEvidenceSet || [])
  const activeEvidenceItems = observedEvidenceSet.filter(item =>
    ['active', 'retained'].includes(String(item?.currentStatus || 'active').trim().toLowerCase())
  )
  const activeAdmissionIds = new Set(
    activeEvidenceItems
      .map(item => normalizeStoredNullableText(item?.sourceRecordId || '', ''))
      .filter(Boolean)
  )
  const activeSymptomKeys = new Set(
    activeEvidenceItems
      .map(item => normalizeStoredNullableText(item?.symptomKey || '', ''))
      .filter(Boolean)
  )
  const answerEffects = normalizeAnswerEffectsForSupervision(response?.answerEffects || [])
  const touchedSymptomKeys = new Set(answerEffects.map(item => item.mappedSymptomKey))
  const negativeSymptomKeys = new Set(
    answerEffects
      .filter(item => item.effectType === 'negative')
      .map(item => item.mappedSymptomKey)
  )
  const trace = normalizeVisualBatchTraceForSupervision(response?.visualBatchTrace)
  const currentVisualCallBatchId = resolveLatestVisualCallBatchId(response, trace)
  const hasFinalDecision = !response?.followUpRequired && Boolean(
    normalizeStoredNullableText(response?.outcomeType || '', '') ||
      normalizeStoredNullableText(response?.stopReason || '', '') ||
      normalizeStoredNullableText(response?.sessionStatus || '', '') === 'completed'
  )

  const supervisionRows = admissionRows.map(item => {
    const visualAdmissionRecordId = normalizeStoredNullableText(item?.visual_admission_record_id || '', '')
    const visualCallBatchId = normalizeStoredNullableText(item?.visual_call_batch_id || '', '')
    const symptomKey = normalizeStoredNullableText(item?.object_key || '', '')
    const adoptedByEvidence = Number(
      activeAdmissionIds.has(visualAdmissionRecordId) ||
      (symptomKey && activeSymptomKeys.has(symptomKey))
    )
      ? 1
      : 0
    const correctedByQuestion = Number(symptomKey && touchedSymptomKeys.has(symptomKey)) ? 1 : 0
    const supersededByRetake = Number(
      trace.supersedeApplied &&
      currentVisualCallBatchId &&
      visualCallBatchId &&
      visualCallBatchId !== currentVisualCallBatchId
    )
      ? 1
      : 0
    const deniedByRuntime = adoptedByEvidence
      ? 0
      : Number((symptomKey && negativeSymptomKeys.has(symptomKey)) || supersededByRetake)
        ? 1
        : 0
    const deniedByOutcomeCompetition =
      adoptedByEvidence || deniedByRuntime || !hasFinalDecision ? 0 : 1

    return {
      visualSupervisionRecordId: buildVisualSupervisionRecordId(sessionId, visualAdmissionRecordId),
      openid: String(openid || ''),
      sessionId,
      visualCallBatchId,
      visualAdmissionRecordId,
      adoptedByEvidence,
      correctedByQuestion,
      deniedByRuntime,
      deniedByOutcomeCompetition,
      questionCorrectionScope: resolveQuestionCorrectionScopeForSymptom(
        answerEffects,
        symptomKey
      ),
      finalOutcomeType: normalizeStoredNullableText(response?.outcomeType, null),
      finalStopReason: normalizeStoredNullableText(response?.stopReason, null)
    }
  })
    .filter(item => item.visualAdmissionRecordId)

  if (!supervisionRows.length) {
    return
  }

  await upsertVisualSupervisionRows(supervisionRows)
}

module.exports = {
  upsertVisualSupervisionRecords
}
