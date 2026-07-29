'use strict'

const { clamp01 } = require('../repositories/sql')
const { FORMAL_PEST_VISUAL_EVIDENCE_KEYS } = require('../domain/diagnosis-mode-registry')
const { evidenceGroupForKey } = require('../domain/diagnosis-mode-router')

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
  'standard_flow',
  'direct_result',
  'choose_direction',
  'request_followup_capture',
  'question_package',
  'uncertain',
  'finalize'
]
const FORMAL_PEST_VISUAL_EVIDENCE_KEY_SET = new Set(FORMAL_PEST_VISUAL_EVIDENCE_KEYS)
const STRING_SHORTHAND_NOTE = 'provider_string_symptom_candidate_preserved_conservatively'
const OUT_OF_POOL_RECOVERY_NOTE = 'locked_pest_evidence_recovered_conservatively'
const VISUAL_OUTPUT_SCHEMA_TEXT = JSON.stringify({
  normalized_organ: '',
  image_quality_grade: '',
  analyzability: '',
  capture_region: 'unknown',
  region_ref: 'unknown',
  mode_candidates: [{ mode: '', confidence: 0, region_ref: 'unknown' }],
  symptom_candidates: [
    {
      symptom_key: '',
      strength_level: 'strong|medium|weak',
      confidence_band: 'high|medium|low'
    }
  ],
  out_of_pool_symptom_candidates: [
    {
      raw_visual_name_en: '',
      closest_symptom_key_hint: ''
    }
  ],
  visual_discriminators: [
    {
      dimension_key: 'insect_body_presence',
      value_key: 'present|absent|uncertain',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    },
    {
      dimension_key: 'insect_body_shape',
      value_key:
        'mite|wax_oval|hard_shell|white_fly|pear_shaped|slender|leaf_miner_tunnel|small_black_fly|none|uncertain',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    },
    {
      dimension_key: 'insect_body_location',
      value_key: 'leaf_upper|leaf_lower|stem|soil_surface|leaf_internal|unknown',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    },
    {
      dimension_key: 'surface_coating_presence',
      value_key: 'present|absent|uncertain',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    },
    {
      dimension_key: 'surface_coating_type',
      value_key: 'powdery_white|sooty_black|none|uncertain',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    },
    {
      dimension_key: 'leaf_anomaly_sign',
      value_key: 'uniform_yellow|patchy_yellow|droop_wilt|none|uncertain',
      confidence_band: 'high|medium|low',
      visible_basis_cn: ''
    }
  ],
  missing_info_for_path: [
    {
      dimension_key: 'insect_body_visibility',
      admission_readiness: 'ready|cautious|retain_only'
    }
  ],
  route_hints: [{ type: '' }]
})

function buildRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function stringifyJson(value) {
  if (value === null || value === undefined) {
    return null
  }
  return JSON.stringify(value)
}

function normalizeEnum(value, allowed, conservative) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return allowed.includes(normalized) ? normalized : conservative
}

function normalizeOrgan(value, conservative = 'unknown') {
  return normalizeEnum(value, ALLOWED_ORGANS, conservative)
}

function normalizeQualityGrade(value, conservative = 'medium') {
  return normalizeEnum(value, ALLOWED_QUALITY_GRADES, conservative)
}

function normalizeAnalyzability(value, conservative = 'medium') {
  return normalizeEnum(value, ALLOWED_ANALYZABILITY, conservative)
}

function normalizeStrengthLevel(value, conservative = 'medium') {
  return normalizeEnum(value, ALLOWED_STRENGTH_LEVELS, conservative)
}

function normalizeConfidenceBand(value, conservative = 'medium') {
  return normalizeEnum(value, ALLOWED_CONFIDENCE_BANDS, conservative)
}

function normalizeVisibilityScope(value, conservative = 'organ') {
  return normalizeEnum(value, ALLOWED_VISIBILITY_SCOPES, conservative)
}

function normalizeAdmissionReadiness(value, conservative = 'cautious') {
  return normalizeEnum(value, ALLOWED_ADMISSION_READINESS, conservative)
}

