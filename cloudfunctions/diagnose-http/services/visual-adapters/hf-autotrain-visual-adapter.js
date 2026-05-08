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
  normalizeText,
  qualityGradeToAnalyzability,
  clampConfidence
} = require('../../utils/visual-contract')
const {
  llm: {
    model: configuredSourceModelName = 'hf-autotrain-image-classification',
    service: configuredProvider = 'hunyuan',
    hfAutotrain: {
      endpoint: configuredEndpoint = '',
      apiKey: configuredApiKey = '',
      timeoutMs: configuredTimeoutMs = 60000,
      topK: configuredTopK = 3,
      modelName: configuredHfModelName = 'henglidadi/symptoms'
    } = {}
  } = {}
} = require('../../configs')
const labelMap = require('../../constants/hf-autotrain-label-map')

const ADAPTER_NAME = 'hf_autotrain_visual_adapter'
const DEFAULT_PROVIDER = 'hf_autotrain'

function pickSourceModelName() {
  const hfName = normalizeText(configuredHfModelName || '', '')
  return hfName || normalizeText(configuredSourceModelName || '', 'hf-autotrain-image-classification')
}

function scoreToBand(score = 0) {
  const numeric = Number(score || 0)
  if (numeric >= 0.8) {return 'high'}
  if (numeric >= 0.5) {return 'medium'}
  return 'low'
}

function scoreToStrength(score = 0) {
  const numeric = Number(score || 0)
  if (numeric >= 0.8) {return 'strong'}
  if (numeric >= 0.5) {return 'medium'}
  return 'weak'
}

function scoreToReadiness(score = 0) {
  const numeric = Number(score || 0)
  if (numeric >= 0.8) {return 'ready'}
  if (numeric >= 0.5) {return 'cautious'}
  return 'retain_only'
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

  return {
    source_model_provider: overrideProvider || DEFAULT_PROVIDER,
    source_model_name: overrideName || pickSourceModelName(),
    adapter_name: ADAPTER_NAME,
    prompt_version: overridePromptVersion || (
      normalizeText(configuredProvider || '', '').toLowerCase() === DEFAULT_PROVIDER
        ? 'hf_label_mapping_v1'
        : 'hf_label_mapping_shadow_v1'
    )
  }
}

function parseDataUri(imageRef = '') {
  const normalized = normalizeText(imageRef, '')
  const match = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {return null}
  return {
    mimeType: match[1],
    base64: match[2]
  }
}

