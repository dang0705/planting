import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { validateGenusFertilizationMonthlyRuntimeBatch } from './lib/genus-fertilization-monthly-runtime-batch.mjs'

const repoRoot = process.cwd()
const require = createRequire(import.meta.url)
const auditPath = path.join(repoRoot, 'SQL-cvs/genus_fertilizing_monthly_audit_v1.json')
const csvPath = path.join(repoRoot, 'docs/genus_care_profile.csv')
const v5SqlPath = path.join(
  repoRoot,
  'SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql'
)

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))
const csvWorkbook = XLSX.readFile(csvPath, { raw: true })
const csvRows = XLSX.utils.sheet_to_json(csvWorkbook.Sheets[csvWorkbook.SheetNames[0]], {
  header: [
    'genus_name',
    'family_name',
    'plant_category',
    'watering_strategy_json',
    'fertilizing_strategy_json',
    'light_strategy_json',
    'airflow_strategy_json',
    'temp_min_c',
    'temp_max_c',
    'humidity_min',
    'humidity_max',
    'toxicity_level',
    'review_status',
    'source_evidence',
    'baseline_note',
    'evidence_level',
    'evidence_strategy',
    'reserved_field',
    'created_at',
    'updated_at'
  ],
  raw: true,
  defval: null
})

function splitSqlRow(line) {
  const fields = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === "'" && quoted && next === "'") {
      current += "''"
      index += 1
      continue
    }
    if (char === "'") {
      quoted = !quoted
    }
    if (char === ',' && !quoted) {
      fields.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  fields.push(current.trim())
  return fields
}

function decodeSqlValue(value) {
  const normalized = String(value || '').trim()
  if (normalized.startsWith("'") && normalized.endsWith("'")) {
    return normalized.slice(1, -1).replaceAll("''", "'")
  }
  return normalized
}

const monthlyIntervalPattern =
  /每(?:隔)?\s*[0-9一二三四五六七八九十]+(?:\s*[–-]\s*[0-9一二三四五六七八九十]+)?\s*(?:天|周|个?月|季|年)(?:\s*[0-9一二三四五六七八九十]+\s*次)?|每月|每周|每季|每年(?:\s*[0-9一二三四五六七八九十]+(?:\s*[–-]\s*[0-9一二三四五六七八九十]+)?\s*次)?|全年\s*[0-9一二三四五六七八九十]+(?:\s*[–-]\s*[0-9一二三四五六七八九十]+)?\s*次|约\s*[0-9一二三四五六七八九十]+(?:\s*[–-]\s*[0-9一二三四五六七八九十]+)?\s*个月(?:\s*[0-9一二三四五六七八九十]+\s*次)?|[0-9一二三四五六七八九十]+\s*[–-]\s*[0-9一二三四五六七八九十]+\s*个月(?:有效|后复核)/u
const monthlyLabelPattern = /产品标签|按标签/u
const ambiguousGrowthCopyPattern = /有(?:明显)?(?:新)?生长|仍有生长/u
const publicNoteBoilerplatePattern =
  /液体肥(?:与|和)缓释肥二选一|缓释肥按|按产品标签|https?:\/\/|evidenceRef|sourceRefIds/u
const scopeAdjustmentPairs = new Set([
  'indoor_growth_signal',
  'indoor_phenology',
  'container_frost_free_window',
  'container_phenology',
  'aquatic_water_temperature'
])
const monthlyRuleSchemaVersion = 1
const scheduleKinds = new Set([
  'interval',
  'annual_count',
  'event',
  'conditional',
  'pause',
  'avoid',
  'constraint',
  'unspecified'
])
const intervalUnits = new Set(['day', 'week', 'month', 'quarter'])

function classifyPublicMonthlyRule(displayText) {
  const text = String(displayText || '').trim()
  if (monthlyLabelPattern.test(text)) {
    return 'product_dependent'
  }
  if (/暂无统一属级固定间隔/u.test(text)) {
    return 'no_uniform_interval'
  }
  if (monthlyIntervalPattern.test(text)) {
    return 'explicit_interval'
  }
  if (
    /^(?:暂停(?:施肥|追加)(?:$|[；，。])|低温[^；，。]*暂停(?:$|[；，。])|休眠[^；，。]*暂停(?:$|[；，。])|不向[^；，。]*(?:加入|使用).*$|不建议(?:施肥|追加|常规追加|额外追加).*|未给出专属规则)/u.test(
      text
    )
  ) {
    return 'explicit_no_fertilization_status'
  }
  return 'non_interval'
}

