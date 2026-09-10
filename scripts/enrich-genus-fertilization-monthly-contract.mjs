import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const auditPath = path.join(repoRoot, 'SQL-cvs/genus_fertilizing_monthly_audit_v1.json')
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

const SCOPE_TYPES = new Set(['indoor', 'container', 'aquatic'])
const ADJUSTMENT_MODES = new Set([
  'growth_signal',
  'frost_free_window',
  'phenology',
  'water_temperature'
])

function normalizeText(value) {
  return String(value || '')
    .replace(/[–—－]/gu, '-')
    .replace(/[至到]/gu, '-')
    .replace(/\s+/gu, '')
    .trim()
}

function toInterval(value, unit) {
  return { value: Number(value), unit }
}

function buildSchedule(
  kind,
  {
    interval = null,
    annualCount = null,
    eventCode = null,
    conditionCodes = ['none'],
    modifiers = []
  } = {}
) {
  return {
    schemaVersion: 1,
    kind,
    interval,
    annualCount,
    eventCode,
    monthHints: null,
    conditionCodes,
    modifiers
  }
}

function conditionCodes(text) {
  const codes = []
  if (/出芽后至叶片枯黄/u.test(text)) {
    codes.push('sprout_to_leaf_senescence')
  } else if (/出苗至开花/u.test(text)) {
    codes.push('emergence_to_flowering')
  } else {
    if (/新叶|新芽|新生长/u.test(text)) {
      codes.push('new_leaves_or_shoots')
    } else if (/生长/u.test(text)) {
      codes.push('active_growth')
    }
    if (/花后/u.test(text)) {
      codes.push('post_bloom')
    }
    if (/萌芽/u.test(text)) {
      codes.push('bud_break')
    }
  }
  if (/温暖季|暖季/u.test(text)) {
    codes.push('warm_season')
  }
  if (/容器/u.test(text)) {
    codes.push('container_context')
  }
  return [...new Set(codes.length ? codes : ['none'])]
}

function modifiers(text) {
  const values = []
  if (/低浓度/u.test(text)) {
    values.push('low_concentration')
  }
  if (/高钾/u.test(text)) {
    values.push('high_potassium')
  }
  if (/不与液肥叠加/u.test(text)) {
    values.push('exclusive_with_liquid')
  }
  return values
}

