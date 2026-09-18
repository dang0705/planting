import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/http-functions/storage/client.js'),
  'utf8'
)
const moduleSource = source
  .replace("import { requestHttpFile, requestHttpFunction } from '@/api/http'", '')
  .replace(
    /import \{[^}]*getCloudbaseUserIdentity[^}]*\} from ['"]@\/utils\/cloudbase-auth\.js['"]/u,
    ''
  )
  .replaceAll('export async function', 'async function')
  .replaceAll('export function', 'function')

const calls = []
const loaded = new Function(
  'requestHttpFile',
  'requestHttpFunction',
  'ensureWechatCloudInitialized',
  'getCloudbaseUserIdentity',
  `${moduleSource}
return { requestDiagnoseImageUpload }`
)(
  async (...args) => {
    calls.push({ type: 'http-file', args })
    return { code: 200, data: { tempUrl: 'https://fallback.test/image.jpg' } }
  },
  async (...args) => {
    calls.push({ type: 'http-function', args })
    return { code: 200, data: { tempUrl: 'https://fallback.test/image.jpg' } }
  },
  () => calls.push({ type: 'cloud-init' }),
  async () => ({ openid: 'wx-identity-user' })
)

const previousWx = globalThis.wx
try {
  globalThis.wx = {
    cloud: {
      uploadFile(options) {
        calls.push({ type: 'cloud-upload', options })
        options.success({ fileID: 'cloud://env/diagnose/wx-user/temp.jpg' })
      },
      getTempFileURL(options) {
        calls.push({ type: 'cloud-temp-url', options })
        return Promise.resolve({
          fileList: [{ code: 'SUCCESS', tempFileURL: 'https://cdn.test/image.jpg' }]
        })
      }
    }
  }

  const attempts = []
  const nativeResult = await loaded.requestDiagnoseImageUpload(
    {
      filePath: '/tmp/image.jpg',
      openid: 'wx-user',
      plantId: 'temp',
      suffix: 'jpg',
      maxAge: 7200,
      fileBytes: 1234
    },
    { onAttempt: attempt => attempts.push(attempt) }
  )
  assert.equal(nativeResult.tempUrl, 'https://cdn.test/image.jpg')
  assert.equal(nativeResult.uploadTiming.transport, 'wechat_cloud_native')
  assert.equal(nativeResult.uploadTiming.binaryBytes, 1234)
  assert.deepEqual(attempts, [1])
  assert.equal(
    calls.some(call => call.type === 'http-file'),
    false
  )
  assert.equal(
    calls.some(call => call.type === 'http-function'),
    false
  )
  assert.match(
    calls.find(call => call.type === 'cloud-upload').options.cloudPath,
    /^diagnose\/wx-user\//u
  )
  assert.deepEqual(calls.find(call => call.type === 'cloud-temp-url').options.fileList, [
    'cloud://env/diagnose/wx-user/temp.jpg'
  ])

  calls.length = 0
  const uploadOnlyResult = await loaded.requestDiagnoseImageUpload({
    filePath: '/tmp/soil.jpg',
    openid: 'wx-user',
    plantId: 'temp',
    suffix: 'jpg',
    resolveTempUrl: false
  })
  assert.equal(uploadOnlyResult.fileId, 'cloud://env/diagnose/wx-user/temp.jpg')
  assert.equal(uploadOnlyResult.tempUrl, '')
  assert.equal(calls.some(call => call.type === 'cloud-temp-url'), false)

  globalThis.wx = {
    cloud: {
      uploadFile(options) {
        calls.push({ type: 'cloud-upload', options })
        options.success({ fileID: 'cloud://env/diagnose/wx-identity-user/temp.jpg' })
      },
      getTempFileURL(options) {
        calls.push({ type: 'cloud-temp-url', options })
        return Promise.resolve({
          fileList: [{ code: 'SUCCESS', tempFileURL: 'https://cdn.test/identity-image.jpg' }]
        })
      }
    }
  }
  calls.length = 0
  const identityResult = await loaded.requestDiagnoseImageUpload({
    filePath: '/tmp/image.jpg',
    suffix: 'jpg',
    fileBytes: 1234
  })
  assert.equal(identityResult.tempUrl, 'https://cdn.test/identity-image.jpg')
  assert.match(
    calls.find(call => call.type === 'cloud-upload').options.cloudPath,
    /^diagnose\/wx-identity-user\//u
  )
  assert.equal(
    calls.some(call => call.type === 'http-file'),
    false
  )

  globalThis.wx = { cloud: {} }
  calls.length = 0
  const fallbackResult = await loaded.requestDiagnoseImageUpload({
    filePath: '/tmp/image.jpg',
    suffix: 'jpg'
  })
  assert.equal(fallbackResult.tempUrl, 'https://fallback.test/image.jpg')
  assert.equal(
    calls.some(call => call.type === 'http-file'),
    true
  )
} finally {
  globalThis.wx = previousWx
}

console.log('native diagnosis image upload routing tests passed')
