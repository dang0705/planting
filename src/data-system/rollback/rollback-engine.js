'use strict'

const { TABLE_CONFIG_MAP } = require('../config/tables')
const {
  DEV_SCHEMA,
  PROD_SCHEMA,
  withTransaction,
  tableName,
  quoteIdentifier,
  listTableColumns
} = require('../db/mysql')
const { parseRecordKey, buildWhereByRecordKey } = require('../diff/diff-engine')

function parseJson(value, fallback = null) {
  if (!value) {return fallback}
  if (typeof value === 'object') {return value}
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function normalizeDateTimeValue(value) {
  if (value === null || value === undefined) {return value}
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const d = value
    const pad = item => String(item).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
      d.getUTCHours()
    )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  }

  if (typeof value === 'string') {
    const isoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
    if (isoLike) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) {
        const pad = item => String(item).padStart(2, '0')
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
          d.getUTCHours()
        )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
      }
    }
  }

  return value
}

function normalizeJsonColumnValue(value) {
  if (value === null || value === undefined || value === '') {return null}
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {return null}
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch (error) {
      return JSON.stringify(trimmed)
    }
  }

  try {
    return JSON.stringify(value)
  } catch (error) {
    return null
  }
}

function buildUpsertStatement(schema, table, row = {}, keyColumns = []) {
  const insertColumns = Object.keys(row).filter(column => !(column === 'id' && (row[column] === null || row[column] === undefined)))
  if (!insertColumns.length) {
    throw new Error(`rollback 无法写入 ${table}: 没有可插入字段`)
  }

  const updateColumns = insertColumns.filter(column => !keyColumns.includes(column) && column !== 'id')
  const sql = `
    INSERT INTO ${tableName(schema, table)} (${insertColumns.map(quoteIdentifier).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE ${
      updateColumns.length
        ? updateColumns.map(column => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`).join(', ')
        : `${quoteIdentifier(keyColumns[0])} = VALUES(${quoteIdentifier(keyColumns[0])})`
    }
  `

  return {
    sql,
    params: insertColumns.map(column => normalizeDateTimeValue(row[column] ?? null))
  }
}

async function markDiffRollbackStatus(connection, diffId, status, columns = []) {
  if (!columns.includes('status')) {return}

  const updates = ['status = ?']
  const params = [status]

  if (columns.includes('reviewed_at')) {
    updates.push('reviewed_at = ?')
    params.push(new Date())
  }
  if (columns.includes('reviewed_by')) {
    updates.push('reviewed_by = ?')
    params.push('rollback-engine')
  }
  params.push(diffId)

  await connection.query(
    `
      UPDATE ${tableName(DEV_SCHEMA, 'publish_diffs')}
      SET ${updates.join(', ')}
      WHERE id = ?
    `,
    params
  )
}

async function runRollbackEngine({ batchId } = {}) {
  if (!batchId) {
    throw new Error('rollback-data 缺少 batchId')
  }

  return withTransaction(async connection => {
    const diffColumns = await listTableColumns(connection, DEV_SCHEMA, 'publish_diffs').catch(() => [])
    if (!diffColumns.length) {
      throw new Error('cloud1_dev.publish_diffs 不存在，无法回滚')
    }

    const [diffRows] = await connection.query(
      `
        SELECT *
        FROM ${tableName(DEV_SCHEMA, 'publish_diffs')}
        WHERE batch_id = ?
        ORDER BY id DESC
      `,
      [batchId]
    )

    const summary = {
      restored: 0,
      deactivated: 0,
      deleted: 0,
      skipped: 0
    }

    for (const diff of diffRows || []) {
      const table = diff.table_name
      const tableConfig = TABLE_CONFIG_MAP[table]
      if (!tableConfig) {
        summary.skipped += 1
        continue
      }

      const prodColumns = await listTableColumns(connection, PROD_SCHEMA, table).catch(() => [])
      if (!prodColumns.length) {
        summary.skipped += 1
        continue
      }

      const prodColumnSet = new Set(prodColumns)
      const recordKeyPayload = parseRecordKey(diff.record_key)
      const where = buildWhereByRecordKey(recordKeyPayload)
      const oldRow = parseJson(diff.old_row_json, null)

      if (diff.change_type === 'added') {
        if (prodColumnSet.has('is_active')) {
          await connection.query(
            `
              UPDATE ${tableName(PROD_SCHEMA, table)}
              SET is_active = 0
              WHERE ${where.sql}
            `,
            where.params
          )
          summary.deactivated += 1
        } else {
          await connection.query(
            `
              DELETE FROM ${tableName(PROD_SCHEMA, table)}
              WHERE ${where.sql}
            `,
            where.params
          )
          summary.deleted += 1
        }
        await markDiffRollbackStatus(connection, diff.id, 'rolled_back', diffColumns)
        continue
      }

      if (diff.change_type === 'updated') {
        if (!oldRow) {
          summary.skipped += 1
          await markDiffRollbackStatus(connection, diff.id, 'rollback_missing_old_row', diffColumns)
          continue
        }

        const payload = {}
        for (const column of Object.keys(oldRow)) {
          if (!prodColumnSet.has(column)) {continue}
          // Do not rollback surrogate/internal id across schemas.
          if (column === 'id') {continue}
          payload[column] = oldRow[column]
        }
        for (const jsonColumn of tableConfig.jsonColumns || []) {
          if (!Object.prototype.hasOwnProperty.call(payload, jsonColumn)) {continue}
          payload[jsonColumn] = normalizeJsonColumnValue(payload[jsonColumn])
        }
        const upsert = buildUpsertStatement(PROD_SCHEMA, table, payload, tableConfig.keys)
        await connection.query(upsert.sql, upsert.params)
        summary.restored += 1
        await markDiffRollbackStatus(connection, diff.id, 'rolled_back', diffColumns)
        continue
      }

      if (diff.change_type === 'removed') {
        if (prodColumnSet.has('is_active')) {
          await connection.query(
            `
              UPDATE ${tableName(PROD_SCHEMA, table)}
              SET is_active = 1
              WHERE ${where.sql}
            `,
            where.params
          )
          summary.restored += 1
          await markDiffRollbackStatus(connection, diff.id, 'rolled_back', diffColumns)
        } else if (oldRow) {
          const payload = {}
          for (const column of Object.keys(oldRow)) {
            if (!prodColumnSet.has(column)) {continue}
            if (column === 'id') {continue}
            payload[column] = oldRow[column]
          }
          for (const jsonColumn of tableConfig.jsonColumns || []) {
            if (!Object.prototype.hasOwnProperty.call(payload, jsonColumn)) {continue}
            payload[jsonColumn] = normalizeJsonColumnValue(payload[jsonColumn])
          }
          const upsert = buildUpsertStatement(PROD_SCHEMA, table, payload, tableConfig.keys)
          await connection.query(upsert.sql, upsert.params)
          summary.restored += 1
          await markDiffRollbackStatus(connection, diff.id, 'rolled_back', diffColumns)
        } else {
          summary.skipped += 1
          await markDiffRollbackStatus(connection, diff.id, 'rollback_manual_required', diffColumns)
        }
        continue
      }

      summary.skipped += 1
    }

    const batchColumns = await listTableColumns(connection, DEV_SCHEMA, 'publish_batches').catch(() => [])
    if (batchColumns.length) {
      const payload = {}
      if (batchColumns.includes('batch_id')) {payload.batch_id = `rollback_${Date.now()}`}
      if (batchColumns.includes('version_tag')) {payload.version_tag = 'rollback'}
      if (batchColumns.includes('status')) {payload.status = 'rolled_back'}
      if (batchColumns.includes('summary_json')) {payload.summary_json = JSON.stringify(summary)}
      if (batchColumns.includes('created_at')) {payload.created_at = new Date()}
      if (batchColumns.includes('published_at')) {payload.published_at = new Date()}
      if (batchColumns.includes('rollback_of_batch_id')) {payload.rollback_of_batch_id = batchId}

      const payloadColumns = Object.keys(payload)
      if (payloadColumns.length) {
        await connection.query(
          `
            INSERT INTO ${tableName(DEV_SCHEMA, 'publish_batches')}
            (${payloadColumns.map(quoteIdentifier).join(', ')})
            VALUES (${payloadColumns.map(() => '?').join(', ')})
          `,
          payloadColumns.map(column => payload[column])
        )
      }
    }

    return {
      ok: true,
      batchId,
      summary
    }
  })
}

module.exports = {
  runRollbackEngine
}
