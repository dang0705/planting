'use strict'

const { resolveDiagnosisModeRoute } = require('../domain/diagnosis-mode-router')
const { buildBatchModelDirectDecision } = require('../domain/visual-direct-decision')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeKey(value = '', conservative = '') {
  return normalizeText(value, conservative).toLowerCase()
}

function normalizeCandidateEvidence(candidate = {}) {
  const symptomKey = normalizeKey(candidate?.symptom_key || candidate?.symptomKey || '')
  if (!symptomKey) {
    return null
  }
  return {
    evidenceKey: symptomKey,
    symptomKey,
    evidenceGroup: normalizeKey(candidate?.evidence_group || candidate?.evidenceGroup || ''),
    confidenceBand: normalizeKey(candidate?.confidence_band || candidate?.confidenceBand || 'low'),
    strengthLevel: normalizeKey(candidate?.strength_level || candidate?.strengthLevel || 'weak'),
    normalizedOrgan: normalizeKey(
      candidate?.primary_support_organ ||
        candidate?.normalized_organ ||
        candidate?.normalizedOrgan ||
        candidate?.support_organs?.[0] ||
        'unknown'
    ),
    visibilityScope: normalizeKey(candidate?.visibility_scope || candidate?.visibilityScope || 'organ'),
    imageId: normalizeText(candidate?.primary_support_image_id || candidate?.imageId || ''),
    regionRef: normalizeCaptureRegion(
      candidate?.primary_capture_region || candidate?.region_ref || candidate?.capture_region
    ),
    sourceRecordId: normalizeText(candidate?.primary_visual_normalized_image_result_id || ''),
    currentStatus: 'active'
  }
}

function buildAdmittedVisualEvidence(aggregateResult = {}) {
  const candidatesByKey = new Map(
    (Array.isArray(aggregateResult.aggregated_symptom_candidates)
      ? aggregateResult.aggregated_symptom_candidates
      : []
    ).map(candidate => [normalizeKey(candidate?.symptom_key || ''), candidate])
  )

  return (Array.isArray(aggregateResult.admission_records) ? aggregateResult.admission_records : [])
    .filter(record => record?.admission_result === 'formally_admitted')
    .map(record => {
      const key = normalizeKey(record?.object_key || '')
      return normalizeCandidateEvidence({
        ...(candidatesByKey.get(key) || {}),
        symptom_key: key,
        primary_visual_normalized_image_result_id: record?.visual_normalized_image_result_id || ''
      })
    })
    .filter(Boolean)
}

function buildRetainedVisualEvidence(aggregateResult = {}) {
  const candidatesByKey = new Map(
    (Array.isArray(aggregateResult.aggregated_symptom_candidates)
      ? aggregateResult.aggregated_symptom_candidates
      : []
    ).map(candidate => [normalizeKey(candidate?.symptom_key || ''), candidate])
  )

  return (Array.isArray(aggregateResult.admission_records) ? aggregateResult.admission_records : [])
    .filter(
      record =>
        record?.admission_result !== 'formally_admitted' &&
        (!record?.object_type || record.object_type === 'symptom')
    )
    .map(record => {
      const key = normalizeKey(record?.object_key || '')
      return normalizeCandidateEvidence({
        ...(record?.candidate || candidatesByKey.get(key) || {}),
        symptom_key: key,
        primary_visual_normalized_image_result_id: record?.visual_normalized_image_result_id || ''
      })
    })
    .filter(Boolean)
}

function buildVisualModeCandidates(successfulResults = []) {
  return (Array.isArray(successfulResults) ? successfulResults : []).flatMap(result => {
    const normalized = result?.normalizedResult || {}
    const imageId = normalizeText(result?.imageId || '')
    return (Array.isArray(normalized.mode_candidates) ? normalized.mode_candidates : []).map(
      item => {
        const regionRef = normalizeCaptureRegion(
          item?.region_ref ||
            item?.regionRef ||
            item?.capture_region ||
            normalized.region_ref ||
            normalized.capture_region ||
            result?.captureRegion ||
            result?.requestedCaptureRegion
        )
        return {
          modeKey: normalizeKey(item?.modeKey || item?.mode || item?.diagnosis_mode || ''),
          confidence: Number(item?.confidence || 0),
          imageId,
          regionRef,
          sourceRecordId: normalizeText(
            result?.visualNormalizedImageResultId || normalized.visual_normalized_image_result_id || ''
          ),
          visualRawImageRecordId: normalizeText(
            result?.visualRawImageRecordId || normalized.visual_raw_image_record_id || ''
          ),
          inputSlotType: normalizeKey(
            result?.inputSlotType || normalized.input_organ_hint || normalized.inputSlotType || 'unknown'
          ),
          modelOrgan: normalizeKey(
            normalized.model_detected_organ || normalized.normalized_organ || 'unknown'
          ),
          analyzability: normalizeKey(normalized.analyzability || ''),
          organConflictFlag: Number(normalized.organ_conflict_flag || 0) ? 1 : 0
        }
      }
    )
  })
}

function attachDiagnosisModeRoute({
  aggregateResult,
  successfulResults = [],
  diagnosisProfile = 'full',
  priorEvidenceLedger = [],
  requestedCaptureRegion = '',
  originVisualCallBatchId = ''
} = {}) {
  const admittedVisualEvidence = buildAdmittedVisualEvidence(aggregateResult)
  const retainedVisualEvidence = buildRetainedVisualEvidence(aggregateResult)
  const visualModeCandidates = buildVisualModeCandidates(successfulResults)
  const modelDirectDecision = buildBatchModelDirectDecision(successfulResults, diagnosisProfile)
  const routeResult = resolveDiagnosisModeRoute({
    diagnosisProfile,
    admittedVisualEvidence,
    retainedVisualEvidence,
    visualModeCandidates,
    modelDirectCandidates: modelDirectDecision.acceptedCandidates,
    modelDirectDecision,
    priorEvidenceLedger,
    imageContext: {
      aggregateAnalyzability: aggregateResult?.aggregate_analyzability || '',
      requestedCaptureRegion,
      originVisualCallBatchId
    }
  })

  return {
    ...aggregateResult,
    diagnosis_mode_route_result: routeResult,
    route_primary_action: routeResult.routePrimaryAction || aggregateResult?.route_primary_action
  }
}

module.exports = {
  attachDiagnosisModeRoute,
  _test: {
    buildAdmittedVisualEvidence,
    buildRetainedVisualEvidence,
    buildVisualModeCandidates,
    buildBatchModelDirectDecision
  }
}