async function callInferenceService(imageRuntimeInput = {}) {
  const endpoint = normalizeText(configuredEndpoint, '')
  if (!endpoint) {
    throw new Error('hf_autotrain_endpoint_missing')
  }

  const parsedDataUri = parseDataUri(imageRuntimeInput?.imageRef || '')
  const payload = {
    top_k: Math.max(1, Number(configuredTopK || 3) || 3),
    input_organ_hint: normalizeText(imageRuntimeInput?.inputSlotType || '', '')
  }

  if (parsedDataUri?.base64) {
    payload.image_base64 = parsedDataUri.base64
  } else {
    payload.image_url = normalizeText(imageRuntimeInput?.imageRef || '', '')
  }

  if (!payload.image_base64 && !payload.image_url) {
    throw new Error('hf_autotrain_image_ref_missing')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(configuredTimeoutMs || 15000)))

  try {
    const response = await fetch(endpoint.replace(/\/+$/, '') + '/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(normalizeText(configuredApiKey, '') ? { Authorization: `Bearer ${configuredApiKey}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(normalizeText(data?.error || `hf_autotrain_http_${response.status}`, 'hf_autotrain_http_failed'))
    }
    if (!data || typeof data !== 'object') {
      throw new Error('hf_autotrain_response_invalid')
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('hf_autotrain_timeout')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function capReadiness(value = 'cautious', cap = 'ready') {
  const normalizedValue = normalizeAdmissionReadiness(value, 'cautious')
  const normalizedCap = normalizeAdmissionReadiness(cap, 'ready')
  const ranking = {
    retain_only: 1,
    cautious: 2,
    ready: 3
  }

  return ranking[normalizedValue] <= ranking[normalizedCap] ? normalizedValue : normalizedCap
}

function buildMappedCandidates(predictions = [], notes = [], routeHints = []) {
  const candidateMap = new Map()

  for (const item of Array.isArray(predictions) ? predictions : []) {
    const rawLabel = normalizeText(item?.label || item?.className || item?.class_name || '', '')
      .toLowerCase()
    if (!rawLabel) {continue}

    const rawScore = Number(item?.score ?? item?.confidence ?? item?.probability ?? 0)
    const mapping = labelMap[rawLabel]

    if (!mapping) {
      notes.push(`hf_label_unmapped:${rawLabel}`)
      continue
    }

    if (mapping.normalization_note) {
      notes.push(mapping.normalization_note)
    }

    if (mapping.non_problematic_signal || mapping.route_only_signal) {
      const routeScoreFloor = Number(mapping.min_route_score ?? 0.7)
      if (rawScore >= routeScoreFloor) {
        routeHints.push({
          type: mapping.route_hint_type || 'possible_non_problematic_signal',
          reason: mapping.route_hint_reason || 'hf_label_route_only',
          score: rawScore,
          label: rawLabel
        })
      }
      continue
    }

    const adjustedScore = clampConfidence(rawScore + Number(mapping.confidence_adjustment || 0))
    const symptomKey = normalizeText(mapping.symptom_key, '')
    if (!symptomKey) {continue}

    const candidate = {
      symptom_key: symptomKey,
      display_name_cn: normalizeText(mapping.display_name_cn || symptomKey, symptomKey),
      strength_level: normalizeStrengthLevel(scoreToStrength(adjustedScore), 'medium'),
      confidence_band: normalizeConfidenceBand(scoreToBand(adjustedScore), 'medium'),
      visibility_scope: normalizeVisibilityScope(mapping.visibility_scope || 'organ', 'organ'),
      supporting_region_note: '',
      admission_readiness: capReadiness(
        scoreToReadiness(adjustedScore),
        mapping.readiness_cap || 'ready'
      ),
      normalized_score: adjustedScore
    }

    const existing = candidateMap.get(symptomKey)
    if (!existing || Number(existing.normalized_score || 0) < adjustedScore) {
      candidateMap.set(symptomKey, candidate)
    }
  }

  return Array.from(candidateMap.values())
    .sort((a, b) => Number(b.normalized_score || 0) - Number(a.normalized_score || 0))
    .slice(0, 8)
    .map(item => ({
      symptom_key: item.symptom_key,
      display_name_cn: item.display_name_cn,
      strength_level: item.strength_level,
      confidence_band: item.confidence_band,
      visibility_scope: item.visibility_scope,
      supporting_region_note: item.supporting_region_note,
      admission_readiness: item.admission_readiness
    }))
}

function resolveNormalizedOrgan(imageRuntimeInput = {}, mappedCandidates = [], predictions = []) {
  const inputHint = normalizeOrgan(imageRuntimeInput?.inputSlotType, 'unknown')
  if (inputHint !== 'unknown') {return inputHint}

  const firstCandidate = mappedCandidates[0]
  if (firstCandidate?.symptom_key) {
    const firstPrediction = normalizeText(predictions?.[0]?.label || '', '').toLowerCase()
    const mapping = labelMap[firstPrediction]
    if (mapping?.normalized_organ) {
      return normalizeOrgan(mapping.normalized_organ, 'unknown')
    }
  }

  return 'unknown'
}

function normalizeModelVisualResult(
  rawStructuredOutput = {},
  imageRuntimeInput = {},
  visualCallBatchId = '',
  adapterMeta = getAdapterMeta()
) {
  const predictions = Array.isArray(rawStructuredOutput?.symptom_candidates)
    ? rawStructuredOutput.symptom_candidates
    : Array.isArray(rawStructuredOutput?.predictions)
      ? rawStructuredOutput.predictions
      : []
  const imageQualityGrade = normalizeQualityGrade(rawStructuredOutput?.image_quality_grade, 'medium')
  const normalizationNotes = normalizeNotes(rawStructuredOutput?.normalization_notes || [])
  const routeHints = normalizeRouteHints(rawStructuredOutput?.route_hints || [])
  const mappedCandidates = buildMappedCandidates(predictions, normalizationNotes, routeHints)

  return {
    image_id: imageRuntimeInput.imageId,
    visual_call_batch_id: visualCallBatchId,
    source_model_provider: adapterMeta.source_model_provider,
    source_model_name: adapterMeta.source_model_name,
    input_organ_hint:
      imageRuntimeInput.inputSlotType && imageRuntimeInput.inputSlotType !== 'unknown'
        ? imageRuntimeInput.inputSlotType
        : 'unknown',
    normalized_organ: normalizeOrgan(
      rawStructuredOutput?.normalized_organ ||
        resolveNormalizedOrgan(imageRuntimeInput, mappedCandidates, predictions),
      'unknown'
    ),
    image_quality_grade: imageQualityGrade,
    analyzability: normalizeAnalyzability(
      rawStructuredOutput?.analyzability,
      qualityGradeToAnalyzability(imageQualityGrade)
    ),
    symptom_candidates: mappedCandidates,
    route_hints: routeHints,
    suggested_followup_capture: normalizeSuggestedFollowupCapture(
      rawStructuredOutput?.suggested_followup_capture || []
    ),
    normalization_notes: normalizationNotes
  }
}

async function analyzeImage(
  imageRuntimeInput = {},
  { visualCallBatchId, adapterMetaOverride = {} } = {}
) {
  const adapterMeta = getAdapterMeta(adapterMetaOverride)
  const rawStructuredOutput =
    imageRuntimeInput?.hfStructuredOutput ||
    imageRuntimeInput?.hfClassificationResult ||
    imageRuntimeInput?.precomputedClassification ||
    await callInferenceService(imageRuntimeInput)

  return {
    ...imageRuntimeInput,
    callStatus: 'succeeded',
    rawTextOutput: JSON.stringify(rawStructuredOutput),
    rawStructuredOutput,
    normalizedResult: normalizeModelVisualResult(
      rawStructuredOutput,
      imageRuntimeInput,
      visualCallBatchId,
      adapterMeta
    ),
    adapterMeta
  }
}

module.exports = {
  ADAPTER_NAME,
  getAdapterMeta,
  analyzeImage
}
