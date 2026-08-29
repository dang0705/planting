'use strict'

const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData
} = require('/opt/utils/http')
const { debugLog } = require('../utils/common')

let diagnosisHandlers = null
let reviewHandlers = null
let outOfPoolHandlers = null

function getDiagnosisHandlers() {
  if (!diagnosisHandlers) {
    diagnosisHandlers = require('../handlers/diagnosis-handlers')
  }
  return diagnosisHandlers
}

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

function publicRouteError(error) {
  const statusCode = Number(error?.statusCode || 0)
  if (statusCode < 400 || statusCode >= 500) {
    return null
  }

  const messageByStatus = {
    400: '请求参数无效',
    401: '请先登录',
    403: '无权访问该接口',
    404: '请求资源不存在',
    405: '不支持的请求方法'
  }

  return jsonResponse(statusCode, {
    code: statusCode,
    message: messageByStatus[statusCode] || '请求无法完成',
    data: null
  })
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
      const { getRefactorArtifacts } = require('../services/bootstrap-report')
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

    // 保留活动契约中的兼容入口：旧脚本仍通过 /stream/diagnose 发起 SSE，
    // /diagnose 则是历史同步入口。两者都必须复用 diagnosis/start，避免出现
    // 第二套诊断状态机或让配置中“已暴露”的路径落到 404。
    if (path === '/stream/diagnose' || path.endsWith('/stream/diagnose')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisStart } = getDiagnosisHandlers()
      return await handleDiagnosisStart(request, context, {
        ...payload,
        streamVisualDecision: true
      })
    }

    if (path === '/diagnose' || path.endsWith('/diagnose')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisStart } = getDiagnosisHandlers()
      return await handleDiagnosisStart(request, context, payload)
    }

    if (path.includes('/diagnosis/start')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisStart } = getDiagnosisHandlers()
      return await handleDiagnosisStart(request, context, payload)
    }

    if (path.includes('/diagnosis/question/start')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisQuestionStart } = getDiagnosisHandlers()
      return await handleDiagnosisQuestionStart(request, context, payload)
    }

    if (path.includes('/diagnosis/answer')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisAnswer } = getDiagnosisHandlers()
      return await handleDiagnosisAnswer(request, context, payload)
    }

    if (path.includes('/diagnosis/retake/authorize')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisRetakeAuthorize } = getDiagnosisHandlers()
      return await handleDiagnosisRetakeAuthorize(request, context, payload)
    }

    if (path.includes('/diagnosis/retake/skip')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisRetakeSkip } = getDiagnosisHandlers()
      return await handleDiagnosisRetakeSkip(request, context, payload)
    }

    if (path.includes('/diagnosis/result')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisResult } = getDiagnosisHandlers()
      return await handleDiagnosisResult(request, context, request.query)
    }

    if (path.includes('/diagnosis/history')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisHistory } = getDiagnosisHandlers()
      return await handleDiagnosisHistory(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/list')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisReviewList } = getReviewHandlers()
      return await handleDiagnosisReviewList(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/images')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisReviewImages } = getReviewHandlers()
      return await handleDiagnosisReviewImages(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/detail')) {
      if (
        method === 'POST' &&
        String(payload?.action || request.query?.action || '').trim() === 'importBatch'
      ) {
        const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
        return await handleDiagnosisReviewImportBatch(request, context, payload)
      }
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisReviewDetail } = getReviewHandlers()
      return await handleDiagnosisReviewDetail(request, context, request.query)
    }

    if (path.includes('/diagnosis/review/import')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
      return await handleDiagnosisReviewImportBatch(request, context, payload)
    }

    if (path.includes('/diagnosis/feedback')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      if (String(payload?.action || request.query?.action || '').trim() === 'importBatch') {
        const { handleDiagnosisReviewImportBatch } = getReviewHandlers()
        return await handleDiagnosisReviewImportBatch(request, context, payload)
      }
      const { handleDiagnosisFeedback } = getDiagnosisHandlers()
      return await handleDiagnosisFeedback(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/list')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolCandidateList } = getOutOfPoolHandlers()
      return await handleOutOfPoolCandidateList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/image')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolCandidateImage } = getOutOfPoolHandlers()
      return await handleOutOfPoolCandidateImage(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/review')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolCandidateReview } = getOutOfPoolHandlers()
      return await handleOutOfPoolCandidateReview(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/list')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolProxyMappingList } = getOutOfPoolHandlers()
      return await handleOutOfPoolProxyMappingList(request, context, request.query)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/upsert')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolProxyMappingUpsert } = getOutOfPoolHandlers()
      return await handleOutOfPoolProxyMappingUpsert(request, context, payload)
    }

    if (path.includes('/visual/out-of-pool/proxy-mappings/disable')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleOutOfPoolProxyMappingDisable } = getOutOfPoolHandlers()
      return await handleOutOfPoolProxyMappingDisable(request, context, payload)
    }

    return notFound(path)
  } catch (error) {
    console.error('diagnose-http error:', error)
    return publicRouteError(error) || internalServerError('诊断暂时不可用，请稍后重试')
  }
}

module.exports = {
  normalizeHttpPayload,
  main,
  _test: { publicRouteError }
}
