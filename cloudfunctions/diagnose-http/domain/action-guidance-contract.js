'use strict'

const ACTION_CATEGORY_DEFINITIONS = Object.freeze({
  isolation_sanitation: Object.freeze({
    categoryId: 'isolation_sanitation',
    categoryNameCn: '隔离、清理与消毒'
  }),
  inspection_monitoring: Object.freeze({
    categoryId: 'inspection_monitoring',
    categoryNameCn: '检查与复查'
  }),
  pest_physical_control: Object.freeze({
    categoryId: 'pest_physical_control',
    categoryNameCn: '物理除虫'
  }),
  pest_kill_treatment: Object.freeze({
    categoryId: 'pest_kill_treatment',
    categoryNameCn: '杀虫/杀螨处理'
  }),
  disease_kill_treatment: Object.freeze({
    categoryId: 'disease_kill_treatment',
    categoryNameCn: '杀菌处理'
  }),
  water_adjustment: Object.freeze({
    categoryId: 'water_adjustment',
    categoryNameCn: '控水与补水'
  }),
  environment_adjustment: Object.freeze({
    categoryId: 'environment_adjustment',
    categoryNameCn: '光照、通风与温湿度调整'
  }),
  nutrition_adjustment: Object.freeze({
    categoryId: 'nutrition_adjustment',
    categoryNameCn: '施肥与营养调整'
  }),
  non_intervention: Object.freeze({
    categoryId: 'non_intervention',
    categoryNameCn: '保持稳定、暂不处理'
  }),
  retake_escalation: Object.freeze({
    categoryId: 'retake_escalation',
    categoryNameCn: '补拍、检查根系与升级'
  }),
  treatment_safety: Object.freeze({
    categoryId: 'treatment_safety',
    categoryNameCn: '用药注意事项'
  })
})

const ACTION_STAGE_KEYS = Object.freeze(new Set(['today', 'three_day', 'seven_day', 'avoid']))

const ACTION_METHOD_IDS = Object.freeze(
  new Set([
    'inspection',
    'monitoring',
    'isolation',
    'sanitation',
    'rinse',
    'wipe',
    'remove',
    'sticky_trap',
    'foliar_spray',
    'soil_drench',
    'soil_adjustment',
    'water_adjustment',
    'light_adjustment',
    'airflow_adjustment',
    'humidity_adjustment',
    'nutrition_adjustment',
    'retake',
    'escalate',
    'avoid_unconfirmed_treatment',
    'avoid_mixing_products',
    'avoid_stress'
  ])
)

