'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  llm: {
    service: configuredPrimaryService = 'hunyuan',
    model: configuredPrimaryModel = '',
    modelProfile: configuredPrimaryModelProfile = '',
    modelReasoningMode: configuredPrimaryModelReasoningMode = '',
    shadowService: configuredShadowService = '',
    shadowModel: configuredShadowModel = ''
  } = {}
} = require('../configs')
const { getVisualAdapter } = require('./visual-adapters')
const {
  buildRuntimeId,
  stringifyJson,
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
  normalizeStringList,
  confidenceBandToScore,
  strengthLevelToWeight,
  pickStrongerBand,
  pickStrongerStrength,
  pickHigherReadiness,
  qualityGradeToClarityLevel,
  resolveSubjectCompletenessLevel,
  resolveAggregateRoutePrimaryAction,
  clampConfidence
} = require('../utils/visual-contract')
const {
  isWeakBroadStructuralCandidate,
  resolveStructuralVisualEvidenceStatus
} = require('../utils/structural-visual-evidence')
const {
  listAuditedOutOfPoolProxyMappings
} = require('../repositories/out-of-pool-proxy-mapping-repository')
const {
  getPromptSymptomDictionary
} = require('../repositories/symptom-repository')
const {
  buildOutOfPoolSymptomHintsFromCandidates
} = require('../utils/out-of-pool-proxy')

function normalizeServiceValue(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizePersistedImageRef(value = '') {
  const normalized = normalizeText(value, '')
  if (!normalized) {return ''}
  if (/^data:image\//i.test(normalized)) {
    return '[inline_data_url]'
  }
  return normalized
}

function extractOutOfPoolSymptomCandidates(payload = null) {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  return (Array.isArray(payload.out_of_pool_symptom_candidates)
    ? payload.out_of_pool_symptom_candidates
    : []
  ).filter(item => item && typeof item === 'object')
}

function buildSymptomDisplayNameMap(symptomRows = []) {
  return new Map(
    (Array.isArray(symptomRows) ? symptomRows : [])
      .map(item => {
        const symptomKey = normalizeText(item?.symptomKey || '')
        const displayName = normalizeText(
          item?.displayTextCn || item?.symptomCn || symptomKey,
          symptomKey
        )
        return symptomKey && displayName ? [symptomKey, displayName] : null
      })
      .filter(Boolean)
  )
}

async function loadSymptomDisplayNameMap() {
  try {
    return buildSymptomDisplayNameMap(await getPromptSymptomDictionary())
  } catch (error) {
    console.warn('diagnose-http visual canonical symptom names degraded:', error?.message || error)
    return new Map()
  }
}

function canonicalizeSymptomCandidate(candidate = null, displayNameMap = new Map()) {
  if (!candidate || typeof candidate !== 'object') {
    return candidate
  }

  const symptomKey = normalizeText(candidate?.symptom_key || candidate?.symptomKey || '')
  const canonicalDisplayName = symptomKey ? normalizeText(displayNameMap.get(symptomKey) || '') : ''
  if (!symptomKey || !canonicalDisplayName) {
    return candidate
  }

  return {
    ...candidate,
    symptom_key: symptomKey,
    display_name_cn: canonicalDisplayName
  }
}

function canonicalizeVisualPayload(payload = null, displayNameMap = new Map()) {
  if (!payload || typeof payload !== 'object' || !displayNameMap.size) {
    return payload
  }

  const next = { ...payload }
  if (Array.isArray(next.symptom_candidates)) {
    next.symptom_candidates = next.symptom_candidates.map(candidate =>
      canonicalizeSymptomCandidate(candidate, displayNameMap)
    )
  }
  if (next.parsed_result && typeof next.parsed_result === 'object') {
    next.parsed_result = canonicalizeVisualPayload(next.parsed_result, displayNameMap)
  }
  if (next.parsedResult && typeof next.parsedResult === 'object') {
    next.parsedResult = canonicalizeVisualPayload(next.parsedResult, displayNameMap)
  }
  return next
}

function canonicalizeVisualResult(result = null, displayNameMap = new Map()) {
  if (!result || typeof result !== 'object' || !displayNameMap.size) {
    return result
  }

  return {
    ...result,
    normalizedResult: canonicalizeVisualPayload(result.normalizedResult, displayNameMap),
    rawStructuredOutput: canonicalizeVisualPayload(result.rawStructuredOutput, displayNameMap)
  }
}

function isDataImageUrl(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

async function resolveOutOfPoolAuditImageRef(imageRef = '', outOfPoolCandidates = []) {
  if (!Array.isArray(outOfPoolCandidates) || outOfPoolCandidates.length === 0) {
    return ''
  }

  const normalized = String(imageRef || '').trim()
  if (!normalized) {
    return ''
  }

  if (isDataImageUrl(normalized)) {
    return normalized
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const response = await fetch(normalized)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = String(response.headers.get('content-type') || 'image/jpeg').trim()
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length) {
        return ''
      }

      return `data:${contentType};base64,${buffer.toString('base64')}`
    } catch (error) {
      console.warn(
        'diagnose-http out-of-pool replay image fetch failed, fallback to original image ref:',
        String(error?.message || error || '')
      )
    }
  }

  return normalized
}

async function buildOutOfPoolSymptomHints(successfulResults = []) {
  const proxyMappings = await listAuditedOutOfPoolProxyMappings()
  return buildOutOfPoolSymptomHintsFromCandidates(
    (Array.isArray(successfulResults) ? successfulResults : []).flatMap(result => {
      const normalizedResult = result?.normalizedResult || {}
      const organKey = normalizeText(normalizedResult?.normalized_organ || 'unknown', 'unknown')
      return extractOutOfPoolSymptomCandidates(normalizedResult).map(candidate => ({
        candidate,
        organKey
      }))
    }),
    { proxyMappings }
  )
}

