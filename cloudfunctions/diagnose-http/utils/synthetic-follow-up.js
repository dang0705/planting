'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  QUESTION_ROUTING_SCOPES,
  normalizeQuestionTargetDimension,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('./question-target-dimension')

const SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX = 'q_visual_candidate_confirm__'
const SYNTHETIC_VISUAL_CANDIDATE_GROUP_PREFIX = 'visual_candidate_confirm__'
const SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX = 'q_observed_probe__'
const SYNTHETIC_OBSERVED_PROBE_GROUP_PREFIX = 'observed_probe__'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildVisualCandidateQuestionGroupKey(symptomKey = '') {
  return `${SYNTHETIC_VISUAL_CANDIDATE_GROUP_PREFIX}${normalizeText(symptomKey)}`
}

function buildSyntheticVisualCandidateQuestionKey(symptomKey = '') {
  return `${SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX}${normalizeText(symptomKey)}`
}

function isSyntheticVisualCandidateQuestionKey(questionKey = '') {
  return normalizeText(questionKey).startsWith(SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX)
}

function buildObservedProbeQuestionGroupKey(symptomKey = '', targetDimension = '') {
  return `${SYNTHETIC_OBSERVED_PROBE_GROUP_PREFIX}${normalizeText(symptomKey)}__${normalizeText(targetDimension)}`
}

function buildSyntheticObservedProbeQuestionKey(symptomKey = '', targetDimension = '') {
  return `${SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX}${normalizeText(symptomKey)}__${normalizeText(targetDimension)}`
}

function isSyntheticObservedProbeQuestionKey(questionKey = '') {
  return normalizeText(questionKey).startsWith(SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX)
}

function parseSyntheticObservedProbeQuestionKey(questionKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (!isSyntheticObservedProbeQuestionKey(normalizedQuestionKey)) {
    return { symptomKey: '', targetDimension: '' }
  }

  const body = normalizedQuestionKey.slice(SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX.length)
  const [symptomKey, targetDimension] = body.split('__')

  return {
    symptomKey: normalizeText(symptomKey),
    targetDimension: normalizeText(targetDimension)
  }
}

function isStructuralChewingSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'].includes(symptomKey) ||
    ['chew', 'holes', 'skeletonization'].includes(patternKey)
  )
}

function isYellowingSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    [
      'leaf_yellowing',
      'uniform_yellowing',
      'yellow_lower_leaves',
      'yellow_new_leaves',
      'interveinal_chlorosis',
      'pale_new_leaves',
      'yellowing_patchy',
      'yellow_speckling'
    ].includes(symptomKey) ||
    ['yellowing', 'chlorosis'].includes(patternKey)
  )
}

function isPestTraceSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    [
      'yellow_speckling',
      'stippling',
      'silver_streaks',
      'fine_webbing',
      'sticky_honeydew',
      'leaf_curl',
      'leaf_twist'
    ].includes(symptomKey) ||
    ['speckling', 'webbing', 'streaks', 'curl', 'twist'].includes(patternKey)
  )
}

function isEdemaBumpSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    ['edema', 'blister_like_bumps'].includes(symptomKey) ||
    ['edema', 'blister', 'bumps'].includes(patternKey)
  )
}

const NEUTRAL_STRUCTURAL_SYMPTOM_LABELS = {
  chewed_edges: '叶片边缘缺口',
  holes_in_leaf: '叶片孔洞',
  skeletonized_leaves: '叶片网状缺损',
  tunnels_in_leaf: '叶片隧道状痕迹'
}

const NEUTRAL_STRUCTURAL_PATTERN_LABELS = {
  chew: '叶片边缘缺口',
  holes: '叶片孔洞',
  skeletonization: '叶片网状缺损',
  tunnels: '叶片隧道状痕迹'
}

function resolveNeutralSymptomLabel(item = {}, fallback = '该异常') {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)
  const neutralLabel =
    NEUTRAL_STRUCTURAL_SYMPTOM_LABELS[symptomKey] ||
    NEUTRAL_STRUCTURAL_PATTERN_LABELS[patternKey]
  if (neutralLabel) {return neutralLabel}

  return normalizeText(item?.symptomCn || item?.displayTextCn || symptomKey) || fallback
}

function normalizeNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeDayRange(value = null) {
  if (!Array.isArray(value) || value.length < 2) {
    return null
  }
  const min = Math.max(1, Math.round(Number(value[0] || 0)))
  const max = Math.max(min, Math.round(Number(value[1] || min)))
  return [min, max]
}

function resolveWateringBaseRange(plantContext = {}) {
  return normalizeDayRange(plantContext?.watering?.freq)
}

function resolveHumidityAdjustment({ plantContext = {}, weatherContext = null } = {}) {
  const humidity = normalizeNumber(weatherContext?.humidity)
  const humidityMin = normalizeNumber(plantContext?.humidityMin)
  const humidityMax = normalizeNumber(plantContext?.humidityMax)
  if (humidity === null || humidityMin === null || humidityMax === null) {
    return {
      level: 'unknown',
      humidity,
      humidityMin,
      humidityMax,
      text: ''
    }
  }
  if (humidity > humidityMax) {
    return {
      level: 'humid',
      humidity,
      humidityMin,
      humidityMax,
      text: `最近空气湿度约 ${humidity}%，比这类植物常见的 ${humidityMin}-${humidityMax}% 更高`
    }
  }
  if (humidity < humidityMin) {
    return {
      level: 'dry',
      humidity,
      humidityMin,
      humidityMax,
      text: `最近空气湿度约 ${humidity}%，比这类植物常见的 ${humidityMin}-${humidityMax}% 更低`
    }
  }
  return {
    level: 'normal',
    humidity,
    humidityMin,
    humidityMax,
    text: `最近空气湿度约 ${humidity}%，在这类植物常见的 ${humidityMin}-${humidityMax}% 范围内`
  }
}

function resolveAdjustedWateringRange({ plantContext = {}, weatherContext = null } = {}) {
  const baseRange = resolveWateringBaseRange(plantContext)
  if (!baseRange) {
    return null
  }

  const humidityAdjustment = resolveHumidityAdjustment({ plantContext, weatherContext })
  let [min, max] = baseRange
  if (humidityAdjustment.level === 'humid') {
    min += 1
    max += 2
  } else if (humidityAdjustment.level === 'dry') {
    min = Math.max(1, min - 2)
    max = Math.max(min, max - 1)
  }

  return {
    baseRange,
    adjustedRange: [min, max],
    humidityAdjustment,
    way: normalizeText(plantContext?.watering?.way),
    unit: normalizeText(plantContext?.watering?.unit) || '天'
  }
}

function formatDayRange(range = null) {
  const normalized = normalizeDayRange(range)
  if (!normalized) {return ''}
  const [min, max] = normalized
  return min === max ? `${min} 天` : `${min}-${max} 天`
}

function buildWateringRangeCopy({ plantContext = {}, weatherContext = null } = {}) {
  const resolved = resolveAdjustedWateringRange({ plantContext, weatherContext })
  if (!resolved) {
    return {
      referenceRangeText: '浇水：参考暂时不完整，先看最近两周是否明显比平时更勤或更少',
      tooOftenText: '偏勤：比平时更勤，或土还没明显变干就又浇',
      normalText: '接近平时：通常等土表变干后再浇',
      tooRareText: '偏少：比平时更少，或土已经干透很久才浇',
      helpText: '暂时缺少稳定浇水间隔，可先按最近实际浇水节奏和盆土干湿判断。'
    }
  }

  const [min, max] = resolved.adjustedRange
  const tooOftenMax = Math.max(1, min - 1)
  const tooRareMin = max + 1
  const baseRangeText = formatDayRange(resolved.baseRange)
  const adjustedRangeText = formatDayRange(resolved.adjustedRange)
  const baseText = `浇水：通常约 ${baseRangeText}一次`
  const adjustedText = baseRangeText === adjustedRangeText
    ? ''
    : `结合最近空气湿度，可按约 ${adjustedRangeText}一次做参考`
  const humidityText = resolved.humidityAdjustment.text
  const wayText = resolved.way ? `，一般${resolved.way}` : ''
  const referenceRangeText = [baseText + wayText, adjustedText].filter(Boolean).join('；')

  return {
    referenceRangeText,
    tooOftenText: `偏勤：约 ${tooOftenMax} 天内一次，或土还没明显变干就又浇`,
    normalText: `接近参考：约 ${adjustedRangeText}一次，通常等土表变干后再浇`,
    tooRareText: `偏少：${tooRareMin} 天以上一次，或土已经干透很久才浇`,
    helpText: [referenceRangeText, humidityText]
      .filter(Boolean)
      .join('；') + '。'
  }
}

function normalizeCareText(value = '') {
  if (!value || typeof value !== 'object') {
    return normalizeText(value)
  }
  return normalizeText(
    value.summary ||
    value.description ||
    value.desc ||
    value.text ||
    value.way ||
    value.level ||
    value.freqText ||
    ''
  )
}

function punctuateChineseSentence(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) {return ''}
  return /[。！？]$/.test(normalized) ? normalized : `${normalized}。`
}

function buildLightReferenceText(plantContext = {}) {
  const lightText = normalizeCareText(plantContext?.sunning || plantContext?.light)
  return lightText
    ? `光照：以${lightText}为主`
    : '光照：主要看最近直射太阳是否突然变多或变少'
}

function buildFertilizationReferenceText(plantContext = {}) {
  const fertilizerText = normalizeCareText(plantContext?.fertilization)
  const frequencyText = '近 2 个月 0 次偏少；近 1 个月约 1 次薄肥较接近日常；近 1 个月 2 次以上、重肥，或刚换盆换土，属于变化偏大'
  return fertilizerText
    ? `施肥和换盆：可先参考“${fertilizerText}”；再对照次数：${frequencyText}`
    : `施肥和换盆：${frequencyText}`
}

