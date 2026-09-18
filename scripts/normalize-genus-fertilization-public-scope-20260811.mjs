#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const auditPath = path.join(repoRoot, 'SQL-cvs/genus_fertilizing_monthly_audit_v1.json')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

const PHENOLOGY_GENERA = new Set([
  'Schlumbergera',
  'Cyclamen',
  'Hippeastrum',
  'Phalaenopsis',
  'Clivia',
  'Zantedeschia',
  'Pelargonium',
  'Kalanchoe',
  'Fuchsia',
  'Gerbera',
  'Caladium',
  'Canna',
  'Rosa',
  'Zinnia',
  'Viola',
  'Camellia',
  'Rhododendron',
  'Hyacinthus',
  'Allium',
  'Crocus',
  'Gladiolus',
  'Lilium',
  'Narcissus',
  'Tulipa',
  'Sinningia'
])

const AQUATIC_PATTERN = /水生|水边|浅水|湿地|浮水/u
const CONTAINER_PATTERN = /容器|庭院|露地|温暖季|温带庭院|温暖容器|地栽/u
const PHENOLOGY_PATTERN = /花后|花芽|开花|球根|休眠|春花|秋冬季|年度生长周期|花期|生长期节点/u

// Only reminders that change how a user should read or apply the table are
// promoted to the UI. The full notes field remains in the audit record.
const PUBLIC_NOTES = {
  Schlumbergera:
    '它是附生仙人掌；入秋形成花芽时优先低氮肥，不按旱生仙人掌的停肥方式处理。',
  Aloe: '多肉植物施肥宁少勿多；盆土未干或植株虚弱时不要施肥。',
  Begonia: '秋海棠组别差异较大，本表按常见室内 Rex/纤维根类整理。',
  Spathiphyllum: '叶尖焦枯时先检查盐分和环境，不要盲目加肥。',
  Hoya: '缓释肥采用低频方案：生长期最多每 6 个月 1 次；冬季或不长新叶或新芽时暂停。',
  Hibiscus: '户外高温强生长期可能需要更频繁，本表不要直接套用。',
  Phalaenopsis: '使用树皮基质时需定期用清水冲洗盐分。',
  Zantedeschia: '不同品种的休眠时间可能不同，月份请按植株实际状态顺延或提前。',
  Petunia: '蔓生型或高温强生长时按实际状态调整，不要同时叠加两种肥料。',
  Cucumis: '本表不适用于地栽或水培营养液配方。',
  Asparagus: '这里不适用于露地食用芦笋的施肥方案。',
  Mentha: '薄荷容易旺长，过量施肥会降低香味表现。',
  Coriandrum: '香菜生命周期短，施肥应服务于当前叶片生长，不要因追求频率而过量。',
  Tillandsia: '空气凤梨只能使用稀释的液体叶面或浸泡肥；不要把普通盆栽缓释颗粒放在叶基。',
  Lithops: '夏季休眠时暂停；不要把个别物种的高频方案扩展到整个属。',
  Kalanchoe: '不同长寿花品种和复花管理差异较大，月份请按实际生长和开花状态调整。',
  Bougainvillea: '仅适用于有充足光照且持续生长的容器植株；低光室内或冷季停肥。',
  Adiantum: '建议使用约四分之一浓度，避免过量。',
  Caladium: '肥料不要落在叶片上。',
  Rosa: '地栽玫瑰通常不需要按本表频繁施肥。',
  Viola: '凉爽地区可适当延长生长期，炎热地区则可能提前停肥。',
  Hyacinthus: '本表只适用于多年生栽培；强制盆花不套用，萌芽时和花后不要重复施肥。',
  Allium: '观赏葱属通常不需常规追加，不要把通用容器频率套用到整个属。',
  Crocus: '地栽普通番红花通常不需要追肥，缓释肥不要与液体肥叠加。',
  Camellia: '按花后节点施肥；花期晚的植株顺延到花后，7 月底后不再追加。',
  Gardenia: '本表只适用于高光、温暖且持续生长的容器植株；低光室内或冷季停肥。',
  Euphorbia: 'Euphorbia 属内差异很大，本表只适用于室内多肉型大戟。',
  Selenicereus: '本表只覆盖温暖季、持续生长的攀援或附生型盆栽，不覆盖冬型或休眠型类型。',
  Solanum: 'Solanum 属内差异很大，本表只覆盖容器番茄、茄子等长季果菜，不代表马铃薯等全部类型。',
  Tropaeolum: '旱金莲通常不需要高肥；叶片旺长或花少时不要继续加氮。',
  Cestrum: '属内种类和温度需求差异很大，本表只覆盖温暖季容器木本。',
  Lonicera: '本表只覆盖幼株或容器忍冬，不含成熟地栽植株。',
  Nymphaea: '本表不提供液体肥入水规则。',
  Perilla: '本表只覆盖温暖季容器叶用香草，不覆盖种子或油用生产。'
}

const GUIDANCE_MODES = [
  'indoor_growth_signal',
  'indoor_phenology',
  'container_frost_free_window',
  'container_phenology',
  'aquatic_water_temperature'
]