function normalizeNullableSqlNumber(value) {
  if (value === null || value === undefined || value === '') {return null}
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeUploadCompression(value = null) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const numberFields = [
    'originalSizeBytes',
    'uploadedSizeBytes',
    'compressionRatio',
    'quality',
    'width',
    'height',
    'targetSizeBytes',
    'minimumQuality'
  ]
  const normalized = {
    source: normalizeText(value.source || '', ''),
    compressed: Boolean(value.compressed),
    preserveImageDetails: Boolean(value.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(value.doubleConfirmedForHunyuan)
  }

  for (const field of numberFields) {
    const num = Number(value[field])
    normalized[field] = Number.isFinite(num) && num > 0 ? num : null
  }

  return normalized
}

function buildNullableSqlNumberBinding(value) {
  const normalizedValue = normalizeNullableSqlNumber(value)
  return {
    value: normalizedValue === null ? 0 : normalizedValue,
    hasValue: normalizedValue === null ? 0 : 1
  }
}

const normalizedPrimaryService = normalizeServiceValue(configuredPrimaryService) || 'hunyuan'
const normalizedShadowService = normalizeServiceValue(configuredShadowService)
const shouldEnableShadowCompare = Boolean(normalizedShadowService) && (
  normalizedShadowService !== normalizedPrimaryService ||
  normalizeText(configuredShadowModel || '', '') !== normalizeText(configuredPrimaryModel || '', '')
)

const primaryVisualAdapter = getVisualAdapter(normalizedPrimaryService)
const shadowVisualAdapter = shouldEnableShadowCompare
  ? getVisualAdapter(normalizedShadowService)
  : null

const primaryAdapterMetaOverride = {
  source_model_provider: normalizedPrimaryService,
  source_model_name: normalizeText(configuredPrimaryModel || '', ''),
  source_model_profile: normalizeText(configuredPrimaryModelProfile || '', ''),
  source_model_reasoning_mode: normalizeText(configuredPrimaryModelReasoningMode || '', '')
}

const shadowAdapterMetaOverride = shadowVisualAdapter
  ? {
      source_model_provider: normalizedShadowService,
      source_model_name: normalizeText(configuredShadowModel || configuredPrimaryModel || '', '')
    }
  : null

function scoreQuality(grade = 'medium') {
  const normalized = normalizeQualityGrade(grade, 'medium')
  if (normalized === 'good') {return 3}
  if (normalized === 'poor') {return 1}
  return 2
}

function scoreAnalyzability(level = 'medium') {
  const normalized = normalizeAnalyzability(level, 'medium')
  if (normalized === 'high') {return 4}
  if (normalized === 'marginal') {return 2}
  if (normalized === 'low') {return 1}
  return 3
}

function scoreToQuality(score = 0) {
  if (score >= 2.5) {return 'good'}
  if (score <= 1.5) {return 'poor'}
  return 'medium'
}

function scoreToAnalyzability(score = 0) {
  if (score >= 3.5) {return 'high'}
  if (score >= 2.5) {return 'medium'}
  if (score >= 1.5) {return 'marginal'}
  return 'low'
}

function scoreCandidatePriority(candidate = {}) {
  return (
    confidenceBandToScore(candidate?.confidence_band) * 10 +
    strengthLevelToWeight(candidate?.strength_level)
  )
}

function normalizeDuplicateViewNote(value = '') {
  const normalized = normalizeText(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 80)

  return normalized || 'no_region_note'
}

function buildDuplicateViewGroupKey({
  symptomKey = '',
  normalizedOrgan = 'unknown',
  visibilityScope = 'organ',
  supportingRegionNote = ''
} = {}) {
  return [
    normalizeText(symptomKey, 'unknown_symptom'),
    normalizeOrgan(normalizedOrgan, 'unknown'),
    normalizeVisibilityScope(visibilityScope, 'organ'),
    normalizeDuplicateViewNote(supportingRegionNote)
  ].join('::')
}

function buildSupportViewGroupDescriptor({
  symptomKey = '',
  normalizedOrgan = 'unknown',
  candidate = {},
  imageId = '',
  visualNormalizedImageResultId = '',
  visualRawImageRecordId = ''
} = {}) {
  const visibilityScope = normalizeVisibilityScope(candidate?.visibility_scope, 'organ')
  const supportingRegionNote = normalizeText(candidate?.supporting_region_note || '')

  return {
    group_key: buildDuplicateViewGroupKey({
      symptomKey,
      normalizedOrgan,
      visibilityScope,
      supportingRegionNote
    }),
    symptom_key: normalizeText(symptomKey, ''),
    organ: normalizeOrgan(normalizedOrgan, 'unknown'),
    visibility_scope: visibilityScope,
    supporting_region_note: supportingRegionNote,
    image_id: normalizeText(imageId, ''),
    visual_normalized_image_result_id: normalizeText(visualNormalizedImageResultId, ''),
    visual_raw_image_record_id: normalizeText(visualRawImageRecordId, '')
  }
}

function appendDistinctValue(target = [], value = '') {
  const normalized = normalizeText(value, '')
  if (!normalized) {return target}
  if (!target.includes(normalized)) {target.push(normalized)}
  return target
}

function appendSupportViewGroup(candidateRecord = {}, descriptor = {}) {
  if (!descriptor?.group_key) {return}

  if (!Array.isArray(candidateRecord.support_view_groups)) {
    candidateRecord.support_view_groups = []
  }

  let currentGroup = candidateRecord.support_view_groups.find(
    item => item.group_key === descriptor.group_key
  )

  if (!currentGroup) {
    currentGroup = {
      group_key: descriptor.group_key,
      symptom_key: descriptor.symptom_key,
      organ: descriptor.organ,
      visibility_scope: descriptor.visibility_scope,
      supporting_region_note: descriptor.supporting_region_note,
      image_ids: [],
      visual_normalized_image_result_ids: [],
      visual_raw_image_record_ids: [],
      image_count: 0,
      independent_support_unit: 1
    }
    candidateRecord.support_view_groups.push(currentGroup)
  }

  appendDistinctValue(currentGroup.image_ids, descriptor.image_id)
  appendDistinctValue(
    currentGroup.visual_normalized_image_result_ids,
    descriptor.visual_normalized_image_result_id
  )
  appendDistinctValue(currentGroup.visual_raw_image_record_ids, descriptor.visual_raw_image_record_id)
  currentGroup.image_count = currentGroup.image_ids.length

  candidateRecord.support_group_keys = candidateRecord.support_view_groups.map(item => item.group_key)
  candidateRecord.support_count = candidateRecord.support_view_groups.length
}

function resolvePerImageRoutePrimaryAction({
  analyzability = 'medium',
  symptomCandidates = [],
  suggestedFollowupCapture = []
} = {}) {
  const normalizedAnalyzability = normalizeAnalyzability(analyzability, 'medium')
  const candidateCount = Array.isArray(symptomCandidates) ? symptomCandidates.length : 0
  const followupCount = Array.isArray(suggestedFollowupCapture)
    ? suggestedFollowupCapture.length
    : 0

  if (normalizedAnalyzability === 'low') {return 'retake_first'}
  if (candidateCount > 0) {return 'standard_flow'}
  if (normalizedAnalyzability === 'marginal' || followupCount > 0) {return 'ask_first'}
  return 'uncertain_prepare'
}

function resolveOrganSource(inputSlotType = 'unknown', normalizedOrgan = 'unknown') {
  const normalizedInput = normalizeOrgan(inputSlotType, 'unknown')
  const normalizedResult = normalizeOrgan(normalizedOrgan, 'unknown')

  if (normalizedInput === 'unknown' && normalizedResult === 'unknown') {return 'unknown'}
  if (normalizedInput === 'unknown') {return 'model_detected'}
  if (normalizedResult === 'unknown') {return 'ui_hint'}
  if (normalizedInput === normalizedResult) {return 'merged'}
  return 'ui_hint'
}

function buildImageRuntimeInput(input = {}, index = 0) {
  const imageRef = normalizeText(
    input.imageRef || input.imageUrl || input.url || input.image || ''
  )
  if (!imageRef) {return null}

  const normalizedOrderIndex = Number(input.orderIndex ?? index)
  const normalizedInputSlotOrder = Number(input.inputSlotOrder ?? input.orderIndex ?? index)
  const declaredOrganConfidence = input.userDeclaredOrganConfidence

  return {
    imageRef,
    imageId: buildRuntimeId(`visimg${index + 1}`),
    orderIndex: Number.isFinite(normalizedOrderIndex) ? normalizedOrderIndex : index,
    inputSlotOrder: Number.isFinite(normalizedInputSlotOrder) ? normalizedInputSlotOrder : index,
    inputSlotLabel: normalizeText(input.inputSlotLabel || input.slotLabel || '', ''),
    userDeclaredOrganType: normalizeOrgan(
      input.userDeclaredOrganType || input.declaredOrganType || input.userDeclaredOrgan || 'unknown',
      'unknown'
    ),
    userDeclaredOrganConfidence:
      declaredOrganConfidence === null ||
      declaredOrganConfidence === undefined ||
      declaredOrganConfidence === ''
        ? null
        : Number.isFinite(Number(declaredOrganConfidence))
          ? Number(declaredOrganConfidence)
          : null,
    inputSlotType: normalizeOrgan(
      input.inputSlotType || input.slotType || input.organHint || input.organ || 'unknown',
      'unknown'
    ),
    uploadCompression: normalizeUploadCompression(
      input.uploadCompression || input.compression || null
    ),
    shadowStructuredOutput:
      input.shadowStructuredOutput ||
      input.shadowCompareInput ||
      input.hfStructuredOutput ||
      input.hfClassificationResult ||
      input.precomputedClassification ||
      null,
    visualRawImageRecordId: buildRuntimeId('visraw'),
    visualNormalizedImageResultId: buildRuntimeId('visnorm')
  }
}

function buildCaseSlotSummary(imageInputs = []) {
  return (Array.isArray(imageInputs) ? imageInputs : []).map((item, index) => ({
    imageId: item?.imageId || '',
    inputSlotType: normalizeText(item?.inputSlotType || '', 'unknown'),
    inputSlotOrder: Number.isFinite(Number(item?.inputSlotOrder ?? item?.orderIndex ?? index))
      ? Number(item.inputSlotOrder ?? item.orderIndex ?? index)
      : index,
    inputSlotLabel: normalizeText(item?.inputSlotLabel || '', '')
  }))
}

function emitVisualStreamEvent(onVisualEvent, eventName, payload = {}) {
  if (typeof onVisualEvent !== 'function') {return}
  try {
    onVisualEvent(eventName, payload)
  } catch (error) {
    console.warn('diagnose-http visual stream event ignored:', error?.message || error)
  }
}

function normalizeVisualStreamList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function pickVisualStreamText(...values) {
  for (const value of values) {
    const text = normalizeText(value, '')
    if (text) {return text}
  }
  return ''
}

function pickVisualStreamNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) {return number}
  }
  return null
}