function readV5BaseIntervals() {
  const rows = new Map()
  for (const line of fs.readFileSync(v5SqlPath, 'utf8').split('\n')) {
    if (!line.trimStart().startsWith("('genus_care_")) {
      continue
    }
    const fields = splitSqlRow(line)
    const genus = decodeSqlValue(fields[2])
    const fertilizing = JSON.parse(decodeSqlValue(fields[10]))
    rows.set(genus, fertilizing?.freq || [])
  }
  return rows
}

function assertSourceRefs(entry, genus) {
  const sourceRefs = Array.isArray(entry.sourceRefs) ? entry.sourceRefs : []
  const sourceIds = new Set()
  for (const source of sourceRefs) {
    assert.ok(source?.id, `${genus}: source id is required`)
    assert.ok(!sourceIds.has(source.id), `${genus}: duplicate source id ${source.id}`)
    assert.ok(source.name, `${genus}: source name is required`)
    assert.ok(source.url, `${genus}: source url is required for internal audit`)
    assert.ok(source.evidenceRef, `${genus}: evidenceRef is required for internal audit`)
    sourceIds.add(source.id)
  }
  return sourceIds
}

function assertSchedule(schedule, label) {
  assert.ok(schedule, `${label}: schedule is required`)
  assert.equal(
    schedule.schemaVersion,
    monthlyRuleSchemaVersion,
    `${label}: unsupported schedule schema version`
  )
  assert.ok(scheduleKinds.has(schedule.kind), `${label}: unsupported schedule kind`)
  assert.ok(Array.isArray(schedule.conditionCodes), `${label}: conditionCodes must be an array`)
  assert.ok(Array.isArray(schedule.modifiers), `${label}: modifiers must be an array`)
  if (schedule.kind === 'interval') {
    assert.ok(schedule.interval, `${label}: interval rule requires interval data`)
  }
  if (schedule.kind === 'annual_count') {
    assert.ok(schedule.annualCount, `${label}: annual_count rule requires annualCount data`)
  }

  if (schedule.interval) {
    for (const endpoint of [schedule.interval.min, schedule.interval.max]) {
      assert.ok(endpoint, `${label}: interval endpoint is required`)
      assert.ok(Number.isInteger(endpoint.value), `${label}: interval value must be an integer`)
      assert.ok(endpoint.value > 0, `${label}: interval value must be positive`)
      assert.ok(intervalUnits.has(endpoint.unit), `${label}: unsupported interval unit`)
    }
  }

  if (schedule.annualCount) {
    assert.ok(Number.isInteger(schedule.annualCount.min), `${label}: annual min must be an integer`)
    assert.ok(Number.isInteger(schedule.annualCount.max), `${label}: annual max must be an integer`)
    assert.ok(schedule.annualCount.min > 0, `${label}: annual min must be positive`)
    assert.ok(
      schedule.annualCount.max >= schedule.annualCount.min,
      `${label}: invalid annual range`
    )
    assert.equal(schedule.annualCount.period, 'year', `${label}: annual period must be year`)
  }

  if (['event', 'conditional'].includes(schedule.kind)) {
    assert.ok(schedule.eventCode, `${label}: eventCode is required for event rules`)
  }
  if (schedule.monthHints) {
    assert.ok(Array.isArray(schedule.monthHints), `${label}: monthHints must be an array`)
    assert.ok(
      schedule.monthHints.every(month => Number.isInteger(month) && month >= 1 && month <= 12),
      `${label}: monthHints must contain valid months`
    )
  }
}

