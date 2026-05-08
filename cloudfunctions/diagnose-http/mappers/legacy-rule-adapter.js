'use strict'

const keyAliasMap = require('../constants/key-alias-map')

function mapByAlias(kind, key) {
  const normalized = String(key || '').trim()
  if (!normalized) {return ''}
  const map = keyAliasMap[kind] || {}
  return map[normalized] || normalized
}

function normalizeConfidence(value, fallback = 0.75) {
  const num = Number(value)
  if (!Number.isFinite(num)) {return fallback}
  if (num < 0) {return 0}
  if (num > 1) {return 1}
  return num
}

function normalizeOptionKey(optionKey = '') {
  const normalized = String(optionKey || '').trim().toLowerCase()
  if (['yes', 'no', 'unknown'].includes(normalized)) {
    return normalized
  }

  if (normalized.startsWith('opt_')) {
    const raw = normalized.slice(4)
    if (['yes', 'no', 'unknown'].includes(raw)) {
      return raw
    }
  }

  return mapByAlias('option', normalized || 'unknown') || 'unknown'
}

function adaptObservedSymptoms(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .map(item => {
      if (!item) {return null}
      const rawKey =
        typeof item === 'string'
          ? item
          : item.symptomKey || item.symptom_key || item.key || item.code || ''
      const symptomKey = mapByAlias('symptom', rawKey)
      if (!symptomKey) {return null}

      return {
        symptomKey,
        symptomCn: item.symptomCn || item.symptom_cn || item.label || symptomKey,
        confidence: normalizeConfidence(item.confidence, 0.75),
        source: item.source || item.evidenceSource || item.evidence_source || 'visual_ai'
      }
    })
    .filter(Boolean)
}

function adaptLegacyFollowUpAnswers(followUpAnswers = []) {
  return (Array.isArray(followUpAnswers) ? followUpAnswers : [])
    .map(item => {
      if (!item) {return null}
      const questionKey = mapByAlias(
        'question',
        item.questionKey || item.question_key || item.symptomKey || item.symptom_key || ''
      )
      if (!questionKey) {return null}

      const optionKey = normalizeOptionKey(
        item.optionKey || item.option_key || item.answerValue || item.answer_value || ''
      )

      return {
        questionKey,
        optionKey
      }
    })
    .filter(Boolean)
}

module.exports = {
  mapByAlias,
  normalizeOptionKey,
  adaptObservedSymptoms,
  adaptLegacyFollowUpAnswers
}
