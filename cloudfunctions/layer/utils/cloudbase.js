/**
 * CloudBase Node SDK 模块
 * 用于 MySQL 数据库操作、AI 能力和用户信息获取
 */
const { resolveCloudbaseEnvId, resolveSqlDatabaseName } = require('./runtime-env')

let cloudbaseApp = null
let cloudbaseSDK = null
const RUN_SQL_RETRY_LIMIT = 3
const RUN_SQL_RETRY_DELAY_MS = 250
const NODE_SDK_VERSION = '3.18.0'
const lightweightHttpsAgent = new (require('https').Agent)({
  keepAlive: true,
  maxSockets: 8
})
const lightweightHttpAgent = new (require('http').Agent)({
  keepAlive: true,
  maxSockets: 8
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableRunSqlError(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  const message = String(error?.message || error || '')
  return (
    [
      'ECONNABORTED',
      'ECONNRESET',
      'EPIPE',
      'ESOCKETTIMEDOUT',
      'ETIMEDOUT',
      'PROTOCOL_CONNECTION_LOST'
    ].includes(code) ||
    /(?:ECONNABORTED|ECONNRESET|EPIPE|ESOCKETTIMEDOUT|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|socket hang up|connection lost|timed out)/i.test(
      message
    ) ||
    message.includes('Database connection failed') ||
    message.includes('Run query failed')
  )
}

const SQL_TABLES = [
  'users',
  'user_platform_identities',
  'user_sessions',
  'plant_catalog',
  'plant_images',
  'plant_identity_entities',
  'plant_identity_aliases',
  'plant_identity_match_rules',
  'plant_identity_merge_history',
  'genus_care_profiles',
  'plant_identity_diagnosis_links',
  'user_plant_instances',
  'symptoms',
  'symptom_classes',
  'symptom_class_mapping',
  'problems',
  'diagnosis_result_explanations',
  'symptom_problem_evidence',
  'problem_host_profiles',
  'genus_problem_profiles',
  'plant_problem_profiles',
  'problem_causality',
  'question_library_v5_real',
  'question_option_mapping_v5_real',
  'question_strategy_v5_real',
  'class_question_group_strategy',
  'question_generation_engine',
  'diagnosis_sessions',
  'diagnosis_result_snapshots',
  'visual_call_batches',
  'plant_identity_resolution_records',
  'visual_raw_image_records',
  'visual_normalized_image_results',
  'visual_admission_records',
  'visual_call_aggregate_results',
  'visual_supervision_records',
  'observed_evidence_set',
  'diagnosis_symptom_observations',
  'diagnosis_follow_ups',
  'question_package_snapshot',
  'stop_state',
  'diagnosis_feedback',
  'diagnosis_batch_reviews',
  'identify_sessions',
  'user_diagnose_quota',
  'user_identify_quota',
  'weather_cache',
  'weather_locations',
  'plant_care_locations',
  'diagnosis_weather_evidence',
  'user_watering_reminder_events',
  'user_fertilization_reminder_events',
  'user_fertilization_events',
  'subscription_orders'
]

function qualifySqlTableNames(sql, databaseName) {
  const dbName = String(databaseName || '').trim()
  if (!dbName) {
    return sql
  }

  const escapedDbName = `\`${dbName.replace(/`/g, '``')}\``
  const tablePattern = SQL_TABLES.join('|')

  return String(sql || '').replace(
    new RegExp(
      `\\b(FROM|JOIN|UPDATE|INTO)\\s+(?!\\()(?!(?:\\\`?${dbName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\\`?)\\.)((?:\\\`)?(${tablePattern})(?:\\\`)?)\\b`,
      'gi'
    ),
    (match, keyword, originalTableRef, tableName) => {
      return `${keyword} ${escapedDbName}.\`${tableName}\``
    }
  )
}

/**
 * 解析 CloudBase 管理端凭据。
 *
 * 线上云函数通常可以使用运行时身份；本地 tcb-ff 调试则需要显式凭据。
 * 本仓库的 GitHub Actions 使用 TENCENT_* 命名，历史本地脚本使用 CLOUDBASE_*，
 * 这里统一适配，避免本地只配置 TENCENT_* 时仍报 secret id error。
 */