function pickVisualStreamCandidate(item = {}) {
  if (!item || typeof item !== 'object') {return null}
  return {
    symptomKey: pickVisualStreamText(item.symptomKey, item.symptom_key, item.objectKey, item.object_key),
    symptomCn: pickVisualStreamText(
      item.symptomCn,
      item.symptom_cn,
      item.displayTextCn,
      item.display_text_cn,
      item.displayName,
      item.display_name,
      item.rawVisualNameCn,
      item.raw_visual_name_cn
    ),
    rawVisualNameCn: pickVisualStreamText(item.rawVisualNameCn, item.raw_visual_name_cn),
    rawVisualNameEn: pickVisualStreamText(item.rawVisualNameEn, item.raw_visual_name_en),
    confidence: pickVisualStreamNumber(item.confidence, item.score),
    targetLayer: pickVisualStreamText(item.targetLayer, item.target_layer),
    evidenceRole: pickVisualStreamText(item.evidenceRole, item.evidence_role),
    reason: pickVisualStreamText(item.reason, item.admissionReason, item.admission_reason),
    closestSymptomKeyHint: pickVisualStreamText(
      item.closestSymptomKeyHint,
      item.closest_symptom_key_hint
    ),
    admissionResult: pickVisualStreamText(item.admissionResult, item.admission_result)
  }
}

function compactVisualStreamCandidates(items = [], limit = 8) {
  return normalizeVisualStreamList(items)
    .map(pickVisualStreamCandidate)
    .filter(Boolean)
    .slice(0, limit)
}

function buildVisualDecisionStreamSummary(aggregateResult = {}) {
  const observedSymptoms = compactVisualStreamCandidates(
    aggregateResult.observed_symptoms || aggregateResult.observedSymptoms || [],
    12
  )
  const symptomCandidates = compactVisualStreamCandidates(
    aggregateResult.aggregated_symptom_candidates ||
      aggregateResult.aggregatedSymptomCandidates ||
      aggregateResult.symptom_candidates ||
      aggregateResult.symptomCandidates ||
      aggregateResult.in_pool_symptom_candidates ||
      aggregateResult.inPoolSymptomCandidates ||
      [],
    12
  )
  const outOfPoolSymptomCandidates = compactVisualStreamCandidates(
    aggregateResult.out_of_pool_symptom_candidates ||
      aggregateResult.outOfPoolSymptomCandidates ||
      aggregateResult.out_of_pool_symptom_hints ||
      aggregateResult.outOfPoolSymptomHints ||
      [],
    12
  )
  const routeHints = normalizeVisualStreamList(
    aggregateResult.aggregate_route_hints ||
      aggregateResult.aggregateRouteHints ||
      aggregateResult.route_hints ||
      aggregateResult.routeHints ||
      []
  )
    .map(item => pickVisualStreamText(item?.type, item?.key, item?.route, item))
    .filter(Boolean)
    .slice(0, 8)

  return {
    contractVersion: 'visual_decision_stream_v2',
    observedSymptoms,
    symptomCandidates,
    aggregatedSymptomCandidates: symptomCandidates,
    outOfPoolSymptomCandidates,
    routeHints,
    counts: {
      observedSymptoms: observedSymptoms.length,
      symptomCandidates: symptomCandidates.length,
      outOfPoolSymptomCandidates: outOfPoolSymptomCandidates.length,
      routeHints: routeHints.length
    },
    visualBatchTrace: aggregateResult.visual_batch_trace || aggregateResult.visualBatchTrace || null
  }
}

async function analyzeSingleImage(
  imageRuntimeInput,
  { visualCallBatchId, onText, llmOptions = {} } = {}
) {
  const startedAt = Date.now()
  const primaryStartedAt = Date.now()
  const primaryResult = await primaryVisualAdapter.analyzeImage(imageRuntimeInput, {
    visualCallBatchId,
    onText,
    adapterMetaOverride: primaryAdapterMetaOverride,
    llmOptions
  })
  const primaryMs = Math.max(0, Date.now() - primaryStartedAt)

  if (!shadowVisualAdapter) {
    return {
      ...primaryResult,
      visualAdapterTiming: {
        primaryMs,
        shadowMs: 0,
        shadowStatus: 'disabled',
        totalMs: Math.max(0, Date.now() - startedAt)
      },
      shadowCompare: {
        enabled: 0,
        compare_status: 'disabled',
        source_model_provider: null,
        source_model_name: null
      }
    }
  }

  try {
    const shadowStartedAt = Date.now()
    const shadowResult = await shadowVisualAdapter.analyzeImage(
      {
        ...imageRuntimeInput,
        hfStructuredOutput:
          imageRuntimeInput.shadowStructuredOutput ||
          imageRuntimeInput.hfStructuredOutput ||
          imageRuntimeInput.hfClassificationResult ||
          imageRuntimeInput.precomputedClassification ||
          null
      },
      {
        visualCallBatchId,
        adapterMetaOverride: shadowAdapterMetaOverride
      }
    )
    const shadowMs = Math.max(0, Date.now() - shadowStartedAt)

    return {
      ...primaryResult,
      visualAdapterTiming: {
        primaryMs,
        shadowMs,
        shadowStatus: 'succeeded',
        totalMs: Math.max(0, Date.now() - startedAt)
      },
      shadowCompare: {
        enabled: 1,
        compare_status: 'succeeded',
        source_model_provider: shadowResult?.adapterMeta?.source_model_provider || null,
        source_model_name: shadowResult?.adapterMeta?.source_model_name || null,
        adapter_name: shadowResult?.adapterMeta?.adapter_name || null,
        normalized_result: shadowResult?.normalizedResult || null,
        raw_structured_output: shadowResult?.rawStructuredOutput || null
      }
    }
  } catch (error) {
    return {
      ...primaryResult,
      visualAdapterTiming: {
        primaryMs,
        shadowMs: Math.max(0, Date.now() - startedAt - primaryMs),
        shadowStatus: 'failed',
        totalMs: Math.max(0, Date.now() - startedAt)
      },
      shadowCompare: {
        enabled: 1,
        compare_status: 'failed',
        source_model_provider: shadowAdapterMetaOverride?.source_model_provider || null,
        source_model_name: shadowAdapterMetaOverride?.source_model_name || null,
        adapter_name: shadowVisualAdapter?.ADAPTER_NAME || null,
        error_code: 'shadow_compare_failed',
        error_message: normalizeText(error?.message || error || 'shadow_compare_failed', '')
      }
    }
  }
}

