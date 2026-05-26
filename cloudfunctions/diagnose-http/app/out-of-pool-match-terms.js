'use strict'

function normalizeOutOfPoolReviewMatchTerm(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

function buildOutOfPoolReviewMatchTerms(candidate = {}) {
  const rawCn = normalizeOutOfPoolReviewMatchTerm(candidate.rawVisualNameCn || candidate.raw_visual_name_cn)
  const rawEn = normalizeOutOfPoolReviewMatchTerm(candidate.rawVisualNameEn || candidate.raw_visual_name_en)
  const reasonTerms = normalizeOutOfPoolReviewMatchTerm(candidate.reason)
  const closestHint = String(
    candidate.closestSymptomKeyHint || candidate.closest_symptom_key_hint || ''
  ).trim().toLowerCase()

  const normalized = new Set()

  rawCn.forEach(item => normalized.add(item))
  rawEn.forEach(item => normalized.add(item))
  reasonTerms.forEach(item => normalized.add(item))
  if (closestHint) {
    normalized.add(closestHint)
    normalized.add(closestHint.replace(/[_-]+/g, ' '))
    normalized.add(closestHint.replace(/[_]/g, ''))
  }

  return Array.from(normalized).filter(item => item.length > 1)
}

module.exports = {
  normalizeOutOfPoolReviewMatchTerm,
  buildOutOfPoolReviewMatchTerms
}
