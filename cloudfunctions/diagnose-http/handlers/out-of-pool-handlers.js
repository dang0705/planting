'use strict'

const { jsonResponse } = require('/opt/utils/http')
const { resolveRequestPrincipal, assertInternalReviewAccess } = require('../services/request-guard')
const {
  listOutOfPoolCandidates,
  getOutOfPoolCandidate,
  getOutOfPoolCandidateImage,
  upsertOutOfPoolCandidateReview,
  upsertOutOfPoolCandidateGroupReview
} = require('../repositories/out-of-pool-review-repository')
const {
  disableOutOfPoolProxyMapping,
  listOutOfPoolProxyMappings,
  upsertOutOfPoolProxyMapping
} = require('../repositories/out-of-pool-proxy-mapping-repository')
const { buildOutOfPoolReviewMatchTerms } = require('../app/out-of-pool-match-terms')

async function handleOutOfPoolCandidateList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await listOutOfPoolCandidates({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    status: query?.status || 'all',
    keyword: query?.keyword || ''
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolCandidateImage(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await getOutOfPoolCandidateImage({
    visualNormalizedImageResultId: query?.visualNormalizedImageResultId,
    candidateIndex: Number(query?.candidateIndex || 0)
  })

  if (!data) {
    return jsonResponse(404, { code: 404, message: '池外候选图片不存在', data: null })
  }

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolCandidateReview(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const visualNormalizedImageResultId = String(payload.visualNormalizedImageResultId || '').trim()
  const candidateIndex = Number(payload.candidateIndex || 0)
  const groupId = String(payload.groupId || '').trim()
  const reviewAction = String(payload.reviewAction || '').trim().toLowerCase()

  if (groupId) {
    const groupReview = await upsertOutOfPoolCandidateGroupReview({
      groupId,
      reviewAction,
      reviewedByOpenid: principal.userInfo?.openid || ''
    })

    return jsonResponse(200, {
      code: 200,
      data: {
        ...groupReview,
        proxyMapping: null
      }
    })
  }

  if (!visualNormalizedImageResultId || !Number.isFinite(candidateIndex) || candidateIndex < 1) {
    return jsonResponse(400, { code: 400, message: '缺少候选项标识', data: null })
  }

  const candidate = await getOutOfPoolCandidate({
    visualNormalizedImageResultId,
    candidateIndex
  })

  if (!candidate) {
    return jsonResponse(404, { code: 404, message: '池外候选不存在', data: null })
  }

  await upsertOutOfPoolCandidateReview({
    candidate,
    reviewAction,
    reviewedByOpenid: principal.userInfo?.openid || ''
  })

  let proxyMapping = null
  const closestSymptomKeyHint = String(
    candidate.closestSymptomKeyHint || candidate.closest_symptom_key_hint || ''
  ).trim()
  const matchTerms = buildOutOfPoolReviewMatchTerms(candidate)

  if (reviewAction === 'approved' && closestSymptomKeyHint && matchTerms.length) {
    proxyMapping = await upsertOutOfPoolProxyMapping({
      targetSymptomKey: closestSymptomKeyHint,
      matchTerms,
      rationale: [
        'Auto-created from approved out-of-pool candidate.',
        candidate.visualOutOfPoolReviewId || candidate.visual_out_of_pool_review_id || '',
        candidate.reason || ''
      ].filter(Boolean).join(' '),
      reviewStatus: 'audited',
      enabled: true,
      priority: 100,
      operatorOpenid: principal.userInfo?.openid || ''
    })
  }

  return jsonResponse(200, {
    code: 200,
    data: {
      visualNormalizedImageResultId,
      candidateIndex,
      reviewAction,
      proxyMapping
    }
  })
}

async function handleOutOfPoolProxyMappingList(request, context, query) {
  const principal = await resolveRequestPrincipal({ request, context, payload: query || {} })
  assertInternalReviewAccess({ request, ...principal })

  const data = await listOutOfPoolProxyMappings({
    page: Number(query?.page || 1),
    pageSize: Number(query?.pageSize || 20),
    keyword: query?.keyword || '',
    reviewStatus: query?.reviewStatus || 'all',
    enabled: query?.enabled || 'all'
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolProxyMappingUpsert(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const data = await upsertOutOfPoolProxyMapping({
    mappingId: payload.mappingId || '',
    sourceGroupId: payload.sourceGroupId || payload.groupId || '',
    targetSymptomKey: payload.targetSymptomKey || '',
    matchTerms: payload.matchTerms || [],
    rationale: payload.rationale || '',
    reviewStatus: payload.reviewStatus || 'pending',
    enabled: payload.enabled !== false && payload.enabled !== 0,
    priority: Number(payload.priority || 0),
    operatorOpenid: principal.userInfo?.openid || ''
  })

  return jsonResponse(200, { code: 200, data })
}

async function handleOutOfPoolProxyMappingDisable(request, context, payload) {
  payload = payload || {}
  const principal = await resolveRequestPrincipal({ request, context, payload })
  assertInternalReviewAccess({ request, ...principal })

  const data = await disableOutOfPoolProxyMapping({
    mappingId: payload.mappingId || '',
    operatorOpenid: principal.userInfo?.openid || ''
  })

  return jsonResponse(200, { code: 200, data })
}

module.exports = {
  handleOutOfPoolCandidateList,
  handleOutOfPoolCandidateImage,
  handleOutOfPoolCandidateReview,
  handleOutOfPoolProxyMappingList,
  handleOutOfPoolProxyMappingUpsert,
  handleOutOfPoolProxyMappingDisable
}