function resolveCloudbaseCredentials(env = process.env) {
  const accessKey = String(env.CLOUDBASE_APIKEY || env.CLOUDBASE_API_KEY || '').trim()
  const explicitSecretId = String(
    env.CLOUDBASE_SECRET_ID || env.TENCENT_SECRET_ID || ''
  ).trim()
  const explicitSecretKey = String(
    env.CLOUDBASE_SECRET_KEY || env.TENCENT_SECRET_KEY || ''
  ).trim()
  const explicitSessionToken = String(
    env.CLOUDBASE_TOKEN ||
      env.CLOUDBASE_SESSION_TOKEN ||
      env.TENCENT_SESSION_TOKEN ||
      ''
  ).trim()
  const runtimeSecretId = String(env.TENCENTCLOUD_SECRETID || '').trim()
  const runtimeSecretKey = String(env.TENCENTCLOUD_SECRETKEY || '').trim()
  const runtimeSessionToken = String(
    env.TENCENTCLOUD_SESSIONTOKEN || env.TENCENTCLOUD_SESSION_TOKEN || ''
  ).trim()

  // 远端 SCF 会为每个实例提供带 session token 的临时凭据。它们与当前
  // 运行时绑定，优先级必须高于遗留的静态环境变量；后者可能没有 token，
  // 会让内部 CloudBase API 返回 SIGN_PARAM_INVALID，并把正常读请求拖成
  // 失败/重试。没有完整运行时凭据时，本地开发再回退到显式凭据或 API Key。
  if (runtimeSecretId && runtimeSecretKey && runtimeSessionToken) {
    return {
      secretId: runtimeSecretId,
      secretKey: runtimeSecretKey,
      sessionToken: runtimeSessionToken
    }
  }

  // 远端函数可以同时配置显式服务端密钥、API Key 和运行时临时密钥。
  // 与 CloudBase SDK 的“调用方显式配置优先”规则保持一致：显式密钥对
  // 应先于环境中的 API Key；否则轻量 functions.invokeFunction 可能走到
  // 不接受该 API Key 的内部路由，表现为 ECONNRESET/400。
  if (explicitSecretId && explicitSecretKey) {
    return {
      secretId: explicitSecretId,
      secretKey: explicitSecretKey,
      ...(explicitSessionToken ? { sessionToken: explicitSessionToken } : {})
    }
  }

  if (accessKey) {
    return { accessKey }
  }

  return { secretId: '', secretKey: '' }
}

function buildCloudbaseInitOptions(context, env = process.env) {
  const options = {
    env: resolveCloudbaseEnvId(context)
  }
  const credentials = resolveCloudbaseCredentials(env)
  if (credentials.secretId && credentials.secretKey) {
    options.secretId = credentials.secretId
    options.secretKey = credentials.secretKey
  }
  if (credentials.accessKey) {
    options.accessKey = credentials.accessKey
  }
  if (credentials.sessionToken) {
    options.sessionToken = credentials.sessionToken
  }
  return options
}

function resolveSqlRunConfig(env = process.env) {
  const dbLinkName = String(
    env.CLOUDBASE_SQL_DBLINK_NAME ||
      env.CLOUDBASE_SQL_DB_LINK_NAME ||
      env.SQL_DBLINK_NAME ||
      env.SQL_DB_LINK_NAME ||
      ''
  ).trim()
  const timeout = Number(env.CLOUDBASE_SQL_TIMEOUT || env.SQL_TIMEOUT || '')
  const config = {}

  if (dbLinkName) {
    config.dbLinkName = dbLinkName
  }
  if (Number.isFinite(timeout) && timeout > 0) {
    config.timeout = Math.min(15, timeout)
  }

  return config
}

