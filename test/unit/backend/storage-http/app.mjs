import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(repoRoot, 'cloudfunctions/storage-http/app.js')
const originalLoad = Module._load
const calls = { ownedImage: 0, deleteFile: 0 }

const models = {
  async $runSQL() {
    return { data: { executeResultList: [] } }
  }
}

const cloudbase = {
  models,
  getCloudBase: () => ({
    async getTempFileURL() {
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
        runWithRequestAppEnv: (_env, task) => task(),
        resolveHttpUserInfo: async () => ({ openid: 'wx_owner' })
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
  assert.equal(storage._test.assertImagePayload({ base64: validPngBase64, suffix: 'png' }).length, 12)
  assert.throws(
    () => storage._test.assertImagePayload({ base64: validPngBase64, suffix: 'jpg' }),
    error => error.statusCode === 400
  )

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
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('storage HTTP boundary tests passed')
