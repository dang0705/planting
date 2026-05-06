'use strict'

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2')
const XLSX = require('xlsx')
const { DEV_SCHEMA } = require('../db/mysql')
const { normalizeRow } = require('../utils/normalizer')
const {
  DATA_SOURCE_CONFIGS,
  TABLE_CONFIGS,
  TABLE_CONFIG_MAP
} = require('../config/tables')

function parseArgs(argv = []) {
  const args = {}
  for (const item of argv) {
    if (!item.startsWith('--')) continue
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

function loadWorkbookRows(filePath, tableConfigs = []) {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const result = new Map()

  for (const tableConfig of tableConfigs) {
    const sheetName = tableConfig.sheet
    if (!sheetName || !workbook.SheetNames.includes(sheetName)) {
      result.set(tableConfig.table, [])
      continue
    }

    result.set(
      tableConfig.table,
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null,
        raw: false
      })
    )
  }

  return result
}

function loadCsvRows(filePath, tableConfig = {}) {
  const content = fs.readFileSync(filePath, 'utf8')
  const workbook = XLSX.read(content, {
    type: 'string',
    cellDates: true,
    raw: true
  })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []

  const inputColumns = tableConfig.inputColumns || tableConfig.columns
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: inputColumns,
    range: 0,
    defval: null,
    raw: true
  })
}

function loadRowsBySource({ sourceKey, filePath, tableConfigs = [] }) {
  const sourceConfig = DATA_SOURCE_CONFIGS[sourceKey]
  if (!sourceConfig) {
    throw new Error(`未识别的数据源: ${sourceKey}`)
  }

  if (sourceConfig.fileType === 'xlsx') {
    return loadWorkbookRows(filePath, tableConfigs)
  }

  if (sourceConfig.fileType === 'csv') {
    const result = new Map()
    for (const tableConfig of tableConfigs) {
      result.set(tableConfig.table, loadCsvRows(filePath, tableConfig))
    }
    return result
  }

  throw new Error(`不支持的素材类型: ${sourceConfig.fileType}`)
}

function materializePayloadRows(rawRow = {}, tableConfig = {}) {
  const normalizedInputRow = normalizeRow(rawRow, {
    columns: tableConfig.inputColumns || tableConfig.columns,
    numericColumns: tableConfig.numericColumns,
    jsonColumns: tableConfig.jsonColumns
  })
  const mapped = tableConfig.rowMapper ? tableConfig.rowMapper(normalizedInputRow) : normalizedInputRow
  const rows = Array.isArray(mapped) ? mapped : [mapped]

  return rows
    .filter(Boolean)
    .map(item =>
      normalizeRow(item, {
        columns: tableConfig.columns,
        numericColumns: tableConfig.numericColumns,
        jsonColumns: tableConfig.jsonColumns
      })
    )
}

function chunk(items = [], size = 50) {
  const result = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function quoteIdentifier(name) {
  return `\`${String(name || '').replace(/`/g, '')}\``
}

function buildInsertStatement(tableConfig = {}, rows = []) {
  const columns = tableConfig.columns || []
  const insertColumns = columns.map(quoteIdentifier).join(', ')
  const updateColumns = columns.filter(column => !tableConfig.keys.includes(column) && column !== 'id')

  const valueSql = rows
    .map(row => {
      const values = columns.map(column => mysql.escape(row[column] ?? null)).join(', ')
      return `(${values})`
    })
    .join(',\n')

  const updateSql = updateColumns.length
    ? updateColumns
        .map(column => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
        .join(', ')
    : `${quoteIdentifier(tableConfig.keys[0])} = VALUES(${quoteIdentifier(tableConfig.keys[0])})`

  return [
    `INSERT INTO ${quoteIdentifier(DEV_SCHEMA)}.${quoteIdentifier(tableConfig.table)} (${insertColumns})`,
    'VALUES',
    valueSql,
    `ON DUPLICATE KEY UPDATE ${updateSql};`
  ].join('\n')
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceKey = resolveSourceKey(args.source, args.file)
  const tableConfigs = pickTableConfigs(parseTableArg(args.tables), sourceKey)
  const batchSize = Number(args.batchSize || 50)
  const filePath = args.file
    ? path.resolve(process.cwd(), args.file)
    : resolveDefaultInputPath(sourceKey)
  const outputDir = path.resolve(
    process.cwd(),
    args.outputDir || path.join('tmp', 'import-sql', sourceKey)
  )

  if (!tableConfigs.length) {
    throw new Error('未找到可生成 SQL 的目标表')
  }

  ensureDir(outputDir)

  const rowsByTable = loadRowsBySource({
    sourceKey,
    filePath,
    tableConfigs
  })

  const manifest = []

  for (const tableConfig of tableConfigs) {
    const sourceRows = rowsByTable.get(tableConfig.table) || []
    const payloadRows = []
    for (const rawRow of sourceRows) {
      payloadRows.push(...materializePayloadRows(rawRow, tableConfig))
    }

    const batches = chunk(payloadRows, batchSize)
    batches.forEach((batchRows, index) => {
      const fileName = `${String(manifest.length + 1).padStart(2, '0')}-${tableConfig.table}-${index + 1}.sql`
      const absolutePath = path.join(outputDir, fileName)
      fs.writeFileSync(absolutePath, buildInsertStatement(tableConfig, batchRows), 'utf8')
      manifest.push({
        table: tableConfig.table,
        source: sourceKey,
        batchIndex: index + 1,
        rowCount: batchRows.length,
        file: absolutePath
      })
    })
  }

  const manifestPath = path.join(outputDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({
    source: sourceKey,
    filePath,
    batchSize,
    batches: manifest
  }, null, 2))

  console.log(JSON.stringify({
    ok: true,
    source: sourceKey,
    filePath,
    outputDir,
    manifestPath,
    batchCount: manifest.length,
    totalRows: manifest.reduce((sum, item) => sum + item.rowCount, 0),
    tables: Array.from(new Set(manifest.map(item => item.table)))
  }, null, 2))
}

main()
