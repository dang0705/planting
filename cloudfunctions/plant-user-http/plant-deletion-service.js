'use strict'

const { getCloudBase } = require('/opt/utils/cloudbase')
const { quoteIdentifier, withNativeTransaction } = require('/opt/utils/native-mysql')

const REQUIRED_DELETE_TABLES = [
  'user_plant_instances',
  'plant_images',
  'plant_care_locations',
  'diagnosis_sessions',
  'user_plant_file_deletion_jobs'
]
const PARENT_TABLE = 'user_plant_instances'
const DIAGNOSIS_SESSION_TABLE = 'diagnosis_sessions'
const IMAGE_TABLE = 'plant_images'
const CARE_LOCATION_TABLE = 'plant_care_locations'
const FILE_DELETION_JOB_TABLE = 'user_plant_file_deletion_jobs'
const MAX_FILE_CLEANUP_JOBS = 20

function createDeleteError(message, { code = 'USER_PLANT_DELETE_FAILED', statusCode = 500 } = {}) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function normalizePlantId(value) {
  const plantId = Number(value)
  return Number.isSafeInteger(plantId) && plantId > 0 ? plantId : 0
}

function normalizeOpenid(value) {
  return String(value || '').trim()
}

function normalizeFileIds(values = []) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

function placeholders(values = []) {
  return values.map(() => '?').join(', ')
}

function getColumnSet(rows = []) {
  const byTable = new Map()
  for (const row of rows) {
    const table = String(row.TABLE_NAME || row.table_name || '').trim()
    const column = String(row.COLUMN_NAME || row.column_name || '').trim()
    if (!table || !column) {
      continue
    }
    if (!byTable.has(table)) {
      byTable.set(table, new Set())
    }
    byTable.get(table).add(column)
  }
  return byTable
}

