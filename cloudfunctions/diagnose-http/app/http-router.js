'use strict'

const { jsonResponse, notFound, methodNotAllowed, getHttpRequestData } = require('/opt/utils/http')
const { getRefactorArtifacts } = require('../services/bootstrap-report')
const { debugLog } = require('../utils/common')
const {
  handleDiagnosisStart,
  handleDiagnosisQuestionStart,
  handleDiagnosisAnswer,
  handleDiagnosisResult,
  handleDiagnosisHistory,
  handleDiagnosisFeedback
} = require('../handlers/diagnosis-handlers')

let reviewHandlers = null
let outOfPoolHandlers = null
let legacyHandlers = null

function getReviewHandlers() {
  if (!reviewHandlers) {
    reviewHandlers = require('../handlers/review-handlers')
  }
  return reviewHandlers
}

function getOutOfPoolHandlers() {
  if (!outOfPoolHandlers) {
    outOfPoolHandlers = require('../handlers/out-of-pool-handlers')
  }
  return outOfPoolHandlers
}

function getLegacyHandlers() {
  if (!legacyHandlers) {
    legacyHandlers = require('../handlers/legacy-handlers')
  }
  return legacyHandlers
}

function normalizeHttpPayload(payload) {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'string') {
    const raw = payload.trim()
    if (!raw) {
      return {}
    }

    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      console.warn('diagnose-http payload json parse failed:', error.message)
      return {}
    }
  }

  if (typeof payload === 'object') {
    return payload
  }

  return {}
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'
  const payload = normalizeHttpPayload(method === 'GET' ? request.query : request.body)
  debugLog('diagnose-http request routing:', {
    method,
    path
  })

  try {
    if (path.includes('/health')) {
      const refactorArtifacts = await getRefactorArtifacts()
      return jsonResponse(200, {
        code: 200,
        data: {
          status: 'ok',
          timestamp: Date.now(),
          refactor: {
            hasDataDiffReport: Boolean(refactorArtifacts?.dataDiffReport),
            hasKeyAliasMap: Boolean(refactorArtifacts?.keyAliasMap),
            hasBackfillPlan: Boolean(refactorArtifacts?.backfillPlan),
            hasRepositoryOutputShape: Boolean(refactorArtifacts?.repositoryOutputShape),
            ready: Boolean(refactorArtifacts?.readiness?.ready),
            blockingIssues: Array.isArray(refactorArtifacts?.readiness?.blockingIssues)
              ? refactorArtifacts.readiness.blockingIssues
              : [],
            runtimeSchema: refactorArtifacts?.runtimeSchema || {}
          }
        }
      })
    }

    if (path.includes('/diagnosis/start')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const {
        handleDiagnosisStartStream,
        requestWantsDiagnosisStartSse
      } = getLegacyHandlers()
      if (requestWantsDiagnosisStartSse(request, payload)) {
        return handleDiagnosisStartStream(event, context, request, payload)
      }
      return handleDiagnosisStart(request, context, payload)
    }

    if (path.includes('/diagnosis/question/start')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      return handleDiagnosisQuestionStart(request, context, payload)
    }

    if (path.includes('/diagnosis/answer')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      return handleDiagnosisAnswer(request, context, payload)
    }

    if (path.includes('/diagnosis/result')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      return handleDiagnosisResult(request, context, request.query)
    }

    if (path.includes('/diagnosis/history')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      return handleDiagnosisHistory(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/list')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleDiagnosisReviewList } = getReviewHandlers()
      return handleDiagnosisReviewList(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/images')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleDiagnosisReviewImages } = getReviewHandlers()
      return handleDiagnosisReviewImages(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/detail')) {
      if (
        method === 'POST' &&
        String(payload?.action || request.query?.action || '').trim() === 'importBatch'
      ) {
        const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
        return handleDiagnosisReviewImportBatch(request, context, payload)
      }
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleDiagnosisReviewDetail } = getReviewHandlers()
      return handleDiagnosisReviewDetail(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/import')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
      return handleDiagnosisReviewImportBatch(request, context, payload)
    }

    if (path.includes('/diagnosis/feedback')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      if (
        String(payload?.action || request.query?.action || '').trim() === 'importBatch'
      ) {
        const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
        return handleDiagnosisReviewImportBatch(request, context, payload)
      }
      return handleDiagnosisFeedback(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/list')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleOutOfPoolCandidateList } = getOutOfPoolHandlers()
      return handleOutOfPoolCandidateList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/image')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleOutOfPoolCandidateImage } = getOutOfPoolHandlers()
      return handleOutOfPoolCandidateImage(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/review')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleOutOfPoolCandidateReview } = getOutOfPoolHandlers()
      return handleOutOfPoolCandidateReview(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/list')) {
      if (method !== 'GET') {return methodNotAllowed(method)}
      const { handleOutOfPoolProxyMappingList } = getOutOfPoolHandlers()
      return handleOutOfPoolProxyMappingList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/upsert')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleOutOfPoolProxyMappingUpsert } = getOutOfPoolHandlers()
      return handleOutOfPoolProxyMappingUpsert(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/disable')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleOutOfPoolProxyMappingDisable } = getOutOfPoolHandlers()
      return handleOutOfPoolProxyMappingDisable(request, context, payload)
    }

    if (path.includes('/stream/diagnose')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleLegacyDiagnoseStream } = getLegacyHandlers()
      return handleLegacyDiagnoseStream(event, context, request, payload)
    }

    if (path.includes('/diagnose')) {
      if (method !== 'POST') {return methodNotAllowed(method)}
      const { handleLegacyDiagnose } = getLegacyHandlers()
      return handleLegacyDiagnose(request, context, payload)
    }

    return notFound(path)
  } catch (error) {
    console.error('diagnose-http error:', error)
    return jsonResponse(500, {
      code: 500,
      message: error.message || '服务器错误',
      data: null
    })
  }
}

module.exports = {
  normalizeHttpPayload,
  main
}
