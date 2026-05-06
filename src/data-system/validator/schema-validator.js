'use strict'

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const {
  DATA_SOURCE_CONFIGS,
  TABLE_CONFIGS,
  TABLE_CONFIG_MAP,
  METADATA_COLUMNS
} = require('../config/tables')
const { DEV_SCHEMA, getPool, listTableColumns } = require('../db/mysql')

function resolveSourceKey(source = '', filePath = '') {
  const normalizedSource = String(source || '').trim().toLowerCase()
  if (normalizedSource === 'genuscare') return 'genus-care'
  if (normalizedSource === 'all') return 'all'
  if (DATA_SOURCE_CONFIGS[normalizedSource]) return normalizedSource

  const normalizedPath = String(filePath || '').trim().toLowerCase()
  if (normalizedPath.includes('plant_catalog')) return 'taxonomy'
  if (normalizedPath.includes('genus_care_profile')) return 'genus-care'
  if (normalizedPath.endsWith('.xlsx')) return 'diagnosis'

  return 'diagnosis'
}

function resolveDefaultInputPath(sourceKey = 'diagnosis') {
  const config = DATA_SOURCE_CONFIGS[sourceKey]
  if (!config?.defaultFilePath) {
    throw new Error(`未找到 source=${sourceKey} 的默认素材路径`)
  }
  return path.resolve(process.cwd(), config.defaultFilePath)
}

function pickTableConfigs(tables = [], sourceKey = 'diagnosis') {
  const defaultConfigs = TABLE_CONFIGS.filter(config => config.enabledByDefault !== false)

  if (!Array.isArray(tables) || !tables.length) {
    if (sourceKey === 'all') return defaultConfigs
    return defaultConfigs.filter(config => config.source === sourceKey)
  }

  const picked = []
  for (const table of tables) {
    const config = TABLE_CONFIG_MAP[table]
    if (config) picked.push(config)
  }
  return picked
}

function groupTableConfigsBySource(tableConfigs = []) {
  const groups = new Map()

  for (const tableConfig of tableConfigs) {
    const source = tableConfig.source || 'diagnosis'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source).push(tableConfig)
  }

  return groups
}

function readWorkbookSchema(filePath, tableConfigs = []) {
  const workbook = XLSX.readFile(filePath)
  const schemaMap = {}

  for (const tableConfig of tableConfigs) {
    const sheet = workbook.Sheets[tableConfig.sheet]
    if (!sheet) {
      schemaMap[tableConfig.table] = []
      continue
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false
    })
    const header = Array.isArray(rows[0]) ? rows[0] : []
    schemaMap[tableConfig.table] = header
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }

  return schemaMap
}

function readCsvSchema(filePath, tableConfigs = []) {
  const content = fs.readFileSync(filePath, 'utf8')
  const workbook = XLSX.read(content, {
    type: 'string',
    raw: true
  })
  const firstSheetName = workbook.SheetNames[0]
  const rows = firstSheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        header: 1,
        raw: true
      })
    : []
  const firstRow = Array.isArray(rows[0]) ? rows[0] : []

  const schemaMap = {}
  for (const tableConfig of tableConfigs) {
    const expectedColumns = tableConfig.inputColumns || tableConfig.columns
    if (firstRow.length === expectedColumns.length) {
      schemaMap[tableConfig.table] = expectedColumns
    } else {
      schemaMap[tableConfig.table] = firstRow.map((_, index) => `column_${index + 1}`)
    }
  }

  return schemaMap
}

