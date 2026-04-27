'use strict'

const {
  normalizeOrgan,
  normalizeQualityGrade,
  normalizeAnalyzability,
  normalizeStrengthLevel,
  normalizeConfidenceBand,
  normalizeVisibilityScope,
  normalizeAdmissionReadiness,
  normalizeRouteHints,
  normalizeSuggestedFollowupCapture,
  normalizeNotes,
  confidenceBandToScore,
  clampConfidence
} = require('./visual-contract')

function extractJsonBlock(text) {
  const source = String(text || '').trim()
  if (!source) return null

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
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value

  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function normalizeSentence(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeSymptomCandidate(item) {
  const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
  if (!symptomKey) return null

  return {
    symptom_key: symptomKey,
    display_name_cn: String(item?.display_name_cn || item?.displayNameCn || symptomKey).trim(),
    strength_level: normalizeStrengthLevel(item?.strength_level || item?.strengthLevel, 'medium'),
    confidence_band: normalizeConfidenceBand(item?.confidence_band || item?.confidenceBand, 'medium'),
    visibility_scope: normalizeVisibilityScope(item?.visibility_scope || item?.visibilityScope, 'organ'),
    supporting_region_note: String(
      item?.supporting_region_note || item?.supportingRegionNote || ''
    ).trim(),
    admission_readiness: normalizeAdmissionReadiness(
      item?.admission_readiness || item?.admissionReadiness,
      'cautious'
    )
  }
}

function normalizeOutOfPoolSymptomCandidate(item) {
  const rawVisualNameCn = String(
    item?.raw_visual_name_cn || item?.rawVisualNameCn || item?.raw_name_cn || item?.label_cn || ''
  ).trim()
  const rawVisualNameEn = String(
    item?.raw_visual_name_en || item?.rawVisualNameEn || item?.raw_name_en || item?.label_en || ''
  ).trim()

  if (!rawVisualNameCn && !rawVisualNameEn) {
    return null
  }

  return {
    raw_visual_name_cn: rawVisualNameCn,
    raw_visual_name_en: rawVisualNameEn,
    closest_symptom_key_hint: String(
      item?.closest_symptom_key_hint || item?.closestSymptomKeyHint || ''
    ).trim(),
    reason: String(item?.reason || item?.record_reason || 'not_in_ai_visual_pool').trim()
  }
}

function buildLegacyCandidates(payload = {}) {
  return (Array.isArray(payload?.symptoms) ? payload.symptoms : [])
    .map(item => {
      const symptomKey = String(item?.symptom_key || item?.symptomKey || '').trim()
      if (!symptomKey) return null

      const confidence = clampConfidence(Number(item?.confidence || 0) || 0.75)
      let confidenceBand = 'medium'
      if (confidence >= 0.85) confidenceBand = 'high'
      if (confidence < 0.6) confidenceBand = 'low'

      return normalizeSymptomCandidate({
        symptom_key: symptomKey,
        display_name_cn: item?.display_name_cn || item?.displayNameCn || symptomKey,
        strength_level: confidence >= 0.85 ? 'strong' : confidence >= 0.6 ? 'medium' : 'weak',
        confidence_band: confidenceBand,
        visibility_scope: item?.visibility_scope || item?.visibilityScope || 'organ',
        supporting_region_note: item?.reason || '',
        admission_readiness: confidence >= 0.8 ? 'ready' : confidence >= 0.6 ? 'cautious' : 'retain_only'
      })
    })
    .filter(Boolean)
}

function parseStructuredVisualResult(text) {
  const jsonBlock = extractJsonBlock(text)
  if (!jsonBlock) {
    return null
  }

  const payload = safeJsonParse(jsonBlock)
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const symptomCandidates = Array.isArray(payload?.symptom_candidates)
    ? payload.symptom_candidates.map(normalizeSymptomCandidate).filter(Boolean).slice(0, 8)
    : buildLegacyCandidates(payload).slice(0, 8)

  const qualityGrade = normalizeQualityGrade(
    payload?.image_quality_grade || payload?.image_quality,
    'medium'
  )
  const analyzability = normalizeAnalyzability(
    payload?.analyzability,
    qualityGrade === 'good' ? 'high' : qualityGrade === 'poor' ? 'low' : 'medium'
  )

  return {
    normalized_organ: normalizeOrgan(payload?.normalized_organ, 'unknown'),
    image_quality_grade: qualityGrade,
    analyzability,
    symptom_candidates: symptomCandidates,
    out_of_pool_symptom_candidates: (
      Array.isArray(payload?.out_of_pool_symptom_candidates)
        ? payload.out_of_pool_symptom_candidates
        : []
    )
      .map(normalizeOutOfPoolSymptomCandidate)
      .filter(Boolean)
      .slice(0, 5),
    route_hints: normalizeRouteHints(payload?.route_hints || []),
    suggested_followup_capture: normalizeSuggestedFollowupCapture(
      payload?.suggested_followup_capture || []
    ),
    normalization_notes: normalizeNotes(payload?.normalization_notes || []),
    uncertain_symptoms: (Array.isArray(payload?.uncertain_symptoms) ? payload.uncertain_symptoms : [])
      .map(item => String(item?.symptom_key || item?.symptomKey || item || '').trim())
      .filter(Boolean)
      .slice(0, 5)
  }
}

function toLegacyObservedSymptoms(visualResult = null) {
  return (Array.isArray(visualResult?.symptom_candidates) ? visualResult.symptom_candidates : [])
    .filter(item => normalizeAdmissionReadiness(item?.admission_readiness, 'cautious') !== 'retain_only')
    .map(item => ({
      symptomKey: item.symptom_key,
      confidence: confidenceBandToScore(item.confidence_band),
      evidenceSource: 'visual'
    }))
}

function parseLLMVisualResult(text) {
  const cleanText = normalizeSentence(text)
  const structured = parseStructuredVisualResult(cleanText)

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
    suggested_followup_capture: ['补拍更清晰的受损部位特写和整株图'],
    normalization_notes: ['模型输出无法稳定解析，已降级为空结果。'],
    uncertain_symptoms: []
  }
}

function parseLLMDiagnosis(text) {
  const visualResult = parseLLMVisualResult(text)
  const observedSymptoms = toLegacyObservedSymptoms(visualResult)
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
