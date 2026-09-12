import {
  assertLocalCloudbaseCredentials,
  createLocalGatewayError,
  DEFAULT_FUNCTION_PORT_BASE,
  DEFAULT_OPENID,
  FUNCTION_BUSINESS_PROBES,
  FUNCTION_HEALTH_PATHS,
  FUNCTION_PORTS,
  getFunctionPorts,
  HEALTH_REQUEST_TIMEOUT_MS,
  LOCAL_GATEWAY_KIND,
  PROJECT_ROOT
} from './local-api-env-config.mjs'

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const resolveHealthRequestTimeout = timeoutMs => {
  const numericTimeout = Number(timeoutMs)
  return Number.isFinite(numericTimeout) && numericTimeout > 0
    ? numericTimeout
    : HEALTH_REQUEST_TIMEOUT_MS
}

export async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    resolveHealthRequestTimeout(options.timeoutMs)
  )
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    })
    const bodyText = await response.text()
    let body = null
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = null
    }
    return { response, body, bodyText }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createLocalGatewayError(
        'LOCAL_GATEWAY_TIMEOUT',
        `本地 CloudBase 函数 gateway 健康检查超时: ${url}\n` +
          '请检查端口是否被其他服务占用，或稍后重试。'
      )
    }
    if (error?.code) {
      throw error
    }
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_NOT_RUNNING',
      `本地 CloudBase 函数 gateway 未启动: ${url}\n` + '将尝试自动启动本地函数 gateway。'
    )
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeGatewayFunctionEntries(entries = []) {
  return Array.isArray(entries)
    ? entries
        .map(item => {
          if (typeof item === 'string') {
            return { name: item, port: null, status: '', alive: null }
          }
          return {
            name: String(item?.name || '').trim(),
            port: Number(item?.port || 0) || null,
            status: String(item?.status || '').trim(),
            alive: typeof item?.alive === 'boolean' ? item.alive : null,
            pid: Number(item?.pid || 0) || null,
            exitCode: item?.exitCode ?? null,
            signalCode: item?.signalCode ?? null
          }
        })
        .filter(item => item.name)
    : []
}

function parseGatewayState(body = null) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  return {
    gateway: String(data.gateway || '').trim(),
    projectRoot: String(data.projectRoot || '').trim(),
    pid: Number(data.pid || 0) || null,
    status: String(data.status || '').trim(),
    unavailableFunctions: Array.isArray(data.unavailableFunctions)
      ? data.unavailableFunctions.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    functions: normalizeGatewayFunctionEntries(data.functions)
  }
}

function buildHealthUrl(apiBaseUrl = '') {
  return `${String(apiBaseUrl || '').replace(/\/+$/, '')}/__local_functions__/health`
}

export async function fetchGatewayHealth(apiBaseUrl = '') {
  const healthUrl = buildHealthUrl(apiBaseUrl)
  const { response, body } = await fetchJsonWithTimeout(healthUrl)
  return { healthUrl, response, body, state: parseGatewayState(body) }
}

function isLegacyRepoGateway(state = {}, requiredFunctions = []) {
  if (!state.functions.length) {
    return false
  }
  const functionPorts = new Map(
    state.functions.filter(item => item.port).map(item => [item.name, item.port])
  )
  return requiredFunctions.every(name => functionPorts.get(name) === FUNCTION_PORTS[name])
}

export function isRepoLocalGateway(
  state = {},
  requiredFunctions = [],
  functionPortBase = DEFAULT_FUNCTION_PORT_BASE
) {
  if (state.gateway === LOCAL_GATEWAY_KIND && state.projectRoot === PROJECT_ROOT) {
    const expectedPorts = getFunctionPorts(functionPortBase)
    const functionPorts = new Map(
      state.functions.filter(item => item.port).map(item => [item.name, item.port])
    )
    return requiredFunctions.every(name => functionPorts.get(name) === expectedPorts[name])
  }
  if (Number(functionPortBase) === DEFAULT_FUNCTION_PORT_BASE) {
    return isLegacyRepoGateway(state, requiredFunctions)
  }
  const expectedPorts = getFunctionPorts(functionPortBase)
  const functionPorts = new Map(
    state.functions.filter(item => item.port).map(item => [item.name, item.port])
  )
  return requiredFunctions.every(name => functionPorts.get(name) === expectedPorts[name])
}

