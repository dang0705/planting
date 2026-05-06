'use strict'

const { callLLMDiagnose } = require('../../utils/llm')
const { parseLLMVisualResult } = require('../../utils/diagnosis-parser')
const {
  normalizeOrgan,
  normalizeQualityGrade,
  normalizeAnalyzability,
  normalizeStrengthLevel,
  normalizeConfidenceBand,
  normalizeVisibilityScope,
  normalizeAdmissionReadiness,
  normalizeOrganSource,
  normalizeRouteHints,
  normalizeSuggestedFollowupCapture,
  normalizeNotes,
  normalizeText,
  qualityGradeToAnalyzability
} = require('../../utils/visual-contract')
const {
  llm: {
    model: sourceModelName = 'hunyuan-t1-vision-20250916',
    service: sourceModelProvider = 'hunyuan',
    modelProfile: sourceModelProfile = 'fast_vision',
    modelReasoningMode: sourceModelReasoningMode = 'fast'
  } = {}
} = require('../../configs')

const PROMPT_VERSION = 'visual_structured_v1'
const ADAPTER_NAME = 'hunyuan_visual_adapter'
const QWEN_ADAPTER_NAME = 'qwen_vl_visual_adapter'
const STRUCTURAL_DAMAGE_CUE_RULES = {
  holes_in_leaf: {
    hard: ['真洞', '洞口', '穿孔', '背景', '透过', '孔洞'],
    soft: ['穿透', '缺损']
  },
  chewed_edges: ['缺口', '叶缘', '被咬', '啃食', '边缘缺失'],
  skeletonized_leaves: ['骨架', '叶脉', '只剩叶脉', '镂空'],
  tunnels_in_leaf: ['潜道', '蛇形', '隧道', '蜿蜒']
}
const STRUCTURAL_DAMAGE_AMBIGUOUS_HINTS = ['疑似', '可能', '像是', '看起来像']

