import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

// data_mode=unit_real_data
// 本测试只调用真实 plant-user-http 云函数的 GET/POST 读接口，不写数据库，不使用 fixture。

const require = createRequire(import.meta.url)
const {
  computeLightExposure
} = require('../../../../../cloudfunctions/layer/utils/light-exposure.js')
const {
  computeTranspirationIntervalFactor
} = require('../../../../../cloudfunctions/layer/utils/transpiration.js')

const PROJECT_ROOT = process.cwd()
const AUTH_CACHE_PATH = `${PROJECT_ROOT}/.cache/cloudbase-terminal-anon-auth.json`
const DEFAULT_TIMEOUT_MS = 45000

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((result, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return result
      }
      const separator = trimmed.indexOf('=')
      if (separator <= 0) {
        return result
      }
      result[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
      return result
    }, {})
}

function readCachedAuth() {
  if (!fs.existsSync(AUTH_CACHE_PATH)) {
    return {}
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_CACHE_PATH, 'utf8'))
    if (Number(parsed.expires_at || 0) <= Date.now()) {
      return {}
    }
    return parsed
  } catch {
    return {}
  }
}

const fileEnv = readEnvFile(`${PROJECT_ROOT}/.env.local`)
const env = { ...fileEnv, ...process.env }
const cachedAuth = readCachedAuth()
const envId = String(env.UNIT_REAL_DATA_ENV_ID || env.CLOUDBASE_ENV_ID || '').trim()
const accessToken = String(
  env.UNIT_REAL_DATA_ACCESS_TOKEN ||
    env.CLOUDBASE_TEST_ACCESS_TOKEN ||
    cachedAuth.access_token ||
    ''
).trim()
const openid = String(
  env.UNIT_REAL_DATA_OPENID ||
    env.CLOUDBASE_TEST_OPENID ||
    env.VITE_DEV_OPENID ||
    cachedAuth.sub ||
    ''
).trim()
const baseUrl = String(
  env.UNIT_REAL_DATA_BASE_URL ||
    env.TERMINAL_E2E_FUNCTION_BASE_URL ||
    (envId ? `https://${envId}.api.tcloudbasegateway.com/v1/functions/` : '')
).trim()
const skipAuth = /^(1|true|yes|on)$/i.test(String(env.UNIT_REAL_DATA_SKIP_AUTH || '').trim())
const configuredPlantId = String(env.UNIT_REAL_DATA_PLANT_ID || '').trim()

function assertRealDataConfiguration() {
  assert.ok(baseUrl, '缺少 UNIT_REAL_DATA_BASE_URL 或 CLOUDBASE_ENV_ID')
  assert.ok(openid, '缺少 UNIT_REAL_DATA_OPENID（必须指向真实开发用户）')
  if (!skipAuth) {
    assert.ok(accessToken, '缺少 UNIT_REAL_DATA_ACCESS_TOKEN，且没有可用匿名登录缓存')
  }
}

