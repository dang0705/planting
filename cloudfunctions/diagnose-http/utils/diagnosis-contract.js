'use strict'

const { normalizeRoutePrimaryAction } = require('./visual-contract')

const ALLOWED_OUTCOME_TYPES = ['problematic', 'non_problematic', 'uncertain']

function normalizeOutcomeType(value, conservative = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ALLOWED_OUTCOME_TYPES.includes(normalized) ? normalized : conservative
}

function normalizeDiagnosisRoutePrimaryAction(value, conservative = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return conservative
  }

  return normalizeRoutePrimaryAction(normalized, conservative)
}

module.exports = {
  ALLOWED_OUTCOME_TYPES,
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
}
