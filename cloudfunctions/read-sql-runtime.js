'use strict'

// The deployment stager copies this audited core into each isolated reader package.

// 读函数不能为一次查询加载 36MB Layer，也不能把七次 RDB REST 往返伪装成
// "轻量读取"。这里仅保留 CloudBase 内部 RunMysqlCommand 所需的 Node 内置能力。
const crypto = require('node:crypto')
const http = require('node:http')
const https = require('node:https')

const NODE_SDK_VERSION = '3.18.0'
const SQL_TABLES = [
  'users',
  'user_sessions',
  'user_plant_instances',
  'plant_identity_entities',
  'plant_care_locations',
  'user_watering_reminder_events',
  'user_fertilization_reminder_events',
  'diagnosis_sessions'
]
const HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 4 })
const HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 4 })

function appEnv() {
  const value = String(process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase()
  if (['dev', 'development', 'cloud1_dev'].includes(value)) {
    return 'development'
  }
  if (['prod', 'production', 'cloud1'].includes(value)) {
    return 'production'
  }
  return ''
}

function cloudbaseEnvId() {
  const environment = appEnv()
  if (environment === 'development') {
    return String(
      process.env.CLOUDBASE_ENV_ID_DEV ||
        process.env.TCB_ENV_DEV ||
        process.env.TCB_ENV ||
        process.env.CLOUDBASE_ENV_ID ||
        ''
    ).trim()
  }
  if (environment === 'production') {
    return String(
      process.env.CLOUDBASE_ENV_ID_PROD ||
        process.env.TCB_ENV_PROD ||
        process.env.TCB_ENV ||
        process.env.CLOUDBASE_ENV_ID ||
        ''
    ).trim()
  }
  return String(process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID || '').trim()
}

function cloudbaseSchema() {
  const environment = appEnv()
  if (environment === 'development') {
    return String(
      process.env.SQL_DATABASE_DEV || process.env.CLOUDBASE_SQL_DATABASE_DEV || 'cloud1_dev'
    ).trim()
  }
  if (environment === 'production') {
    return String(
      process.env.SQL_DATABASE_PROD ||
        process.env.CLOUDBASE_SQL_DATABASE_PROD ||
        'cloud1-2grufevs395a9d5e'
    ).trim()
  }
  return String(process.env.SQL_DATABASE || process.env.CLOUDBASE_SQL_DATABASE || '').trim()
}

function apiError(message, code = 'CLOUDBASE_SQL_READ_FAILED', requestId = '') {
  const error = new Error(String(message || 'CloudBase SQL 读取失败'))
  error.code = code
  error.requestId = requestId
  return error
}

function resolveCredentials() {
  const accessKey = String(
    process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY || ''
  ).trim()
  const runtimeSecretId = String(process.env.TENCENTCLOUD_SECRETID || '').trim()
  const runtimeSecretKey = String(process.env.TENCENTCLOUD_SECRETKEY || '').trim()
  const runtimeSessionToken = String(
    process.env.TENCENTCLOUD_SESSIONTOKEN || process.env.TENCENTCLOUD_SESSION_TOKEN || ''
  ).trim()
  if (runtimeSecretId && runtimeSecretKey && runtimeSessionToken) {
    return {
      secretId: runtimeSecretId,
      secretKey: runtimeSecretKey,
      sessionToken: runtimeSessionToken
    }
  }
  const secretId = String(
    process.env.CLOUDBASE_SECRET_ID || process.env.TENCENT_SECRET_ID || ''
  ).trim()
  const secretKey = String(
    process.env.CLOUDBASE_SECRET_KEY || process.env.TENCENT_SECRET_KEY || ''
  ).trim()
  const sessionToken = String(
    process.env.CLOUDBASE_TOKEN ||
      process.env.CLOUDBASE_SESSION_TOKEN ||
      process.env.TENCENT_SESSION_TOKEN ||
      ''
  ).trim()
  if (secretId && secretKey) {
    return {
      secretId,
      secretKey,
      ...(sessionToken ? { sessionToken } : {})
    }
  }
  if (accessKey) {
    return { accessKey }
  }
  return { secretId: '', secretKey: '' }
}

function resolveRunEnvTag() {
  if (process.env.TENCENTCLOUD_RUNENV === 'SCF') {
    return 'scf'
  }
  if (process.env.CBR_ENV_ID) {
    return 'cbr'
  }
  if (['formal', 'pre', 'test'].includes(String(process.env.SUMERU_ENV || '').trim())) {
    return 'sumeru'
  }
  return process.env.TENCENTCLOUD_REGION ? 'tencentcloud' : 'unknown'
}

function resolveEndpoint() {
  const envId = cloudbaseEnvId()
  if (!envId) {
    throw apiError('CloudBase 环境未配置', 'CLOUDBASE_SQL_ENV_MISSING')
  }
  const region = String(
    process.env.TENCENTCLOUD_REGION || process.env.CLOUDBASE_REGION || ''
  ).trim()
  const internal =
    process.env.TENCENTCLOUD_RUNENV === 'SCF' ||
    Boolean(process.env.CBR_ENV_ID) ||
    ['formal', 'pre', 'test'].includes(String(process.env.SUMERU_ENV || '').trim())
  const host = internal
    ? region
      ? `${envId}.internal.${region}.tcb-api.tencentcloudapi.com`
      : `${envId}.internal.tcb-api.tencentcloudapi.com`
    : region
      ? `${envId}.${region}.tcb-api.tencentcloudapi.com`
      : `${envId}.tcb-api.tencentcloudapi.com`
  return {
    envId,
    internal,
    region,
    url: `${internal ? 'http' : 'https'}://${host}/admin?env=${encodeURIComponent(envId)}&seqId=${Date.now()}-${crypto.randomBytes(5).toString('hex')}`
  }
}

function serializeParameters(params = {}) {
  return Object.entries(params).reduce((list, [key, value]) => {
    if (value === undefined) {
      return list
    }
    const type = Array.isArray(value)
      ? 'ARRAY'
      : typeof value === 'boolean'
        ? 'BOOLEAN'
        : typeof value === 'number'
          ? 'NUMBER'
          : typeof value === 'string'
            ? 'STRING'
            : 'OBJECT'
    list.push({ key, type, value: type === 'STRING' ? value : JSON.stringify(value) })
    return list
  }, [])
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function encodeHeaderKey(value) {
  return encodeURIComponent(String(value).trim().toLowerCase())
    .replace(/!/gu, '%21')
    .replace(/'/gu, '%27')
    .replace(/\(/gu, '%28')
    .replace(/\)/gu, '%29')
    .replace(/\*/gu, '%2A')
}

function stringify(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function signRequest({ secretId, secretKey, method, url, params, headers, timestamp }) {
  const target = new URL(url)
  const sortedHeaders = Object.entries(headers)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [encodeHeaderKey(key), stringify(value).trim().toLowerCase()])
    .sort(([left], [right]) => left.localeCompare(right))
  const signedHeaders = sortedHeaders.map(([key]) => key)
  const canonicalHeaders = `${sortedHeaders.map(([key, value]) => `${key}:${value}`).join('\n')}\n`
  const formattedParams = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => [encodeHeaderKey(key), stringify(value).trim()])
    .sort(([left], [right]) => left.localeCompare(right))
  const signedParams = formattedParams.map(([key]) => key)
  const parameterHash = sha256(
    formattedParams.map(([key, value]) => `&${key}=${value}\r\n`).join('')
  )
  const canonicalRequest = `${method}\n${url.replace(/^https?:/u, '').split('?')[0]}\n${target.search.slice(1)}\n${canonicalHeaders}\n${signedHeaders.join(';')}\n${parameterHash}`
  const date = new Date(timestamp * 1_000).toISOString().slice(0, 10)
  const scope = `${date}/tcb/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`
  const dateKey = hmac(`TC3${secretKey}`, date)
  const serviceKey = hmac(dateKey, 'tcb')
  const signingKey = hmac(serviceKey, 'tc3_request')
  const signature = hmac(signingKey, stringToSign, 'hex')
  return {
    authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedParams=${signedParams.join(';')}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
    timestamp
  }
}

function requestJson(url, { body, headers, internal }) {
  const target = new URL(url)
  const client = target.protocol === 'https:' ? https : http
  const payload = Buffer.from(body, 'utf8')
  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': payload.length },
        agent: internal ? false : target.protocol === 'https:' ? HTTPS_AGENT : HTTP_AGENT,
        timeout: 12_000
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.once('error', reject)
        response.once('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({
              statusCode: Number(response.statusCode || 0),
              body: raw ? JSON.parse(raw) : {}
            })
          } catch {
            reject(apiError('CloudBase SQL 返回格式无效', 'CLOUDBASE_SQL_RESPONSE_INVALID'))
          }
        })
      }
    )
    request.once('timeout', () =>
      request.destroy(apiError('CloudBase SQL 读取超时', 'CLOUDBASE_SQL_TIMEOUT'))
    )
    request.once('error', reject)
    request.end(payload)
  })
}

