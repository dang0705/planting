'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveHttpUserInfo
} = require('/opt/utils/http')

async function getPlantImages(plantId, limit = 10, offset = 0) {
  const result = await models.$runSQL(
    `SELECT * FROM plant_images
     WHERE plant_id = {{plantId}}
     ORDER BY uploaded_at DESC
     LIMIT {{limit}} OFFSET {{offset}}`,
    { plantId, limit, offset }
  )
  return result?.data?.executeResultList || []
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/storage/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/storage/plant-images')) {
      return notFound(path)
    }

    const payload = method === 'GET' ? request.query : request.body
    const userInfo = await resolveHttpUserInfo(request.headers, payload, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
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
        'UPDATE plant_images SET plant_id = {{plantId}} WHERE file_id = {{fileId}}',
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

module.exports.main = main