function readSourceSchema({ sourceKey, filePath, tableConfigs = [] }) {
  const sourceConfig = DATA_SOURCE_CONFIGS[sourceKey]
  if (!sourceConfig) {
    throw new Error(`未识别的数据源: ${sourceKey}`)
  }

  if (sourceConfig.fileType === 'xlsx') {
    return readWorkbookSchema(filePath, tableConfigs)
  }

  if (sourceConfig.fileType === 'csv') {
    return readCsvSchema(filePath, tableConfigs)
  }

  throw new Error(`不支持的素材类型: ${sourceConfig.fileType}`)
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

async function readDbSchema(schema = DEV_SCHEMA, tableConfigs = []) {
  const pool = getPool()
  const result = {}
  for (const config of tableConfigs) {
    const columns = await listTableColumns(pool, schema, config.table).catch(() => [])
    result[config.table] = columns
  }
  return result
}

function validateSchemaDiff({ tableConfigs = [], sourceSchema = {}, dbSchema = {}, repositoryFields = {} } = {}) {
  const errors = []
  const details = []
  const metadataSet = new Set(METADATA_COLUMNS)

  for (const config of tableConfigs) {
    const table = config.table
    const actualSourceColumns = sourceSchema[table] || []
    const expectedSourceColumns = config.inputColumns || config.columns
    const dbColumns = dbSchema[table] || []
    const repoColumns = repositoryFields[table] || []

    const missingInSource = expectedSourceColumns.filter(column => !actualSourceColumns.includes(column))
    const extraInSource = actualSourceColumns.filter(column => !expectedSourceColumns.includes(column))
    const missingInDb = config.columns.filter(column => !dbColumns.includes(column))
    const extraInDb = dbColumns.filter(column => {
      if (config.columns.includes(column)) return false
      if (metadataSet.has(column)) return false
      if (column === 'id' && !config.columns.includes('id')) return false
      return true
    })
    const missingInRepoDb = repoColumns.filter(column => !dbColumns.includes(column))

    if (missingInSource.length) {
      errors.push({
        type: 'source_missing_expected_columns',
        table,
        columns: missingInSource
      })
    }
    if (extraInSource.length) {
      errors.push({
        type: 'source_unexpected_columns',
        table,
        columns: extraInSource
      })
    }
    if (missingInDb.length) {
      errors.push({
        type: 'formal_columns_missing_in_db',
        table,
        columns: missingInDb
      })
    }
    if (extraInDb.length) {
      errors.push({
        type: 'db_columns_not_in_formal_config',
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
      expectedSourceColumns: expectedSourceColumns.length,
      actualSourceColumns: actualSourceColumns.length,
      formalColumns: config.columns.length,
      dbColumns: dbColumns.length,
      repositoryColumns: repoColumns.length,
      missingInSource,
      extraInSource,
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
  const sourceKey = resolveSourceKey(options.source, options.filePath)
  const tableConfigs = pickTableConfigs(options.tables, sourceKey)
  if (!tableConfigs.length) {
    throw new Error('未找到可校验的目标表')
  }
  if (options.filePath && groupTableConfigsBySource(tableConfigs).size > 1) {
    throw new Error('同时校验多个 source 时，不支持共用单个 --file 参数')
  }

  const groupedConfigs = groupTableConfigsBySource(tableConfigs)
  const sourceSchema = {}
  for (const [currentSourceKey, currentConfigs] of groupedConfigs.entries()) {
    const filePath =
      options.filePath && groupedConfigs.size === 1
        ? path.resolve(process.cwd(), options.filePath)
        : resolveDefaultInputPath(currentSourceKey)
    Object.assign(
      sourceSchema,
      readSourceSchema({
        sourceKey: currentSourceKey,
        filePath,
        tableConfigs: currentConfigs
      })
    )
  }

  const dbSchema = await readDbSchema(options.schema || DEV_SCHEMA, tableConfigs)
  const repositoryFields = extractRepositorySelects()
  const validation = validateSchemaDiff({
    tableConfigs,
    sourceSchema,
    dbSchema,
    repositoryFields
  })

  const outputPath = path.resolve(
    process.cwd(),
    options.outputPath ||
      (sourceKey === 'all' ? 'schema-diff-report.json' : `schema-diff-report-${sourceKey}.json`)
  )

  const report = {
    generatedAt: new Date().toISOString(),
    source: sourceKey,
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
