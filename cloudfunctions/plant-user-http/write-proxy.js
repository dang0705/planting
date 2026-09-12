'use strict'

const https = require('node:https')

const WRITE_FUNCTION_PATH_PREFIX = '/plant-user-write-http'
const DEFAULT_PUBLIC_FUNCTION_DOMAIN_SUFFIX = '-1403815561.ap-shanghai.app.tcloudbase.com'
const HOP_HEADER = 'x-plant-user-write-proxy'
const FORBIDDEN_FORWARD_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])
const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

function normalizeHeaderValue(value = '') {
  return String(Array.isArray(value) ? value[0] : value || '').trim()
}

function expectedCloudbaseEnvironmentPrefix() {
  const environmentId = String(process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID || '').trim()
  return environmentId ? `${environmentId}-` : ''
}

function parseTrustedPublicOrigin(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }
  let origin
  try {
    origin = new URL(raw)
  } catch {
    return null
  }
  if (
    origin.protocol !== 'https:' ||
    (origin.port && origin.port !== '443') ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    return null
  }
  const hostname = String(origin.hostname || '').toLowerCase()
  const expectedPrefix = expectedCloudbaseEnvironmentPrefix()
  if (
    !hostname.endsWith('.app.tcloudbase.com') ||
    (expectedPrefix && !hostname.startsWith(expectedPrefix))
  ) {
    return null
  }
  return origin
}

function resolveWriteFunctionOrigin(headers = {}) {
  const configured = parseTrustedPublicOrigin(process.env.PLANT_USER_WRITE_PROXY_ORIGIN)
  if (configured) {
    return configured
  }

  // Host 是来自当前 HTTP 网关的地址，仍需绑定本环境的 tcloudbase 公网域名，
  // 防止请求方伪造 Host 把函数变成任意目标的转发器。
  const forwarded = parseTrustedPublicOrigin(
    normalizeHeaderValue(headers['x-forwarded-host']) || normalizeHeaderValue(headers.host)
  )
  if (forwarded) {
    return forwarded
  }

  // CloudBase 某些 HTTP 访问服务会把函数内部 Host 替换成不带公网域名的内部值，
  // 这时不能把写请求错误地判成“路由不可用”。目标域名由受信任的函数环境 ID
  // 和本项目固定的公网服务后缀推导，不使用请求方可控的地址。
  const environmentId = String(process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID || '').trim()
  return environmentId
    ? parseTrustedPublicOrigin(`https://${environmentId}${DEFAULT_PUBLIC_FUNCTION_DOMAIN_SUFFIX}`)
    : null
}

function buildForwardHeaders(headers = {}, rawBody = Buffer.alloc(0), hostname = '') {
  const forwarded = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key || '').toLowerCase()
    if (!normalizedKey || FORBIDDEN_FORWARD_HEADERS.has(normalizedKey)) {
      continue
    }
    forwarded[normalizedKey] = value
  }
  forwarded.host = hostname
  forwarded[HOP_HEADER] = '1'
  if (rawBody.length > 0) {
    forwarded['content-length'] = String(rawBody.length)
  }
  return forwarded
}

function copyResponseHeaders(response, upstreamHeaders = {}) {
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (value === undefined || FORBIDDEN_RESPONSE_HEADERS.has(String(key).toLowerCase())) {
      continue
    }
    response.setHeader(key, value)
  }
}

function createUpstreamError(error, message = '植物服务暂时不可用，请稍后重试') {
  const wrapped = new Error(message)
  wrapped.statusCode = 502
  wrapped.code = error?.code || 'PLANT_USER_WRITE_PROXY_FAILED'
  return wrapped
}

function forwardToWriteFunction({ req, res, rawBody = Buffer.alloc(0) } = {}) {
  const origin = resolveWriteFunctionOrigin(req?.headers || {})
  if (!origin) {
    return Promise.reject(createUpstreamError(null, '植物服务路由暂时不可用，请稍后重试'))
  }

  const requestPath = String(req?.url || '/').startsWith('/') ? req.url : `/${req?.url || ''}`
  const upstreamPath = `${WRITE_FUNCTION_PATH_PREFIX}${requestPath}`
  const headers = buildForwardHeaders(req.headers || {}, rawBody, origin.host)

  return new Promise((resolve, reject) => {
    const upstream = https.request(
      {
        protocol: 'https:',
        hostname: origin.hostname,
        port: origin.port || 443,
        method: req.method || 'GET',
        path: upstreamPath,
        headers,
        timeout: 28_000
      },
      upstreamResponse => {
        copyResponseHeaders(res, upstreamResponse.headers)
        res.statusCode = Number(upstreamResponse.statusCode || 502)
        upstreamResponse.once('error', error => reject(createUpstreamError(error)))
        upstreamResponse.pipe(res)
        upstreamResponse.once('end', resolve)
      }
    )
    upstream.once('timeout', () => upstream.destroy(new Error('UPSTREAM_TIMEOUT')))
    upstream.once('error', error => reject(createUpstreamError(error)))
    if (rawBody.length > 0) {
      upstream.write(rawBody)
    }
    upstream.end()
  })
}

module.exports = {
  forwardToWriteFunction,
  _test: {
    buildForwardHeaders,
    parseTrustedPublicOrigin,
    resolveWriteFunctionOrigin
  }
}