const FERTILIZATION_RULE_SCHEMA_VERSION = 1

function normalizeIntervalUnit(unit) {
  if (unit === '天') {
    return 'day'
  }
  if (unit === '周') {
    return 'week'
  }
  if (unit === '月' || unit === '个月') {
    return 'month'
  }
  if (unit === '季') {
    return 'quarter'
  }
  return unit
}

function parseInterval(displayText) {
  const endpoints = []
  const pattern = /(?:(\d+)(?:\s*[–-]\s*(\d+))?\s*(天|周|个?月|季)|每(天|周|月|季))/gu
  for (const match of displayText.matchAll(pattern)) {
    const explicitValue = match[1]
    const explicitMax = match[2]
    const explicitUnit = match[3]
    const implicitUnit = match[4]
    const unit = normalizeIntervalUnit(explicitUnit || implicitUnit)
    const min = explicitValue ? Number(explicitValue) : 1
    const max = explicitMax ? Number(explicitMax) : min
    endpoints.push({ min, max, unit })
  }

  if (!endpoints.length) {
    return null
  }

  const first = endpoints[0]
  const last = endpoints[endpoints.length - 1]
  return {
    min: { value: first.min, unit: first.unit },
    max: { value: last.max, unit: last.unit }
  }
}

function parseAnnualCount(displayText) {
  const annualRange = displayText.match(/(?:每年|全年)\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*次/u)
  if (annualRange) {
    return {
      min: Number(annualRange[1]),
      max: Number(annualRange[2] || annualRange[1]),
      period: 'year',
      occurrenceIndex: null
    }
  }

  const annualOccurrence = displayText.match(/全年第(\d+)次/u)
  if (annualOccurrence) {
    const occurrenceIndex = Number(annualOccurrence[1])
    return {
      min: 1,
      max: 1,
      period: 'year',
      occurrenceIndex
    }
  }

  return null
}

function parseMonthHints(displayText) {
  const match = displayText.match(/(\d{1,2}(?:\s*[、,]\s*\d{1,2})+)\s*月/u)
  if (!match) {
    return null
  }

  return match[1]
    .split(/[、,]/u)
    .map(value => Number(value.trim()))
    .filter(month => Number.isInteger(month) && month >= 1 && month <= 12)
}

function parseConditionCodes(displayText) {
  const conditionCodes = []
  const add = (pattern, code) => {
    if (pattern.test(displayText) && !conditionCodes.includes(code)) {
      conditionCodes.push(code)
    }
  }

  add(/长新叶或新芽/u, 'new_leaves_or_shoots')
  add(/生长期|温暖生长期|生长旺盛|生长期初|生长初/u, 'active_growth')
  add(/出芽后至叶片枯黄/u, 'sprout_to_leaf_senescence')
  add(/出苗至开花/u, 'emergence_to_flowering')
  add(/萌芽/u, 'bud_break')
  add(/花后/u, 'post_bloom')
  add(/休眠/u, 'dormancy')
  add(/低温/u, 'low_temperature')
  add(/没有新叶或新芽/u, 'no_new_leaves_or_shoots')
  add(/温暖季/u, 'warm_season')
  add(/容器|盆栽|专类容器/u, 'container_context')
  add(/水体|水培/u, 'aquatic_context')

  return conditionCodes.length ? conditionCodes : ['none']
}

function parseModifiers(displayText) {
  const modifiers = []
  const add = (pattern, code) => {
    if (pattern.test(displayText) && !modifiers.includes(code)) {
      modifiers.push(code)
    }
  }

  add(/低浓度/u, 'low_concentration')
  add(/低氮/u, 'low_nitrogen')
  add(/高钾/u, 'high_potassium')
  add(/少量/u, 'light_application')
  add(/勿与液肥叠加|不与液肥叠加/u, 'exclusive_with_liquid')
  add(/根部/u, 'root_application')
  add(/不向水体|水培不加入/u, 'no_water_application')
  add(/仅盆栽|专类容器/u, 'container_only')
  add(/肥沃基质|已有缓释肥|检查水体养分/u, 'check_existing_nutrients')

  return modifiers
}

