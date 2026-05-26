'use strict'

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value || 0)))
}

function buildObservedEvidenceIndex(observedEvidenceSet = []) {
  const symptomConfidenceMap = new Map()
  const symptomEvidenceKeysMap = new Map()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const currentStatus = normalizeText(
      item?.currentStatus || item?.current_status || 'active',
      'active'
    ).toLowerCase()
    if (currentStatus !== 'active') {continue}

    const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '', '')
    if (!symptomKey) {continue}

    const confidence = clamp01(item?.confidence || 0)
    symptomConfidenceMap.set(
      symptomKey,
      Math.max(confidence, Number(symptomConfidenceMap.get(symptomKey) || 0))
    )

    const evidenceKeys = symptomEvidenceKeysMap.get(symptomKey) || []
    evidenceKeys.push(
      normalizeText(
        item?.observedEvidenceSetId || item?.observed_evidence_set_id || item?.evidenceKey || '',
        ''
      )
    )
    symptomEvidenceKeysMap.set(symptomKey, evidenceKeys)
  }

  return {
    symptomConfidenceMap,
    symptomEvidenceKeysMap
  }
}

function buildDerivedEvidenceIndex(derivedEvidenceSet = []) {
  const patternConfidenceMap = new Map()
  const patternDerivedEvidenceIdsMap = new Map()

  for (const item of Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : []) {
    const evidenceState = normalizeText(
      item?.evidenceState || item?.evidence_state || 'present',
      'present'
    ).toLowerCase()
    if (evidenceState !== 'present') {continue}

    const patternKey = normalizeText(item?.patternKey || item?.pattern_key || '', '')
    if (!patternKey) {continue}

    const confidence = clamp01(item?.confidence || 0)
    patternConfidenceMap.set(
      patternKey,
      Math.max(confidence, Number(patternConfidenceMap.get(patternKey) || 0))
    )

    const ids = patternDerivedEvidenceIdsMap.get(patternKey) || []
    ids.push(
      normalizeText(item?.derivedEvidenceId || item?.derived_evidence_id || '', '')
    )
    patternDerivedEvidenceIdsMap.set(patternKey, ids)
  }

  return {
    patternConfidenceMap,
    patternDerivedEvidenceIdsMap
  }
}

function scoreVisualCandidateConfidence(item = {}) {
  const bandScore = {
    low: 0.28,
    medium: 0.46,
    high: 0.64
  }[normalizeText(item?.confidenceBand || item?.confidence_band || '', 'low').toLowerCase()] || 0.28
  const strengthScore = {
    weak: 0.04,
    medium: 0.1,
    strong: 0.16
  }[normalizeText(item?.strengthLevel || item?.strength_level || '', 'weak').toLowerCase()] || 0.04
  const supportScore = Math.min(0.18, Math.max(0, Number(item?.supportCount || item?.support_count || 0) - 1) * 0.08)
  return clamp01(bandScore + strengthScore + supportScore)
}

function buildVisualCandidateIndex(visualCandidateSymptoms = []) {
  const symptomConfidenceMap = new Map()
  const patternConfidenceMap = new Map()

  for (const item of Array.isArray(visualCandidateSymptoms) ? visualCandidateSymptoms : []) {
    const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '', '')
    if (!symptomKey) {continue}

    const confidence = scoreVisualCandidateConfidence(item)
    symptomConfidenceMap.set(
      symptomKey,
      Math.max(confidence, Number(symptomConfidenceMap.get(symptomKey) || 0))
    )

    const patternKey = normalizeText(item?.patternKey || item?.pattern_key || '', '')
    if (patternKey) {
      patternConfidenceMap.set(
        patternKey,
        Math.max(confidence, Number(patternConfidenceMap.get(patternKey) || 0))
      )
    }
  }

  return {
    symptomConfidenceMap,
    patternConfidenceMap
  }
}

function buildRouteHintIndex(routeHints = []) {
  const routeHintScoreMap = new Map()
  const routeHintReasonMap = new Map()

  for (const item of Array.isArray(routeHints) ? routeHints : []) {
    const type = normalizeText(item?.type, '')
    if (!type) {continue}

    const score = clamp01(Number(item?.score || 0))
    routeHintScoreMap.set(type, Math.max(score || 0.82, Number(routeHintScoreMap.get(type) || 0)))

    const reasons = routeHintReasonMap.get(type) || []
    const normalizedReason = normalizeText(item?.reason, '')
    if (normalizedReason) {
      reasons.push(normalizedReason)
      routeHintReasonMap.set(type, reasons)
    }
  }

  return {
    routeHintScoreMap,
    routeHintReasonMap
  }
}

function computeDirectionConfidence({
  matchedSymptomKeys = [],
  matchedPatternKeys = [],
  symptomConfidenceMap = new Map(),
  patternConfidenceMap = new Map()
} = {}) {
  const symptomScore = matchedSymptomKeys.reduce(
    (sum, symptomKey) => sum + Number(symptomConfidenceMap.get(symptomKey) || 0),
    0
  )
  const patternScore = matchedPatternKeys.reduce(
    (sum, patternKey) => sum + Number(patternConfidenceMap.get(patternKey) || 0) * 0.7,
    0
  )

  return clamp01(1 - Math.exp(-(symptomScore + patternScore)))
}

module.exports = {
  buildObservedEvidenceIndex,
  buildDerivedEvidenceIndex,
  buildVisualCandidateIndex,
  buildRouteHintIndex,
  computeDirectionConfidence,
  clamp01
}
