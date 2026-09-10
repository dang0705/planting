import {
  BASE_URL,
  IS_LOCAL_API_BASE_URL,
  PUBLIC_HTTP_FUNCTION_BASE_URL,
  shouldAppendWebFunctionFlag
} from '@/api/env'
import {
  getActivePlatformAccessToken,
  getActivePlatformIdentityTicket
} from '@/api/platform-session'
import { getCloudbaseUserIdentity, refreshPlatformHttpIdentity } from '@/utils/cloudbase-auth'
import { getRequestAppEnvHeader } from '@/utils/runtime-env'

export const DEFAULT_HTTP_TIMEOUT_MS = 20_000

function isWechatMiniProgramRuntime() {
  return typeof wx !== 'undefined' && typeof wx?.cloud !== 'undefined'
}

function buildQueryString(query = {}) {
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )
  if (!entries.length) {
    return ''
  }

  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return `?${search}`
}

function parseFunctionPath(functionPath = '') {
  const rawPath = String(functionPath || '').replace(/^\/+/, '')
  const queryIndex = rawPath.indexOf('?')
  if (queryIndex < 0) {
    return { path: rawPath, query: {} }
  }

  const path = rawPath.slice(0, queryIndex)
  const query = rawPath
    .slice(queryIndex + 1)
    .split('&')
    .reduce((result, pair) => {
      if (!pair) {
        return result
      }
      const separatorIndex = pair.indexOf('=')
      const rawKey = separatorIndex < 0 ? pair : pair.slice(0, separatorIndex)
      const rawValue = separatorIndex < 0 ? '' : pair.slice(separatorIndex + 1)
      try {
        const key = decodeURIComponent(rawKey).trim()
        if (key) {
          result[key] = decodeURIComponent(rawValue)
        }
      } catch {
        // 非法路径查询不应阻断显式 query；保留原始值交给服务端处理。
        const key = String(rawKey || '').trim()
        if (key) {
          result[key] = String(rawValue || '')
        }
      }
      return result
    }, {})

  return { path, query }
}

function getLocalDevOpenId() {
  return String(import.meta.env.VITE_DEV_OPENID || 'dev_terminal_mp_local').trim()
}

function stripReservedIdentityHeaders(headers = {}) {
  const sanitized = { ...headers }
  delete sanitized.Authorization
  delete sanitized.authorization
  delete sanitized['x-planting-http-identity-ticket']
  delete sanitized['x-planting-platform-session']
  return sanitized
}

function buildSignedIdentityTicketHeaders(headers = {}, ticket = '') {
  return {
    ...stripReservedIdentityHeaders(headers),
    'x-app-env': getRequestAppEnvHeader(),
    'x-env': getRequestAppEnvHeader(),
    Authorization: `Bearer ${ticket}`,
    'x-planting-http-identity-ticket': ticket
  }
}

async function refreshSignedIdentityTicketHeaders(headers = {}) {
  const refreshedIdentity = await refreshPlatformHttpIdentity()
  const ticket = String(refreshedIdentity?.httpIdentityTicket || '').trim()
  if (!ticket) {
    throw new Error('身份票据刷新失败，请重新登录后再继续问诊')
  }
  return buildSignedIdentityTicketHeaders(headers, ticket)
}

async function resolveRealRuntimeIdentity() {
  if (isWechatMiniProgramRuntime()) {
    const identity = await getCloudbaseUserIdentity()
    const openid = identity?.openid || ''
    if (!openid) {
      throw new Error('微信身份获取失败：wechat-identity 未返回有效 openid，拒绝匿名降级')
    }
    return identity
  }
  throw new Error('HTTP 云函数身份仅支持微信小程序或本地函数网关')
}

