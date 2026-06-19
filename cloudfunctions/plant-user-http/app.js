'use strict'

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
  createUserPlantInstance,
  listUserPlantInstances,
  updateUserPlantInstance,
  deleteUserPlantInstance
} = require('/opt/utils/plant-knowledge')
const {
  attachCareLocation,
  attachCareLocationsToList,
  savePlantCareLocation
} = require('./care-location-service')

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/user-plants/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/user-plants')) {
      return notFound(path)
    }

    const userInfo = await resolveHttpUserInfo(request.headers, request.query, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    const openid = userInfo.openid

    if (method === 'GET') {
      const data = await listUserPlantInstances(openid, {
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || 20)
      })
      const enrichedData = await attachCareLocationsToList({ openid, data })
      return jsonResponse(200, { code: 200, data: enrichedData })
    }

    if (method === 'POST') {
      const created = await createUserPlantInstance({
        openid,
        plantId: request.body.plantId || null,
        plantIdentityId: request.body.plantIdentityId || null,
        sessionPlantId: request.body.sessionPlantId || null,
        recognizedName: request.body.recognizedName || null,
        sourceType: request.body.sourceType || 'catalog',
        recognitionType: request.body.recognitionType || null,
        recognitionConfidence: request.body.recognitionConfidence || null,
        identityResolutionStatus: request.body.identityResolutionStatus || null,
        visualCallBatchId: request.body.visualCallBatchId || null,
        nickname: request.body.nickname || request.body.nickName || null,
        location: request.body.location || '阳台',
        photos: request.body.photos || null
      })
      const careLocation = await savePlantCareLocation({
        openid,
        plantId: created?.id,
        careLocation: request.body.careLocation || request.body.plantCareLocation || null
      })
      return jsonResponse(200, {
        code: 200,
        message: '保存成功',
        data: attachCareLocation(created, careLocation)
      })
    }

    if (method === 'PATCH') {
      const id = Number(request.body.id || request.query.id)
      if (!id) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      const updated = await updateUserPlantInstance(openid, id, request.body)
      const careLocation = await savePlantCareLocation({
        openid,
        plantId: id,
        careLocation: request.body.careLocation || request.body.plantCareLocation || null
      })
      return jsonResponse(200, {
        code: 200,
        message: '更新成功',
        data: attachCareLocation(updated, careLocation)
      })
    }

    if (method === 'DELETE') {
      const id = Number(request.body.id || request.query.id)
      if (!id) {
        return jsonResponse(400, { code: 400, message: '缺少植物ID', data: null })
      }
      await deleteUserPlantInstance(openid, id)
      return jsonResponse(200, { code: 200, message: '删除成功', data: { id } })
    }

    return methodNotAllowed(method)
  } catch (error) {
    console.error('plant-user-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
