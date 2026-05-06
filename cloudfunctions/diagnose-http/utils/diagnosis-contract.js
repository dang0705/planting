'use strict'

const { normalizeRoutePrimaryAction } = require('./visual-contract')

const ALLOWED_OUTCOME_TYPES = ['problematic', 'non_problematic', 'uncertain']

function normalizeOutcomeType(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_OUTCOME_TYPES.includes(normalized) ? normalized : fallback
}

function normalizeDiagnosisRoutePrimaryAction(value, fallback = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return fallback
  }

  return normalizeRoutePrimaryAction(normalized, fallback)
}

module.exports = {
  ALLOWED_OUTCOME_TYPES,
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
}
