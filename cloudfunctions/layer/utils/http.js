'use strict'

const { debugLog, isSkipAuthEnabled } = require('./common')

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
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
  if (queryIndex === -1) return {}

  const queryString = raw.slice(queryIndex + 1)
  return queryString.split('&').reduce((result, pair) => {
    if (!pair) return result
    const [rawKey, rawVal = ''] = pair.split('=')
    const key = decodeURIComponent(rawKey || '').trim()
    if (!key) return result
    result[key] = decodeURIComponent(rawVal)
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

function createActionResolver(routeTable = {}) {
  const pathMatchers = Object.entries(routeTable)
    .filter(([, route]) => route && route.match)
    .map(([action, route]) => ({ action, match: route.match }))

  return function resolveHttpAction(event, requestData) {
    const headers = normalizeHeaders(requestData.headers)
    const accept = String(headers.accept || '')
    const path = String(requestData.path || '')

    if (event.action) return event.action
    if (requestData.query.action) return requestData.query.action
    if (requestData.body.action) return requestData.body.action

    for (const item of pathMatchers) {
      if (item.match(path, requestData, headers, accept)) {
        return item.action
      }
    }

    if (accept.includes('text/event-stream')) {
      const streamAction = Object.entries(routeTable).find(([, route]) => route?.stream === true)
      return streamAction ? streamAction[0] : ''
    }

    return ''
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

  const payloadOpenId = String(query.openid || query.openId || '').trim()
  if (payloadOpenId) {
    return {
      openid: payloadOpenId,
      source: 'payload-openid'
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

function normalizeHttpResult(result) {
  if (result === undefined || result === null) {
    return jsonResponse(204, {})
  }

  if (typeof result === 'string') {
    return result
  }

  if (typeof result === 'object' && ('statusCode' in result || 'body' in result)) {
    return result
  }

  if (typeof result === 'object' && 'code' in result && 'message' in result) {
    const statusCode = Number(result.code) >= 100 && Number(result.code) < 600 ? Number(result.code) : 200
    return jsonResponse(statusCode, result)
  }

  return jsonResponse(200, result)
}

function createHttpFunctionApp({
  name,
  routeTable,
  proxyHandler,
  onRequest,
  onError
}) {
  const resolveHttpAction = createActionResolver(routeTable)

  return async function main(event, context) {
    try {
      const requestData = getHttpRequestData(event, context)
      debugLog(`[${name}] 云函数调用:`, {
        action: event.action,
        method: requestData.method,
        path: requestData.path,
        query: requestData.query,
        body: requestData.body
      })

      onRequest?.(event, context, requestData)

      const isHttpCall = context.httpContext !== undefined
      if (!isHttpCall) {
        if (typeof proxyHandler === 'function') {
          return await proxyHandler(event, context, requestData)
        }
        return { code: 400, message: '仅支持 HTTP 调用', data: null }
      }

      const action = resolveHttpAction(event, requestData)
      const route = routeTable[action]
      if (!route || typeof route.handler !== 'function') {
        return jsonResponse(404, { code: 404, message: '接口不存在', data: null })
      }

      const result = await route.handler(event, context, requestData)
      return normalizeHttpResult(result)
    } catch (error) {
      console.error(`[${name}] 云函数执行错误:`, error)
      if (typeof onError === 'function') {
        const handled = await onError(error, event, context)
        if (handled !== undefined) {
          return handled
        }
      }

      if (context?.httpContext !== undefined) {
        return jsonResponse(500, { code: 500, message: `服务器错误: ${error.message}`, data: null })
      }

      return { code: 500, message: `服务器错误: ${error.message}`, data: null }
    }
  }
}

module.exports = {
  jsonResponse,
  normalizeHeaders,
  getHttpRequestData,
  createActionResolver,
  resolveHttpUserInfo,
  createHttpFunctionApp
}
