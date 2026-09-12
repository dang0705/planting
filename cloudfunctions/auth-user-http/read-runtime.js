'use strict'

const crypto = require('node:crypto')

function loadHttpIdentityTicketRuntime() {
  try {
    // 部署脚本将 Shared Layer 中唯一的无数据库票据模块随轻量读取入口打包，
    // 不挂载整套 HTTP Layer，也不让冷启动读取依赖 /opt 的层绑定。
    return require('./http-identity-ticket')
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error
    }
    return require('../layer/utils/http-identity-ticket')
  }
}
const { createHttpIdentityTicket, resolveHttpIdentityTicket } = loadHttpIdentityTicketRuntime()
const SESSION_PREFIX = 'planting-session-v1'
const OPENID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-transform'
    },
    body: JSON.stringify(payload)
  }
}

function internalServerError(message = '服务暂时不可用，请稍后重试') {
  return jsonResponse(500, { code: 500, message, data: null })
}

function normalizeHeaders(rawHeaders = {}) {
  const source = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {}
  return Object.entries(source).reduce((headers, [key, value]) => {
    headers[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
    return headers
  }, {})
}

function decodeQueryComponent(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return String(value || '')
  }
}

function parseQueryString(rawValue = '') {
  const queryIndex = String(rawValue || '').indexOf('?')
  if (queryIndex < 0) {
    return {}
  }
  return String(rawValue)
    .slice(queryIndex + 1)
    .split('&')
    .reduce((query, pair) => {
      if (!pair) {
        return query
      }
      const separatorIndex = pair.indexOf('=')
      const key = decodeQueryComponent(
        separatorIndex < 0 ? pair : pair.slice(0, separatorIndex)
      ).trim()
      if (key) {
        query[key] = decodeQueryComponent(separatorIndex < 0 ? '' : pair.slice(separatorIndex + 1))
      }
      return query
    }, {})
}

function asRequestObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseEventBody(event) {
  if (typeof event?.body === 'string') {
    try {
      return asRequestObject(JSON.parse(event.body))
    } catch {
      return {}
    }
  }
  return asRequestObject(event?.body || event)
}

function resolveOverrideMethod(headers = {}, query = {}, body = {}) {
  const requested = String(
    headers['x-http-method-override'] ||
      headers['x-method-override'] ||
      query._method ||
      body._method ||
      ''
  )
    .trim()
    .toUpperCase()
  return ['PATCH', 'PUT', 'DELETE'].includes(requested) ? requested : ''
}

function getHttpRequestData(event, context) {
  const httpContext = context?.httpContext || {}
  const headers = normalizeHeaders({
    ...(event?.headers && typeof event.headers === 'object' ? event.headers : {}),
    ...(httpContext.headers && typeof httpContext.headers === 'object' ? httpContext.headers : {})
  })
  const body = parseEventBody(event)
  const query = {
    ...parseQueryString(httpContext.url || event?.rawPath || ''),
    ...(event?.query && typeof event.query === 'object' ? event.query : {}),
    ...(httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {})
  }
  const rawMethod = String(httpContext.method || event?.httpMethod || event?.method || 'POST')
    .trim()
    .toUpperCase()
  return {
    headers,
    body,
    query,
    path: String(httpContext.path || event?.path || event?.rawPath || '').split('?')[0],
    method: resolveOverrideMethod(headers, query, body) || rawMethod
  }
}

function resolveCloudbaseRuntimeHeaderUser(headers = {}) {
  const openid = String(headers['x-wx-openid'] || '').trim()
  const appid = String(headers['x-wx-appid'] || '').trim()
  const source = String(headers['x-wx-source'] || '').trim()
  const expectedAppId = String(process.env.WECHAT_MINIPROGRAM_APP_ID || '').trim()
  if (
    !OPENID_PATTERN.test(openid) ||
    !appid ||
    !source ||
    !expectedAppId ||
    appid !== expectedAppId
  ) {
    return null
  }
  return { openid, appid, source: 'cloudbase-runtime-header' }
}

function resolveLocalFunctionUser(headers = {}) {
  if (!/^(1|true)$/i.test(String(process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY || '').trim())) {
    return null
  }
  const openid = String(headers['x-wx-openid'] || headers['x-openid'] || '').trim()
  return OPENID_PATTERN.test(openid) ? { openid, source: 'local-function-gateway' } : null
}

function getBearerToken(headers = {}) {
  const session = String(headers['x-planting-platform-session'] || '').trim()
  if (session) {
    return session
  }
  const authorization = String(headers.authorization || '').trim()
  const matched = authorization.match(/^Bearer\s+(.+)$/iu)
  return matched ? String(matched[1] || '').trim() : ''
}

function hashSessionToken(token) {
  const raw = String(token || '').trim()
  const secret = String(process.env.SESSION_TOKEN_SECRET || '').trim()
  if (!raw.startsWith(`${SESSION_PREFIX}_`) || secret.length < 32) {
    return ''
  }
  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

function hasPlatformSessionMaterial(headers = {}) {
  const explicitSession = String(headers['x-planting-platform-session'] || '').trim()
  if (explicitSession) {
    return true
  }
  // CloudBase 网关自身也会写入 Authorization。只有能通过本业务会话格式
  // 校验的 Bearer 才属于手机号统一账号，不能因此压住微信运行时身份。
  return Boolean(hashSessionToken(getBearerToken(headers)))
}

module.exports = {
  jsonResponse,
  internalServerError,
  normalizeHeaders,
  getHttpRequestData,
  createHttpIdentityTicket,
  resolveHttpIdentityTicket,
  resolveCloudbaseRuntimeHeaderUser,
  resolveLocalFunctionUser,
  getBearerToken,
  hashSessionToken,
  hasPlatformSessionMaterial,
  _test: {
    hashSessionToken,
    hasPlatformSessionMaterial,
    resolveHttpIdentityTicket
  }
}