function loadCloudbaseSDK() {
  if (!cloudbaseSDK) {
    // 只有写入、存储、AI 等非读路径需要完整 SDK；读接口使用下面的轻量
    // functions.invokeFunction 请求，避免把 SDK 的整棵依赖树带入冷启动。
    if (typeof globalThis.File !== 'function') {
      globalThis.File = class File {}
    }
    cloudbaseSDK = require('@cloudbase/node-sdk')
  }
  return cloudbaseSDK
}

function resolveCloudbaseApiUrl(context) {
  const envId = String(resolveCloudbaseEnvId(context) || '').trim()
  if (!envId) {
    throw new Error('CloudBase 环境未配置')
  }
  const region = String(
    process.env.TENCENTCLOUD_REGION || process.env.CLOUDBASE_REGION || ''
  ).trim()
  const isInternal =
    process.env.TENCENTCLOUD_RUNENV === 'SCF' ||
    Boolean(process.env.CBR_ENV_ID) ||
    ['formal', 'pre', 'test'].includes(String(process.env.SUMERU_ENV || '').trim())
  const regionalSuffix = 'tcb-api.tencentcloudapi.com'
  const host = isInternal
    ? region
      ? `${envId}.internal.${region}.${regionalSuffix}`
      : `${envId}.internal.${regionalSuffix}`
    : region
      ? `${envId}.${region}.${regionalSuffix}`
      : `${envId}.${regionalSuffix}`
  return {
    envId,
    region,
    isInternal,
    url: `${isInternal ? 'http' : 'https'}://${host}/admin?env=${encodeURIComponent(envId)}&seqId=${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
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

function serializeSqlParameters(params = {}) {
  return Object.entries(params || {}).reduce((list, [key, value]) => {
    if (value === undefined) {
      return list
    }
    let type = 'OBJECT'
    if (typeof value === 'boolean') {
      type = 'BOOLEAN'
    } else if (typeof value === 'number') {
      type = 'NUMBER'
    } else if (typeof value === 'string') {
      type = 'STRING'
    } else if (Array.isArray(value)) {
      type = 'ARRAY'
    }
    list.push({
      key,
      type,
      value: type === 'STRING' ? value : JSON.stringify(value)
    })
    return list
  }, [])
}

function createCloudbaseApiError(message, code = 'CLOUDBASE_API_ERROR', requestId = '') {
  const error = new Error(String(message || 'CloudBase API 请求失败'))
  error.code = code
  error.requestId = requestId
  return error
}

function resolveRequestPort(target) {
  return Number(target.port) || (target.protocol === 'https:' ? 443 : 80)
}

function requestJson(url, { body = '', headers, method = 'post', timeout = 15_000, agent } = {}) {
  const http = url.startsWith('https:') ? require('https') : require('http')
  const payload = Buffer.from(String(body || ''), 'utf8')
  const target = new URL(url)
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        // SCF 同地域的 CloudBase Admin API 使用内网 HTTP；未显式指定端口
        // 时必须使用 HTTP 默认端口 80。此前统一写成 443，导致远端首个
        // SQL 请求在错误端口上表现为 HTTP 400/ECONNRESET。
        port: resolveRequestPort(target),
        path: `${target.pathname}${target.search}`,
        method: String(method || 'post').toLowerCase(),
        headers: {
          ...headers,
          'Content-Length': payload.length
        },
        // CloudBase Node SDK 在 SCF 内部请求上明确关闭 keep-alive；内部网关
        // 可能主动回收空闲 socket，复用旧 socket 会表现为 ECONNRESET。
        agent:
          agent === undefined
            ? target.protocol === 'https:'
              ? lightweightHttpsAgent
              : lightweightHttpAgent
            : agent,
        timeout: timeout * 1_000
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let parsed = raw
          try {
            parsed = raw ? JSON.parse(raw) : {}
          } catch {
            // 保留原始响应，让调用方得到可诊断的 CloudBase 错误。
          }
          resolve({
            statusCode: response.statusCode || 0,
            body: parsed,
            raw
          })
        })
      }
    )
    request.once('timeout', () => {
      request.destroy(createCloudbaseApiError('CloudBase API 请求超时', 'CLOUDBASE_API_TIMEOUT'))
    })
    request.once('error', reject)
    request.end(payload)
  })
}

async function invokeFunctionLightweight(name, data, context = null) {
  const endpoint = resolveCloudbaseApiUrl(context)
  const credentials = resolveCloudbaseCredentials()
  const requestParams = {
    action: 'functions.invokeFunction',
    function_name: name,
    request_data: data ? JSON.stringify(data) : '',
    envName: endpoint.envId,
    wxCloudApiToken: '',
    wxCloudbaseAccesstoken: '',
    tcb_sessionToken: '',
    crossAuthorizationToken: ''
  }
  const runtimeSessionToken = String(process.env.TCB_SESSIONTOKEN || '').trim()
  if (runtimeSessionToken) {
    requestParams.tcb_sessionToken = runtimeSessionToken
  }
  if (credentials.sessionToken) {
    requestParams.sessionToken = credentials.sessionToken
  }
  const body = JSON.stringify(requestParams)
  const timestampMs = Date.now()
  const timestampSeconds = Math.floor(timestampMs / 1_000) - 1
  const headers = {
    'Content-Type': 'application/json',
    Host: new URL(endpoint.url).host,
    'User-Agent': `tcb-node-sdk/${NODE_SDK_VERSION}`,
    'X-TCB-Source': `${String(process.env.TCB_SOURCE || '').trim()},${resolveRunEnvTag()}`,
    'X-Client-Timestamp': timestampMs,
    'X-SDK-Version': `tcb-node-sdk/${NODE_SDK_VERSION}`,
    ...(endpoint.region ? { 'X-TCB-Region': endpoint.region } : {})
  }
  if (String(process.env.TCB_ROUTE_KEY || '').trim()) {
    headers['X-TCB-Route-Key'] = String(process.env.TCB_ROUTE_KEY).trim()
  }

  if (credentials.accessKey) {
    headers.Authorization = `Bearer ${credentials.accessKey}`
  } else {
    if (!credentials.secretId || !credentials.secretKey) {
      throw createCloudbaseApiError('CloudBase API 凭据未配置', 'CLOUDBASE_CREDENTIALS_MISSING')
    }
    const { sign } = require('@cloudbase/signature-nodejs')
    const signed = sign({
      secretId: credentials.secretId,
      secretKey: credentials.secretKey,
      method: 'post',
      url: endpoint.url,
      params: requestParams,
      headers,
      withSignedParams: true,
      timestamp: timestampSeconds
    })
    headers.Authorization = signed.authorization
    headers['X-Signature-Expires'] = 600
    headers['X-Timestamp'] = signed.timestamp
  }

  // 官方 SDK 即使在 API Key 路径也会携带这两个时间头；内部 CloudBase
  // /admin 路由据此完成请求时效校验。不能只在密钥签名分支设置。
  if (!headers['X-Signature-Expires']) {
    headers['X-Signature-Expires'] = 600
  }
  if (!headers['X-Timestamp']) {
    headers['X-Timestamp'] = timestampSeconds
  }

  const response = await requestJson(endpoint.url, {
    body,
    headers,
    agent: endpoint.isInternal ? false : undefined
  })
  const apiResult = response.body && typeof response.body === 'object' ? response.body : {}
  const requestId = String(apiResult.requestId || apiResult.requestID || '').trim()
  if (response.statusCode < 200 || response.statusCode >= 300 || apiResult.code) {
    throw createCloudbaseApiError(
      apiResult.message || `CloudBase API HTTP ${response.statusCode}`,
      apiResult.code || response.statusCode,
      requestId
    )
  }
  const responseData = apiResult?.data?.response_data
  let result = responseData
  if (typeof responseData === 'string') {
    try {
      result = JSON.parse(responseData)
    } catch {
      result = responseData
    }
  }
  return { result, requestId }
}

async function runLightweightCloudbaseSql(sql, params, config) {
  const mysqlConfig = { ...(config || {}), preparedStatements: true }
  const invocation = await invokeFunctionLightweight('lowcode-datasource', {
    methodName: 'callWedaApi',
    params: {
      action: 'RunMysqlCommand',
      data: {
        sqlTemplate: sql,
        config: mysqlConfig,
        parameter: serializeSqlParameters(params)
      }
    },
    userAgent:
      typeof globalThis.navigator?.userAgent === 'string'
        ? globalThis.navigator.userAgent
        : undefined,
    'x-sdk-version': '1.7.1',
    envType: 'prod',
    mode: 'sdk'
  })
  const result = invocation.result || {}
  if (result.code) {
    throw createCloudbaseApiError(result.message, result.code, invocation.requestId)
  }
  return {
    data: result.data || {},
    requestId: invocation.requestId
  }
}

function resolveCloudbaseRestBaseUrl(context = null) {
  const envId = String(resolveCloudbaseEnvId(context) || '').trim()
  if (!envId) {
    throw createCloudbaseApiError('CloudBase 环境未配置', 'CLOUDBASE_ENV_MISSING')
  }
  return `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest`
}

function resolveCloudbaseRestApiKey(env = process.env) {
  return String(env.CLOUDBASE_APIKEY || env.CLOUDBASE_API_KEY || '').trim()
}

function resolveCloudbaseRestSchema(context = null) {
  const schema = String(resolveSqlDatabaseName(context) || '').trim()
  if (!schema) {
    throw createCloudbaseApiError('CloudBase REST 数据库未配置', 'CLOUDBASE_REST_SCHEMA_MISSING')
  }
  return schema
}

/**
 * 通过 CloudBase 官方 MySQL REST API 查询单表数据。
 *
 * 低代码 RunMysqlCommand 适合复杂 SQL，但它依赖低代码数据源的连接器；
 * 连接器偶发返回 Database connection failed 时，即使重试也可能把公共读
 * 请求拖到超时。单表按等值条件读取改走官方 RDB REST，绕开这条连接器链路，
 * 仍使用 CloudBase API Key 做服务端鉴权。只接受固定表名、字段名和 eq 过滤，
 * 不把用户输入拼成 SQL。
 */
async function runCloudbaseRestTableQuery(
  { table, select = '*', equals = {}, limit = 100 } = {},
  context = null
) {
  const normalizedTable = String(table || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(normalizedTable)) {
    throw createCloudbaseApiError('CloudBase REST 表名无效', 'CLOUDBASE_REST_TABLE_INVALID')
  }
  const apiKey = resolveCloudbaseRestApiKey()
  if (!apiKey) {
    throw createCloudbaseApiError(
      'CloudBase REST API Key 未配置',
      'CLOUDBASE_REST_APIKEY_MISSING'
    )
  }

  const schema = resolveCloudbaseRestSchema(context)

  const query = new URLSearchParams()
  query.set('select', String(select || '*'))
  for (const [field, value] of Object.entries(equals || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(field)) {
      throw createCloudbaseApiError(
        'CloudBase REST 过滤字段无效',
        'CLOUDBASE_REST_FILTER_INVALID'
      )
    }
    query.set(field, `eq.${String(value ?? '')}`)
  }
  const normalizedLimit = Number(limit)
  if (Number.isInteger(normalizedLimit) && normalizedLimit > 0) {
    query.set('limit', String(Math.min(normalizedLimit, 1_000)))
  }

  const url = `${resolveCloudbaseRestBaseUrl(context)}/${normalizedTable}?${query.toString()}`
  const response = await requestJson(url, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      'X-Db-Instance': 'default',
      'Accept-Profile': schema,
      'Content-Profile': schema,
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 5_000
  })
  const body = response.body
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw createCloudbaseApiError(
      body?.message || `CloudBase REST API HTTP ${response.statusCode}`,
      body?.code || `CLOUDBASE_REST_HTTP_${response.statusCode}`
    )
  }
  if (!Array.isArray(body)) {
    throw createCloudbaseApiError(
      'CloudBase REST API 返回格式无效',
      'CLOUDBASE_REST_RESPONSE_INVALID'
    )
  }
  return { data: { executeResultList: body } }
}

/**
 * 获取 CloudBase 实例（单例模式）
 */
function getCloudBase() {
  if (!cloudbaseApp) {
    cloudbaseApp = loadCloudbaseSDK().init(buildCloudbaseInitOptions())
  }
  return cloudbaseApp
}

/**
 * 获取用户信息（替代 wx-server-sdk 的 getWXContext）
 * @param {object} context - 云函数上下文
 * @returns {object} 用户信息对象
 */
function getUserInfo(context) {
  const runtimeEnv = context?.environment || context?.environ || {}
  const extendedContext = context?.extendedContext || {}

  const runtimeOpenId = runtimeEnv.WX_OPENID || process.env.WX_OPENID || ''
  const runtimeAppId = runtimeEnv.WX_APPID || process.env.WX_APPID || ''
  const runtimeUid = runtimeEnv.TCB_UUID || extendedContext.userId || process.env.TCB_UUID || ''
  const runtimeCustomUserId = runtimeEnv.TCB_CUSTOM_USER_ID || process.env.TCB_CUSTOM_USER_ID || ''
  const runtimeUnionId = runtimeEnv.WX_UNIONID || process.env.WX_UNIONID || ''

  if (runtimeOpenId || runtimeUid || runtimeCustomUserId) {
    const openid = runtimeOpenId || runtimeUid || runtimeCustomUserId

    return {
      OPENID: openid,
      APPID: runtimeAppId,
      UNIONID: runtimeUnionId,
      ENV: resolveCloudbaseEnvId(context)
    }
  }

  const app = loadCloudbaseSDK().init(buildCloudbaseInitOptions(context))
  const auth = app.auth()
  const userInfo = auth.getUserInfo()

  const {
    openId, // 微信openId，非微信授权登录则空
    appId, // 微信appId，非微信授权登录则空
    uid, // 用户唯一ID
    customUserId // 开发者自定义的用户唯一id
  } = userInfo

  // 使用 openId 作为用户的 openid，如果不存在则使用 uid 或 customUserId
  const openid = openId || uid || customUserId

  return {
    OPENID: openid,
    APPID: appId,
    UNIONID: '', // CloudBase Node SDK 不提供 UNIONID
    ENV: resolveCloudbaseEnvId(context)
  }
}

// 封装 models.$runSQL 方法
const models = {
  /**
   * 执行 SQL 语句
   * @param {string} sql - SQL 语句，使用 {{paramName}} 作为参数占位符
   * @param {object} params - 参数对象
   * @returns {Promise<{data: {executeResultList: Array}}>}
   */
  async $runSQL(sql, params = {}) {
    const normalizedSql = qualifySqlTableNames(sql, resolveSqlDatabaseName())
    const sqlConfig = resolveSqlRunConfig()
    let lastError = null

    for (let attempt = 1; attempt <= RUN_SQL_RETRY_LIMIT; attempt += 1) {
      try {
        return await runLightweightCloudbaseSql(normalizedSql, params, sqlConfig)
      } catch (error) {
        lastError = error
        if (!isRetryableRunSqlError(error) || attempt >= RUN_SQL_RETRY_LIMIT) {
          throw error
        }
        console.warn(
          '[cloudbase.models.$runSQL] transient failure, retrying',
          JSON.stringify({
            attempt,
            nextAttempt: attempt + 1,
            message: String(error?.message || error).slice(0, 300)
          })
        )
        await sleep(RUN_SQL_RETRY_DELAY_MS * attempt)
      }
    }

    throw lastError
  }
}

/**
 * 获取 AI 模块
 */
function ai() {
  const app = getCloudBase()
  return app.ai()
}

/**
 * 获取存储模块
 */
function storage() {
  const app = getCloudBase()
  return app.storage()
}

module.exports = {
  getCloudBase,
  models,
  ai,
  storage,
  getUserInfo,
  resolveCloudbaseCredentials,
  buildCloudbaseInitOptions,
  resolveSqlRunConfig,
  runCloudbaseRestTableQuery,
  _test: {
    resolveRequestPort,
    isRetryableRunSqlError
  }
}