function buildHumidityReferenceText({ plantContext = {}, weatherContext = null } = {}) {
  const humidityAdjustment = resolveHumidityAdjustment({ plantContext, weatherContext })
  return humidityAdjustment.text
    ? `通风和空气湿度：${humidityAdjustment.text}`
    :
    '通风和空气湿度看最近是否明显更闷、更湿或更干'
}

function buildDescriptionList(lines = [], { intro = '', outro = '' } = {}) {
  const listItems = (Array.isArray(lines) ? lines : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
    .map(item => `- ${item}`)
  return [
    normalizeText(intro),
    ...listItems,
    normalizeText(outro)
  ]
    .filter(Boolean)
    .join('\n')
}

function buildCareGateOptionPayloads({ plantContext = {}, weatherContext = null } = {}) {
  const wateringCopy = buildWateringRangeCopy({ plantContext, weatherContext })
  const lightText = buildLightReferenceText(plantContext)
  const fertilizerText = buildFertilizationReferenceText(plantContext)
  const humidityText = buildHumidityReferenceText({ plantContext, weatherContext })

  return {
    watering_area: {
      text: '浇水偏多或偏少',
      description: buildDescriptionList([
        wateringCopy.referenceRangeText,
        '如果最近浇得更勤、更少，或土长期偏湿/偏干，先查浇水。'
      ])
    },
    light_area: {
      text: '光照突然变强或变弱',
      description: buildDescriptionList([
        punctuateChineseSentence(lightText),
        '如果最近直射太阳、遮阴程度或摆放位置变化明显，先查光照。'
      ])
    },
    fertilization_area: {
      text: '施肥或换盆变化',
      description: buildDescriptionList([
        punctuateChineseSentence(fertilizerText),
        '如果最近长期没补肥、补肥偏多，或刚换土换盆，先查营养和根区刺激。'
      ])
    },
    airflow_humidity_area: {
      text: '通风或空气湿度变化',
      description: buildDescriptionList([
        punctuateChineseSentence(humidityText),
        '如果最近环境明显更闷、更湿或更干，先查通风湿度。'
      ])
    },
    unknown: {
      text: '没有明显变化 / 不确定',
      description: buildDescriptionList([
        '如果看不出哪项最可疑，先选这个。',
        '系统会回到黄叶本身的新老叶和分布线索继续排查。'
      ])
    }
  }
}

function buildCareSummaryForPrimaryGate(context = {}) {
  return buildDescriptionList(
    [
      buildWateringRangeCopy(context).referenceRangeText,
      buildLightReferenceText(context?.plantContext),
      buildFertilizationReferenceText(context?.plantContext),
      buildHumidityReferenceText(context)
    ],
    {
      intro: '先快速对照这类植物的日常养护：',
      outro: '如果最近两周和其中任一项差得比较多，先选这个，下一题会继续细分是哪一项。'
    }
  )
}

function normalizeSyntheticOptionEntries(optionTexts = {}) {
  return Object.entries(optionTexts || {}).map(([optionKey, optionValue]) => {
    if (optionValue && typeof optionValue === 'object') {
      return {
        optionKey,
        text: normalizeText(optionValue.text || optionValue.title || optionValue.label || optionKey),
        description: normalizeText(optionValue.description || optionValue.desc || optionValue.helpText || '')
      }
    }
    return {
      optionKey,
      text: normalizeText(optionValue || optionKey),
      description: ''
    }
  })
}

function renderQuestionTemplate(template = '', variables = {}) {
  return normalizeText(template).replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const normalizedKey = normalizeText(key)
    const value = variables[normalizedKey]
    return value === undefined || value === null ? '' : normalizeText(value)
  }).replace(/\s+([。；，、！？])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

function buildTemplateVariables(item = {}, context = {}) {
  const symptomLabel = resolveNeutralSymptomLabel(item, '该异常')
  const wateringCopy = buildWateringRangeCopy(context)
  const lightReference = buildLightReferenceText(context?.plantContext)
  const fertilizationReference = buildFertilizationReferenceText(context?.plantContext)
  const humidityReference = buildHumidityReferenceText(context)

  return {
    symptom_label: symptomLabel,
    watering_reference: wateringCopy.referenceRangeText,
    watering_help: wateringCopy.helpText,
    watering_too_often: wateringCopy.tooOftenText,
    watering_normal: wateringCopy.normalText,
    watering_too_rare: wateringCopy.tooRareText,
    light_reference: lightReference,
    fertilization_reference: fertilizationReference,
    humidity_reference: humidityReference
  }
}

function buildTemplateMap(rows = []) {
  return new Map(
    (Array.isArray(rows) ? rows : [])
      .map(item => [normalizeText(item?.questionKey), item])
      .filter(([questionKey]) => Boolean(questionKey))
  )
}

function buildOptionTemplateMap(rows = []) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const questionKey = normalizeText(row?.questionKey)
    if (!questionKey) {continue}
    const list = map.get(questionKey) || []
    list.push(row)
    map.set(questionKey, list)
  }
  for (const [questionKey, list] of map.entries()) {
    map.set(questionKey, list.slice().sort((a, b) => {
      const orderA = Number(a?.displayOrder || 9999)
      const orderB = Number(b?.displayOrder || 9999)
      if (orderA !== orderB) {return orderA - orderB}
      return normalizeText(a?.optionKey).localeCompare(normalizeText(b?.optionKey))
    }))
  }
  return map
}

function renderDataLayerOptions(optionRows = [], variables = {}) {
  return (Array.isArray(optionRows) ? optionRows : [])
    .map(row => ({
      optionKey: normalizeText(row?.optionKey),
      text: renderQuestionTemplate(row?.optionTextUserCn || row?.optionTextCn || row?.optionKey, variables),
      description: renderQuestionTemplate(row?.optionDescriptionUserCn || '', variables),
      isDefault: Boolean(row?.isDefault)
    }))
    .filter(item => item.optionKey && item.text)
}

function resolveSyntheticDefaultOptionKey(targetDimension = '', optionEntries = []) {
  const keys = new Set(
    (Array.isArray(optionEntries) ? optionEntries : [])
      .map(item => normalizeText(item?.optionKey))
      .filter(Boolean)
  )
  const preferredByDimension = {
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE]: 'care_context',
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE]: 'watering_area'
  }
  const preferred = preferredByDimension[targetDimension]
  if (preferred && keys.has(preferred)) {return preferred}
  if (keys.has('unknown')) {return 'unknown'}
  return normalizeText(optionEntries?.[0]?.optionKey || '')
}