function normalizeOrganSource(value, conservative = 'unknown') {
  return normalizeEnum(value, ALLOWED_ORGAN_SOURCES, conservative)
}

function normalizeRoutePrimaryAction(value, conservative = 'ask_first') {
  return normalizeEnum(value, ALLOWED_ROUTE_PRIMARY_ACTIONS, conservative)
}

function confidenceBandToScore(value) {
  const band = normalizeConfidenceBand(value, 'medium')
  if (band === 'high') {
    return 0.9
  }
  if (band === 'low') {
    return 0.58
  }
  return 0.75
}

function strengthLevelToWeight(value) {
  const level = normalizeStrengthLevel(value, 'medium')
  if (level === 'strong') {
    return 1
  }
  if (level === 'weak') {
    return 0.68
  }
  return 0.82
}

function readinessRank(value) {
  const normalized = normalizeAdmissionReadiness(value, 'cautious')
  if (normalized === 'ready') {
    return 3
  }
  if (normalized === 'cautious') {
    return 2
  }
  return 1
}

function compareBand(a, b) {
  return confidenceBandToScore(a) - confidenceBandToScore(b)
}

function compareStrength(a, b) {
  return strengthLevelToWeight(a) - strengthLevelToWeight(b)
}

function pickStrongerBand(a, b) {
  return compareBand(a, b) >= 0
    ? normalizeConfidenceBand(a, 'medium')
    : normalizeConfidenceBand(b, 'medium')
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
  if (quality === 'good') {
    return 'high'
  }
  if (quality === 'poor') {
    return 'low'
  }
  return 'medium'
}

function qualityGradeToAnalyzability(value) {
  const quality = normalizeQualityGrade(value, 'medium')
  if (quality === 'good') {
    return 'high'
  }
  if (quality === 'poor') {
    return 'low'
  }
  return 'medium'
}

function resolveSubjectCompletenessLevel(inputSlotType = 'unknown', analyzability = 'medium') {
  const slot = normalizeOrgan(inputSlotType, 'unknown')
  const normalizedAnalyzability = normalizeAnalyzability(analyzability, 'medium')

  if (slot === 'whole_plant') {
    if (normalizedAnalyzability === 'high') {
      return 'high'
    }
    if (normalizedAnalyzability === 'low') {
      return 'low'
    }
    return 'medium'
  }

  if (normalizedAnalyzability === 'high') {
    return 'medium'
  }
  if (normalizedAnalyzability === 'low') {
    return 'low'
  }
  if (normalizedAnalyzability === 'marginal') {
    return 'low'
  }
  return 'unknown'
}

function normalizeText(value, conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeStringList(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(item => normalizeText(item)).filter(Boolean))
  )
}

function normalizeRouteHints(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(item => {
      if (!item) {
        return null
      }
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
      if (!type) {
        return null
      }

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
      if (!dimensionKey || !valueKey) {
        return null
      }

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
      if (!dimensionKey) {
        return null
      }

      return {
        dimension_key: dimensionKey,
        reason_cn: normalizeText(item?.reason_cn || item?.reasonCn || item?.reason || '')
      }
    })
    .filter(item => item && item.reason_cn)
    .slice(0, 12)
}

