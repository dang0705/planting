'use strict'

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { TABLE_CONFIGS, TABLE_CONFIG_MAP, METADATA_COLUMNS } = require('../config/tables')
const { DEV_SCHEMA, getPool, listTableColumns } = require('../db/mysql')

function resolveDefaultExcelPath() {
  return path.resolve(process.cwd(), 'docs/plants_v13_user_friendly_full_v7.xlsx')
}

function readExcelSchema(filePath) {
  const workbook = XLSX.readFile(filePath)
  const schemaMap = {}

  for (const config of TABLE_CONFIGS) {
    const sheet = workbook.Sheets[config.sheet]
    if (!sheet) {
      schemaMap[config.table] = []
      continue
    }
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false
    })
    const header = Array.isArray(rows[0]) ? rows[0] : []
    schemaMap[config.table] = header
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }

  return schemaMap
}

function extractRepositorySelects() {
  const repositoryDir = path.resolve(process.cwd(), 'cloudfunctions/diagnose-http/repositories')
  if (!fs.existsSync(repositoryDir)) {
    return {}
  }

  const files = fs
    .readdirSync(repositoryDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(repositoryDir, file))

  const result = {}
  const queryRegex = /SELECT([\s\S]*?)FROM\s+\$\{table\('([^']+)'\)\}/g

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    let matched = queryRegex.exec(content)
    while (matched) {
      const selectBody = matched[1] || ''
      const table = matched[2]
      if (!TABLE_CONFIG_MAP[table]) {
        matched = queryRegex.exec(content)
        continue
      }

      const fields = new Set(result[table] || [])
      for (const line of selectBody.split('\n')) {
        let token = line.trim()
        if (!token) continue
        token = token.replace(/,$/, '').trim()
        if (!token || token === '*') continue
        if (/^\d+\s+AS\s+/i.test(token)) continue
        if (/^'.*'\s+AS\s+/i.test(token)) continue

        const asSplit = token.split(/\s+AS\s+/i)
        token = asSplit[0].trim()

        if (!token || token.includes('(') || token.includes(')')) continue
        if (token.includes('.')) token = token.split('.').pop().trim()
        token = token.replace(/`/g, '')

        if (/^[a-zA-Z0-9_]+$/.test(token)) {
          fields.add(token)
        }
      }

      result[table] = Array.from(fields).sort()
      matched = queryRegex.exec(content)
    }
  }

  return result
}

async function readDbSchema(schema = DEV_SCHEMA) {
  const pool = getPool()
  const result = {}
  for (const config of TABLE_CONFIGS) {
    const columns = await listTableColumns(pool, schema, config.table).catch(() => [])
    result[config.table] = columns
  }
  return result
}

function validateSchemaDiff({ excelSchema = {}, dbSchema = {}, repositoryFields = {} } = {}) {
  const errors = []
  const details = []
  const metadataSet = new Set(METADATA_COLUMNS)

  for (const config of TABLE_CONFIGS) {
    const table = config.table
    const excelColumns = excelSchema[table] || []
    const dbColumns = dbSchema[table] || []
    const repoColumns = repositoryFields[table] || []

    const missingInDb = excelColumns.filter(column => !dbColumns.includes(column))
    const extraInDb = dbColumns.filter(column => {
      if (excelColumns.includes(column)) return false
      if (metadataSet.has(column)) return false

      // v2 spec allows an internal surrogate id primary key even when Excel has no id column.
      if (column === 'id' && !excelColumns.includes('id')) return false

      return true
    })
    const missingInRepoDb = repoColumns.filter(column => !dbColumns.includes(column))

    if (missingInDb.length) {
      errors.push({
        type: 'excel_missing_in_db',
        table,
        columns: missingInDb
      })
    }
    if (extraInDb.length) {
      errors.push({
        type: 'db_missing_in_excel',
        table,
        columns: extraInDb
      })
    }
    if (missingInRepoDb.length) {
      errors.push({
        type: 'repository_field_missing_in_db',
        table,
        columns: missingInRepoDb
      })
    }

    details.push({
      table,
      excelColumns: excelColumns.length,
      dbColumns: dbColumns.length,
      repositoryColumns: repoColumns.length,
      missingInDb,
      extraInDb,
      missingInRepoDb
    })
  }

  return {
    ok: errors.length === 0,
    errors,
    details
  }
}

async function runSchemaValidator(options = {}) {
  const excelPath = options.filePath || resolveDefaultExcelPath()
  const outputPath = path.resolve(process.cwd(), options.outputPath || 'schema-diff-report.json')
  const excelSchema = readExcelSchema(excelPath)
  const dbSchema = await readDbSchema(options.schema || DEV_SCHEMA)
  const repositoryFields = extractRepositorySelects()
  const validation = validateSchemaDiff({ excelSchema, dbSchema, repositoryFields })

  const report = {
    generatedAt: new Date().toISOString(),
    excelPath,
    schema: options.schema || DEV_SCHEMA,
    summary: {
      ok: validation.ok,
      errorCount: validation.errors.length
    },
    validation
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')

  if (!validation.ok) {
    const error = new Error(`schema 校验失败，详情见 ${outputPath}`)
    error.report = report
    throw error
  }

  return report
}

module.exports = {
  runSchemaValidator
}
