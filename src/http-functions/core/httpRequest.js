import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'
import { getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'
import { getRequestAppEnvHeader } from '@/utils/runtime-env'

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
  const queryString = buildQueryString(query)
  const baseUrl = String(BASE_URL || '').replace(/\/+$/, '')
  const path = String(functionPath || '').replace(/^\/+/, '')

  if (!shouldAppendWebFunctionFlag()) {
    return `${baseUrl}/${path}${queryString}`
  }

  if (query && Object.prototype.hasOwnProperty.call(query, 'webfn')) {
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

    if (!functionPath) {
      throw new Error('缺少 functionPath')
    }

    const mergedHeaders = await resolveHttpFunctionAuth({
      auth,
      headers: {
        'Content-Type': 'application/json',
        ...defaults.headers,
        ...headers
      }
    })
    const { requestMethod, requestQuery, requestHeaders } = resolveHttpMethodTransport(
      method,
      query,
      mergedHeaders
    )
    const url = createUrl(functionPath, requestQuery)
    console.log('[http-request] request url:', url)

    return new Promise((resolve, reject) => {
      const requestTask = uni.request({
        url,
        method: requestMethod,
        data: payload,
        header: requestHeaders,
        ...(responseType ? { responseType } : {}),
        ...(enableChunked !== undefined ? { enableChunked } : {}),
        ...(timeout ? { timeout } : {}),
        success: response => resolve(response),
        fail: error => reject(error)
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
