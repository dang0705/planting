'use strict'

// 共享天气对象存储抽象。从 weather-http/services/weather-object-storage.js 下沉到 layer，
// 供 weather-http / plant-user-http / diagnose-http 等多个云函数复用。
// weather-ingestion-scheduler 维持自身 services/weather-object-storage.js 副本，不依赖本文件。

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const DEFAULT_STORAGE_BUCKET_BY_ENV = {
  'cloud1-2grufevs395a9d5e': '636c-cloud1-2grufevs395a9d5e-1403815561'
}

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

function isMissingStorageObjectError(error) {
  const code = String(error?.code || error?.errorCode || '')
  const message = String(error?.message || error || '')
  return code === 'STORAGE_FILE_NONEXIST' || /not\s*found|不存在|NoSuchKey|404/i.test(message)
}

function resolveCloudBaseEnvId(app = {}) {
  return String(
    process.env.CLOUDBASE_ENV_ID ||
      process.env.TCB_ENV ||
      app?.config?.env ||
      app?.config?.envId ||
      app?.config?.envName ||
      ''
  ).trim()
}

function collectStorageBuckets(envId = '') {
  return [
    process.env.WEATHER_CACHE_STORAGE_BUCKET,
    process.env.CLOUDBASE_STORAGE_BUCKET,
    process.env.TCB_STORAGE_BUCKET,
    DEFAULT_STORAGE_BUCKET_BY_ENV[envId]
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean)
}

function buildCloudStorageFileId({ envId = '', bucket = '', cloudPath = '' } = {}) {
  const normalizedPath = String(cloudPath || '').replace(/^\/+/, '')
  if (!normalizedPath) {
    return ''
  }
  const normalizedBucket = String(bucket || '')
    .trim()
    .replace(/\/+$/, '')
  if (normalizedBucket.startsWith('cloud://')) {
    return `${normalizedBucket}/${normalizedPath}`
  }
  if (!envId || !normalizedBucket) {
    return ''
  }
  const bucketSegment = normalizedBucket.includes('.')
    ? normalizedBucket
    : `${envId}.${normalizedBucket}`
  return `cloud://${bucketSegment}/${normalizedPath}`
}

function buildCloudStorageFileIdCandidates({ app = {}, cloudPath = '' } = {}) {
  const normalizedPath = String(cloudPath || '').replace(/^\/+/, '')
  if (!normalizedPath) {
    return []
  }
  const envId = resolveCloudBaseEnvId(app)
  const candidates = collectStorageBuckets(envId)
    .map(bucket => buildCloudStorageFileId({ envId, bucket, cloudPath: normalizedPath }))
    .filter(Boolean)
  candidates.push(`cloud://${normalizedPath}`)
  return [...new Set(candidates)]
}

async function readJsonFromFileId(app, fileId = '') {
  if (!fileId || typeof app.downloadFile !== 'function') {
    return null
  }
  const result = await app.downloadFile({ fileID: fileId }).catch(error => {
    if (isMissingStorageObjectError(error)) {
      return null
    }
    throw error
  })
  return parseJsonBuffer(result)
}

async function resolveFileIdFromCloudPath(app, cloudPath = '') {
  const pathKey = String(cloudPath || '').trim()
  if (!pathKey || typeof app.getUploadMetadata !== 'function') {
    return ''
  }

  const result = await app.getUploadMetadata({ cloudPath: pathKey }).catch(error => {
    if (isMissingStorageObjectError(error)) {
      return null
    }
    throw error
  })

  return String(
    result?.data?.fileId || result?.data?.fileID || result?.fileId || result?.fileID || ''
  )
}

function createWeatherObjectStorage({ app = loadDefaultCloudBaseApp() } = {}) {
  async function uploadJson({ cloudPath = '', payload = {} } = {}) {
    if (!cloudPath) {
      throw new Error('缺少天气缓存对象路径')
    }

    const existingFileId = await resolveFileIdFromCloudPath(app, cloudPath).catch(() => '')
    if (existingFileId && typeof app.deleteFile === 'function') {
      await app.deleteFile({ fileList: [existingFileId] }).catch(error => {
        if (isMissingStorageObjectError(error)) {
          return null
        }
        throw error
      })
    }

    const tempFilePath = createTempJsonFileName()
    await fs.promises.writeFile(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: fs.createReadStream(tempFilePath)
    })
    return {
      cloudPath,
      fileId: uploadResult?.fileID || uploadResult?.fileId || uploadResult?.fileIDList?.[0] || ''
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
        if (isMissingStorageObjectError(error)) {
          return null
        }
        throw error
      })
      const parsed = parseJsonBuffer(result)
      if (parsed) {
        return parsed
      }
    }

    for (const candidateFileId of buildCloudStorageFileIdCandidates({ app, cloudPath })) {
      const parsed = await readJsonFromFileId(app, candidateFileId)
      if (parsed) {
        return parsed
      }
    }

    const resolvedFileId = await resolveFileIdFromCloudPath(app, cloudPath)
    if (resolvedFileId) {
      return readJsonFromFileId(app, resolvedFileId)
    }

    return null
  }

  async function deleteJson({ cloudPath = '', fileId = '' } = {}) {
    const targetFileId =
      String(fileId || '').trim() || (await resolveFileIdFromCloudPath(app, cloudPath))
    if (!targetFileId || typeof app.deleteFile !== 'function') {
      return false
    }
    await app.deleteFile({ fileList: [targetFileId] }).catch(error => {
      if (isMissingStorageObjectError(error)) {
        return null
      }
      throw error
    })
    return true
  }

  return {
    deleteJson,
    uploadJson,
    downloadJson
  }
}

module.exports = {
  buildCloudStorageFileIdCandidates,
  createWeatherObjectStorage,
  isMissingStorageObjectError,
  parseJsonBuffer,
  resolveFileIdFromCloudPath
}