function normalizeSymptomCandidate(item) {
  const shorthand = typeof item === 'string'
  const symptomKey = String(shorthand ? item : item?.symptom_key || item?.symptomKey || '').trim()
  if (!symptomKey) {
    return null
  }

  const strengthLevel = normalizeStrengthLevel(
    item?.strength_level || item?.strengthLevel,
    'medium'
  )
  const confidenceBand = normalizeConfidenceBand(
    item?.confidence_band || item?.confidenceBand,
    'medium'
  )
  const explicitReadiness = item?.admission_readiness || item?.admissionReadiness
  const formalEvidenceKey = evidenceGroupForKey(symptomKey)
  const formalEvidence = FORMAL_PEST_VISUAL_EVIDENCE_KEY_SET.has(formalEvidenceKey)
  const admissionReadiness = shorthand
    ? 'retain_only'
    : formalEvidence
      ? strengthLevel === 'strong' && confidenceBand === 'high'
        ? 'ready'
        : 'cautious'
      : normalizeAdmissionReadiness(explicitReadiness, 'cautious')

  return {
    symptom_key: symptomKey,
    display_name_cn: String(item?.display_name_cn || item?.displayNameCn || symptomKey).trim(),
    strength_level: strengthLevel,
    confidence_band: confidenceBand,
    visibility_scope: normalizeVisibilityScope(
      item?.visibility_scope || item?.visibilityScope,
      'organ'
    ),
    supporting_region_note: String(
      item?.supporting_region_note ||
        item?.supportingRegionNote ||
        (shorthand ? 'string_shorthand' : '')
    ).trim(),
    admission_readiness: admissionReadiness
  }
}

function normalizeOutOfPoolSymptomCandidate(item) {
  const shorthand = typeof item === 'string'
  const rawVisualNameCn = String(
    shorthand
      ? ''
      : item?.raw_visual_name_cn ||
          item?.rawVisualNameCn ||
          item?.raw_name_cn ||
          item?.label_cn ||
          ''
  ).trim()
  const rawVisualNameEn = String(
    shorthand
      ? item
      : item?.raw_visual_name_en ||
          item?.rawVisualNameEn ||
          item?.raw_name_en ||
          item?.label_en ||
          ''
  ).trim()
  if (!rawVisualNameCn && !rawVisualNameEn) {
    return null
  }

  return {
    raw_visual_name_cn: rawVisualNameCn,
    raw_visual_name_en: rawVisualNameEn,
    closest_symptom_key_hint: String(
      shorthand ? item : item?.closest_symptom_key_hint || item?.closestSymptomKeyHint || ''
    ).trim(),
    reason: String(item?.reason || item?.record_reason || 'not_in_ai_visual_pool').trim()
  }
}

function normalizeCandidateLists(symptomItems = [], outOfPoolItems = []) {
  const outOfPoolCandidates = outOfPoolItems
    .map(normalizeOutOfPoolSymptomCandidate)
    .filter(Boolean)
    .slice(0, 5)
  const recoveredCandidates = outOfPoolCandidates
    .map(item =>
      [item.closest_symptom_key_hint, item.raw_visual_name_en, item.raw_visual_name_cn].find(key =>
        FORMAL_PEST_VISUAL_EVIDENCE_KEY_SET.has(key)
      )
    )
    .filter(Boolean)
    .map(normalizeSymptomCandidate)
  const symptomCandidates = Array.from(
    new Map(
      [...symptomItems.map(normalizeSymptomCandidate).filter(Boolean), ...recoveredCandidates].map(
        item => [item.symptom_key, item]
      )
    ).values()
  ).slice(0, 8)

  return {
    symptomCandidates,
    outOfPoolCandidates,
    normalizationNotes: [
      symptomItems.some(item => typeof item === 'string') ? STRING_SHORTHAND_NOTE : '',
      recoveredCandidates.length ? OUT_OF_POOL_RECOVERY_NOTE : ''
    ].filter(Boolean)
  }
}

function resolveAggregateRoutePrimaryAction({
  aggregateAnalyzability = 'medium',
  observedSymptomCount = 0,
  suggestedFollowupCapture = []
} = {}) {
  const analyzability = normalizeAnalyzability(aggregateAnalyzability, 'medium')
  const questionCount = Array.isArray(suggestedFollowupCapture)
    ? suggestedFollowupCapture.length
    : 0

  if (analyzability === 'low') {
    return 'retake_first'
  }
  if (observedSymptomCount > 0) {
    return 'standard_flow'
  }
  if (questionCount > 0 || analyzability === 'marginal') {
    return 'ask_first'
  }
  return 'uncertain_prepare'
}

function clampConfidence(value) {
  return clamp01(value)
}

module.exports = {
  VISUAL_OUTPUT_SCHEMA_TEXT,
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
  normalizeSymptomCandidate,
  normalizeCandidateLists,
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
