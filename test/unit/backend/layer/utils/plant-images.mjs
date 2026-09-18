import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(repoRoot, 'cloudfunctions/layer/utils/plant-images.js')
const originalLoad = Module._load
const sqlCalls = []

const models = {
  async $runSQL(sql, params) {
    sqlCalls.push({ sql, params })
    if (sql.includes('FROM plant_images')) {
      if (params.fileId === 'foreign-file') {
        return { data: { executeResultList: [] } }
      }
      if (params.fileId === 'bound-file') {
        return {
          data: { executeResultList: [{ _id: '2', _openid: params.openid, plantId: '99', fileId: params.fileId }] }
        }
      }
      return {
        data: { executeResultList: [{ _id: '1', _openid: params.openid, plantId: 'identify', fileId: params.fileId }] }
      }
    }
    if (sql.includes('FROM user_plant_instances')) {
      return { data: { executeResultList: [{ id: params.plantId }] } }
    }
    return { data: { executeResultList: [] } }
  }
}

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === './cloudbase' && parent?.filename === sourcePath) {
      return { models }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const plantImages = require(sourcePath)

  assert.deepEqual(plantImages.normalizeFileIds([' file-a ', 'file-a', '', null]), ['file-a'])
  await assert.rejects(
    plantImages.assertOwnedTemporaryPlantImages({ openid: 'wx_user', fileIds: ['foreign-file'] }),
    error => error.statusCode === 403
  )
  await assert.rejects(
    plantImages.assertOwnedTemporaryPlantImages({ openid: 'wx_user', fileIds: ['bound-file'] }),
    error => error.statusCode === 409
  )

  const bound = await plantImages.bindOwnedTemporaryPlantImages({
    openid: 'wx_user',
    plantId: 12,
    fileIds: ['file-a']
  })
  assert.deepEqual(bound, ['file-a'])
  assert.ok(
    sqlCalls.some(
      call =>
        call.sql.includes('UPDATE plant_images') &&
        call.params.openid === 'wx_user' &&
        call.params.plantId === 12 &&
        call.params.fileId === 'file-a'
    )
  )
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('plant image ownership tests passed')
