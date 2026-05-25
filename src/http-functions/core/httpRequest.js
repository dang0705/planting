import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'
import { getCloudbaseAccessToken, getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'
import { getRequestAppEnvHeader } from '@/utils/runtime-env'

function isWechatMiniProgramRuntime() {
  return typeof wx !== 'undefined' && typeof wx?.cloud !== 'undefined'
}

function buildQueryString(query = {}) {
  const entries = Object.entries(query).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )
  if (!entries.length) {return ''}

  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return `?${search}`
}

function getStoredUserOpenId() {
  try {
    const rawUser = uni.getStorageSync('user')
    const user =
      typeof rawUser === 'string'
        ? (() => {
            try {
              return JSON.parse(rawUser)
            } catch {
              return {}
            }
          })()
        : rawUser || {}

    return user.openid || user.wechat_openid || ''
  } catch {
    return ''
  }
}

function getLocalDevOpenId() {
  return String(import.meta.env.VITE_DEV_OPENID || 'dev_terminal_mp_local').trim()
}

async function resolveHttpFunctionAuth({ auth = true, headers = {} } = {}) {
  if (!auth) {
    return headers
  }

  let openid = getStoredUserOpenId()
  let token = ''

  if (IS_LOCAL_API_BASE_URL) {
    openid = openid || getLocalDevOpenId()
  } else if (isWechatMiniProgramRuntime()) {
    try {
      token = await getCloudbaseAccessToken()
    } catch (error) {
      console.warn('获取 CloudBase access token 失败，将继续尝试使用本地 openid:', error)
    }

    if (!openid) {
      try {
        const identity = await getCloudbaseUserIdentity()
        openid = identity?.openid || ''
      } catch (error) {
        console.warn('获取 CloudBase 用户 openid 失败:', error)
      }
    }
  }

  return {
    ...headers,
    'x-app-env': getRequestAppEnvHeader(),
    'x-env': getRequestAppEnvHeader(),
    ...(IS_LOCAL_API_BASE_URL ? { 'x-terminal-e2e': 'true', 'x-anonymous-dev-identity': 'true' } : {}),
    ...(openid ? { 'x-wx-openid': openid, 'x-openid': openid } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
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
    const {
      requestMethod,
      requestQuery,
      requestHeaders
    } = resolveHttpMethodTransport(method, query, mergedHeaders)
    const url = createUrl(functionPath, requestQuery)

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
