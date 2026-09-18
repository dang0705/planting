import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const sourcePath = path.join(repoRoot, 'cloudfunctions/plant-user-http/plant-deletion-service.js')

function relationRows() {
  const tableColumns = {
    user_plant_instances: ['id', '_openid'],
    plant_images: ['_openid', 'plantId', 'fileId'],
    plant_care_locations: ['_openid', 'plant_id'],
    user_plant_file_deletion_jobs: ['_openid', 'user_plant_id', 'file_id'],
    user_watering_events: ['_openid', 'user_plant_id'],
    user_watering_reminder_events: ['_openid', 'user_plant_id'],
    user_fertilization_events: ['_openid', 'user_plant_id'],
    user_fertilization_reminder_events: ['_openid', 'user_plant_id'],
    diagnosis_sessions: ['_openid', 'user_plant_id', 'diagnosis_id', 'session_id'],
    diagnosis_follow_ups: ['diagnosis_id'],
    diagnosis_result_snapshots: ['diagnosis_id', '_openid'],
    visual_call_batches: ['session_id']
  }
  return Object.entries(tableColumns).flatMap(([TABLE_NAME, columns]) =>
    columns.map(COLUMN_NAME => ({ TABLE_NAME, COLUMN_NAME }))
  )
}

function loadService({
  parentExists = true,
  pendingJobs = [{ id: 90, file_id: 'cloud://owner/plant-7.jpg' }],
  failCleanupRead = false
} = {}) {
  const originalLoad = Module._load
  const sqlCalls = []
  const jobUpdates = []
  const connection = {
    async execute(sql, params = []) {
      sqlCalls.push({ sql, params })
      if (sql.includes('FROM INFORMATION_SCHEMA.COLUMNS')) {
        return [relationRows()]
      }
      if (sql.includes('FROM `user_plant_instances`') && sql.includes('FOR UPDATE')) {
        return [parentExists ? [{ id: 7 }] : []]
      }
      if (sql.includes('SELECT fileId')) {
        return [[{ fileId: 'cloud://owner/plant-7.jpg' }]]
      }
      if (sql.includes('SELECT diagnosis_id, session_id')) {
        return [[{ diagnosis_id: 'dx-7', session_id: 'session-7' }]]
      }
      if (sql.includes('SELECT id, file_id')) {
        if (failCleanupRead) {
          const error = new Error('temporary database issue')
          error.code = 'DB_TRANSIENT'
          throw error
        }
        return [pendingJobs]
      }
      if (sql.startsWith('UPDATE `user_plant_file_deletion_jobs`')) {
        jobUpdates.push(params)
        return [{ affectedRows: 1 }]
      }
      if (sql.startsWith('DELETE FROM `user_plant_instances`')) {
        return [{ affectedRows: 1 }]
      }
      return [{ affectedRows: 1 }]
    }
  }
  const nativeMysql = {
    quoteIdentifier(value) {
      return `\`${value}\``
    },
    async withNativeTransaction(handler) {
      return handler(connection)
    }
  }

  try {
    Module._load = function loadMock(request, parent, isMain) {
      if (request === '/opt/utils/native-mysql') {
        return nativeMysql
      }
      if (request === '/opt/utils/cloudbase') {
        return { getCloudBase: () => ({ deleteFile: async () => {} }) }
      }
      return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[sourcePath]
    return { service: require(sourcePath), sqlCalls, jobUpdates }
  } finally {
    Module._load = originalLoad
    delete require.cache[sourcePath]
  }
}

{
  const { service, sqlCalls } = loadService()
  const result = await service.deleteUserPlantCompletely({
    openid: 'wx_owner',
    plantId: 7,
    deleteFile: async fileId => assert.equal(fileId, 'cloud://owner/plant-7.jpg')
  })
  assert.deepEqual(result, {
    plantId: 7,
    fileIds: ['cloud://owner/plant-7.jpg'],
    cleanupPending: false,
    cleanupAttempted: 1
  })
  const statements = sqlCalls.map(call => call.sql)
  for (const table of [
    'user_watering_events',
    'user_watering_reminder_events',
    'user_fertilization_events',
    'user_fertilization_reminder_events',
    'plant_care_locations',
    'plant_images',
    'diagnosis_follow_ups',
    'diagnosis_result_snapshots',
    'visual_call_batches',
    'diagnosis_sessions',
    'user_plant_instances'
  ]) {
    assert.ok(
      statements.some(sql => sql.includes(`DELETE FROM \`${table}\``)),
      `${table} 必须被删除`
    )
  }
  assert.ok(
    statements.some(sql => sql.includes('INSERT INTO `user_plant_file_deletion_jobs`')),
    '图片文件必须在事务中写入清理作业'
  )
  assert.ok(
    statements.some(sql => sql.includes('WHERE id = ? AND _openid = ?')),
    '父植物删除必须双重限制 id 与 openid'
  )
}

{
  const { service, sqlCalls } = loadService({ parentExists: false })
  await assert.rejects(
    service.deleteUserPlantCompletely({
      openid: 'wx_other',
      plantId: 7,
      deleteFile: async () => {}
    }),
    error => error.code === 'USER_PLANT_NOT_FOUND' && error.statusCode === 404
  )
  assert.equal(sqlCalls.filter(call => call.sql.startsWith('DELETE FROM')).length, 0)
}

{
  const { service, jobUpdates } = loadService({
    pendingJobs: [{ id: 91, file_id: 'cloud://owner/pending.jpg' }]
  })
  const cleanup = await service.drainPendingPlantFileDeletionJobs({
    openid: 'wx_owner',
    deleteFile: async () => {
      const error = new Error('storage unavailable')
      error.code = 'NETWORK_ERROR'
      throw error
    }
  })
  assert.deepEqual(cleanup, { attempted: 1, pending: 1 })
  assert.equal(jobUpdates.length, 1)
  assert.deepEqual(jobUpdates[0].slice(0, 3), ['pending', 'NETWORK_ERROR', 'pending'])
}

{
  const { service } = loadService({ failCleanupRead: true })
  const result = await service.deleteUserPlantCompletely({
    openid: 'wx_owner',
    plantId: 7,
    deleteFile: async () => {}
  })
  assert.deepEqual(result, {
    plantId: 7,
    fileIds: ['cloud://owner/plant-7.jpg'],
    cleanupPending: true,
    cleanupAttempted: 0
  })
}

console.log('complete user plant deletion tests passed')
