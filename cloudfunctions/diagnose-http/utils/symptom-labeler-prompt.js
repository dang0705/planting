'use strict'

const crypto = require('crypto')

const { getPromptSymptomDictionary } = require('../repositories/symptom-repository')
const { filterPromptSymptomsByLocation } = require('./prompt-symptom-pool')
const { getLlmImagePromptContext, normalizeLlmImageTaskContext } = require('./llm-image-context')
const { buildCacheFirstVisualPrompt } = require('./visual-prompt-cache-contract')
const { VISUAL_OUTPUT_SCHEMA_TEXT } = require('./visual-contract')
const { normalizeCaptureRegion } = require('./capture-region-normalizer')
const {
  FORMAL_PEST_VISUAL_EVIDENCE_KEYS,
  GENERAL_VISUAL_RULES,
  PEST_MODE_KEYS,
  PEST_VISUAL_RULES
} = require('../domain/diagnosis-mode-registry')

const {
  FULL_CASE_LOCATION_KEYS,
  LOCATION_LABEL_MAP,
  PROMPT_SYMPTOM_HINTS,
  compileGeneralVisibleAnomalyDescriptions,
  compileGeneralVisualMapping,
  compilePestVisibleAnomalyDescriptions,
  compilePestVisualMapping,
  STATIC_ROUTE_CATALOG_TEXT,
  STATIC_VISUAL_WORKFLOW_RULES,
  localizeStaticPromptSections
} = require('./visual-prompt-static-rules')

const ORGAN_TO_LOCATION_KEYS = {
  leaf: ['leaf'],
  stem: ['stem'],
  flower: ['flower'],
  root: ['root', 'soil'],
  root_crown: ['root', 'stem', 'soil'],
  whole_plant: FULL_CASE_LOCATION_KEYS,
  fruit: [],
  other: FULL_CASE_LOCATION_KEYS,
  unknown: []
}

function normalizeText(value = '', conservative = '') {
  return String(value || '').trim() || conservative
}

function normalizeOrgan(value = '', conservative = 'unknown') {
  return normalizeText(value, conservative).toLowerCase() || conservative
}

function normalizeLocationKey(value = '', conservative = '') {
  return normalizeText(value, conservative).toLowerCase()
}

function buildLocationCounts(symptomRows = []) {
  return (Array.isArray(symptomRows) ? symptomRows : []).reduce((acc, symptom) => {
    const locationKey = normalizeLocationKey(symptom?.locationKey, 'unknown') || 'unknown'
    acc[locationKey] = Number(acc[locationKey] || 0) + 1
    return acc
  }, {})
}

function resolvePromptLocationKeys(imageContext = {}) {
  const inputOrganHint = normalizeOrgan(
    imageContext?.inputSlotType || imageContext?.userDeclaredOrganType || 'unknown'
  )
  return ORGAN_TO_LOCATION_KEYS[inputOrganHint] || []
}

function resolvePromptSymptomKeys({ imageContext = {}, locationKeys = [], symptoms = [] } = {}) {
  const diagnosisProfile = normalizeText(
    imageContext?.diagnosisProfile || getLlmImagePromptContext()?.diagnosisProfile,
    'full'
  ).toLowerCase()
  const normalizedLocationKeys = Array.from(
    new Set(
      (Array.isArray(locationKeys) ? locationKeys : []).map(normalizeLocationKey).filter(Boolean)
    )
  )

  if (diagnosisProfile !== 'pest') {
    const symptomKeys = (Array.isArray(symptoms) ? symptoms : [])
      .map(item => normalizeText(item?.symptomKey, ''))
      .filter(Boolean)
    // full profile 下合并当前器官相关的通用视觉证据键（leaf_yellowing、yellowing_patchy、
    // powder_white 等），确保非虫害模式的证据键可用于 symptom_candidates 和 mode 路由。
    // 这些键可能未在 symptoms 表中设置 ai_visual_pool='yes'，需要在此补充。
    const generalKeys = (Array.isArray(GENERAL_VISUAL_RULES) ? GENERAL_VISUAL_RULES : [])
      .filter(rule =>
        normalizedLocationKeys.length
          ? rule.organKeys.some(organKey => normalizedLocationKeys.includes(organKey))
          : true
      )
      .flatMap(rule => rule.evidence.map(item => item.evidenceKey))
      .filter(key => !symptomKeys.includes(key))
    return [...symptomKeys, ...generalKeys]
  }

  if (!normalizedLocationKeys.length) {
    return [...FORMAL_PEST_VISUAL_EVIDENCE_KEYS]
  }

  const keys = new Set(
    PEST_VISUAL_RULES.flatMap(rule =>
      rule.organKeys.some(organKey => normalizedLocationKeys.includes(organKey))
        ? rule.evidence.map(item => item.evidenceKey)
        : []
    )
  )
  return FORMAL_PEST_VISUAL_EVIDENCE_KEYS.filter(key => keys.has(key))
}