function parseSchedule(displayText) {
  const raw = String(displayText || '').trim()
  const text = normalizeText(raw)
  const common = { conditionCodes: conditionCodes(raw), modifiers: modifiers(raw) }

  if (/暂停/u.test(raw)) {
    return buildSchedule('pause', common)
  }
  if (/不建议与液肥叠加/u.test(raw)) {
    return buildSchedule('constraint', common)
  }
  if (/不建议|不向水体/u.test(raw)) {
    return buildSchedule('avoid', common)
  }
  if (/暂无统一属级固定间隔|未给出专属规则/u.test(raw)) {
    return buildSchedule('unspecified', common)
  }

  let match = text.match(/(?:每年|全年)(\d+)(?:-(\d+))?次/u)
  if (match) {
    return buildSchedule('annual_count', {
      ...common,
      annualCount: {
        min: Number(match[1]),
        max: Number(match[2] || match[1]),
        period: 'year'
      }
    })
  }

  if (/全年第1次/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'annual_first_application' })
  }
  if (/如萌芽期未施/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'post_bloom_if_bud_break_missed' })
  }
  if (/生长旺盛时可再施1次/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'vigorous_growth_optional_application' })
  }
  if (/定植或生长期初施1次/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'planting_or_growth_start' })
  }
  if (/生长期初施1次/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'growth_start_application' })
  }
  if (/生长期有叶时少量施用/u.test(raw)) {
    return buildSchedule('event', { ...common, eventCode: 'leaf_growth_application' })
  }

  const interval = (min, max, unit) =>
    buildSchedule('interval', {
      ...common,
      interval: {
        min: toInterval(min, unit),
        max: toInterval(max || min, unit)
      }
    })

  match = text.match(/每月(\d+)次-每(\d+)-(\d+)周1次/u)
  if (match) {
    return buildSchedule('interval', {
      ...common,
      interval: {
        min: toInterval(match[1], 'month'),
        max: toInterval(match[3], 'week')
      }
    })
  }
  match = text.match(/每(\d+)周1次-每月(\d+)次/u)
  if (match) {
    return buildSchedule('interval', {
      ...common,
      interval: {
        min: toInterval(match[1], 'week'),
        max: toInterval(match[2], 'month')
      }
    })
  }
  match = text.match(/每月(\d+)次-每(\d+)月1次/u)
  if (match) {
    return interval(match[1], match[2], 'month')
  }
  match = text.match(/每(\d+)-(\d+)周1次/u)
  if (match) {
    return interval(match[1], match[2], 'week')
  }
  match = text.match(/每(\d+)-(\d+)(?:个)?月1次/u)
  if (match) {
    return interval(match[1], match[2], 'month')
  }
  match = text.match(/每(\d+)(?:个)?月1次/u)
  if (match) {
    return interval(match[1], match[1], 'month')
  }
  match = text.match(/约(\d+)(?:个)?月1次/u)
  if (match) {
    return interval(match[1], match[1], 'month')
  }
  match = text.match(/每(\d+)周1次/u)
  if (match) {
    return interval(match[1], match[1], 'week')
  }
  if (/每周1次/u.test(raw)) {
    return interval(1, 1, 'week')
  }
  if (/每月1次/u.test(raw)) {
    return interval(1, 1, 'month')
  }
  match = text.match(/每(\d+)-(\d+)月/u)
  if (match) {
    return interval(match[1], match[2], 'month')
  }
  match = text.match(/每(\d+)月/u)
  if (match) {
    return interval(match[1], match[1], 'month')
  }

  return buildSchedule('unspecified', common)
}

function deriveScopeType(genus, entry) {
  const label = String(entry.scopeLabel || '')
  if (/水生|水边|浅水|浮水|湿地/u.test(label)) {
    return 'aquatic'
  }
  if (/室内|温室/u.test(label)) {
    return 'indoor'
  }
  if (/容器|庭院|盆栽/u.test(label)) {
    return 'container'
  }
  if (['Viola', 'Camellia', 'Rhododendron', 'Selenicereus'].includes(genus)) {
    return 'container'
  }
  if (genus === 'Hyacinthus') {
    return 'indoor'
  }
  return ''
}

function deriveAdjustmentMode(entry, scopeType) {
  if (scopeType === 'aquatic') {
    return 'water_temperature'
  }
  const text = `${entry.scopeLabel || ''} ${entry.notes || ''}`
  if (
    /花后|开花|萌芽|球根|花芽|现蕾|开花类|花卉|多年生春花|仙人掌|仙客来|朱顶红|水仙|郁金香|唐菖蒲|百合|大岩桐/u.test(
      text
    )
  ) {
    return 'phenology'
  }
  if (scopeType === 'container') {
    return 'frost_free_window'
  }
  return 'growth_signal'
}

function derivePublicNote(entry) {
  const forbidden =
    /液体肥(?:与|和)缓释肥二选一|缓释肥按|按产品标签|https?:\/\/|evidenceRef|sourceRefIds/u
  const parts = String(entry.notes || '')
    .split(/[。！？]/u)
    .map(value => value.trim())
    .filter(Boolean)
  const candidate = parts.find(value => !forbidden.test(value)) || ''
  if (!candidate) {
    return ''
  }
  return candidate.length <= 180 ? candidate : `${candidate.slice(0, 177)}…`
}

