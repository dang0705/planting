'use strict'

const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const {
  listDiagnosisSessions,
  getDiagnosisSessionDetail,
  buildDiagnosisDecision
} = require('/opt/utils/plant-knowledge')

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/diagnosis/history/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    const userInfo = await resolveHttpUserInfo(request.headers, request.query, context)
    if (!userInfo?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }

    if (path.includes('/diagnosis/history/detail')) {
      if (method !== 'GET') return methodNotAllowed(method)
      const detail = await getDiagnosisSessionDetail(userInfo.openid, request.query.id)
      if (!detail) {
        return jsonResponse(404, { code: 404, message: '诊断记录不存在', data: null })
      }
      return jsonResponse(200, { code: 200, data: detail })
    }

    if (path.includes('/diagnosis/history')) {
      if (method !== 'GET') return methodNotAllowed(method)
      const data = await listDiagnosisSessions(userInfo.openid, {
        page: Number(request.query.page || 1),
        pageSize: Number(request.query.pageSize || 10),
        userPlantId: request.query.plantId || null
      })
      return jsonResponse(200, { code: 200, data })
    }

    if (path.includes('/diagnosis/decision')) {
      if (method !== 'POST') return methodNotAllowed(method)
      const decision = await buildDiagnosisDecision({
        openid: userInfo.openid,
        plantId: request.body.plantId || null,
        userPlantId: request.body.userPlantId || null,
        observedSymptoms: request.body.observedSymptoms || []
      })
      return jsonResponse(200, { code: 200, data: decision })
    }

    return notFound(path)
  } catch (error) {
    console.error('diagnosis-history-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }
}

module.exports.main = main