export async function resolveHttpFunctionAuth({
  auth = true,
  headers = {},
  requirePlatformSession = false,
  requireSignedIdentityTicket = false,
  preferPlatformSession = false
} = {}) {
  if (!auth) {
    return headers
  }

  const useRealMiniProgramIdentity = isWechatMiniProgramRuntime()
  const platformSessionToken = getActivePlatformAccessToken()
  // 写操作、诊断和其他需要可即时吊销权限的请求始终使用持久平台会话。
  // preferPlatformSession 作为历史调用方的兼容别名，优先级高于短票据。
  if (!IS_LOCAL_API_BASE_URL && (requirePlatformSession || preferPlatformSession)) {
    if (!platformSessionToken && useRealMiniProgramIdentity) {
      throw new Error('当前登录会话已失效，请重新登录后再继续问诊')
    }
    if (platformSessionToken) {
      return {
        ...stripReservedIdentityHeaders(headers),
        'x-app-env': getRequestAppEnvHeader(),
        'x-env': getRequestAppEnvHeader(),
        Authorization: `Bearer ${platformSessionToken}`,
        // 公网 HTTP 函数域名按该受控字段读取持久平台会话；保留
        // Authorization 仅用于仍由 API 网关承载的兼容入口。
        'x-planting-platform-session': platformSessionToken
      }
    }
  }

  if (!IS_LOCAL_API_BASE_URL && requireSignedIdentityTicket) {
    const platformIdentityTicket = getActivePlatformIdentityTicket()
    if (platformIdentityTicket) {
      return buildSignedIdentityTicketHeaders(headers, platformIdentityTicket)
    }
    if (platformSessionToken) {
      return refreshSignedIdentityTicketHeaders(headers)
    }
  }

  // 非目标业务默认仍走持久会话；不能因为本地存有短票据就改变写请求的
  // 授权来源。只有显式 requireSignedIdentityTicket 的两个读入口可用票据。
  if (!IS_LOCAL_API_BASE_URL && platformSessionToken) {
    return {
      ...stripReservedIdentityHeaders(headers),
      'x-app-env': getRequestAppEnvHeader(),
      'x-env': getRequestAppEnvHeader(),
      Authorization: `Bearer ${platformSessionToken}`,
      // 公网 HTTP 网关可能重写 Authorization；全部持久会话请求都显式
      // 传递既有受控会话字段，避免非目标接口在网关后被误判为未登录。
      'x-planting-platform-session': platformSessionToken
    }
  }

  if (platformSessionToken) {
    return {
      ...stripReservedIdentityHeaders(headers),
      'x-app-env': getRequestAppEnvHeader(),
      'x-env': getRequestAppEnvHeader(),
      Authorization: `Bearer ${platformSessionToken}`
    }
  }

  if (requirePlatformSession && !IS_LOCAL_API_BASE_URL && useRealMiniProgramIdentity) {
    throw new Error('当前登录会话已失效，请重新登录后再继续问诊')
  }

  if (IS_LOCAL_API_BASE_URL) {
    const openid = useRealMiniProgramIdentity
      ? (await resolveRealRuntimeIdentity()).openid
      : getLocalDevOpenId()
    if (!openid) {
      throw new Error('本地函数身份获取失败：未返回有效 openid')
    }
    return {
      ...headers,
      'x-app-env': getRequestAppEnvHeader(),
      'x-env': getRequestAppEnvHeader(),
      'x-wx-openid': openid,
      'x-openid': openid
    }
  }

  if (!useRealMiniProgramIdentity) {
    return {
      ...headers,
      'x-app-env': getRequestAppEnvHeader(),
      'x-env': getRequestAppEnvHeader()
    }
  }

  const identity = await resolveRealRuntimeIdentity()
  if (!identity.httpIdentityTicket) {
    throw new Error('微信身份接口未返回有效 HTTP 身份票据')
  }
  return {
    ...stripReservedIdentityHeaders(headers),
    'x-app-env': getRequestAppEnvHeader(),
    'x-env': getRequestAppEnvHeader(),
    Authorization: `Bearer ${identity.httpIdentityTicket}`,
    'x-planting-http-identity-ticket': identity.httpIdentityTicket
  }
}

function createUrl(functionPath, query, baseUrlOverride = '') {
  const parsedPath = parseFunctionPath(functionPath)
  const mergedQuery = {
    ...parsedPath.query,
    ...(query && typeof query === 'object' ? query : {})
  }
  const queryString = buildQueryString(mergedQuery)
  const baseUrl = String(baseUrlOverride || BASE_URL || '').replace(/\/+$/, '')
  const path = parsedPath.path

  if (!shouldAppendWebFunctionFlag(baseUrl)) {
    return `${baseUrl}/${path}${queryString}`
  }

  if (Object.prototype.hasOwnProperty.call(mergedQuery, 'webfn')) {
    return `${baseUrl}/${path}${queryString}`
  }

  const joiner = queryString ? '&' : '?'
  return `${baseUrl}/${path}${queryString}${joiner}webfn=true`
}

function resolveHttpMethodTransport(method = 'GET', query = {}, headers = {}) {
  const requestedMethod = String(method || 'GET').toUpperCase()

  if (requestedMethod === 'GET' || requestedMethod === 'POST') {
    return {
      requestMethod: requestedMethod,
      requestQuery: query,
      requestHeaders: headers,
      logicalMethod: requestedMethod
    }
  }

  return {
    requestMethod: 'POST',
    requestQuery: {
      ...query,
      _method: requestedMethod
    },
    requestHeaders: {
      ...headers,
      'x-http-method-override': requestedMethod
    },
    logicalMethod: requestedMethod
  }
}

