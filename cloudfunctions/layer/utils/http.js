'use strict'

const crypto = require('crypto')
const { getUserInfo } = require('./cloudbase')
const { normalizeAppEnv, runWithRequestAppEnv } = require('./runtime-env')

const HTTP_IDENTITY_TICKET_PREFIX = 'planting-http-v1'
const HTTP_IDENTITY_TICKET_HEADER = 'x-planting-http-identity-ticket'
const HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS = 5 * 60
const LOCAL_FUNCTION_RUNTIME_FLAG = 'CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY'
const OPENID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }
}

function methodNotAllowed(method) {
  return jsonResponse(405, { code: 405, message: `不支持的请求方法: ${method}` })
}

function internalServerError(message = '服务暂时不可用，请稍后重试') {
  return jsonResponse(500, { code: 500, message, data: null })
}

function notFound(path) {
  return jsonResponse(404, { code: 404, message: `接口不存在: ${path}` })
}

function normalizeHeaders(rawHeaders = {}) {
  const source = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {}
  return Object.entries(source).reduce((headers, [key, value]) => {
    headers[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
    return headers
  }, {})
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return String(value || '')
  }
}

function resolveRequestAppEnv(_rawHeaders = {}, _query = {}, _body = {}) {
  return normalizeAppEnv(process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV)
}

function parseQueryString(rawValue) {
  const raw = String(rawValue || '')
  const queryIndex = raw.indexOf('?')
  if (queryIndex === -1) {
    return {}
  }

  const queryString = raw.slice(queryIndex + 1)
  return queryString.split('&').reduce((result, pair) => {
    if (!pair) {
      return result
    }
    const separatorIndex = pair.indexOf('=')
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    const rawVal = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)
    const key = decodeQueryComponent(rawKey).trim()
    if (!key) {
      return result
    }
    result[key] = decodeQueryComponent(rawVal)
    return result
  }, {})
}

function asRequestObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseEventBody(event) {
  if (!event) {
    return {}
  }

  if (typeof event === 'string') {
    try {
      return asRequestObject(JSON.parse(event))
    } catch {
      return {}
    }
  }

  if (typeof event.body === 'string') {
    try {
      return asRequestObject(JSON.parse(event.body))
    } catch {
      return {}
    }
  }

  if (event.body && typeof event.body === 'object') {
    return asRequestObject(event.body)
  }

  if (typeof event === 'object') {
    return event
  }

  return {}
}

function normalizeHttpMethod(value, fallback = 'GET') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return normalized || fallback
}

function resolveOverrideMethod(rawHeaders = {}, query = {}, body = {}) {
  const headers = normalizeHeaders(rawHeaders)
  const override = normalizeHttpMethod(
    headers['x-http-method-override'] ||
      headers['x-method-override'] ||
      query._method ||
      query.methodOverride ||
      body._method ||
      body.methodOverride,
    ''
  )

  if (!override) {
    return ''
  }

  return ['PATCH', 'PUT', 'DELETE'].includes(override) ? override : ''
}

function getHttpRequestData(event, context) {
  const httpContext = context?.httpContext || {}
  const rawHeaders = httpContext.headers || event?.headers || {}
  const queryFromContext =
    httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {}
  const queryFromEvent = event?.query && typeof event.query === 'object' ? event.query : {}
  const queryFromPath = parseQueryString(httpContext.path)
  const queryFromUrl = parseQueryString(
    httpContext.url || httpContext.rawPath || httpContext.reqUrl
  )
  const body = parseEventBody(event)
  const inferredMethod = normalizeHttpMethod(
    httpContext.method ||
      event?.httpMethod ||
      event?.requestContext?.http?.method ||
      (body && Object.keys(body).length ? 'POST' : 'GET')
  )
  const methodOverride = resolveOverrideMethod(
    rawHeaders,
    {
      ...queryFromPath,
      ...queryFromUrl,
      ...queryFromContext,
      ...queryFromEvent
    },
    body
  )

  return {
    headers: rawHeaders,
    method: methodOverride || inferredMethod,
    path:
      httpContext.path ||
      httpContext.url ||
      httpContext.rawPath ||
      httpContext.reqUrl ||
      event?.path ||
      '',
    query: {
      ...queryFromPath,
      ...queryFromUrl,
      ...queryFromContext,
      ...queryFromEvent
    },
    body
  }
}

function getOpenIdFromUserInfo(userInfo) {
  if (!userInfo) {
    return ''
  }

  return (
    userInfo.OPENID ||
    userInfo.openId ||
    userInfo.openid ||
    userInfo.uid ||
    userInfo.customUserId ||
    ''
  )
}

