'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { models, getCloudBase } = require('/opt/utils/cloudbase')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const {
  assertOwnedPlantImage,
  assertOwnedUserPlant,
  bindOwnedTemporaryPlantImages
} = require('/opt/utils/plant-images')
let platformSession
try {
  platformSession = require('/opt/utils/platform-session')
} catch {
  platformSession = require('../layer/utils/platform-session')
}
const { assertPlatformFeature } = platformSession

const ALLOWED_IMAGE_SUFFIXES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MIN_TEMP_URL_AGE_SECONDS = 300
const MAX_TEMP_URL_AGE_SECONDS = 7200

function createRequestError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeTempUrlAge(value, fallback = 3600) {
  const parsed = Number(value)
  const normalized = Number.isFinite(parsed) ? parsed : fallback
  return Math.max(MIN_TEMP_URL_AGE_SECONDS, Math.min(MAX_TEMP_URL_AGE_SECONDS, normalized))
}

function isTemporaryPlantImageId(value) {
  return ['', 'temp', 'identify'].includes(String(value || '').trim())
}

function normalizePaginationValue(value, fallback, maximum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(0, Math.min(maximum, Math.floor(parsed)))
}

async function getPlantImages({ plantId, openid, limit = 10, offset = 0 }) {
  const result = await models.$runSQL(
    `SELECT * FROM plant_images
     WHERE plantId = {{plantId}} AND _openid = {{openid}}
     ORDER BY uploadedAt DESC
     LIMIT {{limit}} OFFSET {{offset}}`,
    { plantId, openid, limit, offset }
  )
  return result?.data?.executeResultList || []
}

function sanitizePathSegment(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)

  return normalized || fallback
}

function parseImageDataUrl(dataUrl = '') {
  const match = String(dataUrl || '')
    .trim()
    .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i)

  if (!match) {
    throw createRequestError(400, '图片数据格式无效')
  }

  const mimeType = String(match[1] || '').toLowerCase()
  const base64 = String(match[2] || '').trim()

  if (!base64) {
    throw createRequestError(400, '图片内容为空')
  }

  return { mimeType, base64 }
}

function decodeImageBase64(base64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw createRequestError(400, '图片内容格式无效')
  }
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    throw createRequestError(400, '图片内容为空')
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createRequestError(413, '图片过大，请选择 5MB 以下')
  }
  return buffer
}

function resolveImageSuffix({ suffix = '', mimeType = '' } = {}) {
  const normalizedSuffix = String(suffix || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')

  const mimeToSuffix = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/gif': 'gif'
  }
  const inferred = mimeToSuffix[String(mimeType || '').toLowerCase()]

  if (normalizedSuffix) {
    if (!ALLOWED_IMAGE_SUFFIXES.has(normalizedSuffix)) {
      throw createRequestError(400, '不支持的图片格式')
    }
    const comparableSuffix = normalizedSuffix === 'jpeg' ? 'jpg' : normalizedSuffix
    if (inferred && comparableSuffix !== inferred) {
      throw createRequestError(400, '图片格式与文件内容不一致')
    }
    return normalizedSuffix
  }

  if (!inferred || !ALLOWED_IMAGE_SUFFIXES.has(inferred)) {
    throw createRequestError(400, '无法识别图片格式')
  }

  return inferred
}

function hasExpectedImageSignature(buffer, suffix) {
  const normalizedSuffix = suffix === 'jpeg' ? 'jpg' : suffix
  const signatures = {
    jpg: () => buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    png: () =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    webp: () =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
    gif: () =>
      buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
    heic: () => buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  }
  return Boolean(signatures[normalizedSuffix]?.())
}

function assertImagePayload({ base64, suffix }) {
  const buffer = decodeImageBase64(base64)
  if (!hasExpectedImageSignature(buffer, suffix)) {
    throw createRequestError(400, '图片内容与格式不一致')
  }
  return buffer
}

function buildDiagnoseImageCloudPath({ openid, plantId, suffix }) {
  const safeOpenid = sanitizePathSegment(openid, 'anon')
  const safePlantId = sanitizePathSegment(plantId, 'temp')
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex')
  return `diagnose/${safeOpenid}/${safePlantId}_${timestamp}_${random}.${suffix}`
}

function buildPlantImageCloudPath({ openid, plantId, suffix }) {
  const safeOpenid = sanitizePathSegment(openid, 'anon')
  const safePlantId = sanitizePathSegment(plantId, 'temp')
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex')
  return `plants/${safeOpenid}/${safePlantId}_${timestamp}_${random}.${suffix}`
}