const ACTION_GUIDANCE_SOURCE_CATALOG = Object.freeze({
  'ucipm-houseplant-problems': Object.freeze({
    institutionCn: '加州大学综合病虫害管理项目（UC IPM）',
    titleCn: '室内植物问题',
    url: 'https://ipm.ucanr.edu/home-and-landscape/houseplant-problems/',
    evidenceCn: '正确识别、隔离、清洗和按室内植物标签处理；避免未经确认的广谱或长残效处理。',
    checkedOn: '2026-09-13'
  }),
  'umn-spider-mites': Object.freeze({
    institutionCn: '明尼苏达大学推广部门',
    titleCn: '二斑叶螨（红蜘蛛）',
    url: 'https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-insects/spider-mites',
    evidenceCn: '检查叶背和细网；可冲洗叶背；按标签复查，避免自配肥皂水和伤害天敌的长效广谱处理。',
    checkedOn: '2026-09-13'
  }),
  'csu-houseplant-pests-2025': Object.freeze({
    institutionCn: '科罗拉多州立大学推广部门',
    titleCn: '室内植物害虫管理',
    url: 'https://extension.colostate.edu/resource/managing-houseplant-pests/',
    evidenceCn:
      '覆盖粉蚧、介壳虫、蓟马和蕈蚊；粘虫板用于监测和减少成虫，不能代替针对虫体或幼虫的处理。',
    checkedOn: '2026-09-13'
  }),
  'ucipm-powdery-mildew': Object.freeze({
    institutionCn: '加州大学综合病虫害管理项目（UC IPM）',
    titleCn: '观赏植物白粉病',
    url: 'https://ipm.ucanr.edu/home-and-landscape/powdery-mildew-on-ornamentals/',
    evidenceCn: '先改善光照、通风和环境条件；必要时选择标签适用的杀菌处理，并注意药害风险。',
    checkedOn: '2026-09-13'
  }),
  'ucipm-sooty-mold-2020': Object.freeze({
    institutionCn: '加州大学综合病虫害管理项目（UC IPM）',
    titleCn: '煤污病 Pest Notes',
    url: 'https://ipm.ucanr.edu/legacy_assets/pdf/pestnotes/pnsootymold.pdf',
    evidenceCn: '先找出产生蜜露的刺吸式害虫并处理，再清洗煤污霉层；不把清洗霉层等同于直接杀菌。',
    checkedOn: '2026-09-13'
  }),
  'ucipm-leafminers': Object.freeze({
    institutionCn: '加州大学综合病虫害管理项目（UC IPM）',
    titleCn: '潜叶蝇和潜叶害虫管理',
    url: 'https://ipm.ucanr.edu/agriculture/floriculture-and-ornamental-nurseries/leafminers/',
    evidenceCn:
      '移除受害叶片并监测成虫；叶片内部幼虫不能靠粘虫板解决，药剂需按植物和害虫标签执行。',
    checkedOn: '2026-09-13'
  }),
  'umd-overwatered-indoor-plants': Object.freeze({
    institutionCn: '马里兰大学推广部门',
    titleCn: '室内植物浇水过多',
    url: 'https://www.extension.umd.edu/resource/overwatered-indoor-plants',
    evidenceCn: '检查盆土、排水和根部状态；盆土长期潮湿时先停止继续加水并改善排水。',
    checkedOn: '2026-09-13'
  }),
  'umd-indoor-diagnose-2025': Object.freeze({
    institutionCn: '马里兰大学推广部门',
    titleCn: '室内植物问题诊断',
    url: 'https://extension.umd.edu/resource/diagnose-indoor-plant-problems',
    evidenceCn: '结合症状分布、光照、浇水、空气和近期养护变化排查，不凭单一症状直接下结论。',
    checkedOn: '2026-09-13'
  }),
  'rhs-houseplant-leaf-damage': Object.freeze({
    institutionCn: '英国皇家园艺学会（RHS）',
    titleCn: '室内植物叶片损伤',
    url: 'https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants',
    evidenceCn: '区分旧伤、强光和环境损伤；先稳定环境，避免为了旧伤反复加水、加肥或用药。',
    checkedOn: '2026-09-13'
  }),
  'psu-houseplant-disease': Object.freeze({
    institutionCn: '宾夕法尼亚州立大学推广部门',
    titleCn: '室内植物病虫害问题',
    url: 'https://extension.psu.edu/pest-and-disease-problems-of-indoor-plants',
    evidenceCn: '用于室内植物病虫害识别、隔离和处理边界的交叉核对。',
    checkedOn: '2026-09-13'
  })
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function normalizeSourceRefIds(value = []) {
  const parsed = parseJsonValue(value, value)
  const source = Array.isArray(parsed) ? parsed : [parsed]
  return Array.from(new Set(source.map(normalizeText).filter(Boolean)))
}

function normalizeActionItem(item = {}, { profileKey = '', index = 0 } = {}) {
  const source = item && typeof item === 'object' ? item : {}
  const id = normalizeText(source.id || source.actionId || source.action_id)
  const categoryId = normalizeText(source.categoryId || source.category_id)
  const stage = normalizeText(source.stage)
  const methodId = normalizeText(source.methodId || source.method_id)
  const text = normalizeText(source.text || source.textCn || source.text_cn)
  const sourceRefIds = normalizeSourceRefIds(source.sourceRefIds || source.source_ref_ids)
  const errors = []

  if (!id) {
    errors.push('missing_id')
  }
  if (!Object.prototype.hasOwnProperty.call(ACTION_CATEGORY_DEFINITIONS, categoryId)) {
    errors.push('invalid_category_id')
  }
  if (!ACTION_STAGE_KEYS.has(stage)) {
    errors.push('invalid_stage')
  }
  if (!ACTION_METHOD_IDS.has(methodId)) {
    errors.push('invalid_method_id')
  }
  if (!text) {
    errors.push('missing_text')
  }
  if (!sourceRefIds.length) {
    errors.push('missing_source_ref_ids')
  }
  for (const sourceRefId of sourceRefIds) {
    if (!Object.prototype.hasOwnProperty.call(ACTION_GUIDANCE_SOURCE_CATALOG, sourceRefId)) {
      errors.push(`unknown_source_ref:${sourceRefId}`)
    }
  }

  const category = ACTION_CATEGORY_DEFINITIONS[categoryId]
  const normalized = {
    id,
    categoryId,
    categoryNameCn: category?.categoryNameCn || normalizeText(source.categoryNameCn),
    stage,
    methodId,
    text,
    sourceRefIds,
    ...(normalizeText(source.conditionCn || source.condition_cn)
      ? { conditionCn: normalizeText(source.conditionCn || source.condition_cn) }
      : {})
  }

  return {
    valid: errors.length === 0,
    errors,
    item: normalized,
    profileKey,
    index
  }
}

function normalizeActionItems(value = [], { profileKey = '' } = {}) {
  const parsed = parseJsonValue(value, [])
  const source = Array.isArray(parsed) ? parsed : []
  const seenIds = new Set()
  const results = source.map((item, index) => {
    const result = normalizeActionItem(item, { profileKey, index })
    if (result.item.id && seenIds.has(result.item.id)) {
      result.valid = false
      result.errors.push('duplicate_id')
    }
    if (result.item.id) {
      seenIds.add(result.item.id)
    }
    return result
  })
  return {
    items: results.filter(result => result.valid).map(result => result.item),
    errors: results.flatMap(result =>
      result.errors.map(error => ({
        profileKey,
        index: result.index,
        error
      }))
    ),
    sourceItemCount: source.length
  }
}

function deriveActionTextFields(actionItems = [], legacy = {}) {
  const byStage = {
    today: [],
    three_day: [],
    seven_day: [],
    avoid: []
  }
  for (const item of Array.isArray(actionItems) ? actionItems : []) {
    if (Array.isArray(byStage[item.stage])) {
      byStage[item.stage].push(item.text)
    }
  }
  return {
    todayActions: byStage.today.length ? byStage.today : legacy.todayActions || [],
    threeDayActions: byStage.three_day.length ? byStage.three_day : legacy.threeDayActions || [],
    sevenDayObserve: byStage.seven_day.length ? byStage.seven_day : legacy.sevenDayObserve || [],
    avoidActions: byStage.avoid.length ? byStage.avoid : legacy.avoidActions || [],
    retakeOrEscalate: legacy.retakeOrEscalate || []
  }
}

function normalizeActionProfile(profile = {}) {
  const source = profile && typeof profile === 'object' ? profile : {}
  const profileKey = normalizeText(source.actionProfileKey || source.action_profile_key)
  const structured = normalizeActionItems(source.actionItems || source.action_items_json || [], {
    profileKey
  })
  const textFields = deriveActionTextFields(structured.items, {
    todayActions: source.todayActions,
    threeDayActions: source.threeDayActions,
    sevenDayObserve: source.sevenDayObserve,
    avoidActions: source.avoidActions,
    retakeOrEscalate: source.retakeOrEscalate
  })
  return {
    ...source,
    actionProfileKey: profileKey,
    ...textFields,
    actionItems: structured.items,
    actionItemsValidationErrors: structured.errors,
    hasStructuredActionItems: structured.sourceItemCount > 0 && structured.errors.length === 0
  }
}

function groupActionItemsByStage(actionItems = []) {
  const groups = {
    today: [],
    three_day: [],
    seven_day: [],
    avoid: []
  }
  for (const item of Array.isArray(actionItems) ? actionItems : []) {
    if (Array.isArray(groups[item.stage])) {
      groups[item.stage].push(item)
    }
  }
  return groups
}

module.exports = {
  ACTION_CATEGORY_DEFINITIONS,
  ACTION_STAGE_KEYS,
  ACTION_METHOD_IDS,
  ACTION_GUIDANCE_SOURCE_CATALOG,
  normalizeActionItem,
  normalizeActionItems,
  normalizeActionProfile,
  deriveActionTextFields,
  groupActionItemsByStage
}
