'use strict'

const {
  getHttpRequestData,
  resolveHttpUserInfo,
  jsonResponse,
  internalServerError,
  methodNotAllowed,
  notFound,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { resolveSchemaEnv, runWithSchemaEnv } = require('../db/schema-resolver')
const { createReviewTimingLogger } = require('../repositories/diagnosis-review/review-performance')

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
    } catch {
      return {}
    }
  }

  return typeof payload === 'object' ? payload : {}
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

  if (!hasAuthorization && platformSession) {
    normalizedHeaders.authorization = `Bearer ${platformSession}`
  }
  return normalizedHeaders
}

function hasPlatformSession(headers = {}) {
  return Object.keys(headers || {}).some(
    key => String(key).toLowerCase() === 'x-planting-platform-session'
  )
}

function buildPublicErrorPayload(error, fallbackMessage) {
  const statusCode = Number(error?.statusCode || 500)
  const isClientError = statusCode >= 400 && statusCode < 500
  return {
    code: statusCode,
    businessCode: isClientError && error?.code ? String(error.code) : 'INTERNAL_ERROR',
    message: isClientError && error?.message ? error.message : fallbackMessage,
    data: null
  }
}

async function runSlimDiagnosisRequest({
  event,
  context,
  functionName,
  pathFragment,
  method = 'POST',
  fallbackMessage,
  handler
} = {}) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const requestMethod = String(request.method || 'GET').toUpperCase()
  const payload = normalizeHttpPayload(requestMethod === 'GET' ? request.query : request.body)
  const timing = createReviewTimingLogger(functionName, {
    method: requestMethod,
    path
  })
  timing.mark('request-routed')

  const execute = async () => {
    if (!path.includes(pathFragment)) {
      return notFound(path)
    }
    if (requestMethod !== method) {
      return methodNotAllowed(requestMethod)
    }

    try {
      const identityHeaders = buildIdentityResolutionHeaders(request.headers)
      const identity = await resolveHttpUserInfo(identityHeaders, payload, context, {
        timing,
        allowRuntimeIdentity: !hasPlatformSession(request.headers)
      })
      timing.mark('identity-ready', { identityResolved: Boolean(identity?.openid) })
      if (!identity?.openid) {
        throw Object.assign(new Error('请先登录'), { statusCode: 401 })
      }

      return await handler({ request, context, payload, identity, timing })
    } catch (error) {
      console.error(`${functionName} request failed`, {
        name: String(error?.name || 'Error').slice(0, 120),
        code: String(error?.code || '').slice(0, 120),
        statusCode: Number(error?.statusCode || 500),
        message: String(error?.message || error || '').slice(0, 500)
      })
      timing.finish({ statusCode: Number(error?.statusCode || 500), failed: true })
      return jsonResponse(error?.statusCode || 500, buildPublicErrorPayload(error, fallbackMessage))
    }
  }

  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  const schemaEnv = resolveSchemaEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => runWithSchemaEnv(schemaEnv, execute))
}

module.exports = {
  normalizeHttpPayload,
  buildIdentityResolutionHeaders,
  runSlimDiagnosisRequest,
  _test: { buildPublicErrorPayload }
}
