'use strict'

const { clamp01 } = require('../repositories/sql')

const ALLOWED_ORGANS = [
  'leaf',
  'stem',
  'root',
  'root_crown',
  'whole_plant',
  'flower',
  'fruit',
  'other',
  'unknown'
]

const ALLOWED_QUALITY_GRADES = ['good', 'medium', 'poor']
const ALLOWED_ANALYZABILITY = ['high', 'medium', 'marginal', 'low']
const ALLOWED_STRENGTH_LEVELS = ['strong', 'medium', 'weak']
const ALLOWED_CONFIDENCE_BANDS = ['high', 'medium', 'low']
const ALLOWED_VISIBILITY_SCOPES = ['local', 'organ', 'whole_plant']
const ALLOWED_ADMISSION_READINESS = ['ready', 'cautious', 'retain_only']
const ALLOWED_ORGAN_SOURCES = ['ui_hint', 'model_detected', 'merged', 'unknown']
const ALLOWED_ROUTE_PRIMARY_ACTIONS = [
  'retake_first',
  'ask_first',
  'uncertain_prepare',
  'standard_flow'
]

function buildRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function stringifyJson(value) {
  if (value === null || value === undefined) {return null}
  return JSON.stringify(value)
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return allowed.includes(normalized) ? normalized : fallback
}

function normalizeOrgan(value, fallback = 'unknown') {
  return normalizeEnum(value, ALLOWED_ORGANS, fallback)
}

function normalizeQualityGrade(value, fallback = 'medium') {
  return normalizeEnum(value, ALLOWED_QUALITY_GRADES, fallback)
}

function normalizeAnalyzability(value, fallback = 'medium') {
  return normalizeEnum(value, ALLOWED_ANALYZABILITY, fallback)
}

function normalizeStrengthLevel(value, fallback = 'medium') {
  return normalizeEnum(value, ALLOWED_STRENGTH_LEVELS, fallback)
}

function normalizeConfidenceBand(value, fallback = 'medium') {
  return normalizeEnum(value, ALLOWED_CONFIDENCE_BANDS, fallback)
}

function normalizeVisibilityScope(value, fallback = 'organ') {
  return normalizeEnum(value, ALLOWED_VISIBILITY_SCOPES, fallback)
}

function normalizeAdmissionReadiness(value, fallback = 'cautious') {
  return normalizeEnum(value, ALLOWED_ADMISSION_READINESS, fallback)
}

function normalizeOrganSource(value, fallback = 'unknown') {
  return normalizeEnum(value, ALLOWED_ORGAN_SOURCES, fallback)
}

function normalizeRoutePrimaryAction(value, fallback = 'ask_first') {
  return normalizeEnum(value, ALLOWED_ROUTE_PRIMARY_ACTIONS, fallback)
}

function confidenceBandToScore(value) {
  const band = normalizeConfidenceBand(value, 'medium')
  if (band === 'high') {return 0.9}
  if (band === 'low') {return 0.58}
  return 0.75
}

function strengthLevelToWeight(value) {
  const level = normalizeStrengthLevel(value, 'medium')
  if (level === 'strong') {return 1}
  if (level === 'weak') {return 0.68}
  return 0.82
}

function readinessRank(value) {
  const normalized = normalizeAdmissionReadiness(value, 'cautious')
  if (normalized === 'ready') {return 3}
  if (normalized === 'cautious') {return 2}
  return 1
}

function compareBand(a, b) {
  return confidenceBandToScore(a) - confidenceBandToScore(b)
}

function compareStrength(a, b) {
  return strengthLevelToWeight(a) - strengthLevelToWeight(b)
}

function pickStrongerBand(a, b) {
  return compareBand(a, b) >= 0 ? normalizeConfidenceBand(a, 'medium') : normalizeConfidenceBand(b, 'medium')
}

function pickStrongerStrength(a, b) {
  return compareStrength(a, b) >= 0
    ? normalizeStrengthLevel(a, 'medium')
    : normalizeStrengthLevel(b, 'medium')
}

function pickHigherReadiness(a, b) {
  return readinessRank(a) >= readinessRank(b)
    ? normalizeAdmissionReadiness(a, 'cautious')
    : normalizeAdmissionReadiness(b, 'cautious')
}

function qualityGradeToClarityLevel(value) {
  const quality = normalizeQualityGrade(value, 'medium')
  if (quality === 'good') {return 'high'}
  if (quality === 'poor') {return 'low'}
  return 'medium'
}

