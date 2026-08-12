import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const audit = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'SQL-cvs/genus_fertilizing_monthly_audit_v1.json'), 'utf8')
)
const overrides = audit.overrides || {}
const generatedStart = '-- BEGIN GENERATED FERTILIZATION MONTHLY AUDIT V1 R2'
const generatedEnd = '-- END GENERATED FERTILIZATION MONTHLY AUDIT V1 R2'

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

function buildMonthlyUpdates() {
  return Object.entries(overrides)
    .map(([genus, entry]) => {
      const json = JSON.stringify(entry)
      return [
        `UPDATE genus_care_profiles`,
        `SET fertilizing_monthly_strategy_json = '${sqlString(json)}'`,
        `WHERE genus_name = '${sqlString(genus)}' AND is_active = 1;`
      ].join('\n')
    })
    .join('\n\n')
}

function buildBaseIntervalUpdates() {
  return Object.entries(overrides)
    .filter(([, entry]) => Array.isArray(entry.baseIntervalDays))
    .map(([genus, entry]) => {
      const interval = `JSON_ARRAY(${entry.baseIntervalDays.join(',')})`
      return [
        'UPDATE genus_care_profiles',
        `SET fertilizing_strategy_json = JSON_SET(fertilizing_strategy_json, '$.freq', ${interval})`,
        `WHERE genus_name = '${sqlString(genus)}' AND is_active = 1;`
      ].join('\n')
    })
    .join('\n\n')
}

function withGeneratedBlock(content) {
  const block = `${generatedStart}\n${buildMonthlyUpdates()}\n${generatedEnd}`
  const existingStart = content.indexOf(generatedStart)
  const existingEnd = content.indexOf(generatedEnd)
  let normalized = content
  if (existingStart >= 0 && existingEnd > existingStart) {
    normalized = `${content.slice(0, existingStart).trimEnd()}\n${content.slice(existingEnd + generatedEnd.length).trimStart()}`
  }
  const commitIndex = normalized.lastIndexOf('COMMIT;')
  if (commitIndex < 0) {
    throw new Error('Cannot find COMMIT; in SQL file')
  }
  return `${normalized.slice(0, commitIndex).trimEnd()}\n\n${block}\n\n${normalized.slice(commitIndex)}`
}

function updateSqlBaseIntervals(content) {
  return content
    .split('\n')
    .map(line => {
      const target = Object.entries(overrides).find(([genus, entry]) => {
        if (!entry.baseIntervalDays) return false
        const marker = `'${genus}'`
        const markerIndex = line.indexOf(marker)
        if (markerIndex < 0) return false
        return /\{"freq":\[[0-9]+,[0-9]+\],"type"/.test(line.slice(markerIndex))
      })
      if (!target) return line
      const [genus, entry] = target
      const markerIndex = line.indexOf(`'${genus}'`)
      const before = line.slice(0, markerIndex)
      const after = line.slice(markerIndex)
      const updated = after.replace(
        /\{"freq":\[[0-9]+,[0-9]+\],"type"/,
        `{"freq":[${entry.baseIntervalDays.join(',')}],"type"`
      )
      return before + updated
    })
    .join('\n')
}

function updateCsvBaseIntervals(content) {
  return content
    .split('\n')
    .map(line => {
      const target = Object.entries(overrides).find(([genus, entry]) => {
        if (!entry.baseIntervalDays) return false
        if (!(line.startsWith(`${genus},`) || line.includes(`,${genus},`))) return false
        return /"\{""freq"": \[[0-9]+, [0-9]+\], ""type""/.test(line)
      })
      if (!target) return line
      const [, entry] = target
      return line.replace(
        /("\{""freq"": )\[[0-9]+, [0-9]+\](, ""type"":)/,
        `$1[${entry.baseIntervalDays.join(', ')}]$2`
      )
    })
    .join('\n')
}

const sqlFiles = [
  'SQL-cvs/genus_care_profiles_light_uv_minmax_v5_FULL_REPLACE.sql',
  'scripts/sql/add-genus-fertilization-monthly-v1-20260809.sql'
]

for (const relativePath of sqlFiles) {
  const filePath = path.join(repoRoot, relativePath)
  let content = fs.readFileSync(filePath, 'utf8')
  content = updateSqlBaseIntervals(content)
  content = withGeneratedBlock(content)
  fs.writeFileSync(filePath, content)
}

const csvFiles = ['docs/genus_care_profile.csv', 'docs/genus_care_profiles.csv']
for (const relativePath of csvFiles) {
  const csvPath = path.join(repoRoot, relativePath)
  fs.writeFileSync(csvPath, updateCsvBaseIntervals(fs.readFileSync(csvPath, 'utf8')))
}

const refreshMigrationPath = path.join(
  repoRoot,
  'scripts/sql/refresh-genus-fertilization-monthly-v2-20260809.sql'
)
fs.writeFileSync(
  refreshMigrationPath,
  [
    '-- Refresh audited monthly fertilization schedules and their reconciled base intervals.',
    '-- Generated from SQL-cvs/genus_fertilizing_monthly_audit_v1.json.',
    'BEGIN;',
    buildBaseIntervalUpdates(),
    buildMonthlyUpdates(),
    'COMMIT;'
  ].join('\n\n')
)

console.log(
  JSON.stringify(
    {
      status: 'updated',
      overrideCount: Object.keys(overrides).length,
      auditedCount: Object.values(overrides).filter(entry => entry.reviewStatus === 'audited').length,
      sqlFiles,
      csvFiles,
      refreshMigration: 'scripts/sql/refresh-genus-fertilization-monthly-v2-20260809.sql',
      baseIntervalGenera: Object.entries(overrides)
        .filter(([, entry]) => entry.baseIntervalDays)
        .map(([genus, entry]) => `${genus}:${entry.baseIntervalDays.join('-')}`)
    },
    null,
    2
  )
)
