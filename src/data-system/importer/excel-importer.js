'use strict'

const path = require('path')
const XLSX = require('xlsx')
const { TABLE_CONFIGS, TABLE_CONFIG_MAP, METADATA_COLUMNS } = require('../config/tables')
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

function resolveDefaultExcelPath() {
  return path.resolve(process.cwd(), 'docs/plants_v13_user_friendly_full_v7.xlsx')
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

function pickTableConfigs(tables = []) {
  if (!Array.isArray(tables) || !tables.length) return TABLE_CONFIGS

  const picked = []
  for (const table of tables) {
    const config = TABLE_CONFIG_MAP[table]
    if (config) picked.push(config)
  }
  return picked
}

function buildUpsertStatement({ schema, table, payloadColumns = [], keyColumns = [] }) {
  const quotedColumns = payloadColumns.map(quoteIdentifier).join(', ')
  const placeholders = payloadColumns.map(() => '?').join(', ')
  const updateColumns = payloadColumns.filter(
    item => !keyColumns.includes(item) && item !== 'id'
  )

  const updateSql = updateColumns.length
    ? updateColumns.map(column => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`).join(', ')
    : `${quoteIdentifier(keyColumns[0])} = VALUES(${quoteIdentifier(keyColumns[0])})`

  return `
    INSERT INTO ${tableName(schema, table)} (${quotedColumns})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updateSql}
  `
}

async function upsertImportJob(connection, { batchId, fileName, status, detail = null }) {
  const columns = await listTableColumns(connection, DEV_SCHEMA, 'import_jobs').catch(() => [])
  if (!columns.length) return

  const payload = {}
  if (columns.includes('batch_id')) payload.batch_id = batchId
  if (columns.includes('source_type')) payload.source_type = 'excel'
  if (columns.includes('file_name')) payload.file_name = fileName
  if (columns.includes('status')) payload.status = status
  if (columns.includes('sheet_summary_json')) payload.sheet_summary_json = detail ? JSON.stringify(detail) : null
  if (columns.includes('error_summary_json')) payload.error_summary_json = status === 'failed' ? JSON.stringify(detail || {}) : null
  if (columns.includes('created_at')) payload.created_at = new Date()
  if (columns.includes('finished_at')) payload.finished_at = status === 'finished' || status === 'failed' ? new Date() : null

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
  const filePath = options.filePath || resolveDefaultExcelPath()
  const batchId = options.batchId || createBatchId('batch')
  const tableConfigs = pickTableConfigs(options.tables)

  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const startedAt = Date.now()

  try {
    await withTransaction(async connection => {
      await upsertImportJob(connection, {
        batchId,
        fileName: path.basename(filePath),
        status: 'running'
      })

      const summary = []

      for (const config of tableConfigs) {
        if (!workbook.SheetNames.includes(config.sheet)) continue

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[config.sheet], {
          defval: null,
          raw: false
        })
        const dbColumns = await listTableColumns(connection, DEV_SCHEMA, config.table).catch(() => [])
        if (!dbColumns.length) {
          summary.push({ table: config.table, rows: 0, skipped: true, reason: 'table_not_found' })
          continue
        }

        const dbColumnSet = new Set(dbColumns)
        const missingKeyColumns = config.keys.filter(column => !dbColumnSet.has(column))
        if (missingKeyColumns.length) {
          summary.push({
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
          const normalized = normalizeRow(rawRow, config)
          const payload = {}

          for (const column of businessColumns) {
            payload[column] = normalized[column] ?? null
          }

          if (dbColumnSet.has('source_type')) payload.source_type = 'excel'
          if (dbColumnSet.has('source_batch_id')) payload.source_batch_id = batchId
          if (dbColumnSet.has('version_tag') && options.versionTag) payload.version_tag = options.versionTag
          if (dbColumnSet.has('review_status') && !payload.review_status) payload.review_status = 'pending'
          if (dbColumnSet.has('is_active')) {
            payload.is_active =
              payload.is_active === null || payload.is_active === undefined
                ? 1
                : payload.is_active
          }
          if (dbColumnSet.has('updated_at')) payload.updated_at = now
          if (dbColumnSet.has('created_at') && !payload.created_at) payload.created_at = now

          if (dbColumnSet.has('row_hash')) {
            payload.row_hash = computeRowHash(payload, businessColumns)
          }

          const payloadColumns = Array.from(availableColumns)
          const params = payloadColumns.map(column => payload[column] ?? null)
          await connection.query(upsertSql, params)
          imported += 1
        }

        summary.push({ table: config.table, rows: imported, skipped: false })
      }

      await upsertImportJob(connection, {
        batchId,
        fileName: path.basename(filePath),
        status: 'finished',
        detail: {
          filePath,
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
        fileName: path.basename(filePath),
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
    filePath
  }
}

module.exports = {
  runExcelImport
}
