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

const ALLOWED_IMAGE_SUFFIXES = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'])

async function getPlantImages(plantId, limit = 10, offset = 0) {
  const result = await models.$runSQL(
    `SELECT * FROM plant_images
     WHERE plantId = {{plantId}}
     ORDER BY uploadedAt DESC
     LIMIT {{limit}} OFFSET {{offset}}`,
    { plantId, limit, offset }
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
    throw new Error('图片数据格式无效')
  }

  const mimeType = String(match[1] || '').toLowerCase()
  const base64 = String(match[2] || '').trim()

  if (!base64) {
    throw new Error('图片内容为空')
  }

  return { mimeType, base64 }
}

function resolveImageSuffix({ suffix = '', mimeType = '' } = {}) {
  const normalizedSuffix = String(suffix || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')

  if (normalizedSuffix) {
    if (!ALLOWED_IMAGE_SUFFIXES.has(normalizedSuffix)) {
      throw new Error(`不支持的图片格式: ${normalizedSuffix}`)
    }
    return normalizedSuffix
  }

  const mimeToSuffix = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/gif': 'gif'
  }

  const inferred = mimeToSuffix[String(mimeType || '').toLowerCase()]
  if (!inferred || !ALLOWED_IMAGE_SUFFIXES.has(inferred)) {
    throw new Error('无法识别图片格式')
  }

  return inferred
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
  const buffer = Buffer.from(base64, 'base64')

  if (!buffer.length) {
    throw new Error('图片内容为空')
  }

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
      maxAge: Number(maxAge || 7200)
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
  const buffer = Buffer.from(base64, 'base64')

  if (!buffer.length) {
    throw new Error('图片内容为空')
  }

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
      maxAge: Number(maxAge || 7200)
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
    maxAge: Number(maxAge || 3600)
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

        await deleteDiagnoseImage(payload.fileId)
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
      return jsonResponse(200, {
        code: 200,
        message: '获取成功',
        data: {
          images: await getPlantImages(payload.plantId, Number(payload.limit || 10), Number(payload.offset || 0))
        }
      })
    }

    if (method === 'PATCH') {
      if (!payload.fileId || !payload.plantId) {
        return jsonResponse(400, { code: 400, message: '缺少必要参数: fileId, plantId', data: null })
      }
      await models.$runSQL(
        'UPDATE plant_images SET plantId = {{plantId}} WHERE fileId = {{fileId}}',
        { plantId: payload.plantId, fileId: payload.fileId }
      )
      return jsonResponse(200, { code: 200, message: '更新成功', data: null })
    }

    return methodNotAllowed(method)
  } catch (error) {
    console.error('storage-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