function normalizePublicGrowthCopy(entry) {
  const replace = value =>
    String(value || '')
      .replaceAll('（有生长）', '（长新叶或新芽时）')
      .replaceAll('有生长和开花时', '长新叶或新芽、并且开花时')
      .replaceAll('有生长或开花时', '长新叶或新芽或正在开花时')
      .replaceAll('有新生长的容器', '长新叶或新芽的容器')
      .replaceAll('是否有新生长为准', '是否长新叶或新芽为准')
      .replaceAll('仍有明显新生长时', '仍在长新叶或新芽时')
      .replaceAll('无明显新生长时', '没有明显新叶或新芽时')
      .replaceAll('有明显新生长时', '长新叶或新芽时')
      .replaceAll('无新生长时', '没有新叶或新芽时')
      .replaceAll('有新生长时', '长新叶或新芽时')
      .replaceAll('仍有新生长', '仍在长新叶或新芽')
      .replaceAll('仍有生长的条件', '仍在长新叶或新芽的条件')
      .replaceAll('有明显生长时', '长新叶或新芽时')
      .replaceAll('有生长时', '长新叶或新芽时')
      .replaceAll('仍有生长', '仍在长新叶或新芽')
      .replaceAll('有生长的条件', '长新叶或新芽的条件')
      .replaceAll('植株无明显生长', '植株没有明显长新叶或新芽')
      .replaceAll('植株无新生长', '植株没有新叶或新芽')
      .replaceAll('生长弱', '新叶、新芽明显变少')
      .replaceAll('生长减慢', '新叶、新芽变少')
      .replaceAll('持续生长时', '持续长新叶或新芽时')

  return {
    ...entry,
    notes: entry.notes ? replace(entry.notes) : entry.notes,
    rows: (entry.rows || []).map(row => ({
      ...row,
      ...(row.liquid?.displayText
        ? { liquid: { ...row.liquid, displayText: replace(row.liquid.displayText) } }
        : {}),
      ...(row.slowRelease?.displayText
        ? { slowRelease: { ...row.slowRelease, displayText: replace(row.slowRelease.displayText) } }
        : {})
    }))
  }
}

function enrichEntry(genus, entry) {
  if (entry.reviewStatus !== 'audited') {
    return entry
  }
  const normalizedEntry = normalizePublicGrowthCopy(entry)
  const scopeType = deriveScopeType(genus, normalizedEntry)
  const adjustmentMode = deriveAdjustmentMode(normalizedEntry, scopeType)
  if (!SCOPE_TYPES.has(scopeType) || !ADJUSTMENT_MODES.has(adjustmentMode)) {
    throw new Error(`${genus}: cannot derive an audited scope contract`)
  }
  return {
    ...normalizedEntry,
    rows: (normalizedEntry.rows || []).map(row => ({
      ...row,
      ...(row.liquid
        ? { liquid: { ...row.liquid, schedule: parseSchedule(row.liquid.displayText) } }
        : {}),
      ...(row.slowRelease
        ? {
            slowRelease: {
              ...row.slowRelease,
              schedule: parseSchedule(row.slowRelease.displayText)
            }
          }
        : {})
    })),
    scopeType,
    adjustmentMode,
    publicNote: derivePublicNote(normalizedEntry)
  }
}

const enriched = {
  ...audit,
  ruleSchemaVersion: 1,
  defaultCoverage: {
    ...audit.defaultCoverage,
    scopeType: 'unknown',
    adjustmentMode: 'none',
    publicNote: ''
  },
  overrides: Object.fromEntries(
    Object.entries(audit.overrides || {}).map(([genus, entry]) => [
      genus,
      enrichEntry(genus, entry)
    ])
  )
}

const auditedEntries = Object.values(enriched.overrides).filter(
  entry => entry.reviewStatus === 'audited'
)
const scheduleKinds = {}
let cellCount = 0
for (const entry of auditedEntries) {
  for (const row of entry.rows || []) {
    for (const type of ['liquid', 'slowRelease']) {
      const schedule = row[type]?.schedule
      if (!schedule) {
        continue
      }
      cellCount += 1
      scheduleKinds[schedule.kind] = (scheduleKinds[schedule.kind] || 0) + 1
    }
  }
}

fs.writeFileSync(auditPath, `${JSON.stringify(enriched, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      status: 'updated',
      auditPath,
      rootRuleSchemaVersion: enriched.ruleSchemaVersion,
      auditedEntries: auditedEntries.length,
      enrichedCells: cellCount,
      scheduleKinds
    },
    null,
    2
  )
)