function buildAggregatedSymptomCandidates(successfulResults = []) {
  const aggregatedMap = new Map()

  for (const result of successfulResults) {
    const normalizedOrgan = normalizeOrgan(result?.normalizedResult?.normalized_organ, 'unknown')
    const imageId = result?.imageId || ''
    const visualNormalizedImageResultId = result?.visualNormalizedImageResultId || ''
    const visualRawImageRecordId = result?.visualRawImageRecordId || ''

    for (const candidate of result?.normalizedResult?.symptom_candidates || []) {
      const symptomKey = normalizeText(candidate?.symptom_key || '')
      if (!symptomKey) {continue}

      const candidateScore = scoreCandidatePriority(candidate)
      let current = aggregatedMap.get(symptomKey)
      if (!current) {
        current = {
          symptom_key: symptomKey,
          display_name_cn: normalizeText(candidate?.display_name_cn || symptomKey),
          strength_level: normalizeStrengthLevel(candidate?.strength_level, 'medium'),
          confidence_band: normalizeConfidenceBand(candidate?.confidence_band, 'medium'),
          visibility_scope: normalizeVisibilityScope(candidate?.visibility_scope, 'organ'),
          supporting_region_note: normalizeText(candidate?.supporting_region_note || ''),
          admission_readiness: normalizeAdmissionReadiness(
            candidate?.admission_readiness,
            'cautious'
          ),
          support_image_ids: [],
          support_normalized_result_ids: [],
          support_raw_image_record_ids: [],
          support_organs: [],
          support_view_groups: [],
          support_group_keys: [],
          support_count: 0,
          primary_visual_normalized_image_result_id: visualNormalizedImageResultId || null,
          primary_visual_raw_image_record_id: visualRawImageRecordId || null,
          primary_support_image_id: imageId || null,
          primary_support_score: candidateScore
        }
        aggregatedMap.set(symptomKey, current)
      }

      current.strength_level = pickStrongerStrength(current.strength_level, candidate?.strength_level)
      current.confidence_band = pickStrongerBand(current.confidence_band, candidate?.confidence_band)
      current.admission_readiness = pickHigherReadiness(
        current.admission_readiness,
        candidate?.admission_readiness
      )

      appendDistinctValue(current.support_image_ids, imageId)
      appendDistinctValue(current.support_normalized_result_ids, visualNormalizedImageResultId)
      appendDistinctValue(current.support_raw_image_record_ids, visualRawImageRecordId)
      if (normalizedOrgan !== 'unknown') {appendDistinctValue(current.support_organs, normalizedOrgan)}
      appendSupportViewGroup(
        current,
        buildSupportViewGroupDescriptor({
          symptomKey,
          normalizedOrgan,
          candidate,
          imageId,
          visualNormalizedImageResultId,
          visualRawImageRecordId
        })
      )

      if (!current.supporting_region_note && candidate?.supporting_region_note) {
        current.supporting_region_note = normalizeText(candidate.supporting_region_note)
      }

      if (candidateScore > Number(current.primary_support_score || 0)) {
        current.primary_visual_normalized_image_result_id = visualNormalizedImageResultId || null
        current.primary_visual_raw_image_record_id = visualRawImageRecordId || null
        current.primary_support_image_id = imageId || null
        current.primary_support_score = candidateScore
      }
    }
  }

  return Array.from(aggregatedMap.values()).map(candidate => ({
    ...candidate,
    visual_structural_evidence_status: resolveStructuralVisualEvidenceStatus(candidate)
  })).sort((a, b) => {
    const scoreA = scoreCandidatePriority(a)
    const scoreB = scoreCandidatePriority(b)
    return scoreB - scoreA
  })
}

function buildDuplicateViewGroups(aggregatedCandidates = []) {
  return (Array.isArray(aggregatedCandidates) ? aggregatedCandidates : []).flatMap(candidate =>
    (Array.isArray(candidate?.support_view_groups) ? candidate.support_view_groups : [])
      .filter(group => Number(group?.image_count || 0) > 1)
      .map(group => ({
        duplicate_view_group_id: group.group_key,
        symptom_key: candidate?.symptom_key || group.symptom_key,
        organ: group.organ,
        visibility_scope: group.visibility_scope,
        supporting_region_note: group.supporting_region_note,
        image_ids: group.image_ids || [],
        visual_normalized_image_result_ids: group.visual_normalized_image_result_ids || [],
        visual_raw_image_record_ids: group.visual_raw_image_record_ids || [],
        image_count: Number(group.image_count || 0),
        independent_support_unit: Number(group.independent_support_unit || 1)
      }))
  )
}

function resolveAdmissionDecision(candidate = {}, aggregateAnalyzability = 'medium') {
  const analyzability = normalizeAnalyzability(aggregateAnalyzability, 'medium')
  const readiness = normalizeAdmissionReadiness(candidate?.admission_readiness, 'cautious')
  const band = normalizeConfidenceBand(candidate?.confidence_band, 'medium')
  const strength = normalizeStrengthLevel(candidate?.strength_level, 'medium')
  const supportCount = Number(candidate?.support_count || 0)
  const supportOrgans = normalizeStringList(candidate?.support_organs || []).filter(
    item => item !== 'unknown'
  )
  const organReady = supportOrgans.length > 0
  const reasons = []

  if (readiness === 'retain_only') {
    reasons.push('model_marked_retain_only')
    return {
      admission_result: 'explanation_retained',
      admission_reason: reasons.join('; '),
      entered_runtime: 0,
      target_layer: 'explanation_only'
    }
  }

  if (isWeakBroadStructuralCandidate(candidate)) {
    reasons.push('broad_structural_visual_candidate_needs_user_confirmation')
    return {
      admission_result: 'candidate_retained',
      admission_reason: reasons.join('; '),
      entered_runtime: 0,
      target_layer: 'visual_candidate'
    }
  }

  if (analyzability === 'low') {reasons.push('aggregate_analyzability_low')}
  if (!organReady) {reasons.push('organ_not_reliably_bound')}
  if (band === 'low') {reasons.push('confidence_band_low')}
  if (strength === 'weak') {reasons.push('strength_weak')}
  if (supportCount <= 1) {reasons.push('single_support_group')}

  const allowFormalAdmission =
    readiness === 'ready' &&
    analyzability !== 'low' &&
    organReady &&
    band !== 'low' &&
    (band === 'high' || supportCount >= 2 || strength === 'strong')

  if (allowFormalAdmission) {
    return {
      admission_result: 'formally_admitted',
      admission_reason: 'formal_gate_passed',
      entered_runtime: 1,
      target_layer: 'observed_evidence_set'
    }
  }

  const keepAsCandidate =
    analyzability !== 'low' &&
    (band !== 'low' || supportCount >= 2 || strength !== 'weak')

  if (keepAsCandidate) {
    return {
      admission_result: 'candidate_retained',
      admission_reason: reasons.join('; ') || 'needs_followup_confirmation',
      entered_runtime: 0,
      target_layer: 'visual_candidate'
    }
  }

  return {
    admission_result: 'explanation_retained',
    admission_reason: reasons.join('; ') || 'explanation_retained_by_guardrail',
    entered_runtime: 0,
    target_layer: 'explanation_only'
  }
}

function buildAdmissionRecords({
  sessionId = '',
  visualCallBatchId = '',
  aggregateAnalyzability = 'medium',
  aggregatedCandidates = []
} = {}) {
  return (Array.isArray(aggregatedCandidates) ? aggregatedCandidates : [])
    .filter(
      item =>
        normalizeText(item?.symptom_key || '') &&
        normalizeText(item?.primary_visual_normalized_image_result_id || '')
    )
    .map(candidate => {
      const decision = resolveAdmissionDecision(candidate, aggregateAnalyzability)

      return {
        visual_admission_record_id: buildRuntimeId('visadmit'),
        session_id: sessionId,
        visual_call_batch_id: visualCallBatchId,
        visual_normalized_image_result_id: candidate.primary_visual_normalized_image_result_id,
        object_type: 'symptom',
        object_key: candidate.symptom_key,
        admission_result: decision.admission_result,
        admission_reason: decision.admission_reason,
        entered_runtime: decision.entered_runtime,
        target_layer: decision.target_layer,
        candidate
      }
    })
}

function buildObservedSymptomsFromAdmissions(admissionRecords = []) {
  return (Array.isArray(admissionRecords) ? admissionRecords : [])
    .filter(item => normalizeText(item?.admission_result) === 'formally_admitted')
    .map(item => {
      const candidate = item?.candidate || {}
      const supportBonus = Math.max(0, Number(candidate?.support_count || 0) - 1) * 0.05
      const confidence =
        confidenceBandToScore(candidate?.confidence_band) * 0.7 +
        strengthLevelToWeight(candidate?.strength_level) * 0.3 +
        supportBonus

      return {
        symptomKey: candidate.symptom_key,
        symptomCn: candidate.display_name_cn || candidate.symptom_key,
        confidence: clampConfidence(confidence),
        source: 'visual_admission_v1'
      }
    })
}

function buildAggregateRouteHints({
  successfulResults = [],
  aggregateAnalyzability = 'medium',
  observedSymptoms = [],
  suggestedFollowupCapture = []
} = {}) {
  const routeHintMap = new Map()

  for (const result of successfulResults) {
    for (const hint of result?.normalizedResult?.route_hints || []) {
      const key = `${normalizeText(hint?.type)}::${normalizeText(hint?.reason)}`
      if (!key || routeHintMap.has(key)) {continue}
      routeHintMap.set(key, {
        type: normalizeText(hint?.type || ''),
        reason: normalizeText(hint?.reason || '')
      })
    }
  }

  if (
    !observedSymptoms.length &&
    normalizeAnalyzability(aggregateAnalyzability, 'medium') === 'low'
  ) {
    routeHintMap.set('retake_image::aggregate_low_analyzability', {
      type: 'retake_image',
      reason: 'aggregate_low_analyzability'
    })
  }

  if (Array.isArray(suggestedFollowupCapture) && suggestedFollowupCapture.length) {
    routeHintMap.set('request_specific_organ::followup_capture_needed', {
      type: 'request_specific_organ',
      reason: 'followup_capture_needed'
    })
  }

  if (observedSymptoms.length) {
    routeHintMap.set('continue_diagnosis::visual_candidates_ready', {
      type: 'continue_diagnosis',
      reason: 'visual_candidates_ready'
    })
  }

  return Array.from(routeHintMap.values())
}

