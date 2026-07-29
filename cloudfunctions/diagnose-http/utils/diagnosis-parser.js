'use strict'

const {
  normalizeOrgan,
  normalizeQualityGrade,
  normalizeAnalyzability,
  normalizeAdmissionReadiness,
  normalizeRouteHints,
  normalizeSuggestedFollowupCapture,
  normalizeNotes,
  normalizeVisualDiscriminators,
  normalizeMissingInfoForPath,
  normalizeSymptomCandidate,
  normalizeCandidateLists,
  confidenceBandToScore,
  clampConfidence
} = require('./visual-contract')
const { normalizeCaptureRegion } = require('./capture-region-normalizer')
const { PEST_MODE_KEYS, PEST_VISUAL_RULES } = require('../domain/diagnosis-mode-registry')

const MIN_THRIPS_VISIBLE_MODE_CONFIDENCE = 0.95

function extractJsonBlock(text) {
  const source = String(text || '').trim()
  if (!source) {
    return null
  }

  const fencedMatch =
    source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return source.slice(start, end + 1)
  }

  return null
}

function safeJsonParse(value) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'object') {
    return value
  }

  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractJsonStringField(source = '', fieldName = '') {
  const pattern = new RegExp(
    `"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`,
    'i'
  )
  const match = String(source || '').match(pattern)
  if (!match?.[1]) {
    return ''
  }

  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return match[1]
  }
}