const ORTHOGONAL_DIMENSION_PRIORITY_BY_PATTERN = {
  spots: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  blotch: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  blotches: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  rings: [
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  yellowing: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
  ],
  chlorosis: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
  ],
  powder: [
    QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  mold: [
    QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  webbing: [
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  speckling: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  streaks: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  curl: [
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  twist: [
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  edema: [
    QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE,
    QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  blister: [
    QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE,
    QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  tunnels: [
    QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  chew: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  holes: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  skeletonization: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  burn: [
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  browning: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  necrosis: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  bleach: [
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  tear: [
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  soft: [
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  soaked: [
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ]
}

const ORTHOGONAL_DIMENSION_PRIORITY_BY_SYMPTOM = {
  leaf_yellowing: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
  ],
  uniform_yellowing: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT
  ],
  yellow_lower_leaves: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT
  ],
  yellow_new_leaves: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT
  ],
  interveinal_chlorosis: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT
  ],
  pale_new_leaves: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT
  ],
  yellowing_patchy: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT
  ],
  yellow_speckling: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  stippling: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  silver_streaks: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  fine_webbing: [
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  sticky_honeydew: [
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  leaf_curl: [
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  leaf_twist: [
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  leaf_margin_necrosis: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  leaf_margin_burn: [
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  uniform_browning: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  patchy_browning: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  leaf_bleaching: [
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  sunburn_patch: [
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  edema: [
    QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE,
    QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  blister_like_bumps: [
    QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE,
    QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  chewed_edges: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  holes_in_leaf: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  skeletonized_leaves: [
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  tunnels_in_leaf: [
    QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  sooty_mold: [
    QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  black_mold_growth: [
    QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
    QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ],
  powder_white: [
    QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  black_spots_spreading: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  brown_spots_halo: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  irregular_blotches: [
    QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
    QUESTION_TARGET_DIMENSIONS.LESION_HALO,
    QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ]
}

const SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM = {
  leaf_yellowing: {
    [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
      yes: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.34 },
        { problemKey: 'low_light', scoreDelta: 0.14 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.12 }
      ],
      no: [
        { problemKey: 'iron_deficiency', scoreDelta: 0.24 },
        { problemKey: 'root_stress', scoreDelta: 0.14 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.1 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'root_stress', scoreDelta: 0.14 },
        { problemKey: 'temperature_stress', scoreDelta: 0.1 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.08 }
      ],
      no: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.2 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.16 },
        { problemKey: 'low_light', scoreDelta: 0.14 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
        { problemKey: 'root_rot', scoreDelta: -0.1 },
        { problemKey: 'overwatering', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'spider_mites', scoreDelta: 0.12 },
        { problemKey: 'thrips', scoreDelta: 0.12 },
        { problemKey: 'aphids', scoreDelta: 0.1 },
        { problemKey: 'sunburn', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'chlorosis', scoreDelta: 0.14 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.18 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.16 },
        { problemKey: 'low_light', scoreDelta: 0.12 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE]: {
      yes: [
        { problemKey: 'sunburn', scoreDelta: 0.26 },
        { problemKey: 'heat_stress', scoreDelta: 0.2 },
        { problemKey: 'low_light', scoreDelta: -0.14 }
      ],
      no: [
        { problemKey: 'low_light', scoreDelta: 0.18 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.08 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.06 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT]: {
      yes: [
        { problemKey: 'overwatering', scoreDelta: 0.26 },
        { problemKey: 'root_rot', scoreDelta: 0.18 },
        { problemKey: 'root_stress', scoreDelta: 0.16 },
        { problemKey: 'underwatering', scoreDelta: -0.16 }
      ],
      no: [
        { problemKey: 'underwatering', scoreDelta: 0.24 },
        { problemKey: 'low_light', scoreDelta: 0.08 },
        { problemKey: 'overwatering', scoreDelta: -0.16 },
        { problemKey: 'root_rot', scoreDelta: -0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT]: {
      yes: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.24 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.18 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.18 },
        { problemKey: 'low_light', scoreDelta: -0.08 }
      ],
      no: [
        { problemKey: 'low_light', scoreDelta: 0.12 },
        { problemKey: 'root_stress', scoreDelta: 0.08 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.08 }
      ]
    }
  },
  yellowingDifferential: {
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE]: {
      care_context: [
        { problemKey: 'overwatering', scoreDelta: 0.08 },
        { problemKey: 'underwatering', scoreDelta: 0.08 },
        { problemKey: 'low_light', scoreDelta: 0.08 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.08 },
        { problemKey: 'root_stress', scoreDelta: 0.06 }
      ],
      pest_trace: [
        { problemKey: 'spider_mites', scoreDelta: 0.16 },
        { problemKey: 'whiteflies', scoreDelta: 0.16 },
        { problemKey: 'aphids', scoreDelta: 0.12 },
        { problemKey: 'scale_insects', scoreDelta: 0.12 },
        { problemKey: 'thrips', scoreDelta: 0.12 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.08 }
      ],
      disease_trace: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.16 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.14 },
        { problemKey: 'powdery_mildew', scoreDelta: 0.12 },
        { problemKey: 'root_rot', scoreDelta: 0.08 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.06 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.06 }
      ],
      yellowing_only: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.04 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.04 },
        { problemKey: 'low_light', scoreDelta: 0.04 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE]: {
      watering_area: [
        { problemKey: 'overwatering', scoreDelta: 0.14 },
        { problemKey: 'underwatering', scoreDelta: 0.14 },
        { problemKey: 'root_stress', scoreDelta: 0.1 }
      ],
      light_area: [
        { problemKey: 'low_light', scoreDelta: 0.16 },
        { problemKey: 'sunburn', scoreDelta: 0.14 },
        { problemKey: 'heat_stress', scoreDelta: 0.1 }
      ],
      fertilization_area: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.16 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.14 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.14 }
      ],
      airflow_humidity_area: [
        { problemKey: 'overwatering', scoreDelta: 0.1 },
        { problemKey: 'root_stress', scoreDelta: 0.08 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE]: {
      halo_spots: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.14 }
      ],
      water_soaked_soft: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'root_rot', scoreDelta: 0.1 },
        { problemKey: 'soft_rot', scoreDelta: 0.08 }
      ],
      powder_mold_surface: [
        { problemKey: 'powdery_mildew', scoreDelta: 0.2 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.12 }
      ],
      yellowing_only_no_lesion: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.1 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.1 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.03 },
        { problemKey: 'low_light', scoreDelta: 0.03 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: {
      mite_webbing: [
        { problemKey: 'spider_mites', scoreDelta: 0.22 },
        { problemKey: 'whiteflies', scoreDelta: -0.08 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 }
      ],
      thrips_silver_black: [
        { problemKey: 'thrips', scoreDelta: 0.22 },
        { problemKey: 'spider_mites', scoreDelta: -0.08 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 }
      ],
      sticky_honeydew: [
        { problemKey: 'whiteflies', scoreDelta: 0.2 },
        { problemKey: 'aphids', scoreDelta: 0.18 },
        { problemKey: 'scale_insects', scoreDelta: 0.18 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.14 },
        { problemKey: 'spider_mites', scoreDelta: -0.12 }
      ],
      no_pest_trace: [
        { problemKey: 'spider_mites', scoreDelta: -0.1 },
        { problemKey: 'whiteflies', scoreDelta: -0.1 },
        { problemKey: 'aphids', scoreDelta: -0.08 },
        { problemKey: 'thrips', scoreDelta: -0.08 },
        { problemKey: 'low_light', scoreDelta: -0.02 },
        { problemKey: 'nutrient_deficiency', scoreDelta: -0.02 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN]: {
      new_leaves_first: [
        { problemKey: 'iron_deficiency', scoreDelta: 0.26 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.12 }
      ],
      old_lower_leaves_first: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.16 },
        { problemKey: 'low_light', scoreDelta: 0.04 },
        { problemKey: 'iron_deficiency', scoreDelta: -0.14 }
      ],
      no_clear_age_bias: [
        { problemKey: 'low_light', scoreDelta: 0.04 },
        { problemKey: 'root_stress', scoreDelta: 0.04 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.03 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN]: {
      uniform_whole_leaf: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.12 },
        { problemKey: 'low_light', scoreDelta: 0.05 },
        { problemKey: 'overwatering', scoreDelta: 0.03 }
      ],
      interveinal: [
        { problemKey: 'iron_deficiency', scoreDelta: 0.28 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.12 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.1 }
      ],
      patchy_or_speckled: [
        { problemKey: 'thrips', scoreDelta: 0.1 },
        { problemKey: 'spider_mites', scoreDelta: 0.1 },
        { problemKey: 'sunburn', scoreDelta: 0.08 }
      ],
      edge_or_scorch_patch: [
        { problemKey: 'sunburn', scoreDelta: 0.22 },
        { problemKey: 'heat_stress', scoreDelta: 0.14 },
        { problemKey: 'salt_stress', scoreDelta: 0.1 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT]: {
      often_wet: [
        { problemKey: 'overwatering', scoreDelta: 0.26 },
        { problemKey: 'root_stress', scoreDelta: 0.18 },
        { problemKey: 'root_rot', scoreDelta: 0.1 },
        { problemKey: 'underwatering', scoreDelta: -0.18 }
      ],
      often_dry: [
        { problemKey: 'underwatering', scoreDelta: 0.26 },
        { problemKey: 'overwatering', scoreDelta: -0.18 },
        { problemKey: 'root_rot', scoreDelta: -0.1 }
      ],
      normal_or_stable: [
        { problemKey: 'overwatering', scoreDelta: -0.1 },
        { problemKey: 'underwatering', scoreDelta: -0.1 },
        { problemKey: 'root_rot', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT]: {
      stronger_direct_light: [
        { problemKey: 'sunburn', scoreDelta: 0.24 },
        { problemKey: 'heat_stress', scoreDelta: 0.18 },
        { problemKey: 'low_light', scoreDelta: -0.16 }
      ],
      weaker_light: [
        { problemKey: 'low_light', scoreDelta: 0.24 },
        { problemKey: 'sunburn', scoreDelta: -0.14 }
      ],
      no_clear_change: [
        { problemKey: 'low_light', scoreDelta: -0.08 },
        { problemKey: 'sunburn', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT]: {
      low_or_no_fertilizer: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.22 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.2 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.12 }
      ],
      normal_light_fertilizer: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: -0.08 },
        { problemKey: 'nutrient_deficiency', scoreDelta: -0.08 }
      ],
      recent_heavy_fertilizer_or_repot: [
        { problemKey: 'root_stress', scoreDelta: 0.12 },
        { problemKey: 'nutrient_deficiency', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED]: {
      rapid_spreading: [
        { problemKey: 'root_stress', scoreDelta: 0.16 },
        { problemKey: 'temperature_stress', scoreDelta: 0.12 },
        { problemKey: 'root_rot', scoreDelta: 0.08 }
      ],
      slow_stable: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.1 },
        { problemKey: 'low_light', scoreDelta: 0.1 },
        { problemKey: 'root_rot', scoreDelta: -0.08 }
      ],
      with_wilting_or_drop: [
        { problemKey: 'root_stress', scoreDelta: 0.2 },
        { problemKey: 'root_rot', scoreDelta: 0.12 },
        { problemKey: 'overwatering', scoreDelta: 0.1 }
      ]
    }
  },
  yellow_speckling: {
    [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
      yes: [
        { problemKey: 'spider_mites', scoreDelta: 0.14 },
        { problemKey: 'whiteflies', scoreDelta: 0.14 },
        { problemKey: 'aphids', scoreDelta: 0.08 },
        { problemKey: 'thrips', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'spider_mites', scoreDelta: -0.1 },
        { problemKey: 'whiteflies', scoreDelta: -0.1 },
        { problemKey: 'aphids', scoreDelta: -0.08 },
        { problemKey: 'sunburn', scoreDelta: 0.12 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.1 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS]: {
      yes: [
        { problemKey: 'whiteflies', scoreDelta: 0.26 },
        { problemKey: 'aphids', scoreDelta: 0.24 },
        { problemKey: 'scale_insects', scoreDelta: 0.22 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.18 },
        { problemKey: 'spider_mites', scoreDelta: -0.22 },
        { problemKey: 'thrips', scoreDelta: -0.12 }
      ],
      no: [
        { problemKey: 'spider_mites', scoreDelta: -0.12 },
        { problemKey: 'thrips', scoreDelta: -0.08 },
        { problemKey: 'whiteflies', scoreDelta: -0.12 },
        { problemKey: 'aphids', scoreDelta: -0.12 },
        { problemKey: 'scale_insects', scoreDelta: -0.1 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'spider_mites', scoreDelta: 0.08 },
        { problemKey: 'thrips', scoreDelta: 0.12 },
        { problemKey: 'aphids', scoreDelta: 0.1 },
        { problemKey: 'whiteflies', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.14 },
        { problemKey: 'iron_deficiency', scoreDelta: 0.12 },
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.12 },
        { problemKey: 'low_light', scoreDelta: 0.1 },
        { problemKey: 'spider_mites', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'spider_mites', scoreDelta: 0.08 },
        { problemKey: 'thrips', scoreDelta: 0.12 },
        { problemKey: 'whiteflies', scoreDelta: 0.08 }
      ],
      no: [
        { problemKey: 'sunburn', scoreDelta: 0.12 },
        { problemKey: 'nutrient_deficiency', scoreDelta: 0.1 },
        { problemKey: 'spider_mites', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
      yes: [
        { problemKey: 'nitrogen_deficiency', scoreDelta: 0.14 },
        { problemKey: 'low_light', scoreDelta: 0.1 },
        { problemKey: 'spider_mites', scoreDelta: -0.1 }
      ],
      no: [
        { problemKey: 'spider_mites', scoreDelta: 0.04 },
        { problemKey: 'thrips', scoreDelta: 0.1 },
        { problemKey: 'whiteflies', scoreDelta: 0.08 }
      ]
    }
  },
  black_spots_spreading: {
    [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.16 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: -0.18 }
      ],
      no: [
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.22 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.14 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.1 },
        { problemKey: 'edema', scoreDelta: -0.08 },
        { problemKey: 'fungus_gnat', scoreDelta: -0.1 }
      ],
      no: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.22 },
        { problemKey: 'edema', scoreDelta: 0.16 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LESION_HALO]: {
      yes: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING]: {
      yes: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.24 },
        { problemKey: 'edema', scoreDelta: 0.16 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.12 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.22 },
        { problemKey: 'caterpillars', scoreDelta: 0.16 },
        { problemKey: 'beetles', scoreDelta: 0.14 },
        { problemKey: 'snails_slugs', scoreDelta: 0.12 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.16 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.12 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.14 },
        { problemKey: 'chewing_insects', scoreDelta: -0.18 },
        { problemKey: 'caterpillars', scoreDelta: -0.12 },
        { problemKey: 'beetles', scoreDelta: -0.1 },
        { problemKey: 'snails_slugs', scoreDelta: -0.1 }
      ]
    }
  },
  structuralDamageCause: {
    [QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE]: {
      pest_trace: [
        { problemKey: 'chewing_insects', scoreDelta: 0.28 },
        { problemKey: 'caterpillars', scoreDelta: 0.18 },
        { problemKey: 'beetles', scoreDelta: 0.14 },
        { problemKey: 'snails_slugs', scoreDelta: 0.14 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.1 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.08 }
      ],
      lesion_dropout: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'chewing_insects', scoreDelta: -0.16 },
        { problemKey: 'caterpillars', scoreDelta: -0.1 },
        { problemKey: 'beetles', scoreDelta: -0.08 },
        { problemKey: 'snails_slugs', scoreDelta: -0.08 }
      ],
      mechanical_old: [
        { problemKey: 'chewing_insects', scoreDelta: -0.16 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.08 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.08 }
      ]
    }
  },
  pestTraceType: {
    [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: {
      mite_webbing: [
        { problemKey: 'spider_mites', scoreDelta: 0.28 },
        { problemKey: 'thrips', scoreDelta: -0.08 },
        { problemKey: 'sunburn', scoreDelta: -0.1 },
        { problemKey: 'nutrient_deficiency', scoreDelta: -0.08 }
      ],
      thrips_silver_black: [
        { problemKey: 'thrips', scoreDelta: 0.28 },
        { problemKey: 'spider_mites', scoreDelta: -0.08 },
        { problemKey: 'sunburn', scoreDelta: -0.08 }
      ],
      sticky_honeydew: [
        { problemKey: 'whiteflies', scoreDelta: 0.22 },
        { problemKey: 'aphids', scoreDelta: 0.22 },
        { problemKey: 'scale_insects', scoreDelta: 0.2 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.18 },
        { problemKey: 'spider_mites', scoreDelta: -0.16 },
        { problemKey: 'thrips', scoreDelta: -0.08 }
      ],
      no_pest_trace: [
        { problemKey: 'spider_mites', scoreDelta: -0.18 },
        { problemKey: 'thrips', scoreDelta: -0.18 },
        { problemKey: 'whiteflies', scoreDelta: -0.14 },
        { problemKey: 'aphids', scoreDelta: -0.14 },
        { problemKey: 'scale_insects', scoreDelta: -0.12 },
        { problemKey: 'sunburn', scoreDelta: -0.02 },
        { problemKey: 'nutrient_deficiency', scoreDelta: -0.02 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS]: {
      yes: [
        { problemKey: 'whiteflies', scoreDelta: 0.24 },
        { problemKey: 'aphids', scoreDelta: 0.22 },
        { problemKey: 'scale_insects', scoreDelta: 0.2 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.16 },
        { problemKey: 'spider_mites', scoreDelta: -0.2 },
        { problemKey: 'thrips', scoreDelta: -0.1 }
      ],
      no: [
        { problemKey: 'whiteflies', scoreDelta: -0.14 },
        { problemKey: 'aphids', scoreDelta: -0.14 },
        { problemKey: 'scale_insects', scoreDelta: -0.12 },
        { problemKey: 'spider_mites', scoreDelta: 0.1 },
        { problemKey: 'thrips', scoreDelta: 0.04 }
      ]
    }
  },
  edemaBumpStage: {
    [QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE]: {
      watery_blister: [
        { problemKey: 'edema', scoreDelta: 0.24 },
        { problemKey: 'overwatering', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.08 }
      ],
      corky_scab: [
        { problemKey: 'edema', scoreDelta: 0.28 },
        { problemKey: 'overwatering', scoreDelta: 0.1 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.08 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.08 }
      ],
      flat_spot: [
        { problemKey: 'edema', scoreDelta: -0.18 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.08 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.06 }
      ]
    }
  },
  tunnels_in_leaf: {
    [QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN]: {
      mine_line: [
        { problemKey: 'leaf_miners', scoreDelta: 0.3 }
      ],
      other_mark: [
        { problemKey: 'leaf_miners', scoreDelta: -0.22 }
      ]
    }
  },
  powder_white: {
    [QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN]: {
      spreading_powder: [
        { problemKey: 'powdery_mildew', scoreDelta: 0.3 }
      ],
      limited_static: [
        { problemKey: 'powdery_mildew', scoreDelta: -0.12 }
      ]
    }
  },
  brown_spots_halo: {
    [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: -0.2 }
      ],
      no: [
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.22 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.16 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'edema', scoreDelta: -0.08 },
        { problemKey: 'fungus_gnat', scoreDelta: -0.1 }
      ],
      no: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.24 },
        { problemKey: 'edema', scoreDelta: 0.18 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LESION_HALO]: {
      yes: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING]: {
      yes: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.24 },
        { problemKey: 'edema', scoreDelta: 0.18 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.12 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.16 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.22 },
        { problemKey: 'caterpillars', scoreDelta: 0.16 },
        { problemKey: 'beetles', scoreDelta: 0.14 },
        { problemKey: 'snails_slugs', scoreDelta: 0.12 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.16 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.16 },
        { problemKey: 'chewing_insects', scoreDelta: -0.18 },
        { problemKey: 'caterpillars', scoreDelta: -0.12 },
        { problemKey: 'beetles', scoreDelta: -0.1 },
        { problemKey: 'snails_slugs', scoreDelta: -0.1 }
      ]
    }
  },
  irregular_blotches: {
    [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.14 },
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: -0.16 }
      ],
      no: [
        { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.2 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.1 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: {
      yes: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.16 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.1 },
        { problemKey: 'edema', scoreDelta: -0.08 }
      ],
      no: [
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.2 },
        { problemKey: 'edema', scoreDelta: 0.16 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.2 },
        { problemKey: 'caterpillars', scoreDelta: 0.14 },
        { problemKey: 'beetles', scoreDelta: 0.12 },
        { problemKey: 'snails_slugs', scoreDelta: 0.12 },
        { problemKey: 'fungal_leaf_spot', scoreDelta: -0.14 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.1 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.14 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'chewing_insects', scoreDelta: -0.16 },
        { problemKey: 'caterpillars', scoreDelta: -0.12 },
        { problemKey: 'beetles', scoreDelta: -0.1 },
        { problemKey: 'snails_slugs', scoreDelta: -0.1 }
      ]
    }
  },
  chewed_edges: {
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.08 },
        { problemKey: 'caterpillars', scoreDelta: 0.06 },
        { problemKey: 'beetles', scoreDelta: 0.05 },
        { problemKey: 'snails_slugs', scoreDelta: 0.05 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.1 },
        { problemKey: 'chewing_insects', scoreDelta: -0.18 },
        { problemKey: 'caterpillars', scoreDelta: -0.12 },
        { problemKey: 'beetles', scoreDelta: -0.1 },
        { problemKey: 'snails_slugs', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.22 },
        { problemKey: 'caterpillars', scoreDelta: 0.16 },
        { problemKey: 'beetles', scoreDelta: 0.12 },
        { problemKey: 'snails_slugs', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'chewing_insects', scoreDelta: -0.12 },
        { problemKey: 'caterpillars', scoreDelta: -0.1 },
        { problemKey: 'beetles', scoreDelta: -0.08 },
        { problemKey: 'snails_slugs', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.06 },
        { problemKey: 'caterpillars', scoreDelta: 0.04 },
        { problemKey: 'beetles', scoreDelta: 0.04 },
        { problemKey: 'snails_slugs', scoreDelta: 0.04 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.05 },
        { problemKey: 'caterpillars', scoreDelta: 0.04 },
        { problemKey: 'beetles', scoreDelta: 0.04 }
      ]
    }
  },
  holes_in_leaf: {
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.08 },
        { problemKey: 'caterpillars', scoreDelta: 0.06 },
        { problemKey: 'snails_slugs', scoreDelta: 0.06 },
        { problemKey: 'beetles', scoreDelta: 0.05 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.1 },
        { problemKey: 'chewing_insects', scoreDelta: -0.2 },
        { problemKey: 'caterpillars', scoreDelta: -0.14 },
        { problemKey: 'snails_slugs', scoreDelta: -0.14 },
        { problemKey: 'beetles', scoreDelta: -0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.22 },
        { problemKey: 'caterpillars', scoreDelta: 0.14 },
        { problemKey: 'snails_slugs', scoreDelta: 0.14 },
        { problemKey: 'beetles', scoreDelta: 0.12 }
      ],
      no: [
        { problemKey: 'chewing_insects', scoreDelta: -0.12 },
        { problemKey: 'caterpillars', scoreDelta: -0.1 },
        { problemKey: 'snails_slugs', scoreDelta: -0.1 },
        { problemKey: 'beetles', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.06 },
        { problemKey: 'caterpillars', scoreDelta: 0.04 },
        { problemKey: 'snails_slugs', scoreDelta: 0.04 },
        { problemKey: 'beetles', scoreDelta: 0.04 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.05 },
        { problemKey: 'snails_slugs', scoreDelta: 0.04 }
      ]
    }
  },
  skeletonized_leaves: {
    [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.08 },
        { problemKey: 'beetles', scoreDelta: 0.06 },
        { problemKey: 'caterpillars', scoreDelta: 0.05 }
      ],
      no: [
        { problemKey: 'fungal_leaf_spot', scoreDelta: 0.1 },
        { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.08 },
        { problemKey: 'chewing_insects', scoreDelta: -0.22 },
        { problemKey: 'beetles', scoreDelta: -0.16 },
        { problemKey: 'caterpillars', scoreDelta: -0.14 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.24 },
        { problemKey: 'beetles', scoreDelta: 0.16 },
        { problemKey: 'caterpillars', scoreDelta: 0.12 }
      ],
      no: [
        { problemKey: 'chewing_insects', scoreDelta: -0.12 },
        { problemKey: 'beetles', scoreDelta: -0.1 },
        { problemKey: 'caterpillars', scoreDelta: -0.08 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'chewing_insects', scoreDelta: 0.06 },
        { problemKey: 'beetles', scoreDelta: 0.05 },
        { problemKey: 'caterpillars', scoreDelta: 0.04 }
      ]
    }
  },
  tunnels_in_leaf: {
    [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: {
      yes: [
        { problemKey: 'leaf_miners', scoreDelta: 0.22 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: {
      yes: [
        { problemKey: 'leaf_miners', scoreDelta: 0.12 }
      ]
    }
  },
  water_soaked_stem: {
    [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
      yes: [
        { problemKey: 'poor_drainage', scoreDelta: 0.18 },
        { problemKey: 'root_stress', scoreDelta: 0.14 },
        { problemKey: 'general_stress', scoreDelta: 0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'poor_drainage', scoreDelta: 0.14 },
        { problemKey: 'root_stress', scoreDelta: 0.12 },
        { problemKey: 'general_stress', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'environmental_stress', scoreDelta: 0.12 },
        { problemKey: 'general_stress', scoreDelta: 0.12 }
      ]
    }
  },
  soft_stem: {
    [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: {
      yes: [
        { problemKey: 'poor_drainage', scoreDelta: 0.16 },
        { problemKey: 'root_stress', scoreDelta: 0.14 },
        { problemKey: 'general_stress', scoreDelta: 0.12 }
      ]
    },
    [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: {
      yes: [
        { problemKey: 'poor_drainage', scoreDelta: 0.12 },
        { problemKey: 'root_stress', scoreDelta: 0.12 },
        { problemKey: 'general_stress', scoreDelta: 0.1 }
      ],
      no: [
        { problemKey: 'environmental_stress', scoreDelta: 0.1 },
        { problemKey: 'general_stress', scoreDelta: 0.1 }
      ]
    }
  }
}

function buildOrthogonalProbeDimensionOrder(item = {}) {
  const patternKey = normalizeText(item?.patternKey)
  const locationKey = normalizeText(item?.locationKey)
  const symptomKey = normalizeText(item?.symptomKey)
  const symptomSpecific = ORTHOGONAL_DIMENSION_PRIORITY_BY_SYMPTOM[symptomKey] || []
  const base = ORTHOGONAL_DIMENSION_PRIORITY_BY_PATTERN[patternKey] || []

  const fallback = locationKey === 'stem'
    ? [
        QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
        QUESTION_TARGET_DIMENSIONS.PROGRESSION,
        QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
      ]
    : [
        QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
        QUESTION_TARGET_DIMENSIONS.PROGRESSION,
        QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
      ]

  const combined = [...symptomSpecific, ...base, ...fallback]

  if (locationKey === 'leaf' && !combined.includes(QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE)) {
    combined.push(QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE)
  }
  if (
    symptomKey === 'black_spots_spreading' ||
    symptomKey === 'brown_spots_halo' ||
    symptomKey === 'irregular_blotches'
  ) {
    const blockedVisualFactReviewDimensions = new Set([
      QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
      QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY
    ])
    return Array.from(new Set([
      QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
      QUESTION_TARGET_DIMENSIONS.LESION_HALO,
      QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      ...combined
    ])).filter(targetDimension => !blockedVisualFactReviewDimensions.has(targetDimension))
  }

  return Array.from(new Set(combined))
}

function buildSyntheticDirectProblemAdjustments(item = {}, targetDimension = '', optionKey = '') {
  const symptomKey = normalizeText(item?.symptomKey)
  const normalizedTargetDimension = normalizeQuestionTargetDimension(targetDimension, '')
  const normalizedOptionKey = normalizeText(optionKey).toLowerCase()
  if (!symptomKey || !normalizedTargetDimension || !normalizedOptionKey) {
    return []
  }

  const symptomEffects =
    isStructuralChewingSymptom({ ...item, symptomKey }) &&
    normalizedTargetDimension === QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE
      ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.structuralDamageCause
      : isPestTraceSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
          QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS
        ].includes(normalizedTargetDimension)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.pestTraceType
      : isEdemaBumpSymptom({ ...item, symptomKey }) &&
        normalizedTargetDimension === QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.edemaBumpStage
      : isYellowingSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
          QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
          QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
        ].includes(normalizedTargetDimension)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.yellowingDifferential
      : SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM[symptomKey]
  const dimensionEffects = symptomEffects?.[normalizedTargetDimension]
  const optionEffects = dimensionEffects?.[normalizedOptionKey]

  return (Array.isArray(optionEffects) ? optionEffects : [])
    .map(item => ({
      problemKey: normalizeText(item?.problemKey),
      scoreDelta: Number(item?.scoreDelta || 0)
    }))
    .filter(item => item.problemKey && Number(item.scoreDelta || 0) !== 0)
}

function buildOrthogonalProbeText(item = {}, targetDimension = '', context = {}) {
  const symptomLabel = resolveNeutralSymptomLabel(item, '该异常')
  const locationKey = normalizeText(item?.locationKey)
  const patternKey = normalizeText(item?.patternKey)

  switch (targetDimension) {
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE:
      return {
        questionText: '叶子发黄的原因比较多，可能和最近的养护变化、虫子痕迹、病斑或环境变化有关。先选最明显的一类线索，后面就能少问无关问题。除了叶子发黄，你还注意到哪类情况最明显？',
        helpText: '这里只选最明显的一类线索；如果没有其他异常或看不准，可以选“只是发黄”或“不确定”。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE:
      return {
        questionText: '如果黄叶可能和日常养护有关，关键是先找出最近变化最大、最可能影响叶色的一项。请结合这盆植物最近两周的情况，先选最值得排查的方向。',
        helpText: '这题不是让你判断病因，只是先确定从浇水、光照、施肥还是通风湿度继续问。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE:
      return {
        questionText: '黄叶如果伴随斑点、烂斑或霉层，后续判断会完全不同。请先看发黄的位置，最接近下面哪一种？',
        helpText: '不需要区分真菌或细菌，只按肉眼能看到的斑点、湿软感、粉霉层来选。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN:
      return {
        questionText: '黄叶如果暂时没有明显虫痕、病斑或养护变化，就需要看它先从哪里开始。发黄主要先出现在新叶，还是老叶/下部叶？',
        helpText: '这题用于区分缺铁、缺氮、弱光和根区压力等方向，不是重复确认黄叶本身。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN:
      return {
        questionText: '黄叶的分布方式会影响后续方向。发黄的样子更接近哪一种？',
        helpText: '分布方式比“是否发黄”更能区分营养、光照、水分和虫害弱线索。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT:
      const wateringCopy = buildWateringRangeCopy(context)
      return {
        questionText: `黄叶和浇水有关时，重点不是“浇没浇”，而是最近是否明显偏多或偏少。${wateringCopy.referenceRangeText}。最近 2 周，你的浇水更接近哪一种？`,
        helpText: wateringCopy.helpText,
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT:
      return {
        questionText: '黄叶和光照有关时，关键是直射太阳是否明显偏多或偏少。最近 1-2 周，这盆植物每天大概能晒到多久的直射太阳？',
        helpText: '这里问的是直射太阳时长，不是室内亮不亮；后续会结合这类植物平时适合的光照范围判断是否偏强或偏弱。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT:
      return {
        questionText: '黄叶和营养有关时，既可能是长期没补肥，也可能是近期重肥或换盆刺激。最近 1 个月，你大概施肥几次？',
        helpText: '用施肥次数和近期换盆/重肥记录营养背景，不直接把黄叶等同于缺肥。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED:
      return {
        questionText: '如果前面的线索还不够明确，黄叶变化速度能帮助判断是否存在根区或急性环境压力。发黄最近变化速度如何？',
        helpText: '变化速度和是否伴随萎蔫/掉叶，会影响是否需要进入根区或急性环境压力方向。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE:
      return {
        questionText: `这题是为了区分真实缺损更像虫害、病斑脱落，还是旧伤/摩擦，不是重复确认有没有洞。请看这些“${symptomLabel}”周围更像哪种情况？`,
        helpText: '这题不是确认有没有缺损，而是区分缺损更像虫害痕迹、病斑脱落，还是机械/旧伤。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE:
      return {
        questionText: '这题是为了确认有没有更直接的虫子活动线索，避免只凭黄点、缺口或斑驳就判断成虫害。这些痕迹旁边更接近哪种情况？',
        helpText: '这题用于区分红蜘蛛/螨类、蓟马、蜜露类刺吸害虫和非虫害痕迹，不把黄点或银斑直接当虫害。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE:
      return {
        questionText: '鼓包或水泡可能来自水肿、后期结痂，也可能只是普通斑点。先确认变化阶段，后面才能少问无关问题。这些鼓包或水泡更接近哪种变化？',
        helpText: '这题用于区分水肿样鼓包、后期木栓化结痂和普通斑点；还需要结合盆土湿度、光照和通风背景。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN:
      return {
        questionText: '线状痕迹需要先区分是不是叶片内部的“潜叶道”，否则容易和划痕、旧伤或反光混淆。这些线状痕迹更像叶片里面弯曲延伸的浅白隧道，还是表面的划痕、旧伤或反光？',
        helpText: '潜叶道通常像在叶肉内部延伸的弯曲浅色线，不等同于普通孔洞或表面划痕。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN:
      return {
        questionText: '白色粉层要先看是否在扩散，才能区分活跃粉层和较稳定的表面残留。这些白色粉层最近更像在叶面逐渐扩散，还是只停留在少数固定位置？',
        helpText: '这题不要求擦拭白粉，只追问分布和扩散方式，用来区分活跃粉层和不活跃表面异常。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS:
      return {
        questionText:
          locationKey === 'leaf'
            ? `这些“${symptomLabel}”的位置摸起来发黏吗？`
            : `这些“${symptomLabel}”的位置摸起来发黏吗？`,
        helpText: '只确认是否有黏感；干灰、脏层或黑灰附着通常不算发黏。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY:
      return {
        questionText: locationKey === 'leaf'
          ? `这些“${symptomLabel}”的位置是不是真的破了洞或缺了一块？`
          : `这些“${symptomLabel}”的位置有没有真的破损或缺了一块？`,
        helpText: '只确认是否真的破损或缺失；表面变色、斑点、焦边或旧伤痕迹不算真实缺口。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE:
      return {
        questionText: locationKey === 'leaf'
          ? `这些“${symptomLabel}”更像跟着叶片组织一起变化，还是只停留在表面一层？`
          : `这些“${symptomLabel}”更像附着在表面，还是组织本身变色？`,
        helpText: '只观察位置关系，不要求擦拭；如果视觉证据已经明确，系统会优先问其他病因分流题。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE:
      return {
        questionText: locationKey === 'stem'
          ? '异常部位按压时更像湿软发黏，还是更接近干瘪、塌陷或失去支撑？'
          : `异常附近组织更像干硬坏死，还是发软、带水渍感？`,
        helpText: '这一题用来区分“干硬坏死”与“湿软水浸”两种不同方向。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_HALO:
      return {
        questionText: locationKey === 'leaf'
          ? '这些斑点周围是否还能看到一圈偏黄、发浅或像晕开的边缘？'
          : `这些“${symptomLabel}”周围是否还有一圈更浅色、像晕开的边缘？`,
        helpText: '这一题不是重复确认黑斑本身，而是追问是否伴随黄晕，这会影响叶斑问题的分流方向。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING:
      return {
        questionText: locationKey === 'leaf'
          ? '斑点边缘有没有像被水浸过一样，发暗、半透明或偏软？'
          : `这些“${symptomLabel}”边缘有没有像被水浸过一样，发暗、半透明或偏软？`,
        helpText: '这一题用来追问病斑边缘是否有水浸/湿软特征，帮助区分不同叶斑路径。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE:
      return {
        questionText: locationKey === 'leaf'
          ? `这类异常现在主要出现在少数叶片/局部，还是多片叶子、多个位置都能看到？`
          : '这种异常主要集中在局部，还是已经扩到更大范围？',
        helpText: '分布范围用于区分局部事件和全株性压力，不把局部损伤直接判成虫害。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE:
      return {
        questionText: isStructuralChewingSymptom(item)
          ? '翻看叶背、叶脉附近或盆土表面，能看到小虫、黑色颗粒、黏液痕或新鲜缺口吗？'
          : `翻看叶背、叶脉附近或更隐蔽的位置，这种“${symptomLabel}”在背面是否更明显？`,
        helpText: isStructuralChewingSymptom(item)
          ? '结构缺损本身不是虫害结论；这一题只追问是否有更直接的虫害线索。'
          : '很多叶部问题在叶背、叶脉夹角或隐蔽部位更容易暴露真实线索。',
        routingScope: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.PROGRESSION:
      return {
        questionText: `最近 7 天内，这类“${symptomLabel}”有没有明显变多、变大或加重？`,
        helpText: '进展速度会影响是活跃过程、环境事件，还是较稳定的旧损伤/旧斑。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION:
      if (patternKey === 'burn' || patternKey === 'tear') {
        return {
          questionText: '这些痕迹是否主要出现在更容易晒到太阳的一侧？',
          helpText: '这题只判断位置是否偏向受光面，用来区分日晒/环境伤和其他原因。',
          routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
        }
      }
      if (locationKey === 'stem' || patternKey === 'soft' || patternKey === 'soaked') {
        return {
          questionText: '最近盆土是否长期偏湿，或浇水后这类异常更容易加重？',
          helpText: '茎基部发软、水浸和塌陷，常需要结合湿度与浇水背景来分流。',
          routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
        }
      }
      return {
        questionText: `这种“${symptomLabel}”主要先出现在老叶，还是新叶也很明显？`,
        helpText: '受害叶龄和位置常帮助区分营养、环境与病虫害路径。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE:
      return {
        questionText:
          locationKey === 'leaf'
            ? '光照类问题要先确认直射太阳时长，避免把普通室内亮度误当成强光。最近 1-2 周，这盆植物每天大概能晒到多久的直射太阳？'
            : '光照类问题要先确认这个部位是否更容易被直射太阳晒到。最近 1-2 周，这个部位是否比以前更容易晒到直射太阳？',
        helpText: '这里问的是直射太阳，不是普通室内亮度；如果没有直射太阳，可以按 0-1 小时选择。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT:
      const wateringContextCopy = buildWateringRangeCopy(context)
      return {
        questionText:
          locationKey === 'leaf'
            ? `浇水类问题要看最近是否明显偏多或偏少。${wateringContextCopy.referenceRangeText}。最近 2 周，你的浇水更接近哪一种？`
            : '最近 2 周基质干湿变化更接近哪一种？',
        helpText: locationKey === 'leaf'
          ? wateringContextCopy.helpText
          : '这一题用可选择的时间节奏记录干湿背景，后续会结合这类植物的日常需求判断是否偏离。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT:
      return {
        questionText: '施肥类问题要先记录次数和是否近期重肥/换盆，避免直接把黄化等同于缺肥。最近 1 个月，你大概施肥几次？',
        helpText: '这一题只记录供肥背景，不直接把黄化等同于缺肥。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
    default:
      return {
        questionText: `关于“${symptomLabel}”，最近有没有变多、变大，或出现在其他位置？`,
        helpText: normalizeText(item?.userObservationTipCn) || '请尽量在自然光下，从整片叶、叶背和近景几个角度补充观察。',
        routingScope: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
      }
  }
}

function buildSyntheticObservedProbeOptionTexts(item = {}, targetDimension = '', context = {}) {
  const locationKey = normalizeText(item?.locationKey)
  const patternKey = normalizeText(item?.patternKey)

  switch (targetDimension) {
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE:
      return {
        care_context: {
          text: '先排查日常养护变化',
          description: buildCareSummaryForPrimaryGate(context)
        },
        pest_trace: {
          text: '看到虫子或虫害痕迹',
          description: '例如小虫、细网、黑点、叶面发黏、叶背有活动点等。'
        },
        disease_trace: {
          text: '还有斑点、烂斑或霉粉',
          description: '例如褐斑、黑斑、水渍感、软烂、霉层、粉状物等。'
        },
        yellowing_only: {
          text: '只是发黄，没看到其他异常',
          description: '如果主要就是叶色变黄，暂时没看到虫子、病斑或明显养护变化，选这个。'
        },
        unknown: {
          text: '不确定，继续帮我排查',
          description: '如果看不出最明显的方向，选这个，系统会继续从黄叶分布和新老叶位置排查。'
        }
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE:
      return buildCareGateOptionPayloads(context)
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE:
      return {
        halo_spots: '有褐色或黑色斑点，周围还有一圈发黄',
        water_soaked_soft: '斑点像被水浸过，发暗、半透明或偏软',
        powder_mold_surface: '表面像有粉、霉、灰尘或脏层',
        yellowing_only_no_lesion: '只是颜色发黄，没有明显斑点或烂斑',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN:
      return {
        new_leaves_first: '新叶更明显',
        old_lower_leaves_first: '老叶或下部叶更明显',
        no_clear_age_bias: '新老叶差不多，或看不出先后',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN:
      return {
        uniform_whole_leaf: '整片叶比较均匀地发黄',
        interveinal: '叶脉附近还绿，叶脉之间更黄',
        patchy_or_speckled: '一块块、斑驳，或很多小黄点',
        edge_or_scorch_patch: '主要是叶边或局部一块发黄发浅，像晒后留下的伤斑',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT:
      const wateringCopy = buildWateringRangeCopy(context)
      return {
        often_wet: wateringCopy.tooOftenText,
        often_dry: wateringCopy.tooRareText,
        normal_or_stable: wateringCopy.normalText,
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT:
      return {
        stronger_direct_light: '每天直射 3 小时以上，或最近突然晒得更多',
        weaker_light: '每天直射 0-1 小时，或最近明显更阴',
        no_clear_change: '每天直射约 1-3 小时，且最近基本没变',
        unknown: '不确定/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT:
      return {
        low_or_no_fertilizer: '近 2 个月 0 次，或明显少于平时',
        normal_light_fertilizer: '近 1 个月 1 次薄肥，或按平时少量补肥',
        recent_heavy_fertilizer_or_repot: '近 1 个月 2 次以上、重肥，或刚换盆/换土',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED:
      return {
        rapid_spreading: '几天到一两周内明显变多/变重',
        slow_stable: '变化较慢，基本稳定',
        with_wilting_or_drop: '同时明显萎蔫、掉叶或软塌',
        unknown: '不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE:
      return {
        pest_trace: '有小虫、黑色颗粒、黏液痕或新鲜不规则缺口',
        lesion_dropout: '先有褐斑、黑斑或黄边，后来中间干枯脱落',
        mechanical_old: '更像折伤、摩擦、旧伤或焦边裂开',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE:
      return {
        mite_webbing: '叶背或叶柄附近有细网、蜕皮，或极小活动点',
        thrips_silver_black: '有银白擦伤样痕迹，并伴很小的黑色排泄点',
        sticky_honeydew: '表面发黏，或附近有蜜露/煤灰样黑层',
        no_pest_trace: '没有这些虫害痕迹，更像晒伤、肥害、旧伤或普通变色',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE:
      return {
        watery_blister: '像透明或半透明小水泡，常在叶背更明显',
        corky_scab: '已经变褐、粗糙、结痂或像小疙瘩',
        flat_spot: '更像平的斑点或表面痕迹，不像鼓包',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN:
      return {
        mine_line: '更像叶片内部弯曲延伸的浅白隧道',
        other_mark: '更像表面划痕、旧伤或反光',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN:
      return {
        spreading_powder: '最近在叶面逐渐扩散或变多',
        limited_static: '只在少数固定位置，没有明显扩散',
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE:
      return locationKey === 'leaf'
        ? {
            yes: '更像跟着叶片组织一起变化',
            no: '更像只停留在表面一层',
            unknown: '看不出/不确定'
          }
        : {
            yes: '更像附着在表面',
            no: '更像组织本身已经发黑/变色',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE:
      return locationKey === 'stem'
        ? {
            yes: '更像湿软发黏',
            no: '更像干瘪、塌陷或失去支撑',
            unknown: '看不出/不确定'
          }
        : {
            yes: '更像干硬坏死',
            no: '更像发软、带水渍感',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.LESION_HALO:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE:
      return locationKey === 'leaf'
        ? {
            yes: '主要集中在个别叶片/局部',
            no: '多片叶子都能看到',
            unknown: '看不出/不确定'
          }
        : {
            yes: '主要集中在局部',
            no: '已经扩到更大范围',
            unknown: '看不出/不确定'
          }
    case QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '还没看叶背/看不出'
      }
    case QUESTION_TARGET_DIMENSIONS.PROGRESSION:
      return {
        yes: '是的',
        no: '不是的',
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION:
      if (patternKey === 'burn' || patternKey === 'tear') {
        return {
          yes: '是的',
          no: '不是的',
          unknown: '说不清/没留意'
        }
      }
      if (locationKey === 'stem' || patternKey === 'soft' || patternKey === 'soaked') {
        return {
          yes: '是的',
          no: '不是的',
          unknown: '说不清/没留意'
        }
      }
      return {
        yes: '是的',
        no: '不是的',
        unknown: '看不出/不确定'
      }
    case QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE:
      return {
        yes: '每天直射 3 小时以上，或最近突然晒得更多',
        no: '每天直射 0-1 小时，主要是散射光或阴处',
        unknown: '不确定/不符合以上'
      }
    case QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT:
      const wateringContextCopy = buildWateringRangeCopy(context)
      return {
        yes: wateringContextCopy.tooOftenText,
        no: wateringContextCopy.tooRareText,
        unknown: '说不清/没留意'
      }
    case QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT:
      return {
        yes: '近 2 个月 0 次，或明显少于平时',
        no: '近 1 个月 1 次薄肥，或按平时少量补肥',
        unknown: '说不清/没留意'
      }
    default:
      return {
        yes: '是，更符合前面描述的情况',
        no: '否，更符合另一种情况',
        unknown: '看不出/不确定'
      }
  }
}

function buildSyntheticObservedProbeQuestions(
  item = {},
  {
    maxQuestions = 1,
    excludedDimensions = [],
    plantContext = {},
    weatherContext = null,
    questionTemplates = [],
    optionTemplates = []
  } = {}
) {
  const symptomKey = normalizeText(item?.symptomKey)
  if (!symptomKey) {return []}

  const excludedDimensionSet = new Set(
    (Array.isArray(excludedDimensions) ? excludedDimensions : [])
      .map(value => normalizeQuestionTargetDimension(value, ''))
      .filter(Boolean)
  )
  const questionTemplateMap = buildTemplateMap(questionTemplates)
  const optionTemplateMap = buildOptionTemplateMap(optionTemplates)

  return buildOrthogonalProbeDimensionOrder(item)
    .filter(targetDimension => Boolean(targetDimension) && !excludedDimensionSet.has(targetDimension))
    .slice(0, Math.max(1, Math.min(1, Number(maxQuestions || 1))))
    .map(targetDimension => {
      const context = { plantContext, weatherContext }
      const questionKey = buildSyntheticObservedProbeQuestionKey(symptomKey, targetDimension)
      const probeText = buildOrthogonalProbeText(item, targetDimension, context)
      const optionTexts = buildSyntheticObservedProbeOptionTexts(item, targetDimension, context)
      const variables = buildTemplateVariables(item, context)
      const dataLayerQuestion = questionTemplateMap.get(questionKey) || null
      const dataLayerOptions = renderDataLayerOptions(optionTemplateMap.get(questionKey) || [], variables)
      const optionEntries = dataLayerOptions.length
        ? dataLayerOptions
        : normalizeSyntheticOptionEntries(optionTexts)
      const questionRole = inferQuestionRole(targetDimension, probeText.routingScope)
      const defaultOptionKey =
        normalizeText(dataLayerQuestion?.defaultOptionKey) ||
        normalizeText(optionEntries.find(option => option.isDefault)?.optionKey) ||
        (
          questionRole === 'gate'
            ? resolveSyntheticDefaultOptionKey(targetDimension, optionEntries)
            : ''
        )
      return {
        questionKey,
        targetSymptomKey: symptomKey,
        targetDimension,
        routingScope: dataLayerQuestion?.routingScope || probeText.routingScope,
        questionRole,
        effectMode: inferQuestionEffectMode(questionRole, targetDimension),
        defaultOptionKey,
        uiVariant: normalizeText(dataLayerQuestion?.uiVariant),
        renderMode: normalizeText(dataLayerQuestion?.renderMode),
        questionText: renderQuestionTemplate(
          dataLayerQuestion?.questionTextUserCn || dataLayerQuestion?.questionTextCn || probeText.questionText,
          variables
        ),
        helpText: renderQuestionTemplate(dataLayerQuestion?.helpTextCn || probeText.helpText, variables),
        questionGroupKey: dataLayerQuestion?.questionGroupKey || buildObservedProbeQuestionGroupKey(symptomKey, targetDimension),
        questionType: dataLayerQuestion?.questionType || 'single_choice',
        options: optionEntries,
        whyThisQuestion: renderQuestionTemplate(
          dataLayerQuestion?.whyThisQuestionCn ||
            `这题用于从“${targetDimension}”维度补充观察“${resolveNeutralSymptomLabel(item, symptomKey)}”，避免回到同一视觉确认问题。`,
          variables
        )
      }
    })
}

function buildSyntheticFollowUpOptionMappings(questionKeys = [], symptomDictionary = []) {
  const symptomMap = new Map(
    (Array.isArray(symptomDictionary) ? symptomDictionary : [])
      .map(item => [normalizeText(item?.symptomKey), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )

  return Array.from(
    new Set(
      (Array.isArray(questionKeys) ? questionKeys : [])
        .map(item => normalizeText(item))
        .filter(Boolean)
    )
  ).flatMap(questionKey => {
    if (isSyntheticVisualCandidateQuestionKey(questionKey)) {
      const symptomKey = questionKey.slice(SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX.length).trim()
      if (!symptomKey) {return []}

      const symptomMeta = symptomMap.get(symptomKey) || {}
      const symptomLabel = normalizeText(
        resolveNeutralSymptomLabel({ ...symptomMeta, symptomKey }, symptomKey)
      ) || symptomKey

      return [
        {
          questionKey,
          optionKey: 'yes',
          optionTextCn: '是的',
          optionTextUserCn: '是的',
          mapsToSymptomKey: symptomKey,
          value: 1,
          associationStrength: 1,
          answerEffectCn: `把“${symptomLabel}”作为正证据加入诊断。`,
          dataStatus: 'synthetic'
        },
        {
          questionKey,
          optionKey: 'no',
          optionTextCn: '不是的',
          optionTextUserCn: '不是的',
          mapsToSymptomKey: symptomKey,
          value: -1,
          associationStrength: 1,
          answerEffectCn: `把“${symptomLabel}”作为负证据加入诊断。`,
          dataStatus: 'synthetic'
        },
        {
          questionKey,
          optionKey: 'unknown',
          optionTextCn: '看不出/不确定',
          optionTextUserCn: '看不出/不确定',
          mapsToSymptomKey: symptomKey,
          value: 0,
          associationStrength: 0,
          answerEffectCn: `暂不把“${symptomLabel}”作为正式证据。`,
          dataStatus: 'synthetic'
        }
      ]
    }

    if (isSyntheticObservedProbeQuestionKey(questionKey)) {
      const { symptomKey, targetDimension } = parseSyntheticObservedProbeQuestionKey(questionKey)
      const dimensionLabel = targetDimension || '补充维度'
      const symptomMeta = symptomMap.get(symptomKey) || {}
      const normalizedPatternKey = normalizeText(symptomMeta?.patternKey)
      const optionTexts = buildSyntheticObservedProbeOptionTexts(symptomMeta, targetDimension)
      const optionTextByKey = Object.fromEntries(
        normalizeSyntheticOptionEntries(optionTexts).map(option => [option.optionKey, option.text])
      )

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS) {
        const stickyTargetSymptomKey =
          symptomKey === 'sticky_honeydew' ||
          normalizedPatternKey === 'mold' ||
          symptomKey === 'sooty_mold' ||
          symptomKey === 'black_mold_growth'
            ? 'sticky_honeydew'
            : ''
        const dryResidueSymptomKey =
          symptomKey === 'sticky_honeydew'
            ? 'sticky_honeydew'
            : normalizedPatternKey === 'mold' || symptomKey === 'sooty_mold'
            ? 'black_mold_growth'
            : symptomKey
        const dryResidueValue =
          symptomKey === 'sticky_honeydew'
            ? -1
            : dryResidueSymptomKey
              ? 1
              : 0
        const dryResidueAssociationStrength =
          symptomKey === 'sticky_honeydew'
            ? 0.9
            : dryResidueSymptomKey
              ? 0.85
              : 0

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: stickyTargetSymptomKey,
            value: stickyTargetSymptomKey ? 1 : 0,
            associationStrength: stickyTargetSymptomKey ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: stickyTargetSymptomKey
              ? '把“发黏/蜜露残留”作为正证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: dryResidueSymptomKey,
            value: dryResidueValue,
            associationStrength: dryResidueAssociationStrength,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: dryResidueSymptomKey
              ? symptomKey === 'sticky_honeydew'
                ? '把“没有发黏/蜜露感”作为反向证据进入诊断。'
                : '把“干灰/黑霉覆盖层”作为补充证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE) {
        return [
          {
            questionKey,
            optionKey: 'pest_trace',
            optionTextCn: optionTextByKey.pest_trace,
            optionTextUserCn: optionTextByKey.pest_trace,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'pest_trace'
            ),
            answerEffectCn: '记录“结构缺损更像虫害活动痕迹”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'lesion_dropout',
            optionTextCn: optionTextByKey.lesion_dropout,
            optionTextUserCn: optionTextByKey.lesion_dropout,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'lesion_dropout'
            ),
            answerEffectCn: '记录“结构缺损更像病斑干枯脱落”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'mechanical_old',
            optionTextCn: optionTextByKey.mechanical_old,
            optionTextUserCn: optionTextByKey.mechanical_old,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'mechanical_old'
            ),
            answerEffectCn: '记录“结构缺损更像机械/旧伤”的保守分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN) {
        return [
          {
            questionKey,
            optionKey: 'mine_line',
            optionTextCn: optionTextByKey.mine_line,
            optionTextUserCn: optionTextByKey.mine_line,
            mapsToSymptomKey: symptomKey === 'tunnels_in_leaf' ? 'tunnels_in_leaf' : '',
            value: symptomKey === 'tunnels_in_leaf' ? 1 : 0,
            associationStrength: symptomKey === 'tunnels_in_leaf' ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'mine_line'
            ),
            answerEffectCn: '记录“线状痕迹符合潜叶道形态”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'other_mark',
            optionTextCn: optionTextByKey.other_mark,
            optionTextUserCn: optionTextByKey.other_mark,
            mapsToSymptomKey: symptomKey === 'tunnels_in_leaf' ? 'tunnels_in_leaf' : '',
            value: symptomKey === 'tunnels_in_leaf' ? -1 : 0,
            associationStrength: symptomKey === 'tunnels_in_leaf' ? 0.8 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'other_mark'
            ),
            answerEffectCn: '记录“线状痕迹不符合典型潜叶道”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN) {
        return [
          {
            questionKey,
            optionKey: 'spreading_powder',
            optionTextCn: optionTextByKey.spreading_powder,
            optionTextUserCn: optionTextByKey.spreading_powder,
            mapsToSymptomKey: symptomKey === 'powder_white' ? 'powder_white' : '',
            value: symptomKey === 'powder_white' ? 1 : 0,
            associationStrength: symptomKey === 'powder_white' ? 0.75 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'spreading_powder'
            ),
            answerEffectCn: '记录“白色粉层呈扩散趋势”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'limited_static',
            optionTextCn: optionTextByKey.limited_static,
            optionTextUserCn: optionTextByKey.limited_static,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'limited_static'
            ),
            answerEffectCn: '记录“白色粉层暂未见扩散”的保守分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY) {
        const structuralChewingSymptom = isStructuralChewingSymptom({ ...symptomMeta, symptomKey })

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: structuralChewingSymptom ? symptomKey : '',
            value: structuralChewingSymptom ? 1 : 0,
            associationStrength: structuralChewingSymptom ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: structuralChewingSymptom
              ? '把“真实缺口/真洞/骨架化缺损”作为正证据加入诊断。'
              : '记录“组织真实缺损/孔洞”的补充观察。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: structuralChewingSymptom ? symptomKey : '',
            value: structuralChewingSymptom ? -1 : 0,
            associationStrength: structuralChewingSymptom ? 0.85 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: structuralChewingSymptom
              ? '把“没有真实缺口/真洞/骨架化缺损”作为反向证据加入诊断。'
              : '记录“组织完整、并无真实缺损/孔洞”的补充观察。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LESION_HALO) {
        const haloTargetSymptomKey =
          symptomKey === 'black_spots_spreading' || symptomKey === 'brown_spots_halo'
            ? 'brown_spots_halo'
            : ''

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: haloTargetSymptomKey,
            value: haloTargetSymptomKey ? 1 : 0,
            associationStrength: haloTargetSymptomKey ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: haloTargetSymptomKey
              ? '把“褐斑带黄晕”作为补充证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: haloTargetSymptomKey,
            value: haloTargetSymptomKey ? -1 : 0,
            associationStrength: haloTargetSymptomKey ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: haloTargetSymptomKey
              ? '把“缺少黄晕”作为反向证据进入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING) {
        const waterSoakedTargetSymptomKey =
          symptomKey === 'black_spots_spreading' || symptomKey === 'brown_spots_halo'
            ? 'water_soaked_spots'
            : ''

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: waterSoakedTargetSymptomKey,
            value: waterSoakedTargetSymptomKey ? 1 : 0,
            associationStrength: waterSoakedTargetSymptomKey ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: waterSoakedTargetSymptomKey
              ? '把“水渍斑/水浸边缘”作为补充证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: waterSoakedTargetSymptomKey,
            value: waterSoakedTargetSymptomKey ? -1 : 0,
            associationStrength: waterSoakedTargetSymptomKey ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: waterSoakedTargetSymptomKey
              ? '把“缺少水渍/湿软边缘”作为反向证据进入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'unknown',
            optionTextCn: optionTextByKey.unknown,
            optionTextUserCn: optionTextByKey.unknown,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: [],
            answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
            dataStatus: 'synthetic'
          }
        ]
      }

      const optionEntries = normalizeSyntheticOptionEntries(optionTexts)
      const isNonBooleanProbe =
        optionEntries.some(({ optionKey }) => !['yes', 'no', 'unknown'].includes(optionKey))
      if (isNonBooleanProbe) {
        return optionEntries.map(({ optionKey, text }) => ({
          questionKey,
          optionKey,
          optionTextCn: text,
          optionTextUserCn: text,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments:
            optionKey === 'unknown'
              ? []
              : buildSyntheticDirectProblemAdjustments(
                  { ...symptomMeta, symptomKey },
                  targetDimension,
                  optionKey
                ),
          answerEffectCn:
            optionKey === 'unknown'
              ? `暂不记录“${dimensionLabel}”维度的明确结论。`
              : `记录“${dimensionLabel}”维度的分流观察。`,
          dataStatus: 'synthetic'
        }))
      }

      return [
        {
          questionKey,
          optionKey: 'yes',
          optionTextCn: optionTextByKey.yes,
          optionTextUserCn: optionTextByKey.yes,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
            { ...symptomMeta, symptomKey },
            targetDimension,
            'yes'
          ),
          answerEffectCn: `记录“${dimensionLabel}”维度的补充观察。`,
          dataStatus: 'synthetic'
        },
        {
          questionKey,
          optionKey: 'no',
          optionTextCn: optionTextByKey.no,
          optionTextUserCn: optionTextByKey.no,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
            { ...symptomMeta, symptomKey },
            targetDimension,
            'no'
          ),
          answerEffectCn: `记录“${dimensionLabel}”维度的补充观察。`,
          dataStatus: 'synthetic'
        },
        {
          questionKey,
          optionKey: 'unknown',
          optionTextCn: optionTextByKey.unknown,
          optionTextUserCn: optionTextByKey.unknown,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments: [],
          answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
          dataStatus: 'synthetic'
        }
      ]
    }

    return []
  })
}

module.exports = {
  SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX,
  SYNTHETIC_OBSERVED_PROBE_QUESTION_PREFIX,
  buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey,
  isSyntheticVisualCandidateQuestionKey,
  buildObservedProbeQuestionGroupKey,
  buildSyntheticObservedProbeQuestionKey,
  isSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey,
  buildSyntheticObservedProbeQuestions,
  buildSyntheticFollowUpOptionMappings,
  buildTemplateVariables,
  renderQuestionTemplate
}