function buildShadowCompareSummary(successfulResults = []) {
  const compareResults = (Array.isArray(successfulResults) ? successfulResults : [])
    .map(item => item?.shadowCompare || null)
    .filter(Boolean)

  if (!compareResults.length) {
    return {
      enabled: 0,
      compare_status: 'disabled',
      compared_image_count: 0,
      succeeded_image_count: 0,
      failed_image_count: 0,
      providers: [],
      model_names: []
    }
  }

  const succeededImageCount = compareResults.filter(
    item => String(item?.compare_status || '').trim() === 'succeeded'
  ).length
  const skippedImageCount = compareResults.filter(
    item => String(item?.compare_status || '').trim() === 'skipped_no_shadow_input'
  ).length

  return {
    enabled: compareResults.some(item => Number(item?.enabled || 0) === 1) ? 1 : 0,
    compare_status:
      succeededImageCount > 0
        ? 'partial_or_succeeded'
        : skippedImageCount > 0
          ? 'skipped'
        : 'failed',
    compared_image_count: compareResults.length,
    succeeded_image_count: succeededImageCount,
    skipped_image_count: skippedImageCount,
    failed_image_count: compareResults.length - succeededImageCount - skippedImageCount,
    providers: normalizeStringList(compareResults.map(item => item?.source_model_provider || '')),
    model_names: normalizeStringList(compareResults.map(item => item?.source_model_name || ''))
  }
}

function buildVisualBatchTrace({
  visualCallBatchId = '',
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start'
} = {}) {
  const currentBatchId = normalizeText(visualCallBatchId, '')
  const previousBatchId = normalizeText(originVisualCallBatchId, '')
  const supersedeApplied = Boolean(
    previousBatchId && currentBatchId && previousBatchId !== currentBatchId
  )

  return {
    current_visual_call_batch_id: currentBatchId || null,
    origin_visual_call_batch_id:
      (supersedeApplied ? previousBatchId : currentBatchId) || null,
    supersede_target_batch_id: supersedeApplied ? previousBatchId : null,
    superseded_by_batch_id: null,
    supersede_applied: supersedeApplied ? 1 : 0,
    supersede_reason: supersedeApplied ? 'new_visual_submission' : '',
    supersede_scope: supersedeApplied ? 'entire_batch' : '',
    supersede_source: supersedeApplied ? supersedeSource : '',
    supersede_time: supersedeApplied ? new Date().toISOString() : null
  }
}

async function buildAggregateResult({
  sessionId = '',
  visualCallBatchId = '',
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  imageInputs = [],
  successfulResults = []
} = {}) {
  const qualityScores = successfulResults.map(item =>
    scoreQuality(item?.normalizedResult?.image_quality_grade)
  )
  const analyzabilityScores = successfulResults.map(item =>
    scoreAnalyzability(item?.normalizedResult?.analyzability)
  )
  const aggregateQualityGrade = successfulResults.length
    ? scoreToQuality(
        qualityScores.reduce((sum, value) => sum + value, 0) / Math.max(qualityScores.length, 1)
      )
    : 'poor'
  const aggregateAnalyzability = successfulResults.length
    ? scoreToAnalyzability(
        analyzabilityScores.reduce((sum, value) => sum + value, 0) /
          Math.max(analyzabilityScores.length, 1)
      )
    : 'low'
  const aggregatedSymptomCandidates = buildAggregatedSymptomCandidates(successfulResults)
  const duplicateViewGroups = buildDuplicateViewGroups(aggregatedSymptomCandidates)
  const outOfPoolSymptomHints = await buildOutOfPoolSymptomHints(successfulResults)
  const suggestedFollowupCapture = normalizeStringList(
    successfulResults.flatMap(item => item?.normalizedResult?.suggested_followup_capture || [])
  )
  const organCoverageSummary = {
    covered_organs: normalizeStringList(
      successfulResults.map(item => item?.normalizedResult?.normalized_organ || 'unknown')
    ).filter(item => item !== 'unknown'),
    requested_image_count: Array.isArray(imageInputs) ? imageInputs.length : 0,
    effective_image_count: successfulResults.length
  }
  const organSupportSummary = aggregatedSymptomCandidates.map(item => ({
    symptom_key: item.symptom_key,
    support_organs: item.support_organs || [],
    support_count: Number(item.support_count || 0),
    independent_support_count: Number(item.support_count || 0),
    raw_image_count: Array.isArray(item.support_image_ids) ? item.support_image_ids.length : 0
  }))
  const admissionRecords = buildAdmissionRecords({
    sessionId,
    visualCallBatchId,
    aggregateAnalyzability,
    aggregatedCandidates: aggregatedSymptomCandidates
  })
  const observedSymptoms = buildObservedSymptomsFromAdmissions(admissionRecords)
  const aggregateRouteHints = buildAggregateRouteHints({
    successfulResults,
    aggregateAnalyzability,
    observedSymptoms,
    suggestedFollowupCapture
  })
  const shadowCompareSummary = buildShadowCompareSummary(successfulResults)
  const visualBatchTrace = buildVisualBatchTrace({
    visualCallBatchId,
    originVisualCallBatchId,
    supersedeSource
  })

  return {
    visual_call_aggregate_result_id: buildRuntimeId('visagg'),
    visual_call_batch_id: visualCallBatchId,
    visual_batch_trace: visualBatchTrace,
    organ_coverage_summary: organCoverageSummary,
    effective_image_count: successfulResults.length,
    duplicate_view_groups: duplicateViewGroups,
    aggregated_symptom_candidates: aggregatedSymptomCandidates,
    organ_support_summary: organSupportSummary,
    out_of_pool_symptom_hints: outOfPoolSymptomHints,
    aggregate_quality_grade: aggregateQualityGrade,
    aggregate_analyzability: aggregateAnalyzability,
    suggested_followup_capture: suggestedFollowupCapture,
    admission_ready_flag:
      aggregatedSymptomCandidates.length > 0 && aggregateAnalyzability !== 'low',
    admission_records: admissionRecords,
    aggregate_route_hints: aggregateRouteHints,
    shadow_compare_summary: shadowCompareSummary,
    route_primary_action: resolveAggregateRoutePrimaryAction({
      aggregateAnalyzability,
      observedSymptomCount: observedSymptoms.length,
      suggestedFollowupCapture
    }),
    observed_symptoms: observedSymptoms
  }
}

function buildAggregateSummaryForStorage(aggregateResult = {}) {
  return {
    visual_batch_trace: aggregateResult.visual_batch_trace || null,
    organ_coverage_summary: aggregateResult.organ_coverage_summary,
    effective_image_count: aggregateResult.effective_image_count,
    duplicate_view_groups: aggregateResult.duplicate_view_groups,
    aggregated_symptom_candidates: aggregateResult.aggregated_symptom_candidates,
    organ_support_summary: aggregateResult.organ_support_summary,
    out_of_pool_symptom_hints: aggregateResult.out_of_pool_symptom_hints,
    aggregate_quality_grade: aggregateResult.aggregate_quality_grade,
    suggested_followup_capture: aggregateResult.suggested_followup_capture,
    admission_ready_flag: aggregateResult.admission_ready_flag,
    admission_records: (aggregateResult.admission_records || []).map(item => ({
      visual_admission_record_id: item.visual_admission_record_id,
      visual_normalized_image_result_id: item.visual_normalized_image_result_id,
      object_type: item.object_type,
      object_key: item.object_key,
      admission_result: item.admission_result,
      admission_reason: item.admission_reason,
      entered_runtime: item.entered_runtime,
      target_layer: item.target_layer
    })),
    aggregate_route_hints: aggregateResult.aggregate_route_hints,
    shadow_compare_summary: aggregateResult.shadow_compare_summary || null,
    route_primary_action: aggregateResult.route_primary_action,
    observed_symptoms: aggregateResult.observed_symptoms
  }
}

