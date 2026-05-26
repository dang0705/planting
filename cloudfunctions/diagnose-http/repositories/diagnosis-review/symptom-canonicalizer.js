'use strict'

const { getPromptSymptomDictionary } = require('../symptom-repository')
const { normalizeReviewText } = require('./normalizers')

function buildReviewSymptomDisplayNameMap(symptomRows = []) {
  return new Map(
    (Array.isArray(symptomRows) ? symptomRows : [])
      .map(item => {
        const symptomKey = normalizeReviewText(item?.symptomKey || '')
        const displayName = normalizeReviewText(
          item?.displayTextCn || item?.symptomCn || symptomKey,
          symptomKey
        )
        return symptomKey && displayName ? [symptomKey, displayName] : null
      })
      .filter(Boolean)
  )
}

async function loadReviewSymptomDisplayNameMap() {
  try {
    return buildReviewSymptomDisplayNameMap(await getPromptSymptomDictionary())
  } catch (error) {
    console.warn('diagnosis-review canonical symptom names degraded:', error?.message || error)
    return new Map()
  }
}

function canonicalizeReviewSymptomCandidate(candidate = null, displayNameMap = new Map()) {
  if (!candidate || typeof candidate !== 'object' || !displayNameMap.size) {
    return candidate
  }

  const symptomKey = normalizeReviewText(candidate?.symptom_key || candidate?.symptomKey || '')
  const canonicalDisplayName = symptomKey ? normalizeReviewText(displayNameMap.get(symptomKey) || '') : ''
  if (!symptomKey || !canonicalDisplayName) {
    return candidate
  }

  return {
    ...candidate,
    symptom_key: candidate.symptom_key !== undefined ? symptomKey : candidate.symptom_key,
    symptomKey: candidate.symptomKey !== undefined ? symptomKey : candidate.symptomKey,
    display_name_cn:
      candidate.display_name_cn !== undefined || candidate.displayNameCn === undefined
        ? canonicalDisplayName
        : candidate.display_name_cn,
    displayNameCn: candidate.displayNameCn !== undefined ? canonicalDisplayName : candidate.displayNameCn,
    symptom_cn: candidate.symptom_cn !== undefined ? canonicalDisplayName : candidate.symptom_cn,
    symptomCn: candidate.symptomCn !== undefined ? canonicalDisplayName : candidate.symptomCn
  }
}

function canonicalizeReviewSymptomCandidates(candidates = [], displayNameMap = new Map()) {
  return (Array.isArray(candidates) ? candidates : []).map(candidate =>
    canonicalizeReviewSymptomCandidate(candidate, displayNameMap)
  )
}

function canonicalizeReviewVisualPayload(payload = null, displayNameMap = new Map()) {
  if (!payload || typeof payload !== 'object' || !displayNameMap.size) {
    return payload
  }

  if (Array.isArray(payload)) {
    return payload.map(item => canonicalizeReviewVisualPayload(item, displayNameMap))
  }

  const next = { ...payload }
  ;[
    'symptom_candidates',
    'symptomCandidates',
    'aggregated_symptom_candidates',
    'aggregatedSymptomCandidates',
    'observed_symptoms',
    'observedSymptoms'
  ].forEach(key => {
    if (Array.isArray(next[key])) {
      next[key] = canonicalizeReviewSymptomCandidates(next[key], displayNameMap)
    }
  })
  if (next.parsed_result && typeof next.parsed_result === 'object') {
    next.parsed_result = canonicalizeReviewVisualPayload(next.parsed_result, displayNameMap)
  }
  if (next.parsedResult && typeof next.parsedResult === 'object') {
    next.parsedResult = canonicalizeReviewVisualPayload(next.parsedResult, displayNameMap)
  }
  return next
}

module.exports = {
  buildReviewSymptomDisplayNameMap,
  loadReviewSymptomDisplayNameMap,
  canonicalizeReviewSymptomCandidate,
  canonicalizeReviewSymptomCandidates,
  canonicalizeReviewVisualPayload
}
