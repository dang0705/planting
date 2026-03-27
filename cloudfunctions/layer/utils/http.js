'use strict'

const { getUserInfo, getCloudBase } = require('./cloudbase')
const { normalizeAppEnv, runWithRequestAppEnv } = require('./runtime-env')

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

function notFound(path) {
  return jsonResponse(404, { code: 404, message: `接口不存在: ${path}` })
}

function normalizeHeaders(rawHeaders = {}) {
  return Object.entries(rawHeaders).reduce((headers, [key, value]) => {
    headers[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
    return headers
  }, {})
}

function resolveRequestAppEnv(rawHeaders = {}, query = {}, body = {}) {
  const headers = normalizeHeaders(rawHeaders)
  return normalizeAppEnv(
    headers['x-app-env'] ||
      query.appEnv ||
      query.app_env ||
      body.appEnv ||
      body.app_env ||
      process.env.APP_ENV ||
      process.env.RUNTIME_ENV ||
      process.env.NODE_ENV
  )
}

function decodeCloudbaseContext(value) {
  if (!value || typeof value !== 'string') {
    return null
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch (error) {
    console.warn('解析 x-cloudbase-context 失败:', error.message)
    return null
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null
  }

  const segments = token.split('.')
  if (segments.length < 2) {
    return null
  }

  try {
    const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch (error) {
    console.warn('解析 access token 失败:', error.message)
    return null
  }
}

function parseQueryString(rawValue) {
  const raw = String(rawValue || '')
  const queryIndex = raw.indexOf('?')
  if (queryIndex === -1) return {}

  const queryString = raw.slice(queryIndex + 1)
  return queryString.split('&').reduce((result, pair) => {
    if (!pair) return result
    const [rawKey, rawVal = ''] = pair.split('=')
    const key = decodeURIComponent(rawKey || '').trim()
    if (!key) return result
    result[key] = decodeURIComponent(rawVal || '')
    return result
  }, {})
}

function parseEventBody(event) {
  if (!event) return {}

  if (typeof event === 'string') {
    try {
      return JSON.parse(event)
    } catch (error) {
      return {}
    }
  }

  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body)
    } catch (error) {
      return {}
    }
  }

  if (event.body && typeof event.body === 'object') {
    return event.body
  }

  if (typeof event === 'object') {
    return event
  }

  return {}
}

function getHttpRequestData(event, context) {
  const httpContext = context.httpContext || {}
  const queryFromContext =
    httpContext.query && typeof httpContext.query === 'object' ? httpContext.query : {}
  const queryFromPath = parseQueryString(httpContext.path)
  const queryFromUrl = parseQueryString(httpContext.url || httpContext.rawPath || httpContext.reqUrl)
  const body = parseEventBody(event)
  const inferredMethod =
    String(
      httpContext.method ||
        event?.httpMethod ||
        event?.requestContext?.http?.method ||
        ''
    ).toUpperCase() ||
    (body && Object.keys(body).length ? 'POST' : 'GET')

  return {
    headers: httpContext.headers || {},
    method: inferredMethod,
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
      ...queryFromContext
    },
    body
  }
}

function getOpenIdFromUserInfo(userInfo) {
  if (!userInfo) return ''

  return (
    userInfo.OPENID ||
    userInfo.openId ||
    userInfo.openid ||
    userInfo.uid ||
    userInfo.customUserId ||
    ''
  )
}

function isSkipAuthEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

async function resolveUserFromBearerToken(headers) {
  const authorization = headers.authorization || headers.Authorization
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return null
  }

  const accessToken = authorization.slice(7).trim()
  const payload = decodeJwtPayload(accessToken)
  if (!payload) {
    return null
  }

  const directOpenId =
    payload.openid ||
    payload.openId ||
    payload.WX_OPENID ||
    ''
  const uid =
    payload.uid ||
    payload.user_id ||
    payload.userId ||
    payload.sub ||
    payload.TCB_UUID ||
    ''
  const customUserId =
    payload.customUserId ||
    payload.custom_user_id ||
    payload.TCB_CUSTOM_USER_ID ||
    ''

  if (directOpenId) {
    return {
      openid: directOpenId,
      uid,
      customUserId,
      source: 'bearer-token'
    }
  }

  if (!uid && !customUserId) {
    return null
  }

  try {
    const auth = getCloudBase().auth()
    const targetUid = uid || customUserId
    const result = await auth.getEndUserInfo(targetUid)
    const userInfo = result?.userInfo || {}
    const resolvedOpenId =
      userInfo.openId ||
      userInfo.openid ||
      ''

    if (!resolvedOpenId) {
      return null
    }

    return {
      openid: resolvedOpenId,
      uid: userInfo.uid || uid || '',
      customUserId: userInfo.customUserId || customUserId || '',
      source: 'bearer-token-profile',
      userInfo
    }
  } catch (error) {
    console.warn('通过 access token 补查用户信息失败:', error.message)
    return null
  }
}

async function resolveHttpUserInfo(rawHeaders, query = {}, context = null) {
  const headers = normalizeHeaders(rawHeaders)
  const headerOpenId = headers['x-wx-openid'] || headers['x-openid']

  if (headerOpenId) {
    return {
      openid: headerOpenId,
      source: 'openid-header'
    }
  }

  const cloudbaseContext = decodeCloudbaseContext(headers['x-cloudbase-context'])
  const cloudbaseOpenId = getOpenIdFromUserInfo(cloudbaseContext)
  if (cloudbaseOpenId) {
    return {
      openid: cloudbaseOpenId,
      source: 'x-cloudbase-context',
      userInfo: cloudbaseContext
    }
  }

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

  const bearerUser = await resolveUserFromBearerToken(headers)
  if (bearerUser?.openid) {
    return bearerUser
  }

  if (isSkipAuthEnabled(query.skipAuth)) {
    return {
      openid: `test_user_${Date.now()}`,
      source: 'skip-auth'
    }
  }

  return null
}

module.exports = {
  jsonResponse,
  methodNotAllowed,
  notFound,
  normalizeHeaders,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  parseEventBody,
  getHttpRequestData,
  resolveHttpUserInfo,
  isSkipAuthEnabled
}
