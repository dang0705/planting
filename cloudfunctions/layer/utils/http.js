'use strict'

const { getUserInfo, models } = require('./cloudbase')
const { normalizeAppEnv, runWithRequestAppEnv } = require('./runtime-env')
const { getBearerToken, resolvePersistentSession } = require('./platform-session')
const { createHttpIdentityTicket, resolveHttpIdentityTicket } = require('./http-identity-ticket')

const LOCAL_FUNCTION_RUNTIME_FLAG = 'CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY'
const OPENID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

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
  // CloudBase HTTP functions can expose headers on both the event and
  // context.httpContext. The context object may contain only framework
  // headers, so selecting it with `||` silently drops application headers
  // (including the signed identity ticket). Merge both sources before
  // normalizing them in resolveHttpUserInfo.
  const rawHeaders = {
    ...(event?.headers && typeof event.headers === 'object' ? event.headers : {}),
    ...(httpContext.headers && typeof httpContext.headers === 'object' ? httpContext.headers : {})
  }
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
      // functions-framework 将原始方法放在 httpContext.httpMethod；若漏读它，
      // 空 JSON POST 会被误判为 GET，进而被业务路由拒绝为 405。
      httpContext.httpMethod ||
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

function resolveCloudbaseRuntimeHeaderUser(headers = {}) {
  const openid = String(headers['x-wx-openid'] || '').trim()
  const appid = String(headers['x-wx-appid'] || '').trim()
  const source = String(headers['x-wx-source'] || '').trim()
  const configuredAppId = String(process.env.WECHAT_MINIPROGRAM_APP_ID || '').trim()

  // HTTP 云函数的微信原生调用不会把身份放进 Node context，CloudBase 会
  // 将已认证的运行时身份注入 X-Wx-Openid/X-Wx-Appid。必须同时有 appid、
  // source 且 appid 与当前环境绑定的小程序一致，不能把单独的 openid 头当成
  // 身份，也不能让抖音/小红书请求退回到宿主身份。
  if (
    !OPENID_PATTERN.test(openid) ||
    !appid ||
    !source ||
    !configuredAppId ||
    appid !== configuredAppId
  ) {
    return null
  }

  return {
    openid,
    appid,
    source: 'cloudbase-runtime-header'
  }
}

function isLocalFunctionRuntime() {
  return /^(1|true)$/i.test(String(process.env[LOCAL_FUNCTION_RUNTIME_FLAG] || '').trim())
}

async function resolveHttpUserInfo(rawHeaders, query = {}, context = null, options = {}) {
  const headers = normalizeHeaders(rawHeaders)
  const allowRuntimeIdentity = options?.allowRuntimeIdentity === true
  const allowSignedHttpIdentityTicket = options?.allowSignedHttpIdentityTicket === true

  // 持久平台会话是统一用户和数据归属的唯一默认来源。运行时注入的微信
  // OpenID 只允许在明确的身份建立入口作为兜底，不能抢在已存在会话前面。
  const bearerToken = getBearerToken(headers)
  if (bearerToken) {
    options?.timing?.mark('identity-session-query-start')
    const platformSession = await resolvePersistentSession({
      token: bearerToken,
      models,
      timing: options?.timing || null
    })
    options?.timing?.mark('identity-session-query-ready', {
      identityResolved: Boolean(platformSession?.openid)
    })
    if (platformSession) {
      return platformSession
    }
  }

  // 只有显式允许短票据的两个只读入口才能使用统一用户票据；写操作和
  // 其他业务默认跳过票据，避免可延迟吊销的凭据绕过持久会话校验。即使同时
  // 携带两种凭据，也先完成持久会话校验，防止旧票据覆盖当前统一账号。
  if (allowSignedHttpIdentityTicket) {
    const ticketUser = resolveHttpIdentityTicket(headers)
    if (ticketUser?.userId && ticketUser.subject === 'planting-user') {
      return ticketUser
    }
  }

  // 本地 LAN 网关的 x-openid 仅用于开发/测试身份注入，不会出现在云端；
  // 即使业务路由不允许运行时身份，也要保留既有本地读写调试闭环。
  const localOpenid = String(headers['x-wx-openid'] || headers['x-openid'] || '').trim()
  if (isLocalFunctionRuntime() && OPENID_PATTERN.test(localOpenid)) {
    return {
      openid: localOpenid,
      source: 'local-function-gateway'
    }
  }

  if (allowRuntimeIdentity) {
    const runtimeHeaderUser = resolveCloudbaseRuntimeHeaderUser(headers)
    if (runtimeHeaderUser) {
      return runtimeHeaderUser
    }
  }

  if (!allowRuntimeIdentity) {
    return null
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
  resolveHttpIdentityTicket,
  resolveCloudbaseRuntimeHeaderUser,
  createHttpIdentityTicket,
  _test: {
    decodeQueryComponent,
    parseQueryString,
    resolveHttpIdentityTicket,
    isLocalFunctionRuntime
  }
}