async function uploadDiagnoseImage({ dataUrl, suffix, plantId, openid, maxAge }) {
  const app = getCloudBase()
  const { mimeType, base64 } = parseImageDataUrl(dataUrl)
  const normalizedSuffix = resolveImageSuffix({ suffix, mimeType })
  const buffer = assertImagePayload({ base64, suffix: normalizedSuffix })

  const tempFilePath = path.join(
    os.tmpdir(),
    `diagnose_upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${normalizedSuffix}`
  )
  const cloudPath = buildDiagnoseImageCloudPath({
    openid,
    plantId,
    suffix: normalizedSuffix
  })

  await fs.promises.writeFile(tempFilePath, buffer)

  try {
    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: fs.createReadStream(tempFilePath)
    })
    const fileId = uploadResult?.fileID || uploadResult?.fileId || ''

    if (!fileId) {
      throw new Error('上传后未获取到文件ID')
    }

    const urlResult = await app.getTempFileURL({
      fileList: [fileId],
      maxAge: normalizeTempUrlAge(maxAge, 7200)
    })
    const tempUrl = urlResult?.fileList?.[0]?.tempFileURL || ''

    if (!tempUrl) {
      throw new Error('上传成功但未获取到图片访问地址')
    }

    return {
      fileId,
      cloudPath,
      url: tempUrl,
      tempUrl,
      suffix: normalizedSuffix,
      mimeType,
      size: buffer.length
    }
  } finally {
    await fs.promises.unlink(tempFilePath).catch(() => {})
  }
}

async function uploadStorageImage({
  dataUrl,
  suffix,
  plantId,
  openid,
  maxAge,
  buildCloudPath
}) {
  const app = getCloudBase()
  const { mimeType, base64 } = parseImageDataUrl(dataUrl)
  const normalizedSuffix = resolveImageSuffix({ suffix, mimeType })
  const buffer = assertImagePayload({ base64, suffix: normalizedSuffix })

  const tempFilePath = path.join(
    os.tmpdir(),
    `storage_upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${normalizedSuffix}`
  )
  const cloudPath = buildCloudPath({
    openid,
    plantId,
    suffix: normalizedSuffix
  })

  await fs.promises.writeFile(tempFilePath, buffer)

  try {
    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: fs.createReadStream(tempFilePath)
    })
    const fileId = uploadResult?.fileID || uploadResult?.fileId || ''

    if (!fileId) {
      throw new Error('上传后未获取到文件ID')
    }

    const urlResult = await app.getTempFileURL({
      fileList: [fileId],
      maxAge: normalizeTempUrlAge(maxAge, 7200)
    })
    const tempUrl = urlResult?.fileList?.[0]?.tempFileURL || ''

    return {
      fileId,
      cloudPath,
      url: tempUrl,
      tempUrl,
      suffix: normalizedSuffix,
      mimeType,
      size: buffer.length
    }
  } finally {
    await fs.promises.unlink(tempFilePath).catch(() => {})
  }
}

async function uploadPlantImageFile({ dataUrl, suffix, plantId, openid, maxAge }) {
  const uploaded = await uploadStorageImage({
    dataUrl,
    suffix,
    plantId,
    openid,
    maxAge,
    buildCloudPath: buildPlantImageCloudPath
  })

  const now = Date.now()
  const recordId = `pimg_${now}_${crypto.randomBytes(4).toString('hex')}`
  await models.$runSQL(
    `INSERT INTO plant_images (
      _id, _openid, plantId, fileName, fileId, url, uploadedAt, createdAt
    ) VALUES (
      {{recordId}}, {{openid}}, {{plantId}}, {{fileName}}, {{fileId}}, {{url}}, {{uploadedAt}}, {{createdAt}}
    )`,
    {
      recordId,
      openid: String(openid || '').trim(),
      plantId: String(plantId || '').trim(),
      fileName: uploaded.cloudPath,
      fileId: uploaded.fileId,
      url: uploaded.url || uploaded.tempUrl || '',
      uploadedAt: now,
      createdAt: now
    }
  )

  return uploaded
}

async function getFileTempUrl(fileId, maxAge = 3600) {
  const app = getCloudBase()
  const urlResult = await app.getTempFileURL({
    fileList: [String(fileId || '').trim()],
    maxAge: normalizeTempUrlAge(maxAge, 3600)
  })
  const tempUrl = urlResult?.fileList?.[0]?.tempFileURL || ''

  if (!tempUrl) {
    throw new Error('获取图片链接失败')
  }

  return tempUrl
}

async function deleteDiagnoseImage(fileId) {
  const app = getCloudBase()
  await app.deleteFile({
    fileList: [String(fileId || '').trim()]
  })
}

async function deleteOwnedPlantImage({ openid, fileId }) {
  await assertOwnedPlantImage({ openid, fileId })
  await deleteDiagnoseImage(fileId)
  await models.$runSQL(
    'DELETE FROM plant_images WHERE _openid = {{openid}} AND fileId = {{fileId}}',
    { openid: String(openid || '').trim(), fileId: String(fileId || '').trim() }
  )
}