function buildPublicTransportError(error) {
  const rawMessage = String(error?.errMsg || error?.message || error || '').toLowerCase()
  const isTimeout = rawMessage.includes('timeout') || rawMessage.includes('timed out')
  const publicError = new Error(
    isTimeout ? '请求超时，请检查网络后重试' : '网络连接不稳定，请检查网络后重试'
  )
  publicError.isRetryable = true
  return publicError
}

export function normalizeJsonResponseData(data, dataType = '') {
  if (dataType !== 'json' || typeof data !== 'string') {
    return data
  }

  const normalized = data.replace(/^\uFEFF/u, '').trim()
  if (!normalized) {
    return data
  }

  try {
    return JSON.parse(normalized)
  } catch {
    // 非 JSON 错误页仍保留原文，交给上层按 HTTP 状态码处理，不能伪造成功对象。
    return data
  }
}

export function httpRequest(defaults = {}) {
  return async function (options = {}) {
    const {
      functionPath = defaults.functionPath || '',
      method = defaults.method || 'GET',
      query = defaults.query,
      payload = defaults.payload,
      headers = {},
      auth = defaults.auth !== undefined ? defaults.auth : true,
      requirePlatformSession = options.requirePlatformSession !== undefined
        ? options.requirePlatformSession
        : defaults.requirePlatformSession === true,
      requireSignedIdentityTicket = options.requireSignedIdentityTicket !== undefined
        ? options.requireSignedIdentityTicket
        : defaults.requireSignedIdentityTicket === true,
      preferPlatformSession = options.preferPlatformSession !== undefined
        ? options.preferPlatformSession
        : defaults.preferPlatformSession === true,
      enableChunked = defaults.enableChunked,
      dataType = options.dataType !== undefined
        ? options.dataType
        : defaults.dataType !== undefined
          ? defaults.dataType
          : enableChunked
            ? undefined
            : 'json',
      responseType = defaults.responseType,
      timeout = defaults.timeout,
      baseUrl = defaults.baseUrl,
      onChunkReceived
    } = options
    const requestTimeout = timeout === undefined ? DEFAULT_HTTP_TIMEOUT_MS : timeout

    if (!functionPath) {
      throw new Error('缺少 functionPath')
    }

    const baseHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'no-cache, no-transform',
      ...defaults.headers,
      ...headers
    }
    const { requestMethod, requestQuery, requestHeaders } = resolveHttpMethodTransport(
      method,
      query,
      baseHeaders
    )

    const mergedHeaders = await resolveHttpFunctionAuth({
      auth,
      headers: requestHeaders,
      requirePlatformSession,
      requireSignedIdentityTicket,
      preferPlatformSession
    })
    const requestBaseUrl =
      baseUrl ?? (!IS_LOCAL_API_BASE_URL ? PUBLIC_HTTP_FUNCTION_BASE_URL : undefined)
    const url = createUrl(functionPath, requestQuery, requestBaseUrl)
    console.log('[http-request] request url:', url)

    const dispatch = requestHeaders => new Promise((resolve, reject) => {
      const requestTask = uni.request({
        url,
        method: requestMethod,
        data: payload,
        header: requestHeaders,
        ...(dataType ? { dataType } : {}),
        ...(responseType ? { responseType } : {}),
        ...(enableChunked !== undefined ? { enableChunked } : {}),
        ...(Number(requestTimeout) > 0 ? { timeout: Number(requestTimeout) } : {}),
        success: response =>
          resolve({
            ...response,
            data: normalizeJsonResponseData(response?.data, dataType)
          }),
        fail: error => reject(buildPublicTransportError(error))
      })

      if (
        typeof onChunkReceived === 'function' &&
        typeof requestTask?.onChunkReceived === 'function'
      ) {
        requestTask.onChunkReceived(onChunkReceived)
      }
    })

    const initialResponse = await dispatch(mergedHeaders)
    const shouldRetrySignedTicket =
      requireSignedIdentityTicket &&
      !IS_LOCAL_API_BASE_URL &&
      Number(initialResponse?.statusCode || 0) === 401 &&
      Boolean(getActivePlatformAccessToken())
    if (!shouldRetrySignedTicket) {
      return initialResponse
    }

    // 客户端本地有效但服务端拒绝的短票据（如边界时钟差或刚过期）只刷新
    // 一次并重试同一只读请求；写入类请求不会进入此分支。
    return dispatch(await refreshSignedIdentityTicketHeaders(requestHeaders))
  }
}
