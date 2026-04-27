'use strict'

const crypto = require('crypto')

const {
  getPromptSymptomDictionary
} = require('../repositories/symptom-repository')
const {
  filterPromptSymptomsByLocation
} = require('./prompt-symptom-pool')
const {
  prompts: { llm: promptTemplate }
} = require('../configs')

const FULL_CASE_LOCATION_KEYS = ['leaf', 'stem', 'flower', 'soil']

const ORGAN_TO_LOCATION_KEYS = {
  leaf: ['leaf'],
  stem: ['stem'],
  flower: ['flower'],
  root: ['soil'],
  root_crown: ['stem', 'soil'],
  whole_plant: FULL_CASE_LOCATION_KEYS,
  fruit: [],
  other: [],
  unknown: []
}

const LOCATION_LABEL_MAP = {
  leaf: '叶片',
  stem: '茎部',
  flower: '花部',
  soil: '盆土 / 根际'
}

const LEAF_STRUCTURAL_PRIORITY_KEYS = [
  'holes_in_leaf',
  'chewed_edges',
  'skeletonized_leaves',
  'tunnels_in_leaf'
]

const PROMPT_SYMPTOM_HINTS = {
  holes_in_leaf: '穿透洞/缺损',
  chewed_edges: '叶缘缺口',
  skeletonized_leaves: '只剩叶脉',
  tunnels_in_leaf: '蛇形潜道',
  black_spots_spreading: '完整组织黑斑',
  brown_spots_halo: '褐斑黄晕',
  irregular_blotches: '不规则暗斑'
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeOrgan(value = '', fallback = 'unknown') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return normalized || fallback
}

function normalizeLocationKey(value = '', fallback = '') {
  return normalizeText(value, fallback).toLowerCase()
}

function compactDisplayText(value = '') {
  return normalizeText(value, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[，,。；;：:].*$/g, '')
    .replace(/\s+/g, '')
    .slice(0, 8)
}

function buildSymptomOptionText(symptom, index) {
  const symptomKey = normalizeText(symptom?.symptomKey, '')
  const discriminatorHint = PROMPT_SYMPTOM_HINTS[normalizeText(symptom?.symptomKey, '')]
  if (!symptomKey) {
    return ''
  }

  return discriminatorHint
    ? `${symptomKey}=${discriminatorHint}`
    : `${symptomKey}=${compactDisplayText(symptom?.displayTextCn || symptom?.symptomCn || symptomKey) || symptomKey}`
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
    imageContext?.inputSlotType || imageContext?.userDeclaredOrganType || 'unknown',
    'unknown'
  )

  return ORGAN_TO_LOCATION_KEYS[inputOrganHint] || []
}