function buildVisualFailureSummary(settledResults = [], imageInputs = []) {
  return (Array.isArray(settledResults) ? settledResults : [])
    .map((item, index) => {
      const imageInput = Array.isArray(imageInputs) ? imageInputs[index] : null
      if (item?.status === 'fulfilled' && item?.value?.normalizedResult) {
        return null
      }

      if (item?.status === 'rejected') {
        return {
          orderIndex: Number.isFinite(Number(imageInput?.orderIndex))
            ? Number(imageInput.orderIndex)
            : index,
          inputSlotType: normalizeText(imageInput?.inputSlotType || '', 'unknown'),
          reason: normalizeText(item?.reason?.message || item?.reason || '', 'unknown_error'),
          stage: 'adapter_call_failed'
        }
      }

      return {
        orderIndex: Number.isFinite(Number(imageInput?.orderIndex))
          ? Number(imageInput.orderIndex)
          : index,
        inputSlotType: normalizeText(imageInput?.inputSlotType || '', 'unknown'),
        reason: 'empty_normalized_result',
        stage: 'normalize_result_failed'
      }
    })
    .filter(Boolean)
}

function buildVisualModelUnavailableError({
  visualCallBatchId = '',
  visualBatchTrace = null,
  failureSummary = []
} = {}) {
  const error = new Error('视觉模型调用失败，请重试')
  error.code = 'visual_model_unavailable'
  error.statusCode = 502
  error.visualCallBatchId = normalizeText(visualCallBatchId, '')
  error.visualBatchTrace = visualBatchTrace || null
  error.failureSummary = Array.isArray(failureSummary) ? failureSummary : []
  return error
}