function assertPromptPoolMatchesLocation(symptomRows = [], locationKeys = []) {
  const normalizedLocationKeys = Array.from(
    new Set(
      (Array.isArray(locationKeys) ? locationKeys : [])
        .map(item => normalizeLocationKey(item))
        .filter(Boolean)
    )
  )

  if (!normalizedLocationKeys.length) {
    return
  }

  const mismatchedKeys = Array.from(
    new Set(
      (Array.isArray(symptomRows) ? symptomRows : [])
        .map(item => normalizeLocationKey(item?.locationKey, 'unknown'))
        .filter(item => item && !normalizedLocationKeys.includes(item))
    )
  )

  if (mismatchedKeys.length) {
    throw new Error(`prompt symptom pool location mismatch: ${mismatchedKeys.join(',')}`)
  }
}

function buildCaseSlotSummaryText(imageContext = {}) {
  const slotSummary = Array.isArray(imageContext?.caseSlotSummary)
    ? imageContext.caseSlotSummary
    : []
  if (!slotSummary.length) {
    return ''
  }

  const lines = slotSummary.map(item => {
    const slotOrder = Number.isFinite(Number(item?.inputSlotOrder))
      ? Number(item.inputSlotOrder) + 1
      : '?'
    const slotLabel =
      normalizeText(item?.inputSlotLabel || '', '') ||
      LOCATION_LABEL_MAP[normalizeLocationKey(item?.inputSlotType || '', '')] ||
      normalizeText(item?.inputSlotType || '', '未指定')
    return `图${slotOrder}:${slotLabel}`
  })

  return lines.join('；')
}

function buildImageContextText(
  imageContext = {},
  locationKeys = [],
  narrowedSymptoms = [],
  allowedSymptomKeys = []
) {
  const totalImageCount = Number.isFinite(Number(imageContext?.totalImageCount))
    ? Number(imageContext.totalImageCount)
    : 1
  const slotOrder = Number.isFinite(Number(imageContext?.inputSlotOrder))
    ? Number(imageContext.inputSlotOrder) + 1
    : 1
  const slotType = normalizeOrgan(imageContext?.inputSlotType, 'unknown')
  const slotLabel =
    normalizeText(imageContext?.inputSlotLabel || '', '') ||
    LOCATION_LABEL_MAP[slotType] ||
    '未指定槽位'
  const declaredOrganType = normalizeOrgan(imageContext?.userDeclaredOrganType, 'unknown')
  const caseSlotSummaryText = buildCaseSlotSummaryText(imageContext)
  const normalizedLocationKeys = Array.from(
    new Set(
      (Array.isArray(locationKeys) ? locationKeys : [])
        .map(item => normalizeLocationKey(item))
        .filter(Boolean)
    )
  )
  const narrowedSymptomKeyList = Array.from(
    new Set(
      (Array.isArray(allowedSymptomKeys) && allowedSymptomKeys.length
        ? allowedSymptomKeys
        : narrowedSymptoms
      )
        .map(item => normalizeText(item?.symptomKey || item, ''))
        .filter(Boolean)
    )
  )
  const promptContext = normalizeLlmImageTaskContext(imageContext, getLlmImagePromptContext())
  const currentImageContext = {
    slot_order: slotOrder,
    total_image_count: Math.max(1, totalImageCount),
    slot_label: slotLabel,
    slot_type: slotType,
    user_declared_organ: declaredOrganType,
    capture_region: normalizeCaptureRegion(imageContext?.captureRegion || '')
  }
  const taskContext = {
    diagnosis_profile: promptContext.diagnosisProfile,
    analysis_round: promptContext.analysisRound,
    entry_source: promptContext.entrySource,
    plant_context: promptContext.plantContext,
    current_image_context: currentImageContext,
    prior_admitted_evidence_digest: promptContext.priorAdmittedEvidenceDigest,
    unresolved_evidence_groups: promptContext.unresolvedEvidenceGroups,
    requested_capture_region: normalizeCaptureRegion(promptContext.requestedCaptureRegion || ''),
    origin_visual_call_batch_id: promptContext.originVisualCallBatchId
  }

  const lines = [`task_context=${JSON.stringify(taskContext)}。`]
  lines.push(
    '视觉识别顺序：先基于当前图片独立识别可见虫体、叶内潜道、霉层、粉层或异常变色下垂；识别明确后，若有可见虫体、霉层或粉层必须优先报告对应 mode_candidates 与正式 evidence key，不能只报同图异常而遗漏实体；只报告当前图明确可见的项，不因本条列举存在而强行报告；不得从 mode key、evidence key、器官名或文字反推画面。'
  )

  if (normalizedLocationKeys.length) {
    lines.push(`allowed_location_keys=${normalizedLocationKeys.join(',')}。`)
    lines.push(`allowed_symptom_keys=${narrowedSymptomKeyList.join(',') || 'none'}。`)
    lines.push('symptom_candidates 只能用上述键；跨器官写入 out_of_pool_symptom_candidates')
  } else {
    lines.push(
      'allowed_location_keys=none；allowed_symptom_keys=none；不要强行选择正式 symptom_candidates。'
    )
  }

  if (caseSlotSummaryText) {
    lines.push(`case_slot_summary=${caseSlotSummaryText}.`)
  }

  const pestVisualMapping = compilePestVisualMapping(normalizedLocationKeys)
  if (pestVisualMapping) {
    lines.push(pestVisualMapping)
  }

  const generalVisualMapping = compileGeneralVisualMapping(normalizedLocationKeys)
  if (generalVisualMapping) {
    lines.push(generalVisualMapping)
  }

  const pestVisibleAnomalyDescriptions =
    compilePestVisibleAnomalyDescriptions(normalizedLocationKeys)
  if (pestVisibleAnomalyDescriptions) {
    lines.push(pestVisibleAnomalyDescriptions)
  }

  const generalVisibleAnomalyDescriptions =
    compileGeneralVisibleAnomalyDescriptions(normalizedLocationKeys)
  if (generalVisibleAnomalyDescriptions) {
    lines.push(generalVisibleAnomalyDescriptions)
  }

  if (promptContext.diagnosisProfile === 'pest') {
    lines.push(
      `diagnosis_profile=pest 时，mode_candidates 只能使用这 8 个虫害机器键：${PEST_MODE_KEYS.join(', ')}。黄化或下垂只能作为伴随可见证据，不能输出 yellow_leaf 或 wilting_droop 作为 mode_candidates。`
    )
    lines.push(
      '识别明确后，虫害 mode_candidates[].mode 只能填模式键，正式 evidence key 只能填当前器官允许的键；不能把 evidence key 当作 mode。'
    )
  }

  return lines.join('\n')
}