function isLocalFunctionRuntime() {
  return /^(1|true)$/i.test(String(process.env[LOCAL_FUNCTION_RUNTIME_FLAG] || '').trim())
}

function getHttpIdentityTicketSecret() {
  const value = String(process.env.HTTP_IDENTITY_TICKET_SECRET || '').trim()
  return value.length >= 32 ? value : ''
}

function parseTicketPayload(encodedPayload = '') {
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function signHttpIdentityTicket(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function hasMatchingSignature(expected, received) {
  const expectedBuffer = Buffer.from(String(expected || ''))
  const receivedBuffer = Buffer.from(String(received || ''))
  return (
    expectedBuffer.length === receivedBuffer.length &&
    expectedBuffer.length > 0 &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

function createHttpIdentityTicket({ openid = '', uid = '', customUserId = '' } = {}) {
  const secret = getHttpIdentityTicketSecret()
  const normalizedOpenid = String(openid || '').trim()
  if (!secret || !OPENID_PATTERN.test(normalizedOpenid)) {
    return ''
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const encodedPayload = Buffer.from(
    JSON.stringify({
      version: 1,
      openid: normalizedOpenid,
      uid: String(uid || '').trim(),
      customUserId: String(customUserId || '').trim(),
      issuedAt,
      expiresAt: issuedAt + HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS,
      nonce: crypto.randomBytes(16).toString('base64url')
    })
  ).toString('base64url')
  return `${HTTP_IDENTITY_TICKET_PREFIX}.${encodedPayload}.${signHttpIdentityTicket(encodedPayload, secret)}`
}

function resolveHttpIdentityTicket(headers = {}) {
  const authorization = String(headers.authorization || '').trim()
  const prefix = `Bearer ${HTTP_IDENTITY_TICKET_PREFIX}.`
  const headerTicket = String(headers[HTTP_IDENTITY_TICKET_HEADER] || '').trim()
  const token = authorization.startsWith(prefix)
    ? authorization.slice('Bearer '.length)
    : headerTicket
  if (!token) {
    return null
  }

  const [ticketPrefix, encodedPayload, signature, extra] = token.split('.')
  const secret = getHttpIdentityTicketSecret()
  if (
    ticketPrefix !== HTTP_IDENTITY_TICKET_PREFIX ||
    !encodedPayload ||
    !signature ||
    extra ||
    !secret
  ) {
    return null
  }
  if (!hasMatchingSignature(signHttpIdentityTicket(encodedPayload, secret), signature)) {
    return null
  }

  const payload = parseTicketPayload(encodedPayload)
  const now = Math.floor(Date.now() / 1000)
  if (
    !payload ||
    payload.version !== 1 ||
    !OPENID_PATTERN.test(String(payload.openid || '')) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60 ||
    payload.expiresAt < now ||
    payload.expiresAt - payload.issuedAt > HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS
  ) {
    return null
  }

  return {
    openid: payload.openid,
    uid: String(payload.uid || '').trim(),
    customUserId: String(payload.customUserId || '').trim(),
    source: 'signed-http-ticket'
  }
}

async function resolveHttpUserInfo(rawHeaders, query = {}, context = null) {
  const headers = normalizeHeaders(rawHeaders)

  if (context) {
    try {
      const runtimeUserInfo = getUserInfo(context)
      const runtimeOpenId = getOpenIdFromUserInfo(runtimeUserInfo)
      if (runtimeOpenId) {
        return {
          openid: runtimeOpenId,
          source: 'cloudbase-runtime',
          userInfo: runtimeUserInfo
        }
      }
    } catch (error) {
      console.warn('通过 CloudBase 运行时获取用户信息失败:', error.message)
    }
  }

  const ticketUser = resolveHttpIdentityTicket(headers)
  if (ticketUser) {
    return ticketUser
  }

  const localOpenid = String(headers['x-wx-openid'] || headers['x-openid'] || '').trim()
  if (isLocalFunctionRuntime() && OPENID_PATTERN.test(localOpenid)) {
    return {
      openid: localOpenid,
      source: 'local-function-gateway'
    }
  }

  return null
}

module.exports = {
  jsonResponse,
  internalServerError,
  methodNotAllowed,
  notFound,
  normalizeHeaders,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  parseEventBody,
  getHttpRequestData,
  resolveHttpUserInfo,
  createHttpIdentityTicket,
  _test: {
    decodeQueryComponent,
    parseQueryString,
    resolveHttpIdentityTicket,
    signHttpIdentityTicket,
    isLocalFunctionRuntime
  }
}