function buildFertilizationSchedule(displayText) {
  const text = String(displayText || '').trim()
  const schedule = {
    schemaVersion: FERTILIZATION_RULE_SCHEMA_VERSION,
    kind: 'unspecified',
    interval: null,
    annualCount: null,
    eventCode: null,
    monthHints: parseMonthHints(text),
    conditionCodes: parseConditionCodes(text),
    modifiers: parseModifiers(text)
  }

  if (!text || /未给出专属规则/u.test(text)) {
    return schedule
  }
  if (/不建议与液肥叠加/u.test(text)) {
    schedule.kind = 'constraint'
    return schedule
  }
  if (/不向水体加入液体肥|不建议(?:常规追加|追加|额外追加)/u.test(text)) {
    schedule.kind = 'avoid'
    return schedule
  }
  if (/暂停(?:施肥|追加)?(?:$|[；，。])/u.test(text)) {
    schedule.kind = 'pause'
    return schedule
  }

  const annualCount = parseAnnualCount(text)
  if (annualCount) {
    schedule.kind = 'annual_count'
    schedule.annualCount = annualCount
    if (/萌芽时或花后/u.test(text)) {
      schedule.eventCode = 'bud_break_or_post_bloom'
    }
    return schedule
  }

  if (/如萌芽期未施，花后补1次/u.test(text)) {
    schedule.kind = 'event'
    schedule.eventCode = 'post_bloom_if_missed'
    return schedule
  }
  if (/定植或生长期初施1次/u.test(text)) {
    schedule.kind = 'event'
    schedule.eventCode = 'planting_or_growth_start'
    return schedule
  }
  if (/生长期初施1次/u.test(text)) {
    schedule.kind = 'event'
    schedule.eventCode = 'growth_start'
    return schedule
  }
  if (/生长旺盛时可再施1次/u.test(text)) {
    schedule.kind = 'event'
    schedule.eventCode = 'optional_vigorous_growth_extra'
    return schedule
  }
  if (/生长期有叶时少量施用/u.test(text)) {
    schedule.kind = 'conditional'
    schedule.eventCode = 'active_growth_with_leaves'
    return schedule
  }

  const interval = parseInterval(text)
  if (interval) {
    schedule.kind = 'interval'
    schedule.interval = interval
    return schedule
  }

  throw new Error(`Cannot normalize fertilization schedule: ${text}`)
}

function normalizeMonthlySchedules(entry) {
  if (!Array.isArray(entry.rows)) {
    return 0
  }

  let normalizedCount = 0
  for (const row of entry.rows) {
    for (const fertilizerType of ['liquid', 'slowRelease']) {
      const cell = row[fertilizerType]
      if (!cell?.displayText) {
        continue
      }
      cell.schedule = buildFertilizationSchedule(cell.displayText)
      normalizedCount += 1
    }
  }
  return normalizedCount
}

function classifyScope(genus, entry) {
  const label = String(entry.scopeLabel || '')
  const notes = String(entry.notes || '')
  const context = `${label} ${notes}`
  if (AQUATIC_PATTERN.test(label) || AQUATIC_PATTERN.test(notes)) {
    return { scopeType: 'aquatic', adjustmentMode: 'water_temperature' }
  }

  // The reviewed scope label is authoritative. Notes often mention a
  // container slow-release reference even when the user-facing scope is
  // indoor, so notes must not override the label.
  const scopeType = /室内|温室/u.test(label)
    ? 'indoor'
    : CONTAINER_PATTERN.test(label)
      ? 'container'
      : CONTAINER_PATTERN.test(context)
        ? 'container'
        : 'indoor'
  const phenology = PHENOLOGY_GENERA.has(genus) || PHENOLOGY_PATTERN.test(context)
  if (scopeType === 'container') {
    return {
      scopeType,
      adjustmentMode: phenology ? 'phenology' : 'frost_free_window'
    }
  }
  return {
    scopeType,
    adjustmentMode: phenology ? 'phenology' : 'growth_signal'
  }
}

const counts = {
  audited: 0,
  nonAudited: 0,
  scopeTypes: {},
  adjustmentModes: {},
  publicNotes: 0,
  normalizedCells: 0,
  ruleKinds: {}
}

audit.ruleSchemaVersion = FERTILIZATION_RULE_SCHEMA_VERSION

for (const [genus, entry] of Object.entries(audit.overrides || {})) {
  if (entry.reviewStatus !== 'audited') {
    counts.nonAudited += 1
    entry.scopeType = 'unknown'
    entry.adjustmentMode = 'none'
    entry.publicNote = ''
    continue
  }

  const classification = classifyScope(genus, entry)
  const publicNote = PUBLIC_NOTES[genus] || ''
  entry.ruleSchemaVersion = FERTILIZATION_RULE_SCHEMA_VERSION
  entry.scopeType = classification.scopeType
  entry.adjustmentMode = classification.adjustmentMode
  entry.publicNote = publicNote
  counts.normalizedCells += normalizeMonthlySchedules(entry)
  for (const row of entry.rows || []) {
    for (const fertilizerType of ['liquid', 'slowRelease']) {
      const kind = row[fertilizerType]?.schedule?.kind
      if (kind) {
        counts.ruleKinds[kind] = (counts.ruleKinds[kind] || 0) + 1
      }
    }
  }

  counts.audited += 1
  counts.scopeTypes[classification.scopeType] = (counts.scopeTypes[classification.scopeType] || 0) + 1
  counts.adjustmentModes[classification.adjustmentMode] =
    (counts.adjustmentModes[classification.adjustmentMode] || 0) + 1
  if (publicNote) {
    counts.publicNotes += 1
  }
}

if (audit.defaultCoverage) {
  audit.defaultCoverage.scopeType = 'unknown'
  audit.defaultCoverage.adjustmentMode = 'none'
  audit.defaultCoverage.publicNote = ''
}

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`)

console.log(JSON.stringify({ status: 'updated', ...counts, guidanceKeys: GUIDANCE_MODES }, null, 2))
