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

function parseJsonPayload(value, fallback = null) {
  if (!value) {return fallback}
  if (typeof value === 'object') {return value}
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeJsonColumnValue(value) {
  if (value === null || value === undefined || value === '') {return null}
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {return null}
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      return JSON.stringify(trimmed)
    }
  }

  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function buildUpsertStatement(schema, table, row = {}, keyColumns = []) {
  const allColumns = Object.keys(row)
  const insertColumns = allColumns.filter(column => !(column === 'id' && (row[column] === null || row[column] === undefined)))
  if (!insertColumns.length) {
    throw new Error(`无法写入 ${table}: 没有可插入字段`)
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
    params: insertColumns.map(column => row[column] ?? null)
  }
}

async function writePublishBatch(connection, { batchId, versionTag, status, summary = null, rollbackOfBatchId = null }) {
  const columns = await listTableColumns(connection, DEV_SCHEMA, 'publish_batches').catch(() => [])
  if (!columns.length) {return}

  const payload = {}
  if (columns.includes('batch_id')) {payload.batch_id = batchId}
  if (columns.includes('version_tag')) {payload.version_tag = versionTag || null}
  if (columns.includes('source_batch_id')) {payload.source_batch_id = batchId}
  if (columns.includes('status')) {payload.status = status}
  if (columns.includes('summary_json')) {payload.summary_json = summary ? JSON.stringify(summary) : null}
  if (columns.includes('created_at')) {payload.created_at = new Date()}
  if (columns.includes('published_at') && status === 'published') {payload.published_at = new Date()}
  if (columns.includes('rollback_of_batch_id')) {payload.rollback_of_batch_id = rollbackOfBatchId}

  const payloadColumns = Object.keys(payload)
  if (!payloadColumns.length) {return}

  const sql = `
    INSERT INTO ${tableName(DEV_SCHEMA, 'publish_batches')}
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

async function loadPublishDiffs(connection, batchId, allowPending = false) {
  const diffColumns = await listTableColumns(connection, DEV_SCHEMA, 'publish_diffs')
  const hasStatus = diffColumns.includes('status')
  const where = ['batch_id = ?']
  const params = [batchId]

  if (hasStatus && !allowPending) {
    where.push(`status = 'approved'`)
  }

  const [rows] = await connection.query(
    `
      SELECT *
      FROM ${tableName(DEV_SCHEMA, 'publish_diffs')}
      WHERE ${where.join(' AND ')}
      ORDER BY id ASC
    `,
    params
  )

  return { rows, hasStatus, diffColumns }
}

async function loadDevRowByRecordKey(connection, table, recordKeyPayload = {}) {
  const where = buildWhereByRecordKey(recordKeyPayload)
  const [rows] = await connection.query(
    `
      SELECT *
      FROM ${tableName(DEV_SCHEMA, table)}
      WHERE ${where.sql}
      LIMIT 1
    `,
    where.params
  )
  return rows[0] || null
}

async function markDiffStatus(connection, diffId, status, hasStatus, diffColumns = []) {
  if (!hasStatus) {return}

  const updates = ['status = ?']
  const params = [status]
  if (diffColumns.includes('reviewed_at')) {
    updates.push('reviewed_at = ?')
    params.push(new Date())
  }
  if (diffColumns.includes('reviewed_by')) {
    updates.push('reviewed_by = ?')
    params.push('publish-engine')
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

async function runPublishEngine({ batchId, versionTag = null, allowPending = false } = {}) {
  if (!batchId) {
    throw new Error('publish-data 缺少 batchId')
  }

  return withTransaction(async connection => {
    await writePublishBatch(connection, {
      batchId,
      versionTag,
      status: 'publishing'
    })

    const { rows: diffRows, hasStatus, diffColumns } = await loadPublishDiffs(connection, batchId, allowPending)
    const summary = {
      added: 0,
      updated: 0,
      removed: 0,
      skipped: 0
    }

    for (const diff of diffRows) {
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

      const keyPayload = parseRecordKey(diff.record_key)
      const where = buildWhereByRecordKey(keyPayload)
      const prodColumnSet = new Set(prodColumns)

      if (diff.change_type === 'removed') {
        if (prodColumnSet.has('is_active')) {
          const setClauses = ['is_active = 0']
          const params = []
          if (prodColumnSet.has('updated_at')) {
            setClauses.push('updated_at = ?')
            params.push(new Date())
          }
          await connection.query(
            `
              UPDATE ${tableName(PROD_SCHEMA, table)}
              SET ${setClauses.join(', ')}
              WHERE ${where.sql}
            `,
            [...params, ...where.params]
          )
          summary.removed += 1
          await markDiffStatus(connection, diff.id, 'published', hasStatus, diffColumns)
        } else {
          summary.skipped += 1
          await markDiffStatus(connection, diff.id, 'pending_manual', hasStatus, diffColumns)
        }
        continue
      }

      const devRow = (await loadDevRowByRecordKey(connection, table, keyPayload)) || parseJsonPayload(diff.new_row_json, null)
      if (!devRow) {
        summary.skipped += 1
        await markDiffStatus(connection, diff.id, 'missing_dev_row', hasStatus, diffColumns)
        continue
      }

      const candidateColumns = Object.keys(devRow).filter(column => prodColumnSet.has(column))
      const payload = {}
      for (const column of candidateColumns) {
        // Do not publish surrogate/internal id across schemas.
        if (column === 'id') {continue}
        payload[column] = devRow[column]
      }
      for (const jsonColumn of tableConfig.jsonColumns || []) {
        if (!Object.prototype.hasOwnProperty.call(payload, jsonColumn)) {continue}
        payload[jsonColumn] = normalizeJsonColumnValue(payload[jsonColumn])
      }
      if (prodColumnSet.has('updated_at')) {
        payload.updated_at = new Date()
      }
      if (prodColumnSet.has('version_tag') && versionTag) {
        payload.version_tag = versionTag
      }
      if (prodColumnSet.has('published_batch_id')) {
        payload.published_batch_id = batchId
      }
      if (prodColumnSet.has('published_at')) {
        payload.published_at = new Date()
      }

      const upsert = buildUpsertStatement(PROD_SCHEMA, table, payload, tableConfig.keys)
      await connection.query(upsert.sql, upsert.params)

      if (diff.change_type === 'added') {summary.added += 1}
      if (diff.change_type === 'updated') {summary.updated += 1}
      await markDiffStatus(connection, diff.id, 'published', hasStatus, diffColumns)
    }

    await writePublishBatch(connection, {
      batchId,
      versionTag,
      status: 'published',
      summary
    })

    return {
      ok: true,
      batchId,
      summary
    }
  })
}

module.exports = {
  runPublishEngine
}
