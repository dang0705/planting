import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { models } = require('../cloudfunctions/layer/utils/cloudbase.js')
const {
  isV2LightEnvironment,
  migrateLegacyLightEnvironment,
  normalizeUserLightContext
} = require('../cloudfunctions/layer/utils/light-exposure-normalize.js')

function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, output: '' }
  for (const token of argv) {
    if (token === '--apply') {
      args.apply = true
    } else if (token.startsWith('--confirm-env=')) {
      args.confirmEnv = token.slice('--confirm-env='.length).trim()
    } else if (token.startsWith('--output=')) {
      args.output = token.slice('--output='.length).trim()
    }
  }
  return args
}

function parseJson(value) {
  if (!value) {
    return null
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function toPersistedV2(value) {
  const normalized = normalizeUserLightContext(value)
  if (!normalized.hasMeaningfulInput) {
    return null
  }
  return {
    schemaVersion: 2,
    naturalLightType: normalized.naturalLightType,
    entryMethod: normalized.entryMethod,
    hasSupplementalLight: normalized.hasSupplementalLight,
    captureSource: normalized.captureSource
  }
}

function classifyRecord(value) {
  if (!value) {
    return 'empty'
  }
  if (isV2LightEnvironment(value)) {
    return 'already_v2'
  }
  return migrateLegacyLightEnvironment(value) ? 'legacy_mappable' : 'invalid'
}

function buildMigrationReport(rows = []) {
  const records = rows.map(row => {
    const original = parseJson(row.light_environment_json_text ?? row.light_environment_json)
    const status = classifyRecord(original)
    return {
      id: Number(row.id),
      status,
      original,
      mapped: status === 'legacy_mappable' ? toPersistedV2(original) : null
    }
  })
  const counts = records.reduce(
    (acc, item) => {
      acc.total += 1
      acc[item.status] = (acc[item.status] || 0) + 1
      if (item.mapped?.naturalLightType) {
        acc.byNaturalLightType[item.mapped.naturalLightType] =
          (acc.byNaturalLightType[item.mapped.naturalLightType] || 0) + 1
      }
      return acc
    },
    {
      total: 0,
      empty: 0,
      already_v2: 0,
      legacy_mappable: 0,
      invalid: 0,
      byNaturalLightType: {}
    }
  )
  return { generatedAt: new Date().toISOString(), counts, records }
}

async function readRows() {
  const result = await models.$runSQL(
    'SELECT id, CAST(light_environment_json AS CHAR) AS light_environment_json_text FROM user_plant_instances WHERE NOT (light_environment_json <=> NULL) ORDER BY id',
    {}
  )
  return result?.data?.executeResultList || []
}

async function applyMigration(report) {
  for (const record of report.records.filter(item => item.status === 'legacy_mappable')) {
    await models.$runSQL(
      // WeDa normalizes JSON whitespace on read, so comparing the original JSON text is not
      // stable. The schemaVersion guard keeps a concurrent V2 confirmation from being overwritten.
      "UPDATE user_plant_instances SET light_environment_json = {{mappedJson}} WHERE id = {{id}} AND (JSON_EXTRACT(light_environment_json, '$.schemaVersion') <=> NULL)",
      {
        id: record.id,
        mappedJson: JSON.stringify(record.mapped)
      }
    )
  }
}

async function writeReport(report, outputPath = '') {
  const target =
    outputPath ||
    path.join(
      process.cwd(),
      '.tmp',
      'light-environment-v2-migration',
      `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    )
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return target
}

async function main() {
  const args = parseArgs()
  const environmentId = String(
    process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.CLOUDBASE_ENVID || ''
  ).trim()
  if (args.apply && (!environmentId || args.confirmEnv !== environmentId)) {
    throw new Error(
      '批量写入必须同时传入 --apply 与 --confirm-env=<当前环境ID>；默认只执行 dry-run。'
    )
  }

  const before = buildMigrationReport(await readRows())
  const beforePath = await writeReport(before, args.output)
  console.log(
    JSON.stringify({
      mode: args.apply ? 'apply' : 'dry-run',
      report: beforePath,
      counts: before.counts
    })
  )
  if (!args.apply) {
    return
  }

  await applyMigration(before)
  const after = buildMigrationReport(await readRows())
  const afterPath = await writeReport(after, beforePath.replace(/\.json$/, '-after.json'))
  if (after.counts.legacy_mappable !== 0 || after.counts.invalid !== 0) {
    throw new Error(`迁移后仍有旧结构或无效结构，详见 ${afterPath}`)
  }
  console.log(JSON.stringify({ mode: 'verified', report: afterPath, counts: after.counts }))
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  main().catch(error => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}

export { parseArgs, parseJson, toPersistedV2, classifyRecord, buildMigrationReport }
