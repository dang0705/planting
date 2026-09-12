#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { qaBackendTargetEvidence, resolveQaBackendTarget } from './qa-backend-target.mjs'

const DEVELOPMENT_ENV_ID = 'cloud1-2grufevs395a9d5e'
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_REPEATS = 2
const DEFAULT_CONCURRENCY = 2

/**
 * 路由压力矩阵分成三类：
 * - health：必须成功，验证函数冷/热路径的基本响应；
 * - read：只读查询或明确的缺参边界，不创建/修改业务数据；
 * - method_guard：对写接口使用错误 HTTP 方法，只验证路由拒绝，不触发写入。
 * 这不是业务写入压测；真实 mutation 需要单独授权和专用测试数据。
 */
export const ROUTE_MATRIX = Object.freeze([
  { id: 'auth.health', path: 'auth-user-http/auth/user/health', method: 'GET', kind: 'health' },
  {
    id: 'auth.invalid-action',
    path: 'auth-user-http/auth/user',
    method: 'GET',
    query: { action: '__light_load_invalid__' },
    kind: 'read',
    expected: [400]
  },
  {
    id: 'catalog.health',
    path: 'plant-catalog-http/catalog/health',
    method: 'GET',
    kind: 'health'
  },
  {
    id: 'catalog.map',
    path: 'plant-catalog-http/catalog/map',
    method: 'GET',
    query: { keyword: '' },
    kind: 'read',
    expected: [200]
  },
  {
    id: 'catalog.plants',
    path: 'plant-catalog-http/catalog/plants',
    method: 'GET',
    query: { page: 1, pageSize: 1 },
    kind: 'read',
    expected: [200]
  },
  {
    id: 'plant-user.health',
    path: 'plant-user-http/user-plants/health',
    method: 'GET',
    kind: 'health'
  },
  {
    id: 'plant-user.list',
    path: 'plant-user-http/user-plants',
    method: 'GET',
    query: { page: 1, pageSize: 1 },
    kind: 'read',
    // 该入口先做用户鉴权；匿名 bearer 的轻压样本应稳定返回 401。
    expected: [200, 401]
  },
  {
    id: 'plant-user.air-environment.invalid',
    path: 'plant-user-http/user-plants/air-environment',
    method: 'GET',
    query: { plantId: 0 },
    kind: 'read',
    expected: [400, 401, 404]
  },
  {
    id: 'plant-user.fertilization.invalid',
    path: 'plant-user-http/user-plants/fertilization-reminders',
    method: 'GET',
    query: { plantId: 0 },
    kind: 'read',
    expected: [400, 401]
  },
  {
    id: 'plant-user.watering.invalid',
    path: 'plant-user-http/user-plants/watering-reminders',
    method: 'GET',
    query: { plantId: 0 },
    kind: 'read',
    expected: [400, 401]
  },
  {
    id: 'plant-user.watering-advisor.list',
    path: 'plant-user-http/user-plants/watering-advisor',
    method: 'GET',
    query: { page: 1, pageSize: 1 },
    kind: 'read',
    expected: [200, 401]
  },
  {
    id: 'plant-user.watering-planner.method-guard',
    path: 'plant-user-http/user-plants/watering-planner',
    method: 'GET',
    kind: 'method_guard',
    expected: [401, 405]
  },
  {
    id: 'plant-user.user-plants.method-guard',
    path: 'plant-user-http/user-plants',
    method: 'GET',
    methodOverride: 'PUT',
    kind: 'method_guard',
    expected: [401, 405]
  },
  {
    id: 'plant-user.fertilization-write.method-guard',
    path: 'plant-user-http/user-plants/fertilization-reminders/confirm',
    method: 'GET',
    methodOverride: 'PATCH',
    query: { plantId: 1 },
    kind: 'method_guard',
    expected: [401, 405]
  },
  {
    id: 'plant-user.watering-write.method-guard',
    path: 'plant-user-http/user-plants/watering-reminders',
    method: 'GET',
    methodOverride: 'PATCH',
    query: { plantId: 1 },
    kind: 'method_guard',
    expected: [401, 405]
  },
  { id: 'storage.health', path: 'storage-http/storage/health', method: 'GET', kind: 'health' },
  {
    id: 'storage.files.invalid',
    path: 'storage-http/storage/files',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [400, 401]
  },
  {
    id: 'storage.files-upload.method-guard',
    path: 'storage-http/storage/files',
    method: 'GET',
    methodOverride: 'PUT',
    kind: 'method_guard',
    expected: [401, 405]
  },
  {
    id: 'storage.diagnose-images.method-guard',
    path: 'storage-http/storage/diagnose-images',
    method: 'GET',
    kind: 'method_guard',
    expected: [401, 405]
  },
  {
    id: 'storage.plant-images.invalid',
    path: 'storage-http/storage/plant-images',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [400, 401]
  },
  {
    id: 'storage.plant-images-write.method-guard',
    path: 'storage-http/storage/plant-images',
    method: 'GET',
    methodOverride: 'PUT',
    kind: 'method_guard',
    expected: [401, 405]
  },
  { id: 'identify.health', path: 'identify-http/identify/health', method: 'GET', kind: 'health' },
  {
    id: 'identify.plant.invalid',
    path: 'identify-http/identify/plant',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [400, 401]
  },
  {
    id: 'identify.plant.method-guard',
    path: 'identify-http/identify/plant',
    method: 'GET',
    methodOverride: 'PUT',
    kind: 'method_guard',
    expected: [405]
  },
  { id: 'diagnose.health', path: 'diagnose-http/health', method: 'GET', kind: 'health' },
  ...[
    { route: 'diagnose', transport: 'http_service' },
    { route: 'stream/diagnose', transport: 'http_service' },
    'diagnosis/start',
    'diagnosis/question/start',
    'diagnosis/answer',
    'diagnosis/retake/authorize',
    'diagnosis/retake/skip',
    'diagnosis/review/import',
    'diagnosis/feedback',
    'visual/out-of-pool/review',
    'visual/out-of-pool/proxy-mappings/upsert',
    'visual/out-of-pool/proxy-mappings/disable'
  ].map(routeEntry => {
    const route = typeof routeEntry === 'string' ? routeEntry : routeEntry.route
    const transport = typeof routeEntry === 'string' ? 'function' : routeEntry.transport
    return {
      id: `diagnose.${route}.method-guard`,
      path: transport === 'http_service' ? route : `diagnose-http/${route}`,
      transport,
      method: 'GET',
      methodOverride: 'PATCH',
      kind: 'method_guard',
      expected: [405]
    }
  }),
  ...[
    'diagnosis/result',
    'diagnosis/history',
    'diagnosis/review/list',
    'diagnosis/review/images',
    'diagnosis/review/detail',
    'visual/out-of-pool/list',
    'visual/out-of-pool/image',
    'visual/out-of-pool/proxy-mappings/list'
  ].map(route => ({
    id: `diagnose.${route}.read`,
    path: `diagnose-http/${route}`,
    method: 'GET',
    kind: 'read',
    expected: [
      'diagnosis/review/list',
      'diagnosis/review/images',
      'diagnosis/review/detail',
      'visual/out-of-pool/list',
      'visual/out-of-pool/image',
      'visual/out-of-pool/proxy-mappings/list'
    ].includes(route)
      ? [200, 400, 401, 403, 404]
      : [200, 400, 401, 404]
  })),
  {
    id: 'diagnosis-history.deprecated',
    path: 'diagnosis-history-http/diagnosis/history',
    method: 'GET',
    kind: 'read',
    expected: [404]
  },
  {
    id: 'diagnosis-history.health',
    path: 'diagnosis-history-http/diagnosis/history/health',
    method: 'GET',
    kind: 'health',
    expected: [200]
  },
  { id: 'weather.health', path: 'weather-http/weather/health', method: 'GET', kind: 'health' },
  {
    id: 'weather.hot-cities',
    path: 'weather-http/weather/hot-cities',
    method: 'GET',
    kind: 'read',
    expected: [200]
  },
  {
    id: 'weather.hot-cities-resolve',
    path: 'weather-http/weather/hot-cities/resolve',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [200, 400]
  },
  {
    id: 'weather.environment-context.invalid',
    path: 'weather-http/weather/environment-context',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [400]
  },
  {
    id: 'weather.current.invalid',
    path: 'weather-http/weather/current',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [400]
  },
  {
    id: 'weather.recent',
    path: 'weather-http/weather/recent',
    method: 'GET',
    query: {},
    kind: 'read',
    expected: [200, 400, 404]
  },
  {
    id: 'weather.24h.method-guard',
    path: 'weather-http/weather/v7/weather/24h',
    method: 'GET',
    methodOverride: 'PATCH',
    kind: 'method_guard',
    expected: [405]
  },
  {
    id: 'weather.24h-alias.method-guard',
    path: 'weather-http/v7/weather/24h',
    method: 'GET',
    methodOverride: 'PATCH',
    kind: 'method_guard',
    expected: [405]
  },
  {
    id: 'weather.ingestion.method-guard',
    path: 'weather-http/weather/ingestion/recent-10d',
    method: 'GET',
    methodOverride: 'PATCH',
    kind: 'method_guard',
    expected: [405]
  }
])

