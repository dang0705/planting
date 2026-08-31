import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'
import { getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'
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

export async function resolveHttpFunctionAuth({ auth = true, headers = {} } = {}) {
  if (!auth) {
    return headers
  }

  const useRealMiniProgramIdentity = isWechatMiniProgramRuntime()

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
  const ticket = String(identity?.httpIdentityTicket || '').trim()
  if (!ticket) {
    throw new Error('微信身份票据获取失败，请稍后重试')
  }
  return {
    ...headers,
    'x-app-env': getRequestAppEnvHeader(),
    'x-env': getRequestAppEnvHeader(),
    Authorization: `Bearer ${ticket}`
  }
}

function createUrl(functionPath, query) {
  const parsedPath = parseFunctionPath(functionPath)
  const mergedQuery = {
    ...parsedPath.query,
    ...(query && typeof query === 'object' ? query : {})
  }
  const queryString = buildQueryString(mergedQuery)
  const baseUrl = String(BASE_URL || '').replace(/\/+$/, '')
  const path = parsedPath.path

  if (!shouldAppendWebFunctionFlag()) {
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

function buildNativeHttpFunctionRequest(functionPath, query = {}) {
  const parsedPath = parseFunctionPath(functionPath)
  const mergedQuery = {
    ...parsedPath.query,
    ...(query && typeof query === 'object' ? query : {})
  }
  const pathSegments = parsedPath.path.split('/').filter(Boolean)
  const functionName = pathSegments.shift() || ''
  const path = `/${pathSegments.join('/')}`.replace(/\/$/u, '') || '/'
  const queryString = buildQueryString(mergedQuery)

  if (!functionName) {
    throw new Error('缺少有效的 HTTP 云函数路径')
  }

  return {
    name: functionName,
    path: `${path}${queryString}`
  }
}

function requestNativeHttpFunction({
  functionPath,
  method,
  query,
  payload,
  headers,
  identityTicket,
  enableChunked,
  timeout,
  onChunkReceived
}) {
  const target = buildNativeHttpFunctionRequest(functionPath, query)
  const options = {
    name: target.name,
    path: target.path,
    method,
    header: {
      ...headers,
      ...(identityTicket
        ? {
            Authorization: `Bearer ${identityTicket}`,
            'x-planting-http-identity-ticket': identityTicket
          }
        : {})
    },
    ...(payload !== undefined ? { data: payload } : {}),
    ...(enableChunked !== undefined ? { enableChunked } : {}),
    ...(Number(timeout) > 0 ? { timeout: Number(timeout) } : {}),
    ...(typeof onChunkReceived === 'function'
      ? { onChunkedReceived: onChunkReceived }
      : {})
  }

  return new Promise((resolve, reject) => {
    try {
      wx.cloud.callHTTPFunction({
        ...options,
        success: response => resolve(response),
        fail: error => reject(buildPublicTransportError(error))
      })
    } catch (error) {
      reject(buildPublicTransportError(error))
    }
  })
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

export function httpRequest(defaults = {}) {
  return async function (options = {}) {
    const {
      functionPath = defaults.functionPath || '',
      method = defaults.method || 'GET',
      query = defaults.query,
      payload = defaults.payload,
      headers = {},
      auth = defaults.auth !== undefined ? defaults.auth : true,
      responseType = defaults.responseType,
      enableChunked = defaults.enableChunked,
      timeout = defaults.timeout,
      onChunkReceived
    } = options
    const requestTimeout = timeout === undefined ? DEFAULT_HTTP_TIMEOUT_MS : timeout

    if (!functionPath) {
      throw new Error('缺少 functionPath')
    }

    const baseHeaders = {
      'Content-Type': 'application/json',
      ...defaults.headers,
      ...headers
    }
    const { requestMethod, requestQuery, requestHeaders } = resolveHttpMethodTransport(
      method,
      query,
      baseHeaders
    )

    if (
      isWechatMiniProgramRuntime() &&
      !IS_LOCAL_API_BASE_URL &&
      typeof wx.cloud.callHTTPFunction === 'function'
    ) {
      const identity = auth ? await resolveRealRuntimeIdentity() : null
      return requestNativeHttpFunction({
        functionPath,
        method: requestMethod,
        query: requestQuery,
        payload,
        headers: {
          ...requestHeaders,
          'x-app-env': getRequestAppEnvHeader(),
          'x-env': getRequestAppEnvHeader()
        },
        identityTicket: identity?.httpIdentityTicket,
        enableChunked,
        timeout: requestTimeout,
        onChunkReceived
      })
    }

    const mergedHeaders = await resolveHttpFunctionAuth({
      auth,
      headers: requestHeaders
    })
    const url = createUrl(functionPath, requestQuery)
    console.log('[http-request] request url:', url)

    return new Promise((resolve, reject) => {
      const requestTask = uni.request({
        url,
        method: requestMethod,
        data: payload,
        header: mergedHeaders,
        ...(responseType ? { responseType } : {}),
        ...(enableChunked !== undefined ? { enableChunked } : {}),
        ...(Number(requestTimeout) > 0 ? { timeout: Number(requestTimeout) } : {}),
        success: response => resolve(response),
        fail: error => reject(buildPublicTransportError(error))
      })

      if (
        typeof onChunkReceived === 'function' &&
        typeof requestTask?.onChunkReceived === 'function'
      ) {
        requestTask.onChunkReceived(onChunkReceived)
      }
    })
  }
}
