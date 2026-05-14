'use strict'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isExplicitObservedEvidenceSourceType(sourceType = '') {
  const normalizedSourceType = normalizeText(sourceType).toLowerCase()
  return [
    'legacy_observed_symptom',
    'user_answer',
    'follow_up_positive',
    'follow_up_seed'
  ].includes(normalizedSourceType)
}

function buildExplicitObservedSymptomKeySet(observedEvidenceSet = []) {
  const explicitObservedSymptomKeys = new Set()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '')
    if (!symptomKey) {continue}

    const sourceType = normalizeText(item?.sourceType || item?.source_type || '')
    const currentStatus = normalizeText(
      item?.currentStatus || item?.current_status || 'active'
    ).toLowerCase()
    if (currentStatus !== 'active') {continue}

    if (isExplicitObservedEvidenceSourceType(sourceType)) {
      explicitObservedSymptomKeys.add(symptomKey)
    }
  }

  return explicitObservedSymptomKeys
}

module.exports = {
  isExplicitObservedEvidenceSourceType,
  buildExplicitObservedSymptomKeySet
}