function parsePositiveInteger(value, fallback, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) {
    return fallback
  }
  return Math.min(number, maximum)
}

export function readConfig(env = process.env) {
  let backendTarget = null
  let backendTargetError = null
  try {
    backendTarget = resolveQaBackendTarget(env, {
      port: 3011,
      functionPortBase: 9100
    })
  } catch (error) {
    backendTargetError = {
      code: error?.code || 'qa_backend_target_invalid',
      message: error?.message || String(error)
    }
  }
  return {
    baseUrl: String(backendTarget?.baseUrl || env.TERMINAL_E2E_FUNCTION_BASE_URL || '')
      .trim()
      .replace(/\/+$/, ''),
    configuredBaseUrl: String(env.TERMINAL_E2E_FUNCTION_BASE_URL || '')
      .trim()
      .replace(/\/+$/, ''),
    backendTarget,
    backendTargetError,
    httpServiceBaseUrl: String(env.BACKEND_LIGHT_LOAD_HTTP_SERVICE_BASE_URL || '')
      .trim()
      .replace(/\/+$/, ''),
    openid: String(env.BACKEND_LIGHT_LOAD_OPENID || '').trim(),
    accessToken: String(env.BACKEND_LIGHT_LOAD_ACCESS_TOKEN || '').trim(),
    envId: String(env.CLOUDBASE_ENV_ID || '').trim(),
    appEnv: String(env.BACKEND_LIGHT_LOAD_APP_ENV || 'development').trim(),
    timeoutMs: parsePositiveInteger(env.BACKEND_LIGHT_LOAD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30000),
    repeats: parsePositiveInteger(env.BACKEND_LIGHT_LOAD_REPEATS, DEFAULT_REPEATS, 5),
    concurrency: parsePositiveInteger(env.BACKEND_LIGHT_LOAD_CONCURRENCY, DEFAULT_CONCURRENCY, 4),
    reportFile: String(env.BACKEND_LIGHT_LOAD_REPORT_FILE || '').trim()
  }
}