function qualityGradeToAnalyzability(value) {
  const quality = normalizeQualityGrade(value, 'medium')
  if (quality === 'good') {return 'high'}
  if (quality === 'poor') {return 'low'}
  return 'medium'
}

function resolveSubjectCompletenessLevel(inputSlotType = 'unknown', analyzability = 'medium') {
  const slot = normalizeOrgan(inputSlotType, 'unknown')
  const normalizedAnalyzability = normalizeAnalyzability(analyzability, 'medium')

  if (slot === 'whole_plant') {
    if (normalizedAnalyzability === 'high') {return 'high'}
    if (normalizedAnalyzability === 'low') {return 'low'}
    return 'medium'
  }

  if (normalizedAnalyzability === 'high') {return 'medium'}
  if (normalizedAnalyzability === 'low') {return 'low'}
  if (normalizedAnalyzability === 'marginal') {return 'low'}
  return 'unknown'
}

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizeText(item))
        .filter(Boolean)
    )
  )
}

function normalizeRouteHints(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(item => {
      if (!item) {return null}
      if (typeof item === 'string') {
        const normalized = normalizeText(item)
        return normalized
          ? {
              type: normalized,
              reason: ''
            }
          : null
      }

      const type = normalizeText(item.type || item.key || item.route_type || '')
      if (!type) {return null}

      return {
        type,
        reason: normalizeText(item.reason || item.note || item.description || '')
      }
    })
    .filter(Boolean)
}

function normalizeSuggestedFollowupCapture(list = []) {
  return normalizeStringList(list).slice(0, 6)
}

function normalizeNotes(list = []) {
  return normalizeStringList(list).slice(0, 8)
}

function normalizeVisualDiscriminators(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(item => {
      const dimensionKey = normalizeText(item?.dimension_key || item?.dimensionKey || '')
      const valueKey = normalizeText(item?.value_key || item?.valueKey || '')
      if (!dimensionKey || !valueKey) {return null}

      return {
        dimension_key: dimensionKey,
        value_key: valueKey,
        confidence_band: normalizeConfidenceBand(
          item?.confidence_band || item?.confidenceBand,
          'medium'
        ),
        visible_basis_cn: normalizeText(item?.visible_basis_cn || item?.visibleBasisCn || '')
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeMissingInfoForPath(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(item => {
      const dimensionKey = normalizeText(item?.dimension_key || item?.dimensionKey || '')
      if (!dimensionKey) {return null}

      return {
        dimension_key: dimensionKey,
        reason_cn: normalizeText(item?.reason_cn || item?.reasonCn || item?.reason || '')
      }
    })
    .filter(item => item && item.reason_cn)
    .slice(0, 12)
}

function resolveAggregateRoutePrimaryAction({
  aggregateAnalyzability = 'medium',
  observedSymptomCount = 0,
  suggestedFollowupCapture = []
} = {}) {
  const analyzability = normalizeAnalyzability(aggregateAnalyzability, 'medium')
  const followupCount = Array.isArray(suggestedFollowupCapture) ? suggestedFollowupCapture.length : 0

  if (analyzability === 'low') {return 'retake_first'}
  if (observedSymptomCount > 0) {return 'standard_flow'}
  if (followupCount > 0 || analyzability === 'marginal') {return 'ask_first'}
  return 'uncertain_prepare'
}

function clampConfidence(value) {
  return clamp01(value)
}

module.exports = {
  buildRuntimeId,
  stringifyJson,
  normalizeOrgan,
  normalizeQualityGrade,
  normalizeAnalyzability,
  normalizeStrengthLevel,
  normalizeConfidenceBand,
  normalizeVisibilityScope,
  normalizeAdmissionReadiness,
  normalizeOrganSource,
  normalizeRoutePrimaryAction,
  normalizeText,
  normalizeStringList,
  normalizeRouteHints,
  normalizeSuggestedFollowupCapture,
  normalizeNotes,
  normalizeVisualDiscriminators,
  normalizeMissingInfoForPath,
  confidenceBandToScore,
  strengthLevelToWeight,
  pickStrongerBand,
  pickStrongerStrength,
  pickHigherReadiness,
  qualityGradeToClarityLevel,
  qualityGradeToAnalyzability,
  resolveSubjectCompletenessLevel,
  resolveAggregateRoutePrimaryAction,
  clampConfidence
}