function normalizeOptionalConfidence(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isStructuralDamageSymptomKey(symptomKey = '') {
  return Object.prototype.hasOwnProperty.call(
    STRUCTURAL_DAMAGE_CUE_RULES,
    normalizeText(symptomKey || '', '')
  )
}

function hasExplicitStructuralDamageCue(symptomKey = '', supportingRegionNote = '', normalizationNotes = []) {
  const normalizedSymptomKey = normalizeText(symptomKey || '', '')
  if (!isStructuralDamageSymptomKey(normalizedSymptomKey)) {
    return true
  }

  const evidenceText = [
    supportingRegionNote,
    ...(Array.isArray(normalizationNotes) ? normalizationNotes : [])
  ]
    .map(item => normalizeText(item || '', ''))
    .filter(Boolean)
    .join(' ')

  if (!evidenceText) {
    return true
  }

  const rule = STRUCTURAL_DAMAGE_CUE_RULES[normalizedSymptomKey]
  if (Array.isArray(rule)) {
    return rule.some(keyword => evidenceText.includes(keyword))
  }

  const hardCueKeywords = Array.isArray(rule?.hard) ? rule.hard : []
  const softCueKeywords = Array.isArray(rule?.soft) ? rule.soft : []
  const hasHardCue = hardCueKeywords.some(keyword => evidenceText.includes(keyword))
  if (hasHardCue) {
    return true
  }

  const hasSoftCue = softCueKeywords.some(keyword => evidenceText.includes(keyword))
  if (!hasSoftCue) {
    return false
  }

  return !STRUCTURAL_DAMAGE_AMBIGUOUS_HINTS.some(keyword => evidenceText.includes(keyword))
}

function resolveOrganDecision(parsedResult = {}, imageRuntimeInput = {}) {
  const inputOrganHint = normalizeOrgan(imageRuntimeInput?.inputSlotType, 'unknown')
  const modelDetectedOrgan = normalizeOrgan(parsedResult?.normalized_organ, 'unknown')

  if (inputOrganHint !== 'unknown' && modelDetectedOrgan !== 'unknown') {
    if (inputOrganHint === modelDetectedOrgan) {
      return {
        normalized_organ: inputOrganHint,
        model_detected_organ: modelDetectedOrgan,
        organ_source: normalizeOrganSource('merged'),
        multi_organ_detected: 0,
        organ_conflict_flag: 0,
        organ_resolution_reason: 'ui_hint_confirmed_by_model'
      }
    }

    return {
      normalized_organ: inputOrganHint,
      model_detected_organ: modelDetectedOrgan,
      organ_source: normalizeOrganSource('merged'),
      multi_organ_detected: 1,
      organ_conflict_flag: 1,
      organ_resolution_reason: `ui_hint_priority_over_model:${modelDetectedOrgan}`
    }
  }

  if (inputOrganHint !== 'unknown') {
    return {
      normalized_organ: inputOrganHint,
      model_detected_organ: 'unknown',
      organ_source: normalizeOrganSource('ui_hint'),
      multi_organ_detected: 0,
      organ_conflict_flag: 0,
      organ_resolution_reason: 'ui_hint_only'
    }
  }

  if (modelDetectedOrgan !== 'unknown') {
    return {
      normalized_organ: modelDetectedOrgan,
      model_detected_organ: modelDetectedOrgan,
      organ_source: normalizeOrganSource('model_detected'),
      multi_organ_detected: 0,
      organ_conflict_flag: 0,
      organ_resolution_reason: 'model_detected_only'
    }
  }

  return {
    normalized_organ: 'unknown',
    model_detected_organ: 'unknown',
    organ_source: normalizeOrganSource('unknown'),
    multi_organ_detected: 0,
    organ_conflict_flag: 0,
    organ_resolution_reason: 'organ_unresolved'
  }
}

function getAdapterMeta(overrides = {}) {
  const overrideProvider = normalizeText(
    overrides?.source_model_provider || overrides?.sourceModelProvider || '',
    ''
  )
  const overrideName = normalizeText(
    overrides?.source_model_name || overrides?.sourceModelName || '',
    ''
  )
  const overridePromptVersion = normalizeText(
    overrides?.prompt_version || overrides?.promptVersion || '',
    ''
  )
  const overrideProfile = normalizeText(
    overrides?.source_model_profile || overrides?.sourceModelProfile || '',
    ''
  )
  const overrideReasoningMode = normalizeText(
    overrides?.source_model_reasoning_mode || overrides?.sourceModelReasoningMode || '',
    ''
  )
  const overrideAdapterName = normalizeText(
    overrides?.adapter_name || overrides?.adapterName || '',
    ''
  )
  const providerForAdapterName =
    overrideProvider || normalizeText(sourceModelProvider || 'hunyuan', 'hunyuan')

  return {
    source_model_provider: providerForAdapterName,
    source_model_name: overrideName || normalizeText(sourceModelName || '', ''),
    source_model_profile: overrideProfile || normalizeText(sourceModelProfile || '', ''),
    source_model_reasoning_mode:
      overrideReasoningMode || normalizeText(sourceModelReasoningMode || '', ''),
    adapter_name:
      overrideAdapterName ||
      (providerForAdapterName.includes('qwen') ||
      providerForAdapterName.includes('aliyun') ||
      providerForAdapterName.includes('bailian')
        ? QWEN_ADAPTER_NAME
        : ADAPTER_NAME),
    prompt_version: overridePromptVersion || PROMPT_VERSION
  }
}

function normalizeModelVisualResult(
  parsedResult = {},
  imageRuntimeInput = {},
  visualCallBatchId = '',
  adapterMeta = getAdapterMeta()
) {
  const organDecision = resolveOrganDecision(parsedResult, imageRuntimeInput)
  const imageQualityGrade = normalizeQualityGrade(parsedResult?.image_quality_grade, 'medium')
  const analyzability = normalizeAnalyzability(
    parsedResult?.analyzability,
    qualityGradeToAnalyzability(imageQualityGrade)
  )
  const normalizationNotes = normalizeNotes(parsedResult?.normalization_notes || [])
  const rawSymptomCandidates = (Array.isArray(parsedResult?.symptom_candidates)
    ? parsedResult.symptom_candidates
    : []
  )
    .map(item => ({
      symptom_key: normalizeText(item?.symptom_key || ''),
      display_name_cn: normalizeText(item?.display_name_cn || item?.symptom_key || ''),
      strength_level: normalizeStrengthLevel(item?.strength_level, 'medium'),
      confidence_band: normalizeConfidenceBand(item?.confidence_band, 'medium'),
      visibility_scope: normalizeVisibilityScope(item?.visibility_scope, 'organ'),
      supporting_region_note: normalizeText(item?.supporting_region_note || ''),
      admission_readiness: normalizeAdmissionReadiness(item?.admission_readiness, 'cautious')
    }))
    .filter(item => item.symptom_key)
    .slice(0, 8)
  const symptomCandidates = rawSymptomCandidates.filter(item => {
    if (hasExplicitStructuralDamageCue(item.symptom_key, item.supporting_region_note, normalizationNotes)) {
      return true
    }

    normalizationNotes.push(`structural_candidate_dropped:${item.symptom_key}:missing_explicit_structural_cue`)
    return false
  })
  const outOfPoolSymptomCandidates = (Array.isArray(parsedResult?.out_of_pool_symptom_candidates)
    ? parsedResult.out_of_pool_symptom_candidates
    : []
  )
    .map(item => ({
      raw_visual_name_cn: normalizeText(item?.raw_visual_name_cn || '', ''),
      raw_visual_name_en: normalizeText(item?.raw_visual_name_en || '', ''),
      closest_symptom_key_hint: normalizeText(item?.closest_symptom_key_hint || '', ''),
      reason: normalizeText(item?.reason || 'not_in_ai_visual_pool', 'not_in_ai_visual_pool')
    }))
    .filter(item => item.raw_visual_name_cn || item.raw_visual_name_en)
    .slice(0, 5)

  if (
    organDecision.organ_conflict_flag &&
    !normalizationNotes.includes(`organ_conflict:${organDecision.organ_resolution_reason}`)
  ) {
    normalizationNotes.push(`organ_conflict:${organDecision.organ_resolution_reason}`)
  }

  if (outOfPoolSymptomCandidates.length) {
    normalizationNotes.push(`out_of_pool_symptom_candidates:${outOfPoolSymptomCandidates.length}`)
  }

  return {
    image_id: imageRuntimeInput.imageId,
    visual_call_batch_id: visualCallBatchId,
    source_model_provider: adapterMeta.source_model_provider,
    source_model_name: adapterMeta.source_model_name,
    input_organ_hint:
      imageRuntimeInput.inputSlotType && imageRuntimeInput.inputSlotType !== 'unknown'
        ? imageRuntimeInput.inputSlotType
        : 'unknown',
    input_slot_order: Number.isFinite(
      Number(imageRuntimeInput.inputSlotOrder ?? imageRuntimeInput.orderIndex ?? 0)
    )
      ? Number(imageRuntimeInput.inputSlotOrder ?? imageRuntimeInput.orderIndex ?? 0)
      : 0,
    input_slot_label: normalizeText(imageRuntimeInput.inputSlotLabel || '', ''),
    user_declared_organ_type: normalizeOrgan(imageRuntimeInput.userDeclaredOrganType, 'unknown'),
    user_declared_organ_confidence: normalizeOptionalConfidence(
      imageRuntimeInput.userDeclaredOrganConfidence
    ),
    normalized_organ: organDecision.normalized_organ,
    model_detected_organ: organDecision.model_detected_organ,
    organ_source: organDecision.organ_source,
    multi_organ_detected: organDecision.multi_organ_detected,
    organ_conflict_flag: organDecision.organ_conflict_flag,
    organ_resolution_reason: organDecision.organ_resolution_reason,
    image_quality_grade: imageQualityGrade,
    analyzability,
    symptom_candidates: symptomCandidates,
    out_of_pool_symptom_candidates: outOfPoolSymptomCandidates,
    route_hints: normalizeRouteHints(parsedResult?.route_hints || []),
    suggested_followup_capture: normalizeSuggestedFollowupCapture(
      parsedResult?.suggested_followup_capture || []
    ),
    normalization_notes: normalizeNotes(normalizationNotes)
  }
}

async function analyzeImage(
  imageRuntimeInput,
  { visualCallBatchId, onText, adapterMetaOverride = {}, llmOptions = {} } = {}
) {
  const startedAt = Date.now()
  const llmStartedAt = Date.now()
  const llmResult = await callLLMDiagnose([imageRuntimeInput], { onText, ...llmOptions })
  const llmMs = Math.max(0, Date.now() - llmStartedAt)
  const adapterMeta = getAdapterMeta({
    ...adapterMetaOverride,
    ...(llmResult && typeof llmResult === 'object' ? llmResult.adapterMetaOverride || {} : {})
  })
  const rawTextOutput =
    typeof llmResult === 'string'
      ? llmResult
      : String(llmResult?.text || '')
  const parseStartedAt = Date.now()
  const rawStructuredOutput = parseLLMVisualResult(rawTextOutput)
  const parseMs = Math.max(0, Date.now() - parseStartedAt)
  const normalizeStartedAt = Date.now()
  const normalizedResult = normalizeModelVisualResult(
    rawStructuredOutput,
    imageRuntimeInput,
    visualCallBatchId,
    adapterMeta
  )
  const normalizeMs = Math.max(0, Date.now() - normalizeStartedAt)

  return {
    ...imageRuntimeInput,
    callStatus: 'succeeded',
    rawTextOutput,
    rawStructuredOutput,
    normalizedResult,
    adapterMeta,
    llmPromptAudit:
      llmResult && typeof llmResult === 'object' ? llmResult.promptAudit || null : null,
    llmUsage:
      llmResult && typeof llmResult === 'object' ? llmResult.usage || null : null,
    llmTiming:
      llmResult && typeof llmResult === 'object'
        ? llmResult.llmTiming || { totalMs: llmMs }
        : { totalMs: llmMs },
    adapterTiming: {
      llmMs,
      parseMs,
      normalizeMs,
      totalMs: Math.max(0, Date.now() - startedAt)
    }
  }
}

module.exports = {
  ADAPTER_NAME,
  QWEN_ADAPTER_NAME,
  getAdapterMeta,
  analyzeImage
}
