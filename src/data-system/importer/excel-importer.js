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
const { computeRowHash } = require('../utils/hash')
const { normalizeRow } = require('../utils/normalizer')
const {
  DEV_SCHEMA,
  getPool,
  withTransaction,
  quoteIdentifier,
  tableName,
  listTableColumns
} = require('../db/mysql')

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

function createBatchId(prefix = 'batch') {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`
  const tail = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(
    now.getSeconds()
  ).padStart(2, '0')}`
  return `${prefix}_${stamp}_${tail}`
}

function pickTableConfigs(tables = [], sourceKey = 'diagnosis') {
  if (!Array.isArray(tables) || !tables.length) {
    const defaultConfigs = TABLE_CONFIGS.filter(config => config.enabledByDefault !== false)
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
    if (!groups.has(source)) {
      groups.set(source, [])
    }
    groups.get(source).push(tableConfig)
  }

  return groups
}

function buildUpsertStatement({ schema, table, payloadColumns = [], keyColumns = [] }) {
  const quotedColumns = payloadColumns.map(quoteIdentifier).join(', ')
  const placeholders = payloadColumns.map(() => '?').join(', ')
  const updateColumns = payloadColumns.filter(
    item => !keyColumns.includes(item) && item !== 'id'
  )

  const updateSql = updateColumns.length
    ? updateColumns
        .map(column => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
        .join(', ')
    : `${quoteIdentifier(keyColumns[0])} = VALUES(${quoteIdentifier(keyColumns[0])})`

  return `
    INSERT INTO ${tableName(schema, table)} (${quotedColumns})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updateSql}
  `
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

async function upsertImportJob(connection, { batchId, sourceType, fileName, status, detail = null }) {
  const columns = await listTableColumns(connection, DEV_SCHEMA, 'import_jobs').catch(() => [])
  if (!columns.length) return

  const payload = {}
  if (columns.includes('batch_id')) payload.batch_id = batchId
  if (columns.includes('source_type')) payload.source_type = sourceType
  if (columns.includes('file_name')) payload.file_name = fileName
  if (columns.includes('status')) payload.status = status
  if (columns.includes('sheet_summary_json')) payload.sheet_summary_json = detail ? JSON.stringify(detail) : null
  if (columns.includes('error_summary_json')) {
    payload.error_summary_json = status === 'failed' ? JSON.stringify(detail || {}) : null
  }
  if (columns.includes('created_at')) payload.created_at = new Date()
  if (columns.includes('finished_at')) {
    payload.finished_at = status === 'finished' || status === 'failed' ? new Date() : null
  }

  const payloadColumns = Object.keys(payload)
  if (!payloadColumns.length) return

  const sql = `
    INSERT INTO ${tableName(DEV_SCHEMA, 'import_jobs')}
    (${payloadColumns.map(quoteIdentifier).join(', ')})
    VALUES (${payloadColumns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE
      ${payloadColumns
        .filter(column => column !== 'batch_id')
        .map(column => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
        .join(', ')}
  `

  await connection.query(sql, payloadColumns.map(column => payload[column]))
}

async function runExcelImport(options = {}) {
  const pool = getPool()
  const batchId = options.batchId || createBatchId('batch')
  const sourceKey = resolveSourceKey(options.source, options.filePath)
  const tableConfigs = pickTableConfigs(options.tables, sourceKey)
  const startedAt = Date.now()

  if (!tableConfigs.length) {
    throw new Error('未找到可导入的目标表')
  }

  try {
    await withTransaction(async connection => {
      await upsertImportJob(connection, {
        batchId,
        sourceType: sourceKey,
        fileName: options.filePath ? path.basename(options.filePath) : sourceKey,
        status: 'running'
      })

      const summary = []
      const groupedConfigs = groupTableConfigsBySource(tableConfigs)

      if (options.filePath && groupedConfigs.size > 1) {
        throw new Error('同时导入多个 source 时，不支持共用单个 --file 参数')
      }

      for (const [currentSourceKey, currentConfigs] of groupedConfigs.entries()) {
        const filePath =
          options.filePath && groupedConfigs.size === 1
            ? path.resolve(process.cwd(), options.filePath)
            : resolveDefaultInputPath(currentSourceKey)
        const rowsByTable = loadRowsBySource({
          sourceKey: currentSourceKey,
          filePath,
          tableConfigs: currentConfigs
        })

        for (const config of currentConfigs) {
          const rows = rowsByTable.get(config.table) || []
          if (!rows.length) {
            summary.push({
              source: currentSourceKey,
              filePath,
              table: config.table,
              rows: 0,
              skipped: true,
              reason: 'source_rows_empty'
            })
            continue
          }

          const dbColumns = await listTableColumns(connection, DEV_SCHEMA, config.table).catch(() => [])
          if (!dbColumns.length) {
            summary.push({
              source: currentSourceKey,
              filePath,
              table: config.table,
              rows: 0,
              skipped: true,
              reason: 'table_not_found'
            })
            continue
          }

          const dbColumnSet = new Set(dbColumns)
          const missingKeyColumns = config.keys.filter(column => !dbColumnSet.has(column))
          if (missingKeyColumns.length) {
            summary.push({
              source: currentSourceKey,
              filePath,
              table: config.table,
              rows: 0,
              skipped: true,
              reason: `missing_key_columns:${missingKeyColumns.join(',')}`
            })
            continue
          }

          const businessColumns = config.columns.filter(column => dbColumnSet.has(column))
          const dynamicColumns = METADATA_COLUMNS.filter(column => dbColumnSet.has(column))
          const availableColumns = new Set([...businessColumns, ...dynamicColumns])
          const upsertSql = buildUpsertStatement({
            schema: DEV_SCHEMA,
            table: config.table,
            payloadColumns: Array.from(availableColumns),
            keyColumns: config.keys
          })
          const now = new Date()
          let imported = 0

          for (const rawRow of rows) {
            const payloadRows = materializePayloadRows(rawRow, config)

            for (const normalized of payloadRows) {
              const payload = {}

              for (const column of businessColumns) {
                payload[column] = normalized[column] ?? null
              }

              if (dbColumnSet.has('source_type')) payload.source_type = currentSourceKey
              if (dbColumnSet.has('source_batch_id')) payload.source_batch_id = batchId
              if (dbColumnSet.has('version_tag') && options.versionTag) payload.version_tag = options.versionTag
              if (dbColumnSet.has('version') && !payload.version && options.versionTag) {
                payload.version = options.versionTag
              }
              if (dbColumnSet.has('data_source') && !payload.data_source) {
                payload.data_source = path.basename(filePath)
              }
              if (dbColumnSet.has('review_status') && !payload.review_status) payload.review_status = 'pending'
              if (dbColumnSet.has('is_active')) {
                payload.is_active =
                  payload.is_active === null || payload.is_active === undefined
                    ? 1
                    : payload.is_active
              }
              if (dbColumnSet.has('updated_at')) payload.updated_at = payload.updated_at || now
              if (dbColumnSet.has('created_at') && !payload.created_at) payload.created_at = now

              if (dbColumnSet.has('row_hash')) {
                payload.row_hash = computeRowHash(payload, businessColumns)
              }

              const payloadColumns = Array.from(availableColumns)
              const params = payloadColumns.map(column => payload[column] ?? null)
              await connection.query(upsertSql, params)
              imported += 1
            }
          }

          summary.push({
            source: currentSourceKey,
            filePath,
            table: config.table,
            rows: imported,
            skipped: false
          })
        }
      }

      await upsertImportJob(connection, {
        batchId,
        sourceType: sourceKey,
        fileName: options.filePath ? path.basename(options.filePath) : sourceKey,
        status: 'finished',
        detail: {
          source: sourceKey,
          tables: summary,
          durationMs: Date.now() - startedAt
        }
      })
    })
  } catch (error) {
    const connection = await pool.getConnection()
    try {
      await upsertImportJob(connection, {
        batchId,
        sourceType: sourceKey,
        fileName: options.filePath ? path.basename(options.filePath) : sourceKey,
        status: 'failed',
        detail: {
          message: error.message
        }
      })
    } finally {
      connection.release()
    }
    throw error
  }

  return {
    ok: true,
    batchId,
    source: sourceKey
  }
}

module.exports = {
  runExcelImport
}
