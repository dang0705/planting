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
  PEST_VISUAL_RULES
} = require('../domain/diagnosis-mode-registry')

const {
  FULL_CASE_LOCATION_KEYS,
  LOCATION_LABEL_MAP,
  PROMPT_SYMPTOM_HINTS,
  compileGeneralVisualMapping,
  compilePestVisualEvidenceHints,
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
  soil: ['soil'],
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

function resolveFormalPestEvidenceKeys(locationKeys = []) {
  const normalizedLocationKeys = new Set(
    (Array.isArray(locationKeys) ? locationKeys : []).map(normalizeLocationKey).filter(Boolean)
  )
  if (!normalizedLocationKeys.size) {
    return []
  }

  const applicableKeys = new Set(
    PEST_VISUAL_RULES.filter(rule =>
      rule.organKeys.some(organKey => normalizedLocationKeys.has(organKey))
    ).flatMap(rule => rule.evidence.map(item => item.evidenceKey))
  )
  return FORMAL_PEST_VISUAL_EVIDENCE_KEYS.filter(key => applicableKeys.has(key))
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
  const formalPestEvidenceKeys = resolveFormalPestEvidenceKeys(normalizedLocationKeys)

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
    // 正式虫害证据由模式注册表定义，不得因 symptoms 表漏迁移而从综合诊断白名单消失。
    // 否则会出现“映射要求输出蓟马证据、动态白名单却禁止输出该证据”的自相矛盾 prompt。
    return Array.from(new Set([...symptomKeys, ...generalKeys, ...formalPestEvidenceKeys]))
  }

  if (!normalizedLocationKeys.length) {
    return [...FORMAL_PEST_VISUAL_EVIDENCE_KEYS]
  }
  return formalPestEvidenceKeys
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

function hasSameSymptomKeySet(left = [], right = []) {
  const leftKeys = new Set(
    (Array.isArray(left) ? left : []).map(item => normalizeText(item, '')).filter(Boolean)
  )
  const rightKeys = new Set(
    (Array.isArray(right) ? right : []).map(item => normalizeText(item, '')).filter(Boolean)
  )
  return (
    leftKeys.size === rightKeys.size &&
    Boolean(leftKeys.size) &&
    Array.from(leftKeys).every(key => rightKeys.has(key))
  )
}

function buildAllowedSymptomKeysText({
  diagnosisProfile = '',
  symptomKeys = [],
  formalPestEvidenceKeys = []
} = {}) {
  const normalizedKeys = Array.from(
    new Set(
      (Array.isArray(symptomKeys) ? symptomKeys : [])
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
  // 仅当当前器官范围的白名单与静态词典中的虫害证据全集严格相等时，才引用静态全集。
  // 任一局部器官、增删键或集合不完整的情形都保留逐键列举，不能借压缩扩大允许范围。
  if (
    diagnosisProfile === 'pest' &&
    hasSameSymptomKeySet(normalizedKeys, FORMAL_PEST_VISUAL_EVIDENCE_KEYS)
  ) {
    return '静态全局词典中的全部虫害可见证据键'
  }
  const normalizedFormalPestKeys = new Set(
    (Array.isArray(formalPestEvidenceKeys) ? formalPestEvidenceKeys : [])
      .map(item => normalizeText(item, ''))
      .filter(Boolean)
  )
  if (diagnosisProfile === 'full' && normalizedFormalPestKeys.size) {
    const nonPestKeys = normalizedKeys.filter(key => !normalizedFormalPestKeys.has(key))
    // 正式虫害键已在同一动态区的映射与提示中逐一列出；这里用范围指代而非重复列键，
    // 既保持“动态区允许”的合同，也避免为完整虫害召回无谓增加输入 Token。
    return [nonPestKeys.join(','), '【虫害映射】中的当前器官正式虫害证据键']
      .filter(Boolean)
      .join('；')
  }
  return normalizedKeys.join(',') || 'none'
}

function buildImageContextText(
  imageContext = {},
  locationKeys = [],
  narrowedSymptoms = [],
  allowedSymptomKeys = []
) {
  const slotType = normalizeOrgan(imageContext?.inputSlotType, 'unknown')
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
  const declaredCaptureRegion = normalizeCaptureRegion(imageContext?.captureRegion || '')
  const taskContext = { profile: promptContext.diagnosisProfile }
  // 每张图由独立模型调用处理，排序/总数由服务端入库链路保存，并不参与当前图证据判断。
  // 仅在补拍时告知轮次；initial 和 unknown 都是默认值，重复发送只会增加动态输入 Token。
  if (promptContext.analysisRound !== 'initial') {
    taskContext.round = promptContext.analysisRound
  }
  taskContext.image = { slot: slotType }
  if (declaredCaptureRegion !== 'unknown') {
    taskContext.image.region = declaredCaptureRegion
  }
  const requestedCaptureRegion = normalizeCaptureRegion(promptContext.requestedCaptureRegion || '')
  if (requestedCaptureRegion !== 'unknown') {
    taskContext.requested_region = requestedCaptureRegion
  }
  if (promptContext.priorAdmittedEvidenceDigest) {
    taskContext.prior_evidence = promptContext.priorAdmittedEvidenceDigest
  }
  if (promptContext.unresolvedEvidenceGroups.length) {
    taskContext.unresolved = promptContext.unresolvedEvidenceGroups
  }

  const lines = [
    `task=${JSON.stringify(taskContext)}。`,
    '先查【虫害映射】再查黄化/下垂，可并存。满足虫害映射即填对应 pest mode_candidates+正式 evidence key；不得被 yellow_leaf/wilting_droop 替代或漏填。无清晰证据不猜。'
  ]

  if (normalizedLocationKeys.length) {
    lines.push(`allowed_location_keys=${normalizedLocationKeys.join(',')}。`)
    lines.push(
      `allowed_symptom_keys=${buildAllowedSymptomKeysText({
        diagnosisProfile: promptContext.diagnosisProfile,
        symptomKeys: narrowedSymptomKeyList,
        formalPestEvidenceKeys: resolveFormalPestEvidenceKeys(normalizedLocationKeys)
      })}。`
    )
    // 静态输出规则已锁定 symptom_candidates 只能使用动态区允许键；这里只保留
    // 不能删的跨器官落位语义，避免逐图重复消耗动态输入 Token。
    lines.push('跨器官仅写 out_of_pool_symptom_candidates。')
  } else {
    lines.push(
      'allowed_location_keys=none；allowed_symptom_keys=none；不要强行选择正式 symptom_candidates。'
    )
  }

  const pestVisualMapping = compilePestVisualMapping(normalizedLocationKeys)
  if (pestVisualMapping) {
    lines.push(pestVisualMapping)
  }
  const pestVisualEvidenceHints = compilePestVisualEvidenceHints(normalizedLocationKeys)
  if (pestVisualEvidenceHints) {
    lines.push(pestVisualEvidenceHints)
  }

  // 虫害路径的允许证据键不包含黄化/下垂通用模式；发送通用映射既无路由意义又会制造冲突。
  const generalVisualMapping =
    promptContext.diagnosisProfile === 'pest'
      ? ''
      : compileGeneralVisualMapping(normalizedLocationKeys)
  const hasYellowOrDroopRoute = GENERAL_VISUAL_RULES.some(
    rule =>
      ['yellow_leaf', 'wilting_droop'].includes(rule.modeKey) &&
      rule.organKeys.some(organKey => normalizedLocationKeys.includes(organKey))
  )
  if (generalVisualMapping) {
    lines.push(generalVisualMapping)
  }

  if (promptContext.diagnosisProfile === 'full' && hasYellowOrDroopRoute) {
    lines.push('full：黄化/下垂各填 symptom+mode；不代虫害')
  }

  if (normalizedLocationKeys.some(key => ['leaf', 'flower'].includes(key))) {
    lines.push('细长虫体须填 thrips+thrips_visible；黄化或黑点不可替代。')
  }

  if (promptContext.diagnosisProfile === 'pest') {
    lines.push(
      'pest：mode 只能使用静态词典的 pest 模式；黄化或下垂仅作为 symptom，evidence key 不可填入 mode。'
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
