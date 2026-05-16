'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')
const {
  CARE_CONTEXT_OPTION_COPY,
  normalizeText
} = require('./keys')

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

function buildTemplateVariables(item = {}, _context = {}) {
  const symptomLabel = resolveNeutralSymptomLabel(item, '该异常')

  return {
    symptom_label: symptomLabel,
    watering_reference: '浇水：按最近两周的实际频率选择',
    watering_help: '不需要先判断对错，只按实际频率和盆土干湿选择。',
    watering_too_often: CARE_CONTEXT_OPTION_COPY.wateringFrequency.often_wet,
    watering_normal: CARE_CONTEXT_OPTION_COPY.wateringFrequency.normal_or_stable,
    watering_too_rare: CARE_CONTEXT_OPTION_COPY.wateringFrequency.often_dry,
    light_reference: '光照：按最近摆放位置选择全日光、散光或全阴',
    fertilization_reference: '施肥和换盆：按近 1 个月补肥、重肥或换盆换土情况选择',
    humidity_reference: '通风和空气湿度：以窗户为参照，选择靠近或远离窗户的变化'
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
    [QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE]: 'care_context'
  }
  const preferred = preferredByDimension[targetDimension]
  if (preferred && keys.has(preferred)) {return preferred}
  if (keys.has('unknown')) {return 'unknown'}
  return normalizeText(optionEntries?.[0]?.optionKey || '')
}

module.exports = {
  CARE_CONTEXT_OPTION_COPY,
  resolveNeutralSymptomLabel,
  normalizeSyntheticOptionEntries,
  renderQuestionTemplate,
  buildTemplateVariables,
  buildTemplateMap,
  buildOptionTemplateMap,
  renderDataLayerOptions,
  resolveSyntheticDefaultOptionKey
}
