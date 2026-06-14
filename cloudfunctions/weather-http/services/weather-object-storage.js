'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

function loadDefaultCloudBaseApp() {
  try {
    return require('/opt/utils/cloudbase').getCloudBase()
  } catch {
    return {
      async uploadFile() {
        throw new Error('缺少 CloudBase app，请在测试中注入 app')
      }
    }
  }
}

function createTempJsonFileName() {
  return path.join(
    os.tmpdir(),
    `weather_cache_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.json`
  )
}

function parseJsonBuffer(value) {
  if (!value) {
    return null
  }
  if (Buffer.isBuffer(value)) {
    return JSON.parse(value.toString('utf8'))
  }
  if (typeof value === 'string') {
    return JSON.parse(value)
  }
  if (value instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(value).toString('utf8'))
  }
  if (value.Body) {
    return parseJsonBuffer(value.Body)
  }
  if (value.fileContent) {
    return parseJsonBuffer(value.fileContent)
  }
  if (value.data) {
    return parseJsonBuffer(value.data)
  }
  return null
}

async function readJsonFromFileId(app, fileId = '') {
  if (!fileId || typeof app.downloadFile !== 'function') {
    return null
  }
  const result = await app.downloadFile({ fileID: fileId }).catch(error => {
    const message = String(error?.message || error || '')
    if (/not\s*found|不存在|NoSuchKey|404/i.test(message)) {
      return null
    }
    throw error
  })
  return parseJsonBuffer(result)
}

function createWeatherObjectStorage({ app = loadDefaultCloudBaseApp() } = {}) {
  async function uploadJson({ cloudPath = '', payload = {} } = {}) {
    if (!cloudPath) {
      throw new Error('缺少天气缓存对象路径')
    }

    const tempFilePath = createTempJsonFileName()
    await fs.promises.writeFile(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

    try {
      const uploadResult = await app.uploadFile({
        cloudPath,
        fileContent: fs.createReadStream(tempFilePath)
      })
      return {
        cloudPath,
        fileId: uploadResult?.fileID || uploadResult?.fileId || uploadResult?.fileIDList?.[0] || ''
      }
    } finally {
      await fs.promises.unlink(tempFilePath).catch(() => {})
    }
  }

  async function downloadJson({ cloudPath = '', fileId = '' } = {}) {
    if (fileId) {
      const parsed = await readJsonFromFileId(app, fileId)
      if (parsed) {
        return parsed
      }
    }

    if (typeof app.downloadFileByCloudPath === 'function' && cloudPath) {
      const result = await app.downloadFileByCloudPath({ cloudPath }).catch(error => {
        const message = String(error?.message || error || '')
        if (/not\s*found|不存在|NoSuchKey|404/i.test(message)) {
          return null
        }
        throw error
      })
      const parsed = parseJsonBuffer(result)
      if (parsed) {
        return parsed
      }
    }

    return null
  }

  return {
    uploadJson,
    downloadJson
  }
}

module.exports = {
  createWeatherObjectStorage,
  parseJsonBuffer
}