function assertRows(entry, genus, sourceIds) {
  assert.equal(entry.rows.length, 12, `${genus}: audited monthly schedule must cover 12 months`)
  const months = new Set()
  for (const row of entry.rows) {
    assert.ok(Number.isInteger(row.month), `${genus}: month must be an integer`)
    assert.ok(row.month >= 1 && row.month <= 12, `${genus}: invalid month ${row.month}`)
    assert.ok(!months.has(row.month), `${genus}: duplicate month ${row.month}`)
    months.add(row.month)

    for (const fertilizerType of ['liquid', 'slowRelease']) {
      const cell = row[fertilizerType]
      if (!cell) {
        continue
      }
      assert.ok(
        cell.displayText,
        `${genus}/${row.month}/${fertilizerType}: displayText is required`
      )
      assertSchedule(cell.schedule, `${genus}/${row.month}/${fertilizerType}`)
      assert.ok(
        !monthlyLabelPattern.test(cell.displayText),
        `${genus}/${row.month}/${fertilizerType}: product-label text must not be stored as a public cell rule`
      )
      assert.ok(
        !ambiguousGrowthCopyPattern.test(cell.displayText),
        `${genus}/${row.month}/${fertilizerType}: public copy must describe observable new leaves or shoots`
      )
      assert.ok(
        Array.isArray(cell.sourceRefIds) && cell.sourceRefIds.length,
        `${genus}/${row.month}/${fertilizerType}: sourceRefIds are required`
      )
      for (const sourceId of cell.sourceRefIds) {
        assert.ok(
          sourceIds.has(sourceId),
          `${genus}/${row.month}/${fertilizerType}: unknown source ${sourceId}`
        )
      }
    }
  }
  assert.equal(months.size, 12, `${genus}: every month must be represented exactly once`)
}

function readCsvBaseIntervals(rows) {
  return new Map(
    rows.map(row => {
      const fertilizing = JSON.parse(row.fertilizing_strategy_json)
      return [row.genus_name, fertilizing?.freq || []]
    })
  )
}

assert.ok(audit.defaultCoverage, 'defaultCoverage is required')
assert.equal(
  audit.ruleSchemaVersion,
  monthlyRuleSchemaVersion,
  'monthly rule schema version must be declared'
)
assert.ok(
  audit.defaultCoverage.reviewStatus === 'unsupported',
  'default coverage must be unsupported'
)
assert.equal(
  audit.defaultCoverage.scopeType,
  'unknown',
  'default coverage scopeType must be unknown'
)
assert.equal(
  audit.defaultCoverage.adjustmentMode,
  'none',
  'default coverage adjustmentMode must be none'
)
assert.equal(audit.defaultCoverage.publicNote, '', 'default coverage publicNote must be empty')
assert.equal(csvRows.length, 152, 'current genus CSV must contain 152 records')
assert.equal(
  new Set(csvRows.map(row => row.genus_name)).size,
  152,
  'genus CSV must have unique genus names'
)

const genera = new Set(csvRows.map(row => row.genus_name))
const v5Intervals = readV5BaseIntervals()
const csvBaseIntervals = readCsvBaseIntervals(csvRows)
assert.equal(v5Intervals.size, 152, 'v5 SQL must contain 152 records')
assert.ok(fs.readFileSync(v5SqlPath, 'utf8').includes('fertilizing_monthly_strategy_json'))

const csvIntervalMismatches = csvRows.filter(row => {
  const csvFertilizing = JSON.parse(row.fertilizing_strategy_json)
  return (
    JSON.stringify(csvFertilizing?.freq || []) !== JSON.stringify(v5Intervals.get(row.genus_name))
  )
})
const genusCareTable = require('../src/data-system/config/tables.js').TABLE_CONFIG_MAP
  .genus_care_profiles
const mappedMonstera = genusCareTable.rowMapper(csvRows.find(row => row.genus_name === 'Monstera'))
assert.equal(
  mappedMonstera.fertilizing_monthly_strategy_json.reviewStatus,
  'audited',
  'genus care importer must attach the audited monthly sidecar'
)
assert.ok(
  genusCareTable.jsonColumns.includes('fertilizing_monthly_strategy_json'),
  'genus care importer must serialize the monthly JSON field'
)