export function validateConfig(config) {
  const missing = []
  if (config.backendTargetError) {
    missing.push('QA_BACKEND_TARGET=' + config.backendTargetError.code)
  }
  if (!config.baseUrl) {
    missing.push('canonical QA backend target')
  }
  if (config.configuredBaseUrl && config.configuredBaseUrl !== config.baseUrl) {
    missing.push('TERMINAL_E2E_FUNCTION_BASE_URL must equal canonical QA backend target')
  }
  if (!config.httpServiceBaseUrl) {
    missing.push('BACKEND_LIGHT_LOAD_HTTP_SERVICE_BASE_URL')
  }
  if (!config.openid) {
    missing.push('BACKEND_LIGHT_LOAD_OPENID')
  }
  if (!config.accessToken) {
    missing.push('BACKEND_LIGHT_LOAD_ACCESS_TOKEN')
  }
  if (config.envId !== DEVELOPMENT_ENV_ID) {
    missing.push(`CLOUDBASE_ENV_ID=${DEVELOPMENT_ENV_ID}`)
  }
  if (config.appEnv !== 'development') {
    missing.push('BACKEND_LIGHT_LOAD_APP_ENV=development')
  }
  return missing
}

function buildUrl(config, route) {
  const isHttpServiceRoute = route.transport === 'http_service'
  const baseUrl = isHttpServiceRoute ? config.httpServiceBaseUrl : config.baseUrl
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(route.query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }
  const url = new URL(`${route.path.replace(/^\/+/, '')}`, `${baseUrl}/`)
  const search = query.toString()
  if (search) {
    url.search = search
  }
  if (!isHttpServiceRoute && url.hostname.endsWith('.api.tcloudbasegateway.com')) {
    url.searchParams.set('webfn', 'true')
  }
  return url
}