function qualifyTables(sql, schema = cloudbaseSchema()) {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(schema)) {
    throw apiError('CloudBase SQL 数据库配置无效', 'CLOUDBASE_SQL_SCHEMA_INVALID')
  }
  const quotedSchema = `\`${schema.replace(/`/gu, '``')}\``
  const tablePattern = SQL_TABLES.join('|')
  return String(sql).replace(
    new RegExp(`\\b(FROM|JOIN)\\s+(${tablePattern})\\b`, 'giu'),
    (_matched, keyword, table) => `${keyword} ${quotedSchema}.\`${table}\``
  )
}

async function runCloudbaseSql(sql, params = {}) {
  const endpoint = resolveEndpoint()
  const credentials = resolveCredentials()
  if (!credentials.accessKey && (!credentials.secretId || !credentials.secretKey)) {
    throw apiError('CloudBase 运行时凭据未配置', 'CLOUDBASE_SQL_CREDENTIALS_MISSING')
  }
  const requestParams = {
    action: 'functions.invokeFunction',
    function_name: 'lowcode-datasource',
    request_data: JSON.stringify({
      methodName: 'callWedaApi',
      params: {
        action: 'RunMysqlCommand',
        data: {
          sqlTemplate: qualifyTables(sql),
          config: { preparedStatements: true },
          parameter: serializeParameters(params)
        }
      },
      'x-sdk-version': '1.7.1',
      envType: 'prod',
      mode: 'sdk'
    }),
    envName: endpoint.envId,
    wxCloudApiToken: '',
    wxCloudbaseAccesstoken: '',
    tcb_sessionToken: String(process.env.TCB_SESSIONTOKEN || '').trim(),
    crossAuthorizationToken: ''
  }
  if (credentials.sessionToken) {
    requestParams.sessionToken = credentials.sessionToken
  }
  const body = JSON.stringify(requestParams)
  const timestampMs = Date.now()
  const timestamp = Math.floor(timestampMs / 1_000) - 1
  const headers = {
    'Content-Type': 'application/json',
    Host: new URL(endpoint.url).host,
    'User-Agent': `tcb-node-sdk/${NODE_SDK_VERSION}`,
    'X-TCB-Source': `${String(process.env.TCB_SOURCE || '').trim()},${resolveRunEnvTag()}`,
    'X-Client-Timestamp': timestampMs,
    'X-SDK-Version': `tcb-node-sdk/${NODE_SDK_VERSION}`,
    ...(endpoint.region ? { 'X-TCB-Region': endpoint.region } : {})
  }
  if (process.env.TCB_ROUTE_KEY) {
    headers['X-TCB-Route-Key'] = String(process.env.TCB_ROUTE_KEY)
  }
  if (credentials.accessKey) {
    headers.Authorization = `Bearer ${credentials.accessKey}`
  } else {
    headers.Authorization = signRequest({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      method: 'post',
      url: endpoint.url,
      params: requestParams,
      headers,
      timestamp
    }).authorization
    // CloudBase Node SDK adds these after signing. The internal /admin route
    // rejects requests when they are included in SignedHeaders.
    headers['X-Signature-Expires'] = 600
    headers['X-Timestamp'] = timestamp
  }
  const response = await requestJson(endpoint.url, {
    body,
    headers,
    internal: endpoint.internal
  })
  const requestId = String(response.body?.requestId || response.body?.requestID || '').trim()
  if (response.statusCode < 200 || response.statusCode >= 300 || response.body?.code) {
    throw apiError(
      response.body?.message || `CloudBase SQL HTTP ${response.statusCode}`,
      response.body?.code || `CLOUDBASE_SQL_HTTP_${response.statusCode || 'UNKNOWN'}`,
      requestId
    )
  }
  let result = response.body?.data?.response_data
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result)
    } catch {
      throw apiError('CloudBase SQL 响应载荷无效', 'CLOUDBASE_SQL_RESULT_INVALID', requestId)
    }
  }
  if (result?.code) {
    throw apiError(result.message, result.code, requestId)
  }
  return { data: result?.data || {}, requestId }
}

module.exports = {
  runCloudbaseSql,
  _test: {
    cloudbaseEnvId,
    cloudbaseSchema,
    qualifyTables,
    resolveRunEnvTag,
    serializeParameters,
    signRequest
  }
}
