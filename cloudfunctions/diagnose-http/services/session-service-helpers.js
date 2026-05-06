'use strict'

const { normalizeStoredNullableText } = require('../utils/stored-value')

function normalizePersistedImageUrl(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^data:image\//i.test(normalized)) {
    return '[inline_data_url]'
  }
  return normalized
}

function mapSeverityHintToLevel(severityHint = '') {
  const normalized = String(severityHint || '').trim()
  if (!normalized) return ''
  if (normalized.includes('高') || normalized.toLowerCase() === 'high') return 'high'
  if (normalized.includes('低') || normalized.toLowerCase() === 'low') return 'low'
  return 'medium'
}

function normalizeVisualBatchTraceForSupervision(trace = null) {
  if (!trace || typeof trace !== 'object') {
    return {
      currentVisualCallBatchId: null,
      originVisualCallBatchId: null,
      supersedeApplied: 0
    }
  }

  return {
    currentVisualCallBatchId: normalizeStoredNullableText(
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '',
      null
    ),
    originVisualCallBatchId: normalizeStoredNullableText(
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '',
      null
    ),
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0
  }
}

function normalizeAnswerEffectsForSupervision(answerEffects = []) {
  return (Array.isArray(answerEffects) ? answerEffects : [])
    .map(item => ({
      mappedSymptomKey: normalizeStoredNullableText(item?.mappedSymptomKey || '', ''),
      effectType: normalizeStoredNullableText(item?.effectType || '', ''),
      questionKey: normalizeStoredNullableText(item?.questionKey || '', ''),
      optionKey: normalizeStoredNullableText(item?.optionKey || '', '')
    }))
    .filter(item => item.mappedSymptomKey && item.effectType && item.effectType !== 'neutral')
}

function resolveQuestionCorrectionScopeForSymptom(answerEffects = [], symptomKey = '') {
  const safeSymptomKey = normalizeStoredNullableText(symptomKey, '')
  if (!safeSymptomKey) {
    return 'none'
  }

  const relevantEffects = (Array.isArray(answerEffects) ? answerEffects : []).filter(
    item => item?.mappedSymptomKey === safeSymptomKey
  )
  if (!relevantEffects.length) {
    return 'none'
  }

  const touchedSymptoms = new Set(
    (Array.isArray(answerEffects) ? answerEffects : [])
      .map(item => normalizeStoredNullableText(item?.mappedSymptomKey || '', ''))
      .filter(Boolean)
  )

  return touchedSymptoms.size > 1 ? 'multiple' : 'symptom'
}

module.exports = {
  normalizePersistedImageUrl,
  mapSeverityHintToLevel,
  normalizeVisualBatchTraceForSupervision,
  normalizeAnswerEffectsForSupervision,
  resolveQuestionCorrectionScopeForSymptom
}
