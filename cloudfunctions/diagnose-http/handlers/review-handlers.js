'use strict'

const { jsonResponse } = require('/opt/utils/http')
const { resolveRequestPrincipal, assertInternalReviewAccess } = require('../services/request-guard')
const {
  listDiagnosisReviewSessions,
  getDiagnosisReviewImages,
  getDiagnosisReviewDetail,
  upsertDiagnosisBatchReviews
} = require('../repositories/diagnosis-review-repository')

async function handleDiagnosisReviewList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })
  const outcomeType = String(
    query?.outcomeType || query?.status || query?.outcome || 'all'
  ).trim()

  const data = await listDiagnosisReviewSessions({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    outcomeType,
    keyword: query?.keyword || '',
    sourceType: query?.sourceType || 'all'
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewImages(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getDiagnosisReviewImages({
    diagnosisSessionId:
      query?.diagnosisSessionId || query?.sessionId || query?.id || query?.resultId || '',
    sourceType: query?.sourceType || 'all'
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '诊断图片不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewDetail(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getDiagnosisReviewDetail({
    diagnosisSessionId:
      query?.diagnosisSessionId || query?.sessionId || query?.id || query?.resultId || '',
    sourceType: query?.sourceType || 'all'
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '诊断记录不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleDiagnosisReviewImportBatch(request, context, payload) {
  const principal = await resolveRequestPrincipal({ request, context, payload: payload || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await upsertDiagnosisBatchReviews({
    records: Array.isArray(payload?.records) ? payload.records : [],
    batchSource: payload?.batchSource || 'plant-sample-combination-audit'
  })

  return jsonResponse(200, { code: 200, data })
}

module.exports = {
  handleDiagnosisReviewList,
  handleDiagnosisReviewImages,
  handleDiagnosisReviewDetail,
  handleDiagnosisReviewImportBatch
}
