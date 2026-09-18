'use strict'

const crypto = require('node:crypto')
const { runCloudbaseSql } = require('./read-sql-runtime')
const TICKET_SUBJECT = 'planting-user'
const OPENID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u
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
const { resolveHttpIdentityTicket } = loadHttpIdentityTicketRuntime()
const SESSION_PREFIX = 'planting-session-v1'
const PLATFORM_SET = new Set(['wechat_mp', 'douyin_mp', 'xiaohongshu_mp'])
const RESTRICTED_PLATFORM_SET = new Set(['douyin_mp', 'xiaohongshu_mp'])

function resolveLocalFunctionUser(headers = {}) {
  if (!/^(1|true)$/i.test(String(process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY || '').trim())) {
    return null
  }
  const openid = String(headers['x-wx-openid'] || headers['x-openid'] || '').trim()
  return OPENID_PATTERN.test(openid) ? { openid, source: 'local-function-gateway' } : null
}

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

function internalServerError(message = '植物列表暂时不可用，请稍后重试') {
  return jsonResponse(500, { code: 500, message, data: null })
}

function normalizeHeaders(rawHeaders = {}) {
  return Object.entries(rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {}).reduce(
    (headers, [key, value]) => {
      headers[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
      return headers
    },
    {}
  )
}

function decodeQueryComponent(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return String(value || '')
  }
}

function parseQueryString(value = '') {
  const raw = String(value || '')
  const index = raw.indexOf('?')
  if (index < 0) {
    return {}
  }
  return raw
    .slice(index + 1)
    .split('&')
    .reduce((query, pair) => {
      if (!pair) {
        return query
      }
      const separator = pair.indexOf('=')
      const key = decodeQueryComponent(separator < 0 ? pair : pair.slice(0, separator)).trim()
      if (key) {
        query[key] = decodeQueryComponent(separator < 0 ? '' : pair.slice(separator + 1))
      }
      return query
    }, {})
}

function parseEventBody(event) {
  if (typeof event?.body === 'string') {
    try {
      const parsed = JSON.parse(event.body)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return event?.body && typeof event.body === 'object' && !Array.isArray(event.body)
    ? event.body
    : {}
}

function getHttpRequestData(event, context) {
  const httpContext = context?.httpContext || {}
  const headers = normalizeHeaders({
    ...(event?.headers && typeof event.headers === 'object' ? event.headers : {}),
    ...(httpContext.headers && typeof httpContext.headers === 'object' ? httpContext.headers : {})
  })
  const body = parseEventBody(event)
  return {
    headers,
    body,
    query: {
      ...parseQueryString(httpContext.url || event?.rawPath || ''),
      ...(event?.query && typeof event.query === 'object' ? event.query : {}),
      ...(httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {})
    },
    method: String(httpContext.method || event?.httpMethod || event?.method || 'GET')
      .trim()
      .toUpperCase(),
    path: String(httpContext.path || event?.path || event?.rawPath || '').split('?')[0]
  }
}

function getBearerToken(headers = {}) {
  const session = String(headers['x-planting-platform-session'] || '').trim()
  if (session) {
    return session
  }
  const matched = String(headers.authorization || '')
    .trim()
    .match(/^Bearer\s+(.+)$/iu)
  return matched ? String(matched[1] || '').trim() : ''
}

function hashSessionToken(token = '') {
  const secret = String(process.env.SESSION_TOKEN_SECRET || '').trim()
  const value = String(token || '').trim()
  return value.startsWith(`${SESSION_PREFIX}_`) && secret.length >= 32
    ? crypto.createHmac('sha256', secret).update(value).digest('hex')
    : ''
}

async function resolvePlantReadIdentity(headers = {}, dependencies = {}) {
  const ticket = resolveHttpIdentityTicket(headers)
  // 显式平台会话与票据同时存在时，会话优先；票据只在没有会话材料时
  // 作为两个高频读入口的快捷身份。这样旧票据不能覆盖当前统一账号。
  const explicitSessionToken = String(headers['x-planting-platform-session'] || '').trim()
  const bearerToken = getBearerToken(headers)
  const sessionToken = explicitSessionToken || (hashSessionToken(bearerToken) ? bearerToken : '')
  if (sessionToken) {
    const tokenHash = hashSessionToken(sessionToken)
    if (!tokenHash) {
      return null
    }
    const querySql = dependencies.runSql || runCloudbaseSql
    const result = await querySql(
      `SELECT s.user_id, s.platform, u._openid AS storage_openid
         FROM user_sessions s
         JOIN users u ON BINARY u._id = BINARY s.user_id
        WHERE s.token_hash = {{tokenHash}}
          AND s.revoked_at <=> NULL
          AND s.expires_at > {{now}}
        LIMIT 1`,
      { tokenHash, now: Date.now() }
    )
    const session = result?.data?.executeResultList?.[0]
    const userId = String(session?.user_id || '').trim()
    if (!session || !userId || !PLATFORM_SET.has(session.platform)) {
      return null
    }
    return {
      openid: String(session.storage_openid || userId).trim(),
      userId,
      platform: session.platform,
      source: 'platform-session'
    }
  }
  // 植物归属只能接受由持久平台会话签发的统一用户票据。旧版微信运行时
  // 票据没有稳定 userId，只能继续走运行时身份兜底，不能直接决定植物归属。
  if (ticket?.userId && ticket.subject === TICKET_SUBJECT && PLATFORM_SET.has(ticket.platform)) {
    return ticket
  }
  const localIdentity = resolveLocalFunctionUser(headers)
  if (localIdentity) {
    return localIdentity
  }
  // 运行时微信 OpenID 只用于手机号等明确的身份建立入口；植物归属必须
  // 来自持久平台会话或其签发的统一用户票据，避免登录账号出现空列表/串号。
  return null
}

function isRestrictedPlatform(platform) {
  return RESTRICTED_PLATFORM_SET.has(String(platform || '').trim())
}

module.exports = {
  jsonResponse,
  internalServerError,
  getHttpRequestData,
  resolvePlantReadIdentity,
  isRestrictedPlatform,
  _test: {
    hashSessionToken,
    resolveHttpIdentityTicket
  }
}