async function assertOwnedUploadTarget({ openid, plantId }) {
  if (isTemporaryPlantImageId(plantId)) {
    return
  }
  await assertOwnedUserPlant({ openid, plantId })
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const requestPath = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (requestPath.includes('/storage/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (
      !requestPath.includes('/storage/plant-images') &&
      !requestPath.includes('/storage/diagnose-images') &&
      !requestPath.includes('/storage/files')
    ) {
      return notFound(requestPath)
    }

    const payload = method === 'GET' ? request.query : request.body
    const userInfo = await resolveHttpUserInfo(request.headers, payload, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    try {
      assertPlatformFeature(userInfo, requestPath)
    } catch (error) {
      if (Number(error?.statusCode) === 403) {
        return jsonResponse(403, { code: error.code, message: error.message, data: null })
      }
      throw error
    }

    if (requestPath.includes('/storage/diagnose-images')) {
      if (method === 'POST') {
        if (!payload.dataUrl) {
          return jsonResponse(400, { code: 400, message: '缺少必要参数: dataUrl', data: null })
        }

        const uploaded = await uploadDiagnoseImage({
          dataUrl: payload.dataUrl,
          suffix: payload.suffix,
          plantId: payload.plantId,
          openid: userInfo.openid,
          maxAge: payload.maxAge
        })

        return jsonResponse(200, {
          code: 200,
          message: '上传成功',
          data: uploaded
        })
      }

      if (method === 'DELETE') {
        if (!payload.fileId) {
          return jsonResponse(400, { code: 400, message: '缺少必要参数: fileId', data: null })
        }

        const safeOpenid = sanitizePathSegment(userInfo.openid, 'anon')
        if (!String(payload.fileId || '').includes(`/diagnose/${safeOpenid}/`)) {
          return jsonResponse(403, { code: 403, message: '无权删除该诊断图片', data: null })
        }

        await deleteDiagnoseImage(payload.fileId)
        return jsonResponse(200, {
          code: 200,
          message: '删除成功',
          data: null
        })
      }

      return methodNotAllowed(method)
    }

    if (requestPath.includes('/storage/files')) {
      if (method === 'POST') {
        if (!payload.dataUrl) {
          return jsonResponse(400, { code: 400, message: '缺少必要参数: dataUrl', data: null })
        }

        await assertOwnedUploadTarget({ openid: userInfo.openid, plantId: payload.plantId })
        const uploaded = await uploadPlantImageFile({
          dataUrl: payload.dataUrl,
          suffix: payload.suffix,
          plantId: payload.plantId,
          openid: userInfo.openid,
          maxAge: payload.maxAge
        })

        return jsonResponse(200, {
          code: 200,
          message: '上传成功',
          data: uploaded
        })
      }

      if (method === 'GET') {
        if (!payload.fileId) {
          return jsonResponse(400, { code: 400, message: '缺少必要参数: fileId', data: null })
        }

        await assertOwnedPlantImage({ openid: userInfo.openid, fileId: payload.fileId })
        const tempUrl = await getFileTempUrl(payload.fileId, payload.maxAge)
        return jsonResponse(200, {
          code: 200,
          message: '获取成功',
          data: {
            fileId: String(payload.fileId || '').trim(),
            tempUrl,
            url: tempUrl
          }
        })
      }

      if (method === 'DELETE') {
        if (!payload.fileId) {
          return jsonResponse(400, { code: 400, message: '缺少必要参数: fileId', data: null })
        }

        await deleteOwnedPlantImage({ openid: userInfo.openid, fileId: payload.fileId })
        return jsonResponse(200, {
          code: 200,
          message: '删除成功',
          data: null
        })
      }

      return methodNotAllowed(method)
    }

    if (method === 'GET') {
      if (!payload.plantId) {
        return jsonResponse(400, { code: 400, message: '缺少必要参数: plantId', data: null })
      }
      await assertOwnedUserPlant({ openid: userInfo.openid, plantId: payload.plantId })
      return jsonResponse(200, {
        code: 200,
        message: '获取成功',
        data: {
          images: await getPlantImages({
            plantId: payload.plantId,
            openid: userInfo.openid,
            limit: normalizePaginationValue(payload.limit, 10, 50),
            offset: normalizePaginationValue(payload.offset, 0, 1000)
          })
        }
      })
    }

    if (method === 'PATCH') {
      if (!payload.fileId || !payload.plantId) {
        return jsonResponse(400, { code: 400, message: '缺少必要参数: fileId, plantId', data: null })
      }
      await bindOwnedTemporaryPlantImages({
        openid: userInfo.openid,
        plantId: payload.plantId,
        fileIds: [payload.fileId]
      })
      return jsonResponse(200, { code: 200, message: '更新成功', data: null })
    }

    return methodNotAllowed(method)
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500
    if (statusCode >= 500) {
      console.error('storage-http error:', error)
    }
    return jsonResponse(statusCode, {
      code: statusCode,
      message: statusCode >= 500 ? '图片服务暂时不可用，请稍后重试' : error.message,
      data: null
    })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}

module.exports._test = {
  assertImagePayload,
  buildDiagnoseImageCloudPath,
  buildPlantImageCloudPath,
  normalizeTempUrlAge,
  resolveImageSuffix
}
