import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(repoRoot, 'cloudfunctions/storage-http/app.js')
const originalLoad = Module._load
// data_mode=unit_fake：验证存储 HTTP 的边界与非敏感性能审计字段，不触发真实存储写入。
const calls = { ownedImage: 0, deleteFile: 0, diagnoseUpload: 0, tempUrl: 0 }
const sqlCalls = []
const registeredPlants = new Map()

const models = {
  async $runSQL(sql, params) {
    sqlCalls.push({ sql, params })
    if (sql.includes('SELECT _id, plantId, fileId FROM plant_images')) {
      const plantId = registeredPlants.get(params.fileId)
      return {
        data: {
          executeResultList: plantId
            ? [{ _id: 'pimg_existing', plantId, fileId: params.fileId }]
            : []
        }
      }
    }
    if (sql.includes('INSERT INTO plant_images')) {
      registeredPlants.set(params.fileId, params.plantId)
    }
    if (sql.includes('SELECT plantId FROM plant_images')) {
      const plantId = registeredPlants.get(params.fileId)
      return {
        data: { executeResultList: plantId ? [{ plantId }] : [] }
      }
    }
    return { data: { executeResultList: [] } }
  }
}

const cloudbase = {
  models,
  getCloudBase: () => ({
    async uploadFile({ fileContent }) {
      calls.diagnoseUpload += 1
      if (Buffer.isBuffer(fileContent)) {
        assert.equal(fileContent.length, 12)
        return { fileID: 'cloud://diagnose-upload-id' }
      }
      await new Promise((resolve, reject) => {
        fileContent.once('error', reject)
        fileContent.once('end', resolve)
        fileContent.resume()
      })
      return { fileID: 'cloud://diagnose-upload-id' }
    },
    async getTempFileURL() {
      calls.tempUrl += 1
      return { fileList: [{ tempFileURL: 'https://temp.example.com/image' }] }
    },
    async deleteFile() {
      calls.deleteFile += 1
    }
  })
}

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return cloudbase
    }
    if (request === '/opt/utils/http') {
      return {
        jsonResponse: (statusCode, body) => ({ statusCode, ...body }),
        notFound: requestPath => ({ statusCode: 404, code: 404, message: requestPath }),
        methodNotAllowed: () => ({ statusCode: 405, code: 405 }),
        getHttpRequestData: event => event,
        resolveRequestAppEnv: () => 'development',
        runWithRequestAppEnv: (_env, task) => task()
      }
    }
    if (request === '/opt/utils/platform-session') {
      return {
        assertPlatformFeature: () => true,
        getBearerToken: () => 'planting-session-v1_test',
        resolvePersistentSession: async () => ({ openid: 'wx_owner' })
      }
    }
    if (request === '/opt/utils/plant-images') {
      return {
        assertOwnedPlantImage: async () => {
          calls.ownedImage += 1
        },
        assertOwnedUserPlant: async () => {},
        bindOwnedTemporaryPlantImages: async () => {}
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const storage = require(sourcePath)
  const validPngBase64 = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('test')
  ]).toString('base64')

  assert.equal(storage._test.normalizeTempUrlAge(999999), 7200)
  assert.equal(storage._test.normalizeTempUrlAge(1), 300)
  assert.equal(storage._test.resolveImageSuffix({ suffix: 'png', mimeType: 'image/png' }), 'png')
  assert.throws(
    () => storage._test.resolveImageSuffix({ suffix: 'jpg', mimeType: 'image/png' }),
    error => error.statusCode === 400
  )
  assert.equal(
    storage._test.assertImagePayload({ base64: validPngBase64, suffix: 'png' }).length,
    12
  )
  assert.throws(
    () => storage._test.assertImagePayload({ base64: validPngBase64, suffix: 'jpg' }),
    error => error.statusCode === 400
  )

  const uploadResponse = await storage.main(
    {
      path: '/storage/diagnose-images',
      method: 'POST',
      body: {
        dataUrl: `data:image/png;base64,${validPngBase64}`,
        suffix: 'png',
        plantId: 'temp'
      },
      headers: {}
    },
    {}
  )
  assert.equal(uploadResponse.code, 200)
  assert.equal(uploadResponse.data.fileId, 'cloud://diagnose-upload-id')
  assert.equal(uploadResponse.data.size, 12)
  assert.equal(calls.diagnoseUpload, 1)
  assert.deepEqual(
    {
      contractVersion: uploadResponse.data.uploadTiming.contractVersion,
      transport: uploadResponse.data.uploadTiming.transport,
      binaryBytes: uploadResponse.data.uploadTiming.binaryBytes,
      base64Bytes: uploadResponse.data.uploadTiming.base64Bytes,
      base64ExpansionBytes: uploadResponse.data.uploadTiming.base64ExpansionBytes
    },
    {
      contractVersion: 'diagnose_image_upload_timing_v1',
      transport: 'json_base64',
      binaryBytes: 12,
      base64Bytes: validPngBase64.length,
      base64ExpansionBytes: validPngBase64.length - 12
    }
  )
  for (const key of [
    'decodeAndValidateMs',
    'tempWriteMs',
    'cloudStorageUploadMs',
    'tempUrlMs',
    'uploadPipelineMs'
  ]) {
    assert.equal(Number.isFinite(uploadResponse.data.uploadTiming[key]), true)
    assert.equal(uploadResponse.data.uploadTiming[key] >= 0, true)
  }
  assert.equal(Object.hasOwn(uploadResponse.data.uploadTiming, 'dataUrl'), false)
  assert.equal(Object.hasOwn(uploadResponse.data.uploadTiming, 'base64'), false)

  const multipartFilePath = path.join(
    os.tmpdir(),
    `storage-http-diagnose-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
  )
  await fs.writeFile(
    multipartFilePath,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('test')
    ])
  )
  const multipartResponse = await storage.main(
    {
      path: '/storage/diagnose-images',
      method: 'POST',
      body: {
        file: {
          filepath: multipartFilePath,
          originalFilename: 'diagnose.png',
          mimetype: 'image/png'
        },
        suffix: 'png',
        plantId: 'temp'
      },
      headers: {}
    },
    {}
  )
  assert.equal(multipartResponse.code, 200)
  assert.equal(multipartResponse.data.size, 12)
  assert.equal(calls.diagnoseUpload, 2)
  assert.deepEqual(
    {
      transport: multipartResponse.data.uploadTiming.transport,
      binaryBytes: multipartResponse.data.uploadTiming.binaryBytes,
      base64Bytes: multipartResponse.data.uploadTiming.base64Bytes,
      base64ExpansionBytes: multipartResponse.data.uploadTiming.base64ExpansionBytes
    },
    {
      transport: 'multipart_file',
      binaryBytes: 12,
      base64Bytes: 0,
      base64ExpansionBytes: 0
    }
  )
  await assert.rejects(fs.access(multipartFilePath), /ENOENT/u)

  const response = await storage.main(
    {
      path: '/storage/files',
      method: 'GET',
      query: { fileId: 'cloud://file-id', maxAge: 999999 },
      headers: {}
    },
    {}
  )
  assert.equal(response.code, 200)
  assert.equal(response.data.tempUrl, 'https://temp.example.com/image')
  assert.equal(calls.ownedImage, 1)

  const tempUrlCallsBeforeRegistration = calls.tempUrl
  const registered = await storage._test.registerDiagnosePlantImage({
    openid: 'wx_owner',
    plantId: 'temp',
    fileId: 'cloud://env/bucket/diagnose/wx_owner/temp.jpg',
    cloudPath: 'diagnose/wx_owner/temp.jpg'
  })
  assert.deepEqual(registered, {
    fileId: 'cloud://env/bucket/diagnose/wx_owner/temp.jpg',
    registered: true
  })
  assert.equal(
    calls.tempUrl,
    tempUrlCallsBeforeRegistration,
    '登记不应再次请求临时链接'
  )
  assert.ok(sqlCalls.some(call => call.sql.includes('ON DUPLICATE KEY UPDATE')))

  const repeated = await storage._test.registerDiagnosePlantImage({
    openid: 'wx_owner',
    plantId: 'temp',
    fileId: 'cloud://env/bucket/diagnose/wx_owner/temp.jpg',
    cloudPath: 'diagnose/wx_owner/temp.jpg'
  })
  assert.deepEqual(repeated, {
    fileId: 'cloud://env/bucket/diagnose/wx_owner/temp.jpg',
    registered: false
  })
  assert.equal(calls.tempUrl, tempUrlCallsBeforeRegistration)
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('storage HTTP boundary tests passed')