function extractJsonArrayBlock(source = '', fieldName = '') {
  const text = String(source || '')
  const keyPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:`, 'i')
  const keyMatch = keyPattern.exec(text)
  if (!keyMatch) {
    return null
  }

  const arrayStart = text.indexOf('[', keyMatch.index + keyMatch[0].length)
  if (arrayStart < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = arrayStart; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '[') {
      depth += 1
      continue
    }

    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        return text.slice(arrayStart, i + 1)
      }
    }
  }

  return null
}

function safeJsonParseArrayField(source = '', fieldName = '') {
  const arrayBlock = extractJsonArrayBlock(source, fieldName)
  const parsed = safeJsonParse(arrayBlock)
  return Array.isArray(parsed) ? parsed : []
}

function deriveCanonicalThripsVisibleCandidate({
  modeCandidates = [],
  visualDiscriminators = []
} = {}) {
  const hasTrustedThripsMode = modeCandidates.some(
    item =>
      item?.mode === 'thrips' && Number(item?.confidence) >= MIN_THRIPS_VISIBLE_MODE_CONFIDENCE
  )
  if (!hasTrustedThripsMode) {
    return null
  }

  const highConfidenceDiscriminators = new Set(
    visualDiscriminators
      .filter(item => item?.confidence_band === 'high')
      .map(item => `${item.dimension_key}:${item.value_key}`)
  )
  const hasVisibleSlenderBody = ['insect_body_presence:present', 'insect_body_shape:slender'].every(
    key => highConfidenceDiscriminators.has(key)
  )
  if (!hasVisibleSlenderBody) {
    return null
  }

  return normalizeSymptomCandidate({
    symptom_key: 'thrips_visible',
    display_name_cn: '可见细长虫体',
    strength_level: 'strong',
    confidence_band: 'high',
    visibility_scope: 'local',
    supporting_region_note: '局部区域可见清晰细长虫体。'
  })
}

function appendCanonicalThripsVisibleCandidate({
  symptomCandidates = [],
  modeCandidates = [],
  visualDiscriminators = []
} = {}) {
  const derivedCandidate = deriveCanonicalThripsVisibleCandidate({
    modeCandidates,
    visualDiscriminators
  })
  if (!derivedCandidate) {
    return symptomCandidates
  }

  return Array.from(
    new Map([derivedCandidate, ...symptomCandidates].map(item => [item.symptom_key, item])).values()
  ).slice(0, 8)
}

function parsePartialStructuredVisualResult(text, options = {}) {
  const source = String(text || '').trim()
  if (!source) {
    return null
  }

  const rawSymptomCandidates = safeJsonParseArrayField(source, 'symptom_candidates')
  const rawOutOfPoolCandidates = safeJsonParseArrayField(source, 'out_of_pool_symptom_candidates')
  const candidateLists = normalizeCandidateLists(rawSymptomCandidates, rawOutOfPoolCandidates)
  const symptomCandidates = candidateLists.symptomCandidates
  const secondaryCandidates = symptomCandidates.length
    ? []
    : buildSessionCandidates({ symptoms: safeJsonParseArrayField(source, 'symptoms') }).slice(0, 8)
  const outOfPoolCandidates = candidateLists.outOfPoolCandidates

  const normalizedOrgan = normalizeOrgan(
    extractJsonStringField(source, 'normalized_organ'),
    'unknown'
  )
  const qualityGrade = normalizeQualityGrade(
    extractJsonStringField(source, 'image_quality_grade') ||
      extractJsonStringField(source, 'image_quality'),
    'medium'
  )
  const analyzability = normalizeAnalyzability(
    extractJsonStringField(source, 'analyzability'),
    qualityGrade === 'good' ? 'high' : qualityGrade === 'poor' ? 'low' : 'medium'
  )
  const routeHints = normalizeRouteHints(safeJsonParseArrayField(source, 'route_hints'))
  const modeCandidates = safeJsonParseArrayField(source, 'mode_candidates')
    .map(item => normalizeModeCandidate(item, { ...options, normalizedOrgan }))
    .filter(Boolean)
    .slice(0, 8)
  const visualDiscriminators = normalizeVisualDiscriminators(
    safeJsonParseArrayField(source, 'visual_discriminators')
  )
  const canonicalSymptomCandidates = appendCanonicalThripsVisibleCandidate({
    symptomCandidates,
    modeCandidates,
    visualDiscriminators
  })
  const missingInfoForPath = normalizeMissingInfoForPath(
    safeJsonParseArrayField(source, 'missing_info_for_path')
  )
  const suggestedFollowupCapture = normalizeSuggestedFollowupCapture(
    safeJsonParseArrayField(source, 'suggested_question_capture')
  )
  const normalizationNotes = normalizeNotes(safeJsonParseArrayField(source, 'normalization_notes'))
  const uncertainSymptoms = safeJsonParseArrayField(source, 'uncertain_symptoms')
    .map(item => String(item?.symptom_key || item?.symptomKey || item || '').trim())
    .filter(Boolean)
    .slice(0, 5)

  if (
    !symptomCandidates.length &&
    !secondaryCandidates.length &&
    !outOfPoolCandidates.length &&
    !normalizedOrgan &&
    !routeHints.length &&
    !visualDiscriminators.length &&
    !missingInfoForPath.length
  ) {
    return null
  }

  return {
    normalized_organ: normalizedOrgan,
    image_quality_grade: qualityGrade,
    analyzability,
    symptom_candidates: canonicalSymptomCandidates.length
      ? canonicalSymptomCandidates
      : secondaryCandidates,
    out_of_pool_symptom_candidates: outOfPoolCandidates,
    route_hints: routeHints,
    capture_region: normalizeCaptureRegion(extractJsonStringField(source, 'capture_region')),
    mode_candidates: modeCandidates,
    region_ref: normalizeCaptureRegion(extractJsonStringField(source, 'region_ref')),
    visual_discriminators: visualDiscriminators,
    missing_info_for_path: missingInfoForPath,
    suggested_question_capture: suggestedFollowupCapture,
    normalization_notes: normalizeNotes([
      ...normalizationNotes,
      ...candidateLists.normalizationNotes,
      'partial_model_output_salvaged'
    ]),
    uncertain_symptoms: uncertainSymptoms
  }
}

function normalizeSentence(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeModeCandidate(
  item,
  { diagnosisProfile = 'full', normalizedOrgan = 'unknown' } = {}
) {
  const mode = String(item?.mode || item?.diagnosis_mode || item?.diagnosisMode || '').trim()
  if (!mode) {
    return null
  }
  if (diagnosisProfile === 'pest' && !PEST_MODE_KEYS.includes(mode)) {
    return null
  }
  const matchingPestRule = PEST_VISUAL_RULES.find(rule => rule.modeKey === mode)
  const organ = normalizeOrgan(normalizedOrgan, 'unknown')
  const hasSpecificOrgan = !['unknown', 'other', 'whole_plant'].includes(organ)
  if (matchingPestRule && hasSpecificOrgan && !matchingPestRule.organKeys.includes(organ)) {
    return null
  }

  return {
    mode,
    confidence: clampConfidence(Number(item?.confidence || 0) || 0),
    region_ref: normalizeCaptureRegion(item?.region_ref || item?.regionRef || item?.capture_region)
  }
}

function buildSessionCandidates(payload = {}) {
  return (Array.isArray(payload?.symptoms) ? payload.symptoms : [])
    .map(item => {
      const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
      if (!symptomKey) {
        return null
      }

      const confidence = clampConfidence(Number(item?.confidence || 0) || 0.75)
      let confidenceBand = 'medium'
      if (confidence >= 0.85) {
        confidenceBand = 'high'
      }
      if (confidence < 0.6) {
        confidenceBand = 'low'
      }

      return normalizeSymptomCandidate({
        symptom_key: symptomKey,
        display_name_cn: item?.display_name_cn || item?.displayNameCn || symptomKey,
        strength_level: confidence >= 0.85 ? 'strong' : confidence >= 0.6 ? 'medium' : 'weak',
        confidence_band: confidenceBand,
        visibility_scope: item?.visibility_scope || item?.visibilityScope || 'organ',
        supporting_region_note: item?.reason || '',
        admission_readiness:
          confidence >= 0.8 ? 'ready' : confidence >= 0.6 ? 'cautious' : 'retain_only'
      })
    })
    .filter(Boolean)
}

function parseStructuredVisualResult(text, options = {}) {
  const jsonBlock = extractJsonBlock(text)
  if (!jsonBlock) {
    return parsePartialStructuredVisualResult(text, options)
  }

  const payload = safeJsonParse(jsonBlock)
  if (!payload || typeof payload !== 'object') {
    return parsePartialStructuredVisualResult(text, options)
  }

  const candidateLists = normalizeCandidateLists(
    Array.isArray(payload?.symptom_candidates) ? payload.symptom_candidates : [],
    Array.isArray(payload?.out_of_pool_symptom_candidates)
      ? payload.out_of_pool_symptom_candidates
      : []
  )
  const symptomCandidates = Array.isArray(payload?.symptom_candidates)
    ? candidateLists.symptomCandidates
    : buildSessionCandidates(payload).slice(0, 8)
  const normalizedOrgan = normalizeOrgan(payload?.normalized_organ, 'unknown')
  const modeCandidates = Array.isArray(payload?.mode_candidates)
    ? payload.mode_candidates
        .map(item => normalizeModeCandidate(item, { ...options, normalizedOrgan }))
        .filter(Boolean)
        .slice(0, 8)
    : []
  const visualDiscriminators = normalizeVisualDiscriminators(payload?.visual_discriminators || [])
  const canonicalSymptomCandidates = appendCanonicalThripsVisibleCandidate({
    symptomCandidates,
    modeCandidates,
    visualDiscriminators
  })

  const qualityGrade = normalizeQualityGrade(
    payload?.image_quality_grade || payload?.image_quality,
    'medium'
  )
  const analyzability = normalizeAnalyzability(
    payload?.analyzability,
    qualityGrade === 'good' ? 'high' : qualityGrade === 'poor' ? 'low' : 'medium'
  )

  return {
    normalized_organ: normalizedOrgan,
    image_quality_grade: qualityGrade,
    analyzability,
    symptom_candidates: canonicalSymptomCandidates,
    out_of_pool_symptom_candidates: candidateLists.outOfPoolCandidates,
    route_hints: normalizeRouteHints(payload?.route_hints || []),
    capture_region: normalizeCaptureRegion(payload?.capture_region || payload?.captureRegion),
    mode_candidates: modeCandidates,
    region_ref: normalizeCaptureRegion(payload?.region_ref || payload?.regionRef),
    visual_discriminators: visualDiscriminators,
    missing_info_for_path: normalizeMissingInfoForPath(payload?.missing_info_for_path || []),
    suggested_question_capture: normalizeSuggestedFollowupCapture(
      payload?.suggested_question_capture || []
    ),
    normalization_notes: normalizeNotes([
      ...(Array.isArray(payload?.normalization_notes) ? payload.normalization_notes : []),
      ...candidateLists.normalizationNotes
    ]),
    uncertain_symptoms: (Array.isArray(payload?.uncertain_symptoms)
      ? payload.uncertain_symptoms
      : []
    )
      .map(item => String(item?.symptom_key || item?.symptomKey || item || '').trim())
      .filter(Boolean)
      .slice(0, 5)
  }
}

function toSessionObservedSymptoms(visualResult = null) {
  return (Array.isArray(visualResult?.symptom_candidates) ? visualResult.symptom_candidates : [])
    .filter(
      item => normalizeAdmissionReadiness(item?.admission_readiness, 'cautious') !== 'retain_only'
    )
    .map(item => ({
      symptomKey: item.symptom_key,
      confidence: confidenceBandToScore(item.confidence_band),
      evidenceSource: 'visual'
    }))
}

function parseLLMVisualResult(text, options = {}) {
  const cleanText = normalizeSentence(text)
  const structured = parseStructuredVisualResult(cleanText, options)

  if (structured) {
    return structured
  }

  return {
    normalized_organ: 'unknown',
    image_quality_grade: 'medium',
    analyzability: 'low',
    symptom_candidates: [],
    out_of_pool_symptom_candidates: [],
    route_hints: [
      {
        type: 'retake_image',
        reason: 'model_output_unparseable'
      }
    ],
    capture_region: 'unknown',
    mode_candidates: [],
    region_ref: 'unknown',
    visual_discriminators: [],
    missing_info_for_path: [],
    suggested_question_capture: ['补拍更清晰的受损部位特写和整株图'],
    normalization_notes: ['模型输出无法稳定解析，已降级为空结果。'],
    uncertain_symptoms: []
  }
}

function parseLLMDiagnosis(text) {
  const visualResult = parseLLMVisualResult(text)
  const observedSymptoms = toSessionObservedSymptoms(visualResult)
  const summary = observedSymptoms.map(item => item.symptomKey).join('、')

  return {
    healthScore: null,
    healthStatus: null,
    mainIssue: null,
    observedSymptoms,
    uncertainSymptoms: visualResult.uncertain_symptoms || [],
    imageQuality: visualResult.image_quality_grade || 'medium',
    symptoms: summary || normalizeSentence(text).slice(0, 200),
    treatment: '',
    prevention: '',
    summary: summary || normalizeSentence(text).slice(0, 180)
  }
}

function parseAgentDiagnosis(text) {
  return parseLLMDiagnosis(text)
}

module.exports = {
  parseLLMVisualResult,
  parseLLMDiagnosis,
  parseAgentDiagnosis
}