function formatUnavailableGatewayWorkers(state = {}) {
  const unavailable = state.functions
    .filter(item => item.alive === false || (item.status && item.status !== 'running'))
    .map(item => `${item.name}${item.pid ? `(${item.pid})` : ''}`)
  return unavailable.length ? unavailable.join(', ') : ''
}

async function assertLocalFunctionsGatewayReady(
  apiBaseUrl = '',
  requiredFunctions = [],
  functionPortBase = DEFAULT_FUNCTION_PORT_BASE
) {
  const { healthUrl, response, state } = await fetchGatewayHealth(apiBaseUrl)
  if (!response.ok || state.status !== 'ok') {
    const poweredBy = response.headers.get('x-powered-by') || response.headers.get('server') || ''
    const unavailable = formatUnavailableGatewayWorkers(state)
    const error = createLocalGatewayError(
      'LOCAL_GATEWAY_BAD_RESPONSE',
      `本地 CloudBase 函数 gateway 未就绪: ${response.status} ${response.statusText}\n` +
        `检查地址: ${healthUrl}\n` +
        `${poweredBy ? `当前端口响应服务: ${poweredBy}\n` : ''}` +
        `${unavailable ? `不可用函数: ${unavailable}\n` : ''}` +
        '请确认该端口没有被其他项目占用。'
    )
    error.gatewayState = state
    throw error
  }
  const availableFunctions = state.functions.map(item => item.name)
  const availableSet = new Set(availableFunctions)
  const missingFunctions = requiredFunctions.filter(name => !availableSet.has(name))
  if (missingFunctions.length) {
    const error = createLocalGatewayError(
      'LOCAL_GATEWAY_MISSING_FUNCTIONS',
      '本地 CloudBase 函数 gateway 未启动完整函数集。\n' +
        `检查地址: ${healthUrl}\n` +
        `缺少函数: ${missingFunctions.join(', ')}\n` +
        `当前函数: ${availableFunctions.length ? availableFunctions.join(', ') : '无'}\n` +
        '微信小程序本地模式请运行 `npm run dev:functions`，不要只运行 `npm run dev:functions:diagnose`。' +
        '如只验证少量函数，可显式传入 `--required-functions=diagnose-http`。'
    )
    error.gatewayState = state
    throw error
  }
  const expectedPorts = getFunctionPorts(functionPortBase)
  const wrongPortFunctions = requiredFunctions.filter(
    name => Number(state.functions.find(item => item.name === name)?.port) !== expectedPorts[name]
  )
  if (wrongPortFunctions.length) {
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_FUNCTION_PORT_MISMATCH',
      `本地 CloudBase 函数端口不匹配: ${wrongPortFunctions.join(', ')}`
    )
  }
}

async function assertLocalFunctionRoutesReady(apiBaseUrl = '', requiredFunctions = []) {
  const baseUrl = String(apiBaseUrl || '').replace(/\/+$/, '')
  const unavailable = []
  const details = []
  for (const functionName of requiredFunctions) {
    const healthPath = FUNCTION_HEALTH_PATHS[functionName]
    if (!healthPath) {
      continue
    }
    const url = `${baseUrl}/${healthPath}`
    try {
      const { response, body } = await fetchJsonWithTimeout(url)
      if (!response.ok || body?.code !== 200) {
        const message = String(body?.message || response.statusText || '').trim()
        unavailable.push(`${functionName}: ${response.status}${message ? ` ${message}` : ''}`)
        details.push({
          functionName,
          url,
          status: response.status,
          bodyCode: body?.code ?? null,
          message
        })
      }
    } catch (error) {
      const message = String(error?.message || error)
      unavailable.push(`${functionName}: ${message}`)
      details.push({ functionName, url, status: null, bodyCode: error?.code ?? null, message })
    }
  }
  if (unavailable.length) {
    const error = createLocalGatewayError(
      'LOCAL_FUNCTION_ROUTES_NOT_READY',
      '本地 CloudBase 函数 health route 尚未全部就绪。\n' +
        unavailable.map(item => `- ${item}`).join('\n')
    )
    error.details = details
    throw error
  }
}

function isUnauthenticatedBusinessProbe(response, body) {
  return response?.status === 401 || body?.code === 401
}