function buildPromptDebugMeta({
  imageContext = null,
  locationKeys = [],
  filteredSymptoms = [],
  dynamicTaskText = ''
} = {}) {
  const safeImageContext = imageContext && typeof imageContext === 'object' ? imageContext : {}
  const candidatePairs = (Array.isArray(filteredSymptoms) ? filteredSymptoms : [])
    .map(item => ({
      symptomKey: normalizeText(item?.symptomKey, ''),
      displayText: normalizeText(
        PROMPT_SYMPTOM_HINTS[normalizeText(item?.symptomKey, '')] ||
          item?.displayTextCn ||
          item?.symptomCn ||
          item?.symptomKey ||
          '',
        ''
      )
    }))
    .filter(item => item.symptomKey)
  const candidateSymptomKeys = candidatePairs.map(item => item.symptomKey)
  const includeAllCandidateSymptomKeys = candidateSymptomKeys.length <= 80
  const candidateSymptomKeysChecksum = crypto
    .createHash('sha1')
    .update(candidateSymptomKeys.join('|'))
    .digest('hex')
    .slice(0, 16)
  const candidateDisplayFragments = candidatePairs
    .map(item => `${item.symptomKey}=${item.displayText}`)
    .filter(Boolean)
  const candidatePoolText = candidateSymptomKeys.join(',')
  const candidatePoolTextChecksum = crypto
    .createHash('sha1')
    .update(candidatePoolText)
    .digest('hex')
    .slice(0, 16)
  const taskText = normalizeText(dynamicTaskText, '')

  return {
    promptPoolSource: 'symptoms.ai_visual_pool=yes',
    tokenMeasureBasis: 'actual_full_promptLength_and_model_usage_promptTokens',
    promptLayout: 'static_rules_schema_directory_then_dynamic_task',
    candidatePoolTextLength: candidatePoolText.length,
    candidatePoolTextChecksum,
    staticCandidateCatalogLength: 0,
    staticCandidateCatalogChecksum: '',
    dynamicTaskLength: taskText.length,
    inputSlotType: normalizeOrgan(safeImageContext?.inputSlotType, 'unknown'),
    inputSlotLabel: normalizeText(safeImageContext?.inputSlotLabel || '', ''),
    userDeclaredOrganType: normalizeOrgan(safeImageContext?.userDeclaredOrganType, 'unknown'),
    inputSlotOrder: Number.isFinite(Number(safeImageContext?.inputSlotOrder))
      ? Number(safeImageContext.inputSlotOrder)
      : 0,
    totalImageCount: Number.isFinite(Number(safeImageContext?.totalImageCount))
      ? Number(safeImageContext.totalImageCount)
      : 1,
    caseSlotSummary: (Array.isArray(safeImageContext?.caseSlotSummary)
      ? safeImageContext.caseSlotSummary
      : []
    )
      .map(item => ({
        inputSlotOrder: Number.isFinite(Number(item?.inputSlotOrder))
          ? Number(item.inputSlotOrder)
          : 0,
        inputSlotType: normalizeOrgan(item?.inputSlotType, 'unknown'),
        inputSlotLabel: normalizeText(item?.inputSlotLabel || '', '')
      }))
      .slice(0, 6),
    locationKeys: Array.from(
      new Set(
        (Array.isArray(locationKeys) ? locationKeys : [])
          .map(item => normalizeLocationKey(item))
          .filter(Boolean)
      )
    ),
    locationLabels: Array.from(
      new Set(
        (Array.isArray(locationKeys) ? locationKeys : [])
          .map(item => LOCATION_LABEL_MAP[normalizeLocationKey(item)] || normalizeLocationKey(item))
          .filter(Boolean)
      )
    ),
    candidateCount: Array.isArray(filteredSymptoms) ? filteredSymptoms.length : 0,
    candidateLocationCounts: buildLocationCounts(filteredSymptoms),
    candidateSymptomKeysHead: candidateSymptomKeys.slice(0, 16),
    candidateSymptomKeysTail: candidateSymptomKeys.slice(-16),
    candidateSymptomKeysChecksum,
    candidateSymptomKeysAll: includeAllCandidateSymptomKeys ? candidateSymptomKeys : undefined,
    candidateKeyDisplayPairsHead: candidatePairs.slice(0, 16),
    candidateKeyDisplayPairsTail: candidatePairs.slice(-16),
    candidateKeyDisplayPairsAll: includeAllCandidateSymptomKeys ? candidatePairs : undefined,
    candidatePromptTextSample: candidateSymptomKeys.slice(0, 10),
    candidateDisplayTextSample: candidateDisplayFragments.slice(0, 10)
  }
}