function buildUrl(functionPath, query = {}) {
  const url = new URL(functionPath.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  if (
    !Object.prototype.hasOwnProperty.call(env, 'UNIT_REAL_DATA_WEBFN') ||
    /^(1|true|yes|on)$/i.test(String(env.UNIT_REAL_DATA_WEBFN || '').trim())
  ) {
    url.searchParams.set('webfn', 'true')
  }
  return url
}

async function request(functionPath, { method = 'GET', query = {}, body = undefined } = {}) {
  const requestQuery = { ...query }
  const requestBody = body && typeof body === 'object' ? { ...body } : body
  if (skipAuth) {
    requestQuery.skipAuth = 'true'
    if (requestBody && typeof requestBody === 'object') {
      requestBody.skipAuth = true
    }
  }
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' }
  // The gateway still requires a bearer credential even when the function
  // itself is asked to bypass its business-level auth check.
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  if (openid) {
    headers['x-openid'] = openid
    headers['x-wx-openid'] = openid
  }
  headers['x-app-env'] = String(env.UNIT_REAL_DATA_APP_ENV || env.APP_ENV || 'development')
  headers['x-env'] = headers['x-app-env']
  if (/^(1|true|yes|on)$/i.test(String(env.UNIT_REAL_DATA_TERMINAL_E2E || '').trim())) {
    headers['x-terminal-e2e'] = 'true'
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Number(env.UNIT_REAL_DATA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  )
  try {
    const requestOptions = {
      method,
      headers,
      signal: controller.signal
    }
    if (method !== 'GET') {
      requestOptions.body = JSON.stringify(requestBody || {})
    }
    const response = await fetch(buildUrl(functionPath, requestQuery), requestOptions)
    const text = await response.text()
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
    return { response, payload }
  } finally {
    clearTimeout(timeout)
  }
}

function assertSuccessfulFunctionResponse(result, label) {
  assert.ok(
    result.response.ok,
    `${label} HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`
  )
  assert.equal(
    result.payload?.code,
    200,
    `${label} code 不是 200: ${JSON.stringify(result.payload)}`
  )
}

function listFromPayload(payload) {
  const data = payload?.data
  return Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : []
}

function choosePlant(plants) {
  const withLightEnvironment = plants.filter(
    plant => plant?.lightEnvironment && typeof plant.lightEnvironment === 'object'
  )
  if (configuredPlantId) {
    const configured = plants.find(plant => String(plant?.id || '') === configuredPlantId)
    assert.ok(
      configured,
      `UNIT_REAL_DATA_PLANT_ID=${configuredPlantId} 不在真实云函数返回的植物列表中`
    )
    return configured
  }
  assert.ok(
    withLightEnvironment.length,
    '真实云函数返回的植物中没有 V2 lightEnvironment，请先在端上确认光照档案'
  )
  return withLightEnvironment[0]
}

function assertV2LightEnvironment(lightEnvironment) {
  assert.equal(lightEnvironment?.schemaVersion, 2)
  assert.ok(
    ['direct', 'bright_diffuse', 'weak_diffuse', 'almost_none'].includes(
      lightEnvironment.naturalLightType
    )
  )
  if (lightEnvironment.naturalLightType === 'almost_none') {
    assert.equal(lightEnvironment.entryMethod, null)
  } else {
    assert.ok(['through_glass', 'open_environment'].includes(lightEnvironment.entryMethod))
  }
  assert.equal(typeof lightEnvironment.hasSupplementalLight, 'boolean')
  assert.ok(['user', 'migrated_v1'].includes(lightEnvironment.captureSource))
}

async function main() {
  assertRealDataConfiguration()
  let plant
  if (configuredPlantId) {
    const plantResult = await request('plant-user-http/user-plants', {
      query: { id: configuredPlantId }
    })
    assertSuccessfulFunctionResponse(plantResult, 'GET /user-plants?id=...')
    plant = plantResult.payload?.data
  } else {
    const plantsResult = await request('plant-user-http/user-plants', {
      query: { page: 1, pageSize: 50 }
    })
    assertSuccessfulFunctionResponse(plantsResult, 'GET /user-plants')
    plant = choosePlant(listFromPayload(plantsResult.payload))
  }
  assert.ok(plant && typeof plant === 'object', '真实云函数未返回目标植物')
  assertV2LightEnvironment(plant.lightEnvironment)

  const referenceDate = new Date().toISOString().slice(0, 10)
  const plannerResult = await request('plant-user-http/user-plants/watering-planner', {
    method: 'POST',
    body: {
      plantId: plant.id,
      weatherDays: [],
      forecastDays: [],
      // 该真实植物当前没有可回放的浇水事件时，服务端按业务合同返回
      // 409 requiresWateringHistory；这里提供一个仅用于计算请求的
      // 明确历史事件，避免把合法业务门槛误报成接口故障。
      wateringEvents: [{ date: referenceDate, watered: true, amount: 'normal' }],
      referenceDate,
      timezone: 'Asia/Shanghai',
      locationKey: ''
    }
  })
  assertSuccessfulFunctionResponse(plannerResult, 'POST /user-plants/watering-planner')
  const data = plannerResult.payload?.data
  assert.ok(data && typeof data === 'object', 'watering-planner 未返回 data')
  assert.ok(Number.isFinite(data.transpirationComputedFactor))
  assert.ok(Number.isFinite(data.transpirationIntervalFactor))
  assert.equal(typeof data.transpirationShadow, 'boolean')
  assert.ok(['day_latest_sample', 'missing'].includes(data.todayWeatherSource))

  const expected = computeTranspirationIntervalFactor({
    lightEnvironment: plant.lightEnvironment,
    weatherDays: [],
    weatherSummary: null,
    shadow: data.transpirationShadow
  })
  assert.equal(data.transpirationComputedFactor, expected.computedFactor)
  assert.equal(data.transpirationIntervalFactor, expected.intervalFactor)

  const exposure = computeLightExposure({
    userLightContext: plant.lightEnvironment,
    weatherDays: []
  })
  assert.equal(exposure.formulaVersion, 'light_exposure_v2')
  assert.ok(exposure.estimatedExposureIndex >= 0 && exposure.estimatedExposureIndex <= 1)

  console.log(
    JSON.stringify(
      {
        dataMode: 'unit_real_data',
        source: 'plant-user-http cloud function',
        plantId: plant.id,
        naturalLightType: plant.lightEnvironment.naturalLightType,
        captureSource: plant.lightEnvironment.captureSource,
        estimatedExposureIndex: exposure.estimatedExposureIndex,
        transpirationComputedFactor: data.transpirationComputedFactor,
        transpirationIntervalFactor: data.transpirationIntervalFactor,
        transpirationShadow: data.transpirationShadow,
        todayWeatherSource: data.todayWeatherSource
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(`[unit_real_data] blocked or failed: ${error.message}`)
  process.exitCode = 1
})