const counts = { audited: 0, conflict: 0, unsupported: 0 }
const monthlyRuleQuality = {
  liquid: {
    explicit_interval: 0,
    explicit_no_fertilization_status: 0,
    product_dependent: 0,
    no_uniform_interval: 0,
    non_interval: 0
  },
  slowRelease: {
    explicit_interval: 0,
    explicit_no_fertilization_status: 0,
    product_dependent: 0,
    no_uniform_interval: 0,
    non_interval: 0
  }
}
const normalizedRuleKinds = {}
for (const genus of genera) {
  const entry = audit.overrides?.[genus] || audit.defaultCoverage
  assert.ok(
    counts[entry.reviewStatus] !== undefined,
    `${genus}: unsupported review status ${entry.reviewStatus}`
  )
  counts[entry.reviewStatus] += 1

  const sourceIds = assertSourceRefs(entry, genus)
  if (entry.reviewStatus === 'audited') {
    assert.ok(
      ['indoor', 'container', 'aquatic'].includes(entry.scopeType),
      `${genus}: audited monthly schedule must declare a supported scopeType`
    )
    assert.ok(
      scopeAdjustmentPairs.has(`${entry.scopeType}_${entry.adjustmentMode}`),
      `${genus}: audited monthly schedule has unsupported scope/adjustment pair`
    )
    assert.equal(typeof entry.publicNote, 'string', `${genus}: publicNote must be a string`)
    assert.ok(
      entry.publicNote.length <= 180,
      `${genus}: publicNote must remain a short user-facing reminder`
    )
    assert.doesNotMatch(
      entry.publicNote,
      publicNoteBoilerplatePattern,
      `${genus}: publicNote must not repeat audit boilerplate or internal evidence`
    )
    assert.ok(
      sourceIds.size >= 2,
      `${genus}: audited monthly schedule must have at least two auditable sources`
    )
    assertRows(entry, genus, sourceIds)
    assert.ok(
      !ambiguousGrowthCopyPattern.test(entry.notes || ''),
      `${genus}: public notes must describe observable new leaves or shoots`
    )
    for (const row of entry.rows) {
      for (const fertilizerType of ['liquid', 'slowRelease']) {
        const cell = row[fertilizerType]
        if (cell?.displayText) {
          monthlyRuleQuality[fertilizerType][classifyPublicMonthlyRule(cell.displayText)] += 1
          normalizedRuleKinds[cell.schedule.kind] =
            (normalizedRuleKinds[cell.schedule.kind] || 0) + 1
        }
      }
    }
    assert.deepEqual(
      entry.baseIntervalDays,
      v5Intervals.get(genus),
      `${genus}: audited monthly schedule must reconcile with v5 base interval`
    )
    assert.deepEqual(
      entry.baseIntervalDays,
      csvBaseIntervals.get(genus),
      `${genus}: audited monthly schedule must reconcile with CSV base interval`
    )
  }
  if (entry.baseIntervalDays) {
    assert.deepEqual(
      entry.baseIntervalDays,
      v5Intervals.get(genus),
      `${genus}: audit interval mismatch with v5`
    )
  }
}

for (const genus of Object.keys(audit.overrides || {})) {
  assert.ok(genera.has(genus), `audit override does not exist in current genus CSV: ${genus}`)
}

const runtimeBatch = validateGenusFertilizationMonthlyRuntimeBatch({ audit, genera })

console.log(
  JSON.stringify(
    {
      status: 'passed',
      sourceRows: csvRows.length,
      v5Rows: v5Intervals.size,
      coverage: counts,
      csvIntervalMismatchesAllRows: csvIntervalMismatches.length,
      auditedCsvIntervalMismatches: Object.entries(audit.overrides || {}).filter(
        ([genus, entry]) =>
          entry.reviewStatus === 'audited' &&
          JSON.stringify(entry.baseIntervalDays) !== JSON.stringify(csvBaseIntervals.get(genus))
      ).length,
      baseIntervalSource: 'SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql',
      publicRule:
        'only audited rows with source names and a non-product-label rule are displayable; only schedule.kind=interval is reminder eligible; audit URLs/evidenceRef stay internal',
      monthlyRuleQuality,
      normalizedRuleKinds,
      runtimeBatch
    },
    null,
    2
  )
)