async function requestRoute(config, route, repeat) {
  const startedAt = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-terminal-e2e': 'true',
    'x-app-env': config.appEnv,
    'x-env': config.appEnv,
    'x-openid': config.openid,
    'x-wx-openid': config.openid
  }
  headers.Authorization = `Bearer ${config.accessToken}`
  if (route.methodOverride) {
    headers['x-http-method-override'] = route.methodOverride
  }
  try {
    const response = await fetch(buildUrl(config, route), {
      method: route.method,
      headers,
      signal: controller.signal
    })
    const text = await response.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { nonJson: text.slice(0, 200) }
    }
    return {
      route: route.id,
      repeat,
      kind: route.kind,
      status: response.status,
      expected: route.expected || (route.kind === 'health' ? [200] : []),
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      bodyCode: body?.code ?? null,
      healthStatus: body?.data?.status ?? null,
      timedOut: false
    }
  } catch (error) {
    return {
      route: route.id,
      repeat,
      kind: route.kind,
      status: null,
      expected: route.expected || (route.kind === 'health' ? [200] : []),
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
      timedOut: error?.name === 'AbortError'
    }
  } finally {
    clearTimeout(timer)
  }
}

function isResultPass(result) {
  if (result.timedOut || result.status === null) {
    return false
  }
  if (result.kind === 'health') {
    return result.status === 200 && result.bodyCode === 200
  }
  return result.expected.includes(result.status)
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = []
  let cursor = 0
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume))
  return output
}

export async function runLightLoad(config = readConfig()) {
  const missing = validateConfig(config)
  if (missing.length) {
    return {
      status: 'BLOCKED',
      reason: 'missing_or_unsafe_real_api_configuration',
      missing,
      data_mode: 'e2e_real_api',
      evidence_class: 'diagnostic_only',
      performance_eligible: false,
      transport: 'node.fetch',
      backend_target: qaBackendTargetEvidence(config.backendTarget),
      mutation_policy: 'read_only',
      route_count: ROUTE_MATRIX.length,
      note: '未运行任何请求；不会回退匿名、假接口或线上旧部署。'
    }
  }

  const jobs = ROUTE_MATRIX.flatMap(route =>
    Array.from({ length: config.repeats }, (_, index) => ({ route, repeat: index + 1 }))
  )
  const results = await mapWithConcurrency(jobs, config.concurrency, job =>
    requestRoute(config, job.route, job.repeat)
  )
  const passed = results.filter(isResultPass)
  const failed = results.filter(result => !isResultPass(result))
  const latencies = passed.map(result => result.latencyMs).sort((a, b) => a - b)
  const percentile = ratio =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * ratio))] || null
  return {
    status: failed.length ? 'FAIL' : 'PASS',
    data_mode: 'e2e_real_api',
    evidence_class: 'diagnostic_only',
    performance_eligible: false,
    transport: 'node.fetch',
    backend_target: qaBackendTargetEvidence(config.backendTarget),
    mutation_policy: 'read_only',
    environment: 'cloud1_dev/development',
    route_count: ROUTE_MATRIX.length,
    request_count: results.length,
    concurrency: config.concurrency,
    repeats: config.repeats,
    timeoutMs: config.timeoutMs,
    latencyMs: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: latencies.length ? latencies[latencies.length - 1] : null
    },
    passed_count: passed.length,
    failed_count: failed.length,
    failures: failed,
    results
  }
}

async function writeReport(file, report) {
  if (!file) {
    return
  }
  const absolute = path.resolve(file)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

async function main() {
  const config = readConfig()
  const report = await runLightLoad(config)
  await writeReport(config.reportFile, report)
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'PASS') {
    process.exitCode = report.status === 'BLOCKED' ? 2 : 1
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath && path.resolve(fileURLToPath(import.meta.url)) === entryPath) {
  await main()
}