export async function assertLocalBusinessRoutesReady(apiBaseUrl = '', options = {}) {
  if (options.skipBusinessCheck) {
    return
  }
  const baseUrl = String(apiBaseUrl || '').replace(/\/+$/, '')
  const sessionToken = String(options.sessionToken || '').trim()
  const unavailable = []
  for (const functionName of options.requiredFunctions || []) {
    const probe = FUNCTION_BUSINESS_PROBES[functionName]
    if (!probe?.path) {
      continue
    }
    const url = `${baseUrl}/${probe.path}`
    try {
      const { response, body } = await fetchJsonWithTimeout(url, {
        method: probe.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-app-env': 'development',
          'x-env': 'development',
          'x-wx-openid': options.openid || DEFAULT_OPENID,
          'x-openid': options.openid || DEFAULT_OPENID,
          'x-terminal-e2e': 'true',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: probe.body ? JSON.stringify(probe.body) : undefined
      })
      if (isUnauthenticatedBusinessProbe(response, body) && !sessionToken) {
        continue
      }
      if (!response.ok || body?.code !== 200) {
        unavailable.push(
          `${functionName}: ${response.status} ${body?.message || response.statusText}`
        )
      }
    } catch (error) {
      unavailable.push(`${functionName}: ${error?.message || error}`)
    }
  }
  if (unavailable.length) {
    throw createLocalGatewayError(
      'LOCAL_FUNCTION_BUSINESS_ROUTES_NOT_READY',
      '本地 CloudBase 函数业务探针未通过。\n' +
        unavailable.map(item => `- ${item}`).join('\n') +
        buildLocalBusinessRouteHint(unavailable)
    )
  }
}

function buildLocalBusinessRouteHint(unavailable = []) {
  const message = unavailable.join('\n').toLowerCase()
  if (message.includes('401') || message.includes('请先登录')) {
    return '\n严格业务探针需要有效的 Bearer 会话令牌；请重新登录后更新 CLOUDBASE_LOCAL_SESSION_TOKEN，或移除该变量让启动器仅执行未登录探针。'
  }
  if (message.includes('secret id error') || message.includes('sign_param_invalid')) {
    return '\n请检查 .env.local 中的 CloudBase SecretId/SecretKey 是否存在、已轮换且有目标环境 SQL 权限。'
  }
  if (message.includes('unknown column') || message.includes('sqlstate: 42s22')) {
    return '\nCloudBase SQL 已连接成功，但当前开发库表结构与代码不一致。请先补齐缺失字段或执行对应 schema 迁移，再重新启动。'
  }
  if (
    message.includes('database connection failed') ||
    message.includes('run query failed') ||
    message.includes('please check the corresponding database connection configuration')
  ) {
    return (
      '\nCloudBase 密钥已进入 SQL 调用，但数据库连接配置未通过。请检查：\n' +
      '- 当前 shell 是否用既有的 CLOUDBASE_* / TENCENT_* 覆盖了 .env.local。\n' +
      '- CloudBase 关系型数据库实例是否 READY，且密钥账号有该环境 SQL 权限。\n' +
      '- 如控制台使用非默认数据库连接名，在 .env.local 设置 CLOUDBASE_SQL_DBLINK_NAME。'
    )
  }
  return '\n请检查本地 gateway 日志和 .env.local 中的 CloudBase / 业务环境配置。'
}

export async function assertLocalRuntimeReady(apiBaseUrl = '', options = {}) {
  assertLocalCloudbaseCredentials(options.requiredFunctions)
  await assertLocalFunctionsGatewayReady(
    apiBaseUrl,
    options.requiredFunctions,
    options.functionPortBase
  )
  await assertLocalFunctionRoutesReady(apiBaseUrl, options.requiredFunctions)
  await assertLocalBusinessRoutesReady(apiBaseUrl, options)
}

export function routeFailureLooksStale(details = []) {
  return details.some(
    item =>
      item.status === 502 &&
      (item.bodyCode === 'LOCAL_FUNCTION_PROXY_FAILED' || item.bodyCode === 502) &&
      /ECONNREFUSED|ECONNRESET|socket hang up/i.test(String(item.message || ''))
  )
}

export function gatewayStateLooksStale(state = {}, requiredFunctions = []) {
  const requiredSet = new Set(requiredFunctions)
  return state.functions.some(
    item =>
      requiredSet.has(item.name) &&
      (item.alive === false || (item.status && item.status !== 'running'))
  )
}

export function hasRuntimeLivenessMetadata(state = {}) {
  return (
    state.gateway === LOCAL_GATEWAY_KIND &&
    state.projectRoot === PROJECT_ROOT &&
    state.functions.some(item => typeof item.alive === 'boolean')
  )
}
