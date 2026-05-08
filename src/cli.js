'use strict'

const { closePool } = require('./data-system/db/mysql')
const { runExcelImport } = require('./data-system/importer/excel-importer')
const { runDiffEngine } = require('./data-system/diff/diff-engine')
const { runPublishEngine } = require('./data-system/publish/publish-engine')
const { runRollbackEngine } = require('./data-system/rollback/rollback-engine')
const { runSchemaValidator } = require('./data-system/validator/schema-validator')

function parseArgs(argv = []) {
  const args = {}
  for (const item of argv) {
    if (!item.startsWith('--')) {continue}
    const [key, ...rest] = item.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : 'true'
  }
  return args
}

function parseTableArg(value = '') {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseBool(value = '') {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase())
}

function printUsage() {
  console.log(`
Usage:
  node src/cli.js import-data --source=diagnosis --file=docs/plants_v13_user_friendly_full_v7.xlsx --batch=batch_xxx
  node src/cli.js import-data --source=taxonomy --file=docs/plant_catalog.csv --batch=batch_xxx
  node src/cli.js import-data --source=genus-care --file=docs/genus_care_profile.csv --batch=batch_xxx
  node src/cli.js diff-data --batch=batch_xxx --tables=problems,symptoms
  node src/cli.js publish-data --batch=batch_xxx --version=v1
  node src/cli.js rollback-data --batch=batch_xxx
  node src/cli.js validate-schema --source=diagnosis --file=docs/plants_v13_user_friendly_full_v7.xlsx --output=schema-diff-report.json

Notes:
  - 默认会处理当前正式版里具备素材来源的表。
  - taxonomy 默认会生成 formal 表：plant_identity_entities / plant_identity_aliases / plant_identity_match_rules / plant_identity_diagnosis_links。
  - diagnosis 默认会包含 plant_problem_profiles。
  - schema-only 表如 plant_identity_merge_history 需通过独立迁移脚本建表，不参与素材导入。
  `.trim())
}

async function main() {
  const [, , command, ...argv] = process.argv
  const args = parseArgs(argv)

  if (!command) {
    printUsage()
    process.exit(1)
  }

  if (parseBool(args.help) || parseBool(args.h)) {
    printUsage()
    return
  }

  try {
    let result = null

    if (command === 'import-data') {
      result = await runExcelImport({
        source: args.source,
        filePath: args.file,
        batchId: args.batch,
        versionTag: args.version,
        tables: parseTableArg(args.tables)
      })
    } else if (command === 'diff-data') {
      result = await runDiffEngine({
        batchId: args.batch,
        tables: parseTableArg(args.tables)
      })
    } else if (command === 'publish-data') {
      result = await runPublishEngine({
        batchId: args.batch,
        versionTag: args.version,
        allowPending: parseBool(args.allowPending)
      })
    } else if (command === 'rollback-data') {
      result = await runRollbackEngine({
        batchId: args.batch
      })
    } else if (command === 'validate-schema') {
      result = await runSchemaValidator({
        source: args.source,
        filePath: args.file,
        outputPath: args.output,
        schema: args.schema
      })
    } else {
      printUsage()
      process.exit(1)
    }

    console.log(JSON.stringify(result, null, 2))
  } finally {
    await closePool().catch(() => {})
  }
}

main().catch(error => {
  console.error('[data-system-cli] failed:', error.message)
  if (error.report) {
    console.error(JSON.stringify(error.report, null, 2))
  }
  process.exit(1)
})
