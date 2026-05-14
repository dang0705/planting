'use strict'

const { isSkipAuthEnabled } = require('./common')

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }
}

function normalizeHeaders(rawHeaders = {}) {
  return Object.entries(rawHeaders).reduce((headers, [key, value]) => {
    headers[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value
    return headers
  }, {})
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

function parseQueryString(rawValue) {
  const raw = String(rawValue || '')
  const queryIndex = raw.indexOf('?')
  if (queryIndex === -1) {return {}}

  const queryString = raw.slice(queryIndex + 1)
  return queryString.split('&').reduce((result, pair) => {
    if (!pair) {return result}
    const [rawKey, rawVal = ''] = pair.split('=')
    const key = decodeURIComponent(rawKey || '').trim()
    if (!key) {return result}
    result[key] = decodeURIComponent(rawVal)
    return result
  }, {})
}

function parseEventBody(event) {
  if (!event) {return {}}

  if (typeof event === 'string') {
    try {
      return JSON.parse(event)
    } catch {
      return {}
    }
  }

  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body)
    } catch {
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

  return {
    headers: httpContext.headers || {},
    method: String(httpContext.method || '').toUpperCase(),
    path:
      httpContext.path || httpContext.url || httpContext.rawPath || httpContext.reqUrl || '',
    query: {
      ...queryFromPath,
      ...queryFromUrl,
      ...queryFromContext
    },
    body
  }
}

function resolveHttpAction(event, requestData) {
  const headers = normalizeHeaders(requestData.headers)
  const accept = String(headers.accept || '')
  const path = String(requestData.path || '')

  if (event.action) {return event.action}
  if (requestData.query.action) {return requestData.query.action}
  if (requestData.body.action) {return requestData.body.action}
  if (path.includes('/stream/diagnose')) {return 'streamDiagnose'}
  if (path.includes('/diagnose')) {return 'syncDiagnose'}
  if (path.includes('/health')) {return 'health'}
  if (accept.includes('text/event-stream')) {return 'streamDiagnose'}
  return ''
}

function getOpenIdFromUserInfo(userInfo) {
  if (!userInfo) {return ''}

  return (
    userInfo.OPENID ||
    userInfo.openId ||
    userInfo.openid ||
    userInfo.uid ||
    userInfo.customUserId ||
    ''
  )
}

async function resolveHttpUserInfo(rawHeaders, query = {}) {
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
  normalizeHeaders,
  getHttpRequestData,
  resolveHttpAction,
  resolveHttpUserInfo
}
