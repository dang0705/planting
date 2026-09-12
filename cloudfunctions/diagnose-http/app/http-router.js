'use strict'

const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveHttpUserInfo
} = require('/opt/utils/http')
let assertPlatformFeature
try {
  ;({ assertPlatformFeature } = require('/opt/utils/platform-session'))
} catch {
  // 旧的已验证 layer10 没有独立暴露 platform-session；诊断路由只需要
  // 平台能力门禁，保留同一规则即可让当前代码兼容该 layer 的远端版本。
  assertPlatformFeature = (identity, path) => {
    const platform = String(identity?.platform || '').trim()
    if (platform !== 'xiaohongshu_mp') {
      return true
    }
    if (/\/user-plants(?:\/)?$/.test(String(path || '').split('?')[0])) {
      return true
    }
    const message = /identify|recognition/.test(String(path || '').toLowerCase())
      ? '当前端暂未开放 AI 植物识别，敬请期待。'
      : /fertiliz/.test(String(path || '').toLowerCase())
        ? '当前端暂未开放施肥提醒，敬请期待。'
        : /watering|water-reminder/.test(String(path || '').toLowerCase())
          ? '当前端暂未开放浇水提醒，敬请期待。'
          : /calendar|reminder/.test(String(path || '').toLowerCase())
            ? '当前端暂未开放日历提醒，敬请期待。'
            : /subscription|pay|order/.test(String(path || '').toLowerCase())
              ? '当前端暂未开放订阅服务，敬请期待。'
              : /storage|upload|file/.test(String(path || '').toLowerCase())
                ? '当前端暂未开放图片与文件服务，敬请期待。'
                : '当前端暂未开放 AI 植物诊断，敬请期待。'
    throw Object.assign(new Error(message), {
      code: 'PLATFORM_FEATURE_UNAVAILABLE',
      statusCode: 403
    })
  }
}
const { debugLog } = require('../utils/common')
const { createReviewTimingLogger } = require('../repositories/diagnosis-review/review-performance')

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
    code: error?.code || statusCode,
    message:
      error?.code === 'PLATFORM_FEATURE_UNAVAILABLE'
        ? error.message
        : messageByStatus[statusCode] || '请求无法完成',
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

function buildIdentityResolutionHeaders(headers = {}) {
  const normalizedHeaders = { ...(headers || {}) }
  const hasAuthorization = Object.keys(normalizedHeaders).some(
    key => String(key).toLowerCase() === 'authorization'
  )
  const platformSession = String(
    Object.entries(normalizedHeaders).find(
      ([key]) => String(key).toLowerCase() === 'x-planting-platform-session'
    )?.[1] || ''
  ).trim()

  // wx.cloud.callHTTPFunction 会占用 Authorization 作为 CloudBase 网关凭据，
  // 因此跨平台业务会话使用独立请求头；在函数内转换为既有 Bearer 解析入口。
  // 令牌仍由 resolvePersistentSession 做哈希校验、过期校验和撤销校验，不能
  // 通过客户端提交 userId/openid 绕过身份验证。
  if (!hasAuthorization && platformSession) {
    normalizedHeaders.authorization = `Bearer ${platformSession}`
  }
  return normalizedHeaders
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'
  const payload = normalizeHttpPayload(method === 'GET' ? request.query : request.body)
  const requestTiming =
    path.includes('/diagnosis/question/start') || path.includes('/diagnosis/answer')
      ? createReviewTimingLogger(
          path.includes('/diagnosis/answer')
            ? 'diagnosis-answer-http'
            : 'diagnosis-question-start-http',
          { method, path }
        )
      : null
  requestTiming?.mark('request-routed')
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

    const identityHeaders = buildIdentityResolutionHeaders(request.headers)
    const hasPlatformSession = Object.keys(request.headers || {}).some(
      key => String(key).toLowerCase() === 'x-planting-platform-session'
    )
    const identity = await resolveHttpUserInfo(identityHeaders, payload, context, {
      timing: requestTiming,
      // 有应用会话时禁止退回微信运行时身份，避免跨端会话失效后串到另一
      // 个微信平台用户；无应用会话时才读取 CloudBase HTTP 上下文中的真实
      // 微信身份，不需要额外调用 wechat-identity。
      allowRuntimeIdentity: !hasPlatformSession
    })
    requestTiming?.mark('identity-ready', { identityResolved: Boolean(identity?.openid) })
    if (!identity?.openid) {
      const error = new Error('请先登录')
      error.statusCode = 401
      throw error
    }
    assertPlatformFeature(identity, path)

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
      return await handleDiagnosisQuestionStart(request, context, payload, {
        userInfo: identity,
        timing: requestTiming
      })
    }

    if (path.includes('/diagnosis/answer')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const { handleDiagnosisAnswer } = getDiagnosisHandlers()
      return await handleDiagnosisAnswer(request, context, payload, {
        userInfo: identity,
        timing: requestTiming
      })
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
