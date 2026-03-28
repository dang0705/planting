'use strict'

const { TABLE_CONFIGS, METADATA_COLUMNS } = require('../config/tables')
const { computeRowHash } = require('../utils/hash')
const { isRowDifferent } = require('../utils/compare-row')
const {
  DEV_SCHEMA,
  PROD_SCHEMA,
  getPool,
  withTransaction,
  tableName,
  quoteIdentifier,
  listTableColumns
} = require('../db/mysql')

function stableRecordKey(row = {}, keyColumns = []) {
  const payload = {}
  for (const key of keyColumns) {
    payload[key] = row[key] ?? null
  }
  return JSON.stringify(payload)
}

function buildRecordMap(rows = [], keyColumns = [], table = '', side = '') {
  const map = new Map()
  let duplicateCount = 0
  let sampleKey = null

  for (const row of rows || []) {
    const recordKey = stableRecordKey(row, keyColumns)
    if (map.has(recordKey)) {
      duplicateCount += 1
      if (!sampleKey) sampleKey = recordKey
      continue
    }
    map.set(recordKey, row)
  }

  if (duplicateCount > 0) {
    throw new Error(
      `${side}.${table} 出现 ${duplicateCount} 条 record_key 冲突，` +
        `请检查 TABLE_CONFIG.keys 与数据库唯一键是否一致。示例: ${sampleKey}`
    )
  }

  return map
}

function parseRecordKey(recordKey = '{}') {
  try {
    const parsed = JSON.parse(recordKey)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function pickCompareColumns(tableConfig = {}, columns = []) {
  const dbColumnSet = new Set(columns || [])
  const businessColumns = (tableConfig.columns || []).filter(
    column => dbColumnSet.has(column) && !tableConfig.keys.includes(column)
  )

  if (dbColumnSet.has('row_hash')) return ['row_hash']
  return businessColumns.filter(column => column !== 'id' && !METADATA_COLUMNS.includes(column))
}

function normalizeJsonRow(row = {}) {
  const result = {}
  for (const [key, value] of Object.entries(row || {})) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      result[key] = new Date(value).toISOString()
    } else {
      result[key] = value
    }
  }
  return result
}

function isActiveRow(row = {}) {
  const value = row?.is_active
  if (value === 0 || value === false) return false
  if (typeof value === 'string' && value.trim() === '0') return false
  return true
}

function buildWhereByRecordKey(recordKeyPayload = {}) {
  const keys = Object.keys(recordKeyPayload)
  if (!keys.length) return { sql: '1 = 0', params: [] }

  const whereSql = keys.map(key => `${quoteIdentifier(key)} <=> ?`).join(' AND ')
  return {
    sql: whereSql,
    params: keys.map(key => recordKeyPayload[key] ?? null)
  }
}

async function insertDiffRows(connection, rows = []) {
  if (!rows.length) return

  const columns = await listTableColumns(connection, DEV_SCHEMA, 'publish_diffs')
  if (!columns.length) {
    throw new Error('cloud1_dev.publish_diffs 不存在，无法写入 diff 结果')
  }

  for (const row of rows) {
    const payload = {}
    if (columns.includes('batch_id')) payload.batch_id = row.batch_id
    if (columns.includes('table_name')) payload.table_name = row.table_name
    if (columns.includes('record_key')) payload.record_key = row.record_key
    if (columns.includes('change_type')) payload.change_type = row.change_type
    if (columns.includes('old_row_json')) payload.old_row_json = row.old_row_json
    if (columns.includes('new_row_json')) payload.new_row_json = row.new_row_json
    if (columns.includes('old_hash')) payload.old_hash = row.old_hash
    if (columns.includes('new_hash')) payload.new_hash = row.new_hash
    if (columns.includes('status')) payload.status = 'pending'
    if (columns.includes('created_at')) payload.created_at = new Date()

    const payloadColumns = Object.keys(payload)
    if (!payloadColumns.length) continue

    const sql = `
      INSERT INTO ${tableName(DEV_SCHEMA, 'publish_diffs')}
      (${payloadColumns.map(quoteIdentifier).join(', ')})
      VALUES (${payloadColumns.map(() => '?').join(', ')})
    `
    await connection.query(sql, payloadColumns.map(column => payload[column]))
  }
}