async function readRelevantTableColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME IN ('_openid', 'user_plant_id', 'plant_id', 'plantId', 'diagnosis_id', 'session_id', 'file_id', 'fileId')`
  )
  return getColumnSet(rows)
}

function assertRequiredTables(tableColumns) {
  const missing = REQUIRED_DELETE_TABLES.filter(table => !tableColumns.has(table))
  if (missing.length) {
    throw createDeleteError('删除服务数据表未就绪，请稍后重试', {
      code: 'USER_PLANT_DELETE_SCHEMA_NOT_READY',
      statusCode: 503
    })
  }
}

async function selectOwnedPlantForUpdate(connection, { openid, plantId }) {
  const [rows] = await connection.execute(
    `SELECT id
     FROM ${quoteIdentifier(PARENT_TABLE)}
     WHERE id = ? AND _openid = ?
     FOR UPDATE`,
    [plantId, openid]
  )
  if (!rows[0]) {
    throw createDeleteError('植物不存在或无权限删除', {
      code: 'USER_PLANT_NOT_FOUND',
      statusCode: 404
    })
  }
}

async function selectOwnedImageFileIds(connection, { openid, plantId }) {
  const [rows] = await connection.execute(
    `SELECT fileId
     FROM ${quoteIdentifier(IMAGE_TABLE)}
     WHERE _openid = ? AND plantId = ?
     FOR UPDATE`,
    [openid, String(plantId)]
  )
  return normalizeFileIds(rows.map(row => row.fileId))
}

async function selectOwnedDiagnosisIds(connection, { openid, plantId, tableColumns }) {
  if (!tableColumns.has(DIAGNOSIS_SESSION_TABLE)) {
    return { diagnosisIds: [], sessionIds: [] }
  }
  const [rows] = await connection.execute(
    `SELECT diagnosis_id, session_id
     FROM ${quoteIdentifier(DIAGNOSIS_SESSION_TABLE)}
     WHERE _openid = ? AND user_plant_id = ?
     FOR UPDATE`,
    [openid, plantId]
  )
  return {
    diagnosisIds: normalizeFileIds(rows.map(row => row.diagnosis_id)),
    sessionIds: normalizeFileIds(rows.map(row => row.session_id))
  }
}

async function deleteDirectPlantChildren(connection, { openid, plantId, tableColumns }) {
  const excluded = new Set([PARENT_TABLE, DIAGNOSIS_SESSION_TABLE, FILE_DELETION_JOB_TABLE])
  for (const [tableName, columns] of tableColumns) {
    if (excluded.has(tableName) || !columns.has('user_plant_id')) {
      continue
    }
    const table = quoteIdentifier(tableName)
    if (columns.has('_openid')) {
      await connection.execute(`DELETE FROM ${table} WHERE _openid = ? AND user_plant_id = ?`, [
        openid,
        plantId
      ])
    } else {
      await connection.execute(`DELETE FROM ${table} WHERE user_plant_id = ?`, [plantId])
    }
  }

  await connection.execute(
    `DELETE FROM ${quoteIdentifier(CARE_LOCATION_TABLE)} WHERE _openid = ? AND plant_id = ?`,
    [openid, plantId]
  )
  await connection.execute(
    `DELETE FROM ${quoteIdentifier(IMAGE_TABLE)} WHERE _openid = ? AND plantId = ?`,
    [openid, String(plantId)]
  )
}

async function deleteDiagnosisChildren(connection, { diagnosisIds, sessionIds, tableColumns }) {
  if (!diagnosisIds.length && !sessionIds.length) {
    return
  }

  const excluded = new Set([DIAGNOSIS_SESSION_TABLE])
  for (const [tableName, columns] of tableColumns) {
    if (excluded.has(tableName)) {
      continue
    }
    const table = quoteIdentifier(tableName)
    if (diagnosisIds.length && columns.has('diagnosis_id')) {
      await connection.execute(
        `DELETE FROM ${table} WHERE diagnosis_id IN (${placeholders(diagnosisIds)})`,
        diagnosisIds
      )
      continue
    }
    if (sessionIds.length && columns.has('session_id')) {
      await connection.execute(
        `DELETE FROM ${table} WHERE session_id IN (${placeholders(sessionIds)})`,
        sessionIds
      )
    }
  }
}

async function enqueueFileDeletionJobs(connection, { openid, plantId, fileIds }) {
  for (const fileId of fileIds) {
    await connection.execute(
      `INSERT INTO ${quoteIdentifier(FILE_DELETION_JOB_TABLE)}
        (_openid, user_plant_id, file_id, status, attempt_count)
       VALUES (?, ?, ?, 'pending', 0)
       ON DUPLICATE KEY UPDATE
         user_plant_id = VALUES(user_plant_id),
         status = IF(status = 'completed', 'completed', 'pending'),
         updated_at = CURRENT_TIMESTAMP`,
      [openid, plantId, fileId]
    )
  }
}

async function deleteUserPlantDataInTransaction({ openid, plantId }) {
  return withNativeTransaction(async connection => {
    const tableColumns = await readRelevantTableColumns(connection)
    assertRequiredTables(tableColumns)
    await selectOwnedPlantForUpdate(connection, { openid, plantId })
    const fileIds = await selectOwnedImageFileIds(connection, { openid, plantId })
    const { diagnosisIds, sessionIds } = await selectOwnedDiagnosisIds(connection, {
      openid,
      plantId,
      tableColumns
    })

    await deleteDirectPlantChildren(connection, { openid, plantId, tableColumns })
    await deleteDiagnosisChildren(connection, { diagnosisIds, sessionIds, tableColumns })
    if (tableColumns.has(DIAGNOSIS_SESSION_TABLE)) {
      await connection.execute(
        `DELETE FROM ${quoteIdentifier(DIAGNOSIS_SESSION_TABLE)} WHERE _openid = ? AND user_plant_id = ?`,
        [openid, plantId]
      )
    }
    await enqueueFileDeletionJobs(connection, { openid, plantId, fileIds })
    const [result] = await connection.execute(
      `DELETE FROM ${quoteIdentifier(PARENT_TABLE)} WHERE id = ? AND _openid = ?`,
      [plantId, openid]
    )
    if (Number(result?.affectedRows || 0) !== 1) {
      throw createDeleteError('植物删除状态异常，请稍后重试')
    }

    return { plantId, fileIds }
  })
}

async function listPendingFileDeletionJobs({ openid, fileIds = [] }) {
  return withNativeTransaction(async connection => {
    const requestedFileIds = normalizeFileIds(fileIds)
    const fileCondition = requestedFileIds.length
      ? ` AND file_id IN (${placeholders(requestedFileIds)})`
      : ''
    const [rows] = await connection.execute(
      `SELECT id, file_id
       FROM ${quoteIdentifier(FILE_DELETION_JOB_TABLE)}
       WHERE _openid = ? AND status = 'pending'${fileCondition}
       ORDER BY updated_at ASC, id ASC
       LIMIT ${requestedFileIds.length || MAX_FILE_CLEANUP_JOBS}
       FOR UPDATE`,
      [openid, ...requestedFileIds]
    )
    return rows.map(row => ({ id: Number(row.id), fileId: String(row.file_id || '').trim() }))
  })
}

async function markFileDeletionJob({ openid, jobId, status, errorCode = '' }) {
  return withNativeTransaction(async connection => {
    await connection.execute(
      `UPDATE ${quoteIdentifier(FILE_DELETION_JOB_TABLE)}
       SET status = ?,
           attempt_count = attempt_count + 1,
           last_error_code = ?,
           last_attempt_at = CURRENT_TIMESTAMP,
           completed_at = IF(? = 'completed', CURRENT_TIMESTAMP, completed_at)
       WHERE id = ? AND _openid = ?`,
      [status, errorCode, status, jobId, openid]
    )
  })
}

function getStorageDeleteFile() {
  const app = getCloudBase()
  if (typeof app?.deleteFile !== 'function') {
    throw createDeleteError('图片清理服务暂不可用', {
      code: 'USER_PLANT_FILE_CLEANUP_UNAVAILABLE',
      statusCode: 503
    })
  }
  return fileId => app.deleteFile({ fileList: [fileId] })
}

function getSafeStorageErrorCode(error) {
  return String(error?.code || 'storage_delete_failed').slice(0, 64)
}

async function drainPendingPlantFileDeletionJobs({ openid, fileIds = [], deleteFile } = {}) {
  const safeOpenid = normalizeOpenid(openid)
  if (!safeOpenid) {
    return { attempted: 0, pending: 0 }
  }
  const jobs = await listPendingFileDeletionJobs({ openid: safeOpenid, fileIds })
  const deleteOneFile = deleteFile || getStorageDeleteFile()
  let pending = 0

  for (const job of jobs) {
    try {
      await deleteOneFile(job.fileId)
      await markFileDeletionJob({ openid: safeOpenid, jobId: job.id, status: 'completed' })
    } catch (error) {
      pending += 1
      await markFileDeletionJob({
        openid: safeOpenid,
        jobId: job.id,
        status: 'pending',
        errorCode: getSafeStorageErrorCode(error)
      })
    }
  }

  return { attempted: jobs.length, pending }
}

async function deleteUserPlantCompletely({ openid, plantId, deleteFile } = {}) {
  const safeOpenid = normalizeOpenid(openid)
  const safePlantId = normalizePlantId(plantId)
  if (!safeOpenid || !safePlantId) {
    throw createDeleteError('缺少植物ID', {
      code: 'USER_PLANT_DELETE_INPUT_INVALID',
      statusCode: 400
    })
  }

  const deleted = await deleteUserPlantDataInTransaction({
    openid: safeOpenid,
    plantId: safePlantId
  })
  let cleanup
  try {
    cleanup = await drainPendingPlantFileDeletionJobs({
      openid: safeOpenid,
      fileIds: deleted.fileIds,
      deleteFile
    })
  } catch (error) {
    // 数据库事务已经提交：保留 pending 作业，后续查询会重试；不能再把已完成的删除伪装为失败。
    console.warn('[plant-user-http] file cleanup deferred after user plant deletion', {
      code: getSafeStorageErrorCode(error)
    })
    cleanup = { attempted: 0, pending: deleted.fileIds.length }
  }
  return {
    ...deleted,
    cleanupPending: cleanup.pending > 0,
    cleanupAttempted: cleanup.attempted
  }
}

module.exports = {
  REQUIRED_DELETE_TABLES,
  normalizePlantId,
  normalizeOpenid,
  normalizeFileIds,
  getColumnSet,
  deleteUserPlantDataInTransaction,
  drainPendingPlantFileDeletionJobs,
  deleteUserPlantCompletely,
  _test: {
    placeholders,
    getSafeStorageErrorCode,
    createDeleteError
  }
}