function assertPromptPoolMatchesLocation(symptomRows = [], locationKeys = []) {
  const normalizedLocationKeys = Array.from(
    new Set((Array.isArray(locationKeys) ? locationKeys : []).map(item => normalizeLocationKey(item)).filter(Boolean))
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
  if (!slotSummary.length) return ''

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

function buildImageContextText(imageContext = {}, locationKeys = []) {
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
  const locationLabels = locationKeys
    .map(item => LOCATION_LABEL_MAP[normalizeLocationKey(item)] || item)
    .filter(Boolean)

  const lines = ['这是多图病例中的单图视觉标准化，只分析当前图。']
  lines.push(`当前图：第${slotOrder}/${Math.max(1, totalImageCount)}张；槽位=${slotLabel}。`)
  lines.push(
    `器官提示=${slotType === 'unknown' ? '未指定' : slotType}；用户声明=${declaredOrganType === 'unknown' ? '未指定' : declaredOrganType}。`
  )

  if (locationLabels.length) {
    lines.push(`本图 symptom_candidates 只允许从这些 location_key 池中选择：${locationLabels.join('、')}。`)
  } else {
    lines.push('当前池没有器官级收窄，只按本图直接可见部位判断。')
  }

  if (caseSlotSummaryText) {
    lines.push(`病例槽位概览：${caseSlotSummaryText}。`)
  }

  lines.push('不要把其他图片可能出现的器官特征误投到当前图。')

  return lines.join('\n')
}

function buildGroupedSymptomOptionsText(symptomRows = []) {
  const locationOrder = ['leaf', 'stem', 'flower', 'soil']
  const groupedMap = new Map()

  for (const symptom of Array.isArray(symptomRows) ? symptomRows : []) {
    const locationKey = normalizeLocationKey(symptom?.locationKey, 'unknown')
    const list = groupedMap.get(locationKey) || []
    list.push(symptom)
    groupedMap.set(locationKey, list)
  }

  const orderedLocationKeys = [
    ...locationOrder.filter(item => groupedMap.has(item)),
    ...Array.from(groupedMap.keys()).filter(item => !locationOrder.includes(item))
  ]

  if (groupedMap.has('leaf')) {
    const leafRows = groupedMap.get('leaf') || []
    const prioritizedLeafRows = []
    const remainingLeafRows = []

    for (const symptom of leafRows) {
      if (LEAF_STRUCTURAL_PRIORITY_KEYS.includes(normalizeText(symptom?.symptomKey, ''))) {
        prioritizedLeafRows.push(symptom)
      } else {
        remainingLeafRows.push(symptom)
      }
    }

    groupedMap.set('leaf', [...prioritizedLeafRows, ...remainingLeafRows])
  }

  let globalIndex = 0
  if (orderedLocationKeys.length === 1) {
    const onlyKey = orderedLocationKeys[0]
    const onlyList = groupedMap.get(onlyKey) || []
    const title = LOCATION_LABEL_MAP[onlyKey] || onlyKey || '未分组'
    const leadHint =
      onlyKey === 'leaf'
        ? '先判结构损伤再看spots。'
        : ''
    return `【${title}】${leadHint}${onlyList.map(symptom => buildSymptomOptionText(symptom, globalIndex++)).join('、')}`
  }

  return orderedLocationKeys
    .map(locationKey => {
      const list = groupedMap.get(locationKey) || []
      if (!list.length) return ''

      const title = LOCATION_LABEL_MAP[locationKey] || locationKey || '未分组'
      const leadHint =
        locationKey === 'leaf'
          ? '先判结构损伤再看spots。'
          : ''
      const lines = list.map(symptom => {
        const line = buildSymptomOptionText(symptom, globalIndex)
        globalIndex += 1
        return line
      })

      return `【${title}】${leadHint}${lines.join('、')}`
    })
    .filter(Boolean)
    .join('\n')
}

function buildPromptSymptomOptionsText(symptomRows = []) {
  const groupedText = buildGroupedSymptomOptionsText(symptomRows)
  if (groupedText) {
    return groupedText
  }

  return '当前 location_key 对应的正式 symptom 候选为空。不要跨器官硬选；若看到明确异常，只允许写入 out_of_pool_symptom_candidates。'
}

function buildPromptDebugMeta({
  imageContext = null,
  locationKeys = [],
  filteredSymptoms = [],
  symptomOptionsText = ''
} = {}) {
  const safeImageContext = imageContext && typeof imageContext === 'object' ? imageContext : {}
  const candidatePairs = (Array.isArray(filteredSymptoms) ? filteredSymptoms : [])
    .map(item => ({
      symptomKey: normalizeText(item?.symptomKey, ''),
      displayText: normalizeText(item?.displayTextCn || item?.symptomCn || item?.symptomKey || '', '')
    }))
    .filter(item => item.symptomKey)
  const candidateSymptomKeys = candidatePairs.map(item => item.symptomKey)
  const includeAllCandidateSymptomKeys = candidateSymptomKeys.length <= 80
  const candidateSymptomKeysChecksum = crypto
    .createHash('sha1')
    .update(candidateSymptomKeys.join('|'))
    .digest('hex')
    .slice(0, 16)
  const candidatePromptFragments = (Array.isArray(filteredSymptoms) ? filteredSymptoms : [])
    .map((item, index) => buildSymptomOptionText(item, index))
    .filter(Boolean)
  const candidatePoolText = normalizeText(symptomOptionsText, '')
  const candidatePoolTextChecksum = crypto
    .createHash('sha1')
    .update(candidatePoolText)
    .digest('hex')
    .slice(0, 16)

  return {
    promptPoolSource: 'symptoms.ai_visual_pool=yes',
    tokenMeasureBasis: 'actual_full_promptLength_and_hunyuan_usage_promptTokens',
    candidatePoolTextLength: candidatePoolText.length,
    candidatePoolTextChecksum,
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
      new Set((Array.isArray(locationKeys) ? locationKeys : []).map(item => normalizeLocationKey(item)).filter(Boolean))
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
    candidatePromptTextSample: candidatePromptFragments.slice(0, 10),
    candidateDisplayTextSample: candidatePromptFragments.slice(0, 10)
  }
}

async function buildSymptomLabelerPromptPayload({ imageContext = null } = {}) {
  const symptomDictionary = await getPromptSymptomDictionary()
  const locationKeys = resolvePromptLocationKeys(imageContext)
  const filteredSymptoms = filterPromptSymptomsByLocation(symptomDictionary, locationKeys)
  assertPromptPoolMatchesLocation(filteredSymptoms, locationKeys)
  const symptomOptionsText = buildPromptSymptomOptionsText(filteredSymptoms)
  const imageContextText = buildImageContextText(imageContext, locationKeys)
  const debugMeta = buildPromptDebugMeta({
    imageContext,
    locationKeys,
    filteredSymptoms,
    symptomOptionsText
  })
  let promptText = ''

  if (typeof promptTemplate === 'function') {
    promptText = promptTemplate({
      symptomOptionsText,
      imageContextText
    })
  } else {
    const basePrompt = String(promptTemplate || '').replace(
      '[这里插入你筛选过的 symptom_key + 简短说明]',
      symptomOptionsText
    )

    promptText = `${imageContextText}\n\n${basePrompt}`.trim()
  }

  return {
    promptText,
    debugMeta
  }
}

async function buildSymptomLabelerPrompt({ imageContext = null } = {}) {
  const payload = await buildSymptomLabelerPromptPayload({ imageContext })
  return payload.promptText
}

module.exports = {
  buildSymptomLabelerPrompt,
  buildSymptomLabelerPromptPayload
}