async function runDiffEngine({ batchId, tables = [] } = {}) {
  if (!batchId) {
    throw new Error('diff-data 缺少 batchId')
  }

  const selected = tables.length
    ? TABLE_CONFIGS.filter(item => tables.includes(item.table))
    : TABLE_CONFIGS

  const summary = []

  await withTransaction(async connection => {
    await connection.query(
      `DELETE FROM ${tableName(DEV_SCHEMA, 'publish_diffs')} WHERE batch_id = ?`,
      [batchId]
    )

    for (const tableConfig of selected) {
      const table = tableConfig.table
      const devColumns = await listTableColumns(connection, DEV_SCHEMA, table).catch(() => [])
      const prodColumns = await listTableColumns(connection, PROD_SCHEMA, table).catch(() => [])
      if (!devColumns.length || !prodColumns.length) {
        summary.push({
          table,
          added: 0,
          updated: 0,
          removed: 0,
          skipped: true
        })
        continue
      }

      const compareColumns = pickCompareColumns(tableConfig, devColumns)
      const keyColumns = tableConfig.keys
      const [devRowsResult] = await connection.query(`SELECT * FROM ${tableName(DEV_SCHEMA, table)}`)
      const [prodRowsResult] = await connection.query(`SELECT * FROM ${tableName(PROD_SCHEMA, table)}`)
      let devRows = devRowsResult || []
      let prodRows = prodRowsResult || []
      if (devColumns.includes('is_active')) {
        devRows = devRows.filter(isActiveRow)
      }
      if (prodColumns.includes('is_active')) {
        prodRows = prodRows.filter(isActiveRow)
      }
      const devMap = buildRecordMap(devRows, keyColumns, table, DEV_SCHEMA)
      const prodMap = buildRecordMap(prodRows, keyColumns, table, PROD_SCHEMA)

      const diffRows = []
      let added = 0
      let updated = 0
      let removed = 0

      for (const [recordKey, devRow] of devMap.entries()) {
        const prodRow = prodMap.get(recordKey)
        if (!prodRow) {
          added += 1
          diffRows.push({
            batch_id: batchId,
            table_name: table,
            record_key: recordKey,
            change_type: 'added',
            old_row_json: null,
            new_row_json: JSON.stringify(normalizeJsonRow(devRow)),
            old_hash: null,
            new_hash: computeRowHash(devRow, compareColumns)
          })
          continue
        }

        const changed = isRowDifferent(devRow, prodRow, compareColumns)
        if (!changed) continue

        updated += 1
        diffRows.push({
          batch_id: batchId,
          table_name: table,
          record_key: recordKey,
          change_type: 'updated',
          old_row_json: JSON.stringify(normalizeJsonRow(prodRow)),
          new_row_json: JSON.stringify(normalizeJsonRow(devRow)),
          old_hash: computeRowHash(prodRow, compareColumns),
          new_hash: computeRowHash(devRow, compareColumns)
        })
      }

      for (const [recordKey, prodRow] of prodMap.entries()) {
        if (devMap.has(recordKey)) continue
        removed += 1
        diffRows.push({
          batch_id: batchId,
          table_name: table,
          record_key: recordKey,
          change_type: 'removed',
          old_row_json: JSON.stringify(normalizeJsonRow(prodRow)),
          new_row_json: null,
          old_hash: computeRowHash(prodRow, compareColumns),
          new_hash: null
        })
      }

      await insertDiffRows(connection, diffRows)
      summary.push({ table, added, updated, removed, skipped: false })
    }
  })

  return {
    ok: true,
    batchId,
    summary
  }
}

module.exports = {
  parseRecordKey,
  buildWhereByRecordKey,
  runDiffEngine
}