async function persistVisualBatchArtifacts({
  sessionId,
  openid,
  visualCallBatchId,
  imageInputs = [],
  settledResults = [],
  aggregateResult = null
} = {}) {
  const batchStatus =
    aggregateResult?.route_primary_action === 'standard_flow' ? 'completed' : 'needs_followup'

  await models.$runSQL(
    `
      INSERT INTO visual_call_batches (
        visual_call_batch_id, _openid, session_id, trigger_source, round_id, batch_status,
        image_count, created_at, updated_at
      ) VALUES (
        {{visualCallBatchId}}, {{openid}}, {{sessionId}}, {{triggerSource}}, {{roundId}}, {{batchStatus}},
        {{imageCount}}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    {
      visualCallBatchId,
      openid: String(openid || ''),
      sessionId,
      triggerSource: 'diagnose_http',
      roundId: 'round_1',
      batchStatus,
      imageCount: Array.isArray(imageInputs) ? imageInputs.length : 0
    }
  )

  for (const settled of settledResults) {
    const input = settled?.imageRuntimeInput || null
    if (!input) {continue}

    const success = settled?.status === 'fulfilled'
    const result = success ? settled.value : null
    const error = success ? null : settled.reason
    const adapterMeta = success
      ? result?.adapterMeta || primaryVisualAdapter.getAdapterMeta(primaryAdapterMetaOverride)
      : primaryVisualAdapter.getAdapterMeta(primaryAdapterMetaOverride)
    const parsedStructuredOutput = success
      ? result?.rawStructuredOutput
      : { error: normalizeText(error?.message || error || 'visual_adapter_failed') }
    const shadowCompare = success ? result?.shadowCompare || null : null
    const outOfPoolCandidates = extractOutOfPoolSymptomCandidates(parsedStructuredOutput)
    const outOfPoolAuditImageRef = await resolveOutOfPoolAuditImageRef(
      input.imageRef,
      outOfPoolCandidates
    )
    const rawStructuredOutput = {
      source_model_provider: adapterMeta.source_model_provider || '',
      source_model_name: adapterMeta.source_model_name || '',
      adapter_name: adapterMeta.adapter_name || '',
      input_slot_type: input.inputSlotType || 'unknown',
      input_slot_order: Number.isFinite(Number(input.inputSlotOrder ?? input.orderIndex ?? 0))
        ? Number(input.inputSlotOrder ?? input.orderIndex ?? 0)
        : 0,
      input_slot_label: input.inputSlotLabel || '',
      user_declared_organ_type: input.userDeclaredOrganType || 'unknown',
      user_declared_organ_confidence: input.userDeclaredOrganConfidence,
      out_of_pool_candidate_count: outOfPoolCandidates.length,
      out_of_pool_replay_image_available: Number(Boolean(outOfPoolAuditImageRef)),
      out_of_pool_replay_image_ref: outOfPoolAuditImageRef || null,
      upload_compression: input.uploadCompression || null,
      shadow_compare: shadowCompare,
      llm_timing: result?.llmTiming || null,
      adapter_timing: result?.adapterTiming || null,
      visual_adapter_timing: result?.visualAdapterTiming || null,
      llm_prompt: result?.llmPromptAudit || null,
      llm_usage: result?.llmUsage || null,
      parsed_result: parsedStructuredOutput
    }

    await models.$runSQL(
      `
        INSERT INTO visual_raw_image_records (
          visual_raw_image_record_id, _openid, session_id, visual_call_batch_id, image_ref,
          input_slot_type, input_slot_order, input_slot_label, user_declared_organ_type,
          user_declared_organ_confidence, source_model_provider, source_model_name, model_name,
          model_version, prompt_version, raw_text_output, raw_structured_output, call_status,
          latency_ms, error_code, created_at
        ) VALUES (
          {{visualRawImageRecordId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}}, {{imageRef}},
          {{inputSlotType}}, {{inputSlotOrder}}, {{inputSlotLabel}}, {{userDeclaredOrganType}},
          CASE
            WHEN {{userDeclaredOrganConfidenceHasValue}} = 1 THEN {{userDeclaredOrganConfidenceValue}}
            ELSE NULL
          END, {{sourceModelProvider}}, {{sourceModelName}},
          {{modelName}}, {{modelVersion}}, {{promptVersion}}, {{rawTextOutput}},
          {{rawStructuredOutput}}, {{callStatus}}, {{latencyMs}}, {{errorCode}}, CURRENT_TIMESTAMP
        )
      `,
      (() => {
        const userDeclaredOrganConfidenceBinding = buildNullableSqlNumberBinding(
          input.userDeclaredOrganConfidence
        )
        return {
        visualRawImageRecordId: input.visualRawImageRecordId,
        openid: String(openid || ''),
        sessionId,
        visualCallBatchId,
        imageRef: normalizePersistedImageRef(input.imageRef),
        inputSlotType: input.inputSlotType,
        inputSlotOrder: Number.isFinite(Number(input.inputSlotOrder ?? input.orderIndex ?? 0))
          ? Number(input.inputSlotOrder ?? input.orderIndex ?? 0)
          : 0,
        inputSlotLabel: input.inputSlotLabel || '',
        userDeclaredOrganType: input.userDeclaredOrganType || '',
        userDeclaredOrganConfidenceValue: userDeclaredOrganConfidenceBinding.value,
        userDeclaredOrganConfidenceHasValue: userDeclaredOrganConfidenceBinding.hasValue,
        sourceModelProvider: adapterMeta.source_model_provider || '',
        sourceModelName: adapterMeta.source_model_name || '',
        modelName: adapterMeta.source_model_name || '',
        modelVersion: adapterMeta.model_version || '',
        promptVersion: adapterMeta.prompt_version || '',
        rawTextOutput: success ? result?.rawTextOutput || '' : '',
        rawStructuredOutput: stringifyJson(rawStructuredOutput),
        callStatus: success ? 'succeeded' : 'failed',
        latencyMs: Number(
          result?.visualAdapterTiming?.primaryMs ||
            result?.adapterTiming?.llmMs ||
            result?.llmTiming?.totalMs ||
            0
        ),
        errorCode: success ? '' : 'visual_adapter_failed'
        }
      })()
    )

    if (!success || !result?.normalizedResult) {
      continue
    }

    const normalizedResult = result.normalizedResult
    const candidateScores = (normalizedResult.symptom_candidates || [])
      .map(item => confidenceBandToScore(item?.confidence_band))
      .sort((a, b) => b - a)
    const patternCandidatesJson = {
      source_model_provider:
        normalizedResult.source_model_provider || adapterMeta.source_model_provider || '',
      source_model_name: normalizedResult.source_model_name || adapterMeta.source_model_name || '',
      adapter_name: adapterMeta.adapter_name || '',
      input_organ_hint: normalizedResult.input_organ_hint || 'unknown',
      input_slot_order: Number.isFinite(
        Number(normalizedResult.input_slot_order ?? input.inputSlotOrder ?? 0)
      )
        ? Number(normalizedResult.input_slot_order ?? input.inputSlotOrder ?? 0)
        : 0,
      input_slot_label: normalizedResult.input_slot_label || input.inputSlotLabel || '',
      user_declared_organ_type:
        normalizedResult.user_declared_organ_type || input.userDeclaredOrganType || 'unknown',
      user_declared_organ_confidence:
        normalizedResult.user_declared_organ_confidence ?? input.userDeclaredOrganConfidence ?? null,
      model_detected_organ: normalizedResult.model_detected_organ || 'unknown',
      organ_source:
        normalizedResult.organ_source ||
        resolveOrganSource(input.inputSlotType, normalizedResult.normalized_organ),
      multi_organ_detected: Number(normalizedResult.multi_organ_detected || 0),
      organ_conflict_flag: Number(normalizedResult.organ_conflict_flag || 0),
      organ_resolution_reason: normalizedResult.organ_resolution_reason || '',
      shadow_compare_enabled: Number(shadowCompare?.enabled || 0),
      shadow_compare_status: shadowCompare?.compare_status || 'disabled',
      shadow_compare_provider: shadowCompare?.source_model_provider || '',
      shadow_compare_model_name: shadowCompare?.source_model_name || '',
      shadow_compare_adapter_name: shadowCompare?.adapter_name || '',
      out_of_pool_symptom_candidates: normalizedResult.out_of_pool_symptom_candidates || [],
      suggested_followup_capture: normalizedResult.suggested_followup_capture || [],
      normalization_notes: normalizedResult.normalization_notes || []
    }

    await models.$runSQL(
      `
        INSERT INTO visual_normalized_image_results (
          visual_normalized_image_result_id, _openid, session_id, visual_call_batch_id,
          visual_raw_image_record_id, source_model_provider, source_model_name,
          input_slot_order, input_slot_label, user_declared_organ_type,
          user_declared_organ_confidence, analyzability_level, clarity_level,
          subject_completeness_level, primary_organ_type, primary_organ_confidence, organ_source,
          multi_organ_detected, organ_conflict_flag, organ_resolution_reason,
          topk_symptoms_json, pattern_candidates_json, route_hints_json, route_primary_action,
          top1_stability_score, top3_stability_score, long_tail_noise_flag,
          pattern_derivation_status, created_at
        ) VALUES (
          {{visualNormalizedImageResultId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
          {{visualRawImageRecordId}}, {{sourceModelProvider}}, {{sourceModelName}},
          {{inputSlotOrder}}, {{inputSlotLabel}}, {{userDeclaredOrganType}},
          CASE
            WHEN {{userDeclaredOrganConfidenceHasValue}} = 1 THEN {{userDeclaredOrganConfidenceValue}}
            ELSE NULL
          END, {{analyzabilityLevel}}, {{clarityLevel}},
          {{subjectCompletenessLevel}}, {{primaryOrganType}}, CASE
            WHEN {{primaryOrganConfidenceHasValue}} = 1 THEN {{primaryOrganConfidenceValue}}
            ELSE NULL
          END,
          {{organSource}}, {{multiOrganDetected}}, {{organConflictFlag}},
          {{organResolutionReason}}, {{topkSymptomsJson}}, {{patternCandidatesJson}},
          {{routeHintsJson}}, {{routePrimaryAction}}, {{top1StabilityScore}},
          {{top3StabilityScore}}, {{longTailNoiseFlag}}, {{patternDerivationStatus}},
          CURRENT_TIMESTAMP
        )
      `,
      (() => {
        const userDeclaredOrganConfidenceBinding = buildNullableSqlNumberBinding(
          normalizedResult.user_declared_organ_confidence ??
            input.userDeclaredOrganConfidence ??
            null
        )
        const primaryOrganConfidenceBinding = buildNullableSqlNumberBinding(null)
        return {
        visualNormalizedImageResultId: input.visualNormalizedImageResultId,
        openid: String(openid || ''),
        sessionId,
        visualCallBatchId,
        visualRawImageRecordId: input.visualRawImageRecordId,
        sourceModelProvider:
          normalizedResult.source_model_provider || adapterMeta.source_model_provider || '',
        sourceModelName: normalizedResult.source_model_name || adapterMeta.source_model_name || '',
        inputSlotOrder: Number.isFinite(
          Number(normalizedResult.input_slot_order ?? input.inputSlotOrder ?? input.orderIndex ?? 0)
        )
          ? Number(normalizedResult.input_slot_order ?? input.inputSlotOrder ?? input.orderIndex ?? 0)
          : 0,
        inputSlotLabel: normalizedResult.input_slot_label || input.inputSlotLabel || '',
        userDeclaredOrganType: normalizedResult.user_declared_organ_type || input.userDeclaredOrganType || '',
        userDeclaredOrganConfidenceValue: userDeclaredOrganConfidenceBinding.value,
        userDeclaredOrganConfidenceHasValue: userDeclaredOrganConfidenceBinding.hasValue,
        analyzabilityLevel: normalizedResult.analyzability,
        clarityLevel: qualityGradeToClarityLevel(normalizedResult.image_quality_grade),
        subjectCompletenessLevel: resolveSubjectCompletenessLevel(
          input.inputSlotType,
          normalizedResult.analyzability
        ),
        primaryOrganType:
          normalizedResult.normalized_organ && normalizedResult.normalized_organ !== 'unknown'
            ? normalizedResult.normalized_organ
            : '',
        primaryOrganConfidenceValue: primaryOrganConfidenceBinding.value,
        primaryOrganConfidenceHasValue: primaryOrganConfidenceBinding.hasValue,
        organSource:
          normalizedResult.organ_source ||
          resolveOrganSource(input.inputSlotType, normalizedResult.normalized_organ),
        multiOrganDetected: Number(normalizedResult.multi_organ_detected || 0),
        organConflictFlag: Number(normalizedResult.organ_conflict_flag || 0),
        organResolutionReason: normalizedResult.organ_resolution_reason || '',
        topkSymptomsJson: stringifyJson(normalizedResult.symptom_candidates || []),
        patternCandidatesJson: stringifyJson(patternCandidatesJson),
        routeHintsJson: stringifyJson(normalizedResult.route_hints || []),
        routePrimaryAction: resolvePerImageRoutePrimaryAction({
          analyzability: normalizedResult.analyzability,
          symptomCandidates: normalizedResult.symptom_candidates,
          suggestedFollowupCapture: normalizedResult.suggested_followup_capture
        }),
        top1StabilityScore: Number.isFinite(candidateScores[0]) ? candidateScores[0] : 0,
        top3StabilityScore:
          candidateScores.length > 0
            ? candidateScores.slice(0, 3).reduce((sum, value) => sum + value, 0) /
              Math.min(candidateScores.length, 3)
            : 0,
        longTailNoiseFlag:
          normalizedResult.symptom_candidates.length <= 1 &&
          normalizedResult.symptom_candidates.some(
            item => normalizeConfidenceBand(item?.confidence_band, 'medium') === 'low'
          )
            ? 1
            : 0,
        patternDerivationStatus:
          Array.isArray(normalizedResult.out_of_pool_symptom_candidates) &&
          normalizedResult.out_of_pool_symptom_candidates.length > 0
            ? 'symptom_candidates_with_out_of_pool_audit'
            : 'symptom_candidates_only'
        }
      })()
    )
  }

  if (aggregateResult?.visual_call_aggregate_result_id) {
    await models.$runSQL(
      `
        INSERT INTO visual_call_aggregate_results (
          visual_call_aggregate_result_id, _openid, session_id, visual_call_batch_id,
          aggregate_analyzability_level, aggregate_summary_json, created_at
        ) VALUES (
          {{visualCallAggregateResultId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
          {{aggregateAnalyzabilityLevel}}, {{aggregateSummaryJson}}, CURRENT_TIMESTAMP
        )
      `,
      {
        visualCallAggregateResultId: aggregateResult.visual_call_aggregate_result_id,
        openid: String(openid || ''),
        sessionId,
        visualCallBatchId,
        aggregateAnalyzabilityLevel: normalizeText(aggregateResult.aggregate_analyzability),
        aggregateSummaryJson: stringifyJson(buildAggregateSummaryForStorage(aggregateResult))
      }
    )
  }

  for (const admissionRecord of aggregateResult?.admission_records || []) {
    await models.$runSQL(
      `
        INSERT INTO visual_admission_records (
          visual_admission_record_id, _openid, session_id, visual_call_batch_id,
          visual_normalized_image_result_id, object_type, object_key, admission_result,
          admission_reason, entered_runtime, target_layer, created_at
        ) VALUES (
          {{visualAdmissionRecordId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
          {{visualNormalizedImageResultId}}, {{objectType}}, {{objectKey}}, {{admissionResult}},
          {{admissionReason}}, {{enteredRuntime}}, {{targetLayer}}, CURRENT_TIMESTAMP
        )
      `,
      {
        visualAdmissionRecordId: admissionRecord.visual_admission_record_id,
        openid: String(openid || ''),
        sessionId,
        visualCallBatchId,
        visualNormalizedImageResultId: normalizeText(
          admissionRecord.visual_normalized_image_result_id
        ),
        objectType: admissionRecord.object_type,
        objectKey: normalizeText(admissionRecord.object_key),
        admissionResult: admissionRecord.admission_result,
        admissionReason: normalizeText(admissionRecord.admission_reason),
        enteredRuntime: admissionRecord.entered_runtime,
        targetLayer: normalizeText(admissionRecord.target_layer)
      }
    )
  }
}

async function analyzeAndPersistVisualBatch({
  sessionId,
  openid,
  imageInputs = [],
  originVisualCallBatchId = '',
  supersedeSource = 'diagnosis_start',
  onText,
  onVisualEvent,
  llmOptions = {}
} = {}) {
  const batchStartedAt = Date.now()
  const baseNormalizedInputs = (Array.isArray(imageInputs) ? imageInputs : [])
    .map(buildImageRuntimeInput)
    .filter(Boolean)
  const caseSlotSummary = buildCaseSlotSummary(baseNormalizedInputs)
  const normalizedInputs = baseNormalizedInputs.map(item => ({
    ...item,
    totalImageCount: baseNormalizedInputs.length,
    caseSlotSummary
  }))

  if (!normalizedInputs.length) {
    return {
      diagnosisText: '',
      observedSymptoms: [],
      visualCallBatchId: null,
      imageResults: [],
      aggregateResult: null
    }
  }
  const inputNormalizeMs = Math.max(0, Date.now() - batchStartedAt)

  const visualCallBatchId = buildRuntimeId('visbatch')
  emitVisualStreamEvent(onVisualEvent, 'visual_input_ready', {
    sessionId,
    visualCallBatchId,
    imageCount: normalizedInputs.length,
    caseSlotSummary
  })

  const modelFanoutStartedAt = Date.now()
  emitVisualStreamEvent(onVisualEvent, 'visual_model_started', {
    sessionId,
    visualCallBatchId,
    imageCount: normalizedInputs.length
  })
  const settledResults = await Promise.allSettled(
    normalizedInputs.map((imageRuntimeInput, index) =>
      analyzeSingleImage(imageRuntimeInput, {
        visualCallBatchId,
        onText:
          normalizedInputs.length === 1 && index === 0
            ? (chunk, fullText) => {
                if (typeof onText === 'function') {
                  onText(chunk, fullText)
                }
              }
            : undefined,
        llmOptions
      })
    )
  )
  const modelFanoutMs = Math.max(0, Date.now() - modelFanoutStartedAt)
  emitVisualStreamEvent(onVisualEvent, 'visual_model_complete', {
    sessionId,
    visualCallBatchId,
    imageCount: normalizedInputs.length,
    fulfilledCount: settledResults.filter(item => item.status === 'fulfilled').length,
    rejectedCount: settledResults.filter(item => item.status === 'rejected').length,
    elapsedMs: modelFanoutMs
  })

  const canonicalizeStartedAt = Date.now()
  const symptomDisplayNameMap = await loadSymptomDisplayNameMap()
  const canonicalizedSettledResults = settledResults.map(item => {
    if (item?.status !== 'fulfilled' || !item?.value) {
      return item
    }
    return {
      ...item,
      value: canonicalizeVisualResult(item.value, symptomDisplayNameMap)
    }
  })
  const canonicalizeMs = Math.max(0, Date.now() - canonicalizeStartedAt)

  const successfulResults = canonicalizedSettledResults
    .filter(item => item.status === 'fulfilled' && item?.value?.normalizedResult)
    .map(item => item.value)
  const visualFailureSummary = buildVisualFailureSummary(canonicalizedSettledResults, normalizedInputs)

  const aggregateStartedAt = Date.now()
  const aggregateResult = await buildAggregateResult({
    sessionId,
    visualCallBatchId,
    originVisualCallBatchId,
    supersedeSource,
    imageInputs: normalizedInputs,
    successfulResults
  })
  const aggregateMs = Math.max(0, Date.now() - aggregateStartedAt)
  emitVisualStreamEvent(onVisualEvent, 'visual_decision_ready', {
    sessionId,
    visualCallBatchId,
    imageCount: normalizedInputs.length,
    successCount: successfulResults.length,
    failedCount: Math.max(0, canonicalizedSettledResults.length - successfulResults.length),
    elapsedMs: aggregateMs,
    decision: buildVisualDecisionStreamSummary(aggregateResult)
  })

  let persistedVisualCallBatchId = null
  let persistMs = 0
  let persistStatus = 'skipped'
  try {
    const persistStartedAt = Date.now()
    await persistVisualBatchArtifacts({
      sessionId,
      openid,
      visualCallBatchId,
      imageInputs: normalizedInputs,
      settledResults: canonicalizedSettledResults.map((item, index) => ({
        ...item,
        imageRuntimeInput: normalizedInputs[index]
      })),
      aggregateResult
    })
    persistMs = Math.max(0, Date.now() - persistStartedAt)
    persistStatus = 'succeeded'
    persistedVisualCallBatchId = visualCallBatchId
  } catch (error) {
    persistMs = Math.max(0, Date.now() - (batchStartedAt + inputNormalizeMs + modelFanoutMs + canonicalizeMs + aggregateMs))
    persistStatus = 'degraded'
    console.warn('diagnose-http visual batch persistence degraded:', error?.message || error)
  }
  emitVisualStreamEvent(onVisualEvent, 'visual_persisted', {
    sessionId,
    visualCallBatchId: persistedVisualCallBatchId || visualCallBatchId,
    persistStatus,
    elapsedMs: persistMs
  })
  console.log('diagnose-http visual batch timing:', {
    sessionId,
    visualCallBatchId,
    imageCount: normalizedInputs.length,
    successCount: successfulResults.length,
    failedCount: Math.max(0, canonicalizedSettledResults.length - successfulResults.length),
    inputNormalizeMs,
    modelFanoutMs,
    canonicalizeMs,
    aggregateMs,
    persistMs,
    persistStatus,
    totalMs: Math.max(0, Date.now() - batchStartedAt)
  })

  if (!successfulResults.length) {
    console.error('diagnose-http visual batch final failure:', {
      visualCallBatchId,
      failureSummary: visualFailureSummary
    })

    throw buildVisualModelUnavailableError({
      visualCallBatchId: persistedVisualCallBatchId || visualCallBatchId,
      visualBatchTrace: aggregateResult.visual_batch_trace || null,
      failureSummary: visualFailureSummary
    })
  }

  return {
    diagnosisText: aggregateResult.observed_symptoms.map(item => item.symptomKey).join('、'),
    observedSymptoms: aggregateResult.observed_symptoms,
    visualCallBatchId: persistedVisualCallBatchId || visualCallBatchId,
    draftVisualCallBatchId: visualCallBatchId,
    visualBatchTrace: aggregateResult.visual_batch_trace || null,
    imageResults: successfulResults,
    aggregateResult
  }
}

module.exports = {
  analyzeAndPersistVisualBatch
}