async function buildSymptomLabelerPromptPayload({ imageContext = null } = {}) {
  const symptomDictionary = await getPromptSymptomDictionary()
  const visualSymptomDictionary = symptomDictionary.filter(
    item => normalizeText(item?.symptomKey, '').toLowerCase() !== 'sticky_honeydew'
  )
  const locationKeys = resolvePromptLocationKeys(imageContext)
  const filteredSymptoms = filterPromptSymptomsByLocation(visualSymptomDictionary, locationKeys)
  const allowedSymptomKeys = resolvePromptSymptomKeys({
    imageContext,
    locationKeys,
    symptoms: filteredSymptoms
  })
  assertPromptPoolMatchesLocation(filteredSymptoms, locationKeys)
  const imageContextText = buildImageContextText(
    imageContext,
    locationKeys,
    filteredSymptoms,
    allowedSymptomKeys
  )
  const dynamicTaskText = imageContextText.trim()
  const debugMeta = buildPromptDebugMeta({
    imageContext,
    locationKeys,
    filteredSymptoms,
    dynamicTaskText
  })
  const baseCachePrompt = buildCacheFirstVisualPrompt({
    taskLine: '【角色】你是植物图片的结构化可见证据标注助手。',
    schemaText: VISUAL_OUTPUT_SCHEMA_TEXT,
    ruleText: STATIC_VISUAL_WORKFLOW_RULES,
    evidenceDirectoryText: STATIC_ROUTE_CATALOG_TEXT,
    dynamicTaskText
  })
  const localizedCachePrompt = localizeStaticPromptSections(baseCachePrompt)
  const promptText = localizedCachePrompt.promptText
  debugMeta.staticPrefixLength =
    String(promptText || '')
      .split('[Dynamic Task]')[0]
      ?.trim().length || 0
  debugMeta.narrowedCandidatePoolTextLength = debugMeta.candidatePoolTextLength
  debugMeta.promptCacheStaticPrefixHash = localizedCachePrompt.staticPrefixHash
  debugMeta.promptCacheDynamicTailHash = localizedCachePrompt.dynamicTailHash

  return {
    promptText,
    debugMeta
  }
}

async function buildSymptomLabelerPrompt({ imageContext = null } = {}) {
  return (await buildSymptomLabelerPromptPayload({ imageContext })).promptText
}

module.exports = {
  buildSymptomLabelerPrompt,
  buildSymptomLabelerPromptPayload
}
