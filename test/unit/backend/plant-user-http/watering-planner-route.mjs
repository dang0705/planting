'use strict'

/**
 * /watering-planner 路由集成测试 —— 浇水算法 v3。
 *
 * 本文件不是"仅用于加载的 mock stub"。它真正执行
 * cloudfunctions/plant-user-http/app.js 的 /watering-planner 路由
 * （不在 404 提前返回），用 spy 断言核心输入链路：
 *
 *   getUserPlantLightEnvironment → computeTranspirationIntervalFactor → buildWateringPlanner
 *
 * 断言：
 *   - getUserPlantWateringStrategy 返回有效策略（不返回 null，避免 404）
 *   - getUserPlantLightEnvironment 返回结构化对象（facing/windowType/position/hasDirectSun/distance）
 *   - computeTranspirationIntervalFactor 收到该精确对象作为 lightEnvironment
 *   - buildWateringPlanner 收到 computeTranspirationIntervalFactor 产出的 intervalFactor
 *   - 响应保留既有浇水结果字段
 *   - 独立 /watering-advisor 返回 amountRangeMl + D0 当日天气审计字段
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✓ ${name}`)
    } catch (error) {
      console.error(`✗ ${name}`)
      throw error
    }
  }
  console.log('watering-planner route integration tests passed')
}

function buildLightEnvironment() {
  return {
    facing: 'south',
    windowType: 'standard',
    position: 'windowsill',
    hasDirectSun: true,
    distance: 30
  }
}

function buildStrategy() {
  return {
    watering: { freq: [5, 8], way: '见干浇透' },
    wateringQuantization: { dryTolerance: 'normal', wetTolerance: 'normal' },
    temperatureMin: 12,
    temperatureMax: 30,
    humidityMin: 35,
    humidityMax: 75,
    potProfile: {
      potTopDiameterCm: 12,
      potBottomDiameterCm: 8,
      potHeightCm: 10,
      hasDrainageHole: 'true'
    }
  }
}

function buildPlannerResult() {
  return {
    nextWaterDate: '2026-07-08',
    nextWaterWindow: '2026-07-08~2026-07-10',
    nextWaterReason: 'BASELINE',
    wateringContext: 'BASELINE',
    action: 'water',
    amountRangeMl: [100, 200],
    potGeometry: { potVolumeMl: 500 },
    stopCondition: '土壤湿润',
    confidenceLevel: 'high',
    reasonCodes: ['BASELINE'],
    effectiveHydrationLoad: 100,
    wetPressureLoad: 0,
    lastEffectiveRootWateredDaysAgo: 3,
    rootZoneMoistureIndex: 0.5,
    userDoseEcho: null,
    transpirationIntervalFactor: 1.0
  }
}

/**
 * 用 spy 加载 app.js，返回 { app, spies }。
 * spies 包含 transpiration/planner/lightEnv/strategy 四个 spy，
 * 每个 spy 有 calls 数组和 impl 可配置返回值。
 */
function loadAppWithSpies(overrides = {}) {
  const originalLoad = Module._load
  const appPath = require.resolve('../../../../cloudfunctions/plant-user-http/app.js')
  delete require.cache[appPath]

  // transpirationSpy: computeTranspirationIntervalFactor(params) — 单参数对象
  const transpirationSpy = {
    calls: [],
    impl:
      overrides.transpirationImpl ||
      (() => ({
        intervalFactor: 1.0,
        computedFactor: 1.0,
        shadow: true,
        evidence: { light: false, weather: false }
      })),
    fn(params) {
      transpirationSpy.calls.push(params)
      return transpirationSpy.impl(params)
    }
  }

  // plannerSpy: buildWateringPlanner(params) — 单参数对象
  const plannerSpy = {
    calls: [],
    impl: overrides.plannerImpl || (() => buildPlannerResult()),
    fn(params) {
      plannerSpy.calls.push(params)
      return plannerSpy.impl(params)
    }
  }

  // lightEnvSpy: getUserPlantLightEnvironment(openid, plantId) — 双参数
  const lightEnvSpy = {
    calls: [],
    impl: overrides.lightEnvImpl || (() => buildLightEnvironment()),
    async fn(openid, plantId) {
      lightEnvSpy.calls.push({ openid, plantId })
      return lightEnvSpy.impl(openid, plantId)
    }
  }

  // strategySpy: getUserPlantWateringStrategy(openid, plantId) — 双参数
  const strategySpy = {
    calls: [],
    impl: overrides.strategyImpl || (() => buildStrategy()),
    async fn(openid, plantId) {
      strategySpy.calls.push({ openid, plantId })
      return strategySpy.impl(openid, plantId)
    }
  }

  Module._load = function patchedAppLoad(request, parent, isMain) {
    if (request === '/opt/utils/http') {
      return {
        jsonResponse(statusCode, payload) {
          return { statusCode, body: JSON.stringify(payload), payload }
        },
        notFound(path) {
          return { statusCode: 404, payload: { code: 404, message: path } }
        },
        methodNotAllowed(method) {
          return { statusCode: 405, payload: { code: 405, message: method } }
        },
        getHttpRequestData(event) {
          return event
        },
        resolveRequestAppEnv() {
          return null
        },
        runWithRequestAppEnv(_appEnv, fn) {
          return fn()
        },
        async resolveHttpUserInfo() {
          return { openid: 'openid_route_test' }
        }
      }
    }
    if (request === '/opt/utils/plant-knowledge') {
      return {
        createUserPlantInstance: async () => ({}),
        listUserPlantInstances: async () => ({ list: [], total: 0, page: 1, pageSize: 20 }),
        updateUserPlantInstance: async () => ({}),
        deleteUserPlantInstance: async () => ({}),
        getUserPlantWateringStrategy: strategySpy.fn
      }
    }
    if (request === '/opt/utils/watering-planner') {
      return {
        buildWateringPlanner: plannerSpy.fn,
        normalizeCareBehaviorTimeline: value => value
      }
    }
    if (request === '/opt/utils/transpiration') {
      return {
        computeTranspirationIntervalFactor: transpirationSpy.fn,
        resolveShadowModeFromEnv: () => true
      }
    }
    if (request === '/opt/utils/user-plant-light-environment') {
      return { getUserPlantLightEnvironment: lightEnvSpy.fn }
    }
    if (request.endsWith('/watering-planner-service')) {
      return {
        buildWeatherSummary: () => ({
          highHumidityDays: 0,
          hotDryDays: 0,
          coldHumidDays: 0,
          rainyDays: 0
        }),
        computeAdhocPlanner: async () => ({
          statusCode: 200,
          data: { amountRangeMl: [80, 150], todayWeatherSource: 'missing', todayWeatherReason: 'test_mock' },
          error: null
        }),
        injectD0IntoForecastDays: async ({ forecastDays = [], referenceDate = '' }) => ({
          forecastDays,
          todayWeatherSource: 'missing',
          todayWeatherRecord: null,
          todayWeatherReason: 'test_mock',
          referenceDate: referenceDate || '2026-06-18'
        })
      }
    }
    if (request.endsWith('/watering-advisor-service')) {
      return {
        saveAdvisorSession: async () => ({ statusCode: 200, message: 'ok', data: null }),
        listAdvisorSessions: async () => ({ statusCode: 200, data: { list: [], total: 0 } })
      }
    }
    if (request.endsWith('/care-location-service')) {
      return {
        attachCareLocation: value => value,
        attachCareLocationsToList: async ({ data }) => data,
        savePlantCareLocation: async () => null
      }
    }
    if (request.endsWith('/watering-reminder-service')) {
      return {
        attachWateringReminderStateToList: async (_openid, data) => data,
        readWateringReminder: async () => ({ statusCode: 200, data: null }),
        saveWateringReminder: async () => ({ statusCode: 200, message: 'ok', data: null })
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const app = require('../../../../cloudfunctions/plant-user-http/app.js')
    return { app, transpirationSpy, plannerSpy, lightEnvSpy, strategySpy }
  } finally {
    Module._load = originalLoad
    delete require.cache[appPath]
  }
}

async function callPlannerRoute(app, body = {}) {
  return app._test.main({
    path: '/user-plants/watering-planner',
    method: 'POST',
    query: {},
    headers: {},
    body: {
      plantId: body.plantId ?? 1,
      wateringEvents: body.wateringEvents ?? [],
      weatherDays: body.weatherDays ?? [],
      forecastDays: body.forecastDays ?? [],
      referenceDate: body.referenceDate ?? '2026-07-01',
      ...body
    }
  })
}

/* ============================================================
 * 1. 路由不提前 404，核心依赖被调用
 * ============================================================ */

test('/watering-planner 路由不提前 404，正确调用 getUserPlantWateringStrategy', async () => {
  const { app, strategySpy } = loadAppWithSpies()
  const response = await callPlannerRoute(app, { plantId: 42 })
  assert.equal(response.statusCode, 200, `应为 200，got ${response.statusCode}`)
  assert.equal(strategySpy.calls.length, 1, 'getUserPlantWateringStrategy 应被调用 1 次')
  assert.equal(strategySpy.calls[0].openid, 'openid_route_test')
  assert.equal(strategySpy.calls[0].plantId, 42)
})

test('getUserPlantLightEnvironment 被调用并传入 openid 与 plantId', async () => {
  const { app, lightEnvSpy } = loadAppWithSpies()
  await callPlannerRoute(app, { plantId: 77 })
  assert.equal(lightEnvSpy.calls.length, 1, 'getUserPlantLightEnvironment 应被调用 1 次')
  assert.equal(lightEnvSpy.calls[0].openid, 'openid_route_test')
  assert.equal(lightEnvSpy.calls[0].plantId, 77)
})

/* ============================================================
 * 2. computeTranspirationIntervalFactor 收到精确的 lightEnvironment
 * ============================================================ */

test('computeTranspirationIntervalFactor 收到精确的 lightEnvironment 对象', async () => {
  const exactEnv = buildLightEnvironment()
  const { app, transpirationSpy } = loadAppWithSpies({
    lightEnvImpl: () => exactEnv
  })
  await callPlannerRoute(app, { plantId: 1 })
  assert.equal(transpirationSpy.calls.length, 1, 'computeTranspirationIntervalFactor 应被调用 1 次')
  const call = transpirationSpy.calls[0]
  assert.deepEqual(
    call.lightEnvironment,
    exactEnv,
    'lightEnvironment 应为 getUserPlantLightEnvironment 返回的精确对象'
  )
  assert.ok(
    call.lightEnvironment.facing &&
      call.lightEnvironment.windowType &&
      call.lightEnvironment.position &&
      'hasDirectSun' in call.lightEnvironment &&
      'distance' in call.lightEnvironment,
    'lightEnvironment 应包含 facing/windowType/position/hasDirectSun/distance 五个字段'
  )
})

test('lightEnvironment 为 null 时传入 null（不抛错）', async () => {
  const { app, transpirationSpy } = loadAppWithSpies({
    lightEnvImpl: () => null
  })
  const response = await callPlannerRoute(app, { plantId: 1 })
  assert.equal(response.statusCode, 200)
  assert.equal(transpirationSpy.calls[0].lightEnvironment, null)
})

test('transpiration 收到 weatherDays、weatherSummary、plantStrategy、shadow', async () => {
  const { app, transpirationSpy } = loadAppWithSpies()
  await callPlannerRoute(app, { plantId: 1 })
  const call = transpirationSpy.calls[0]
  assert.ok(Array.isArray(call.weatherDays), 'weatherDays 应为数组')
  assert.ok(call.weatherSummary, '应传入 weatherSummary')
  assert.ok(call.plantStrategy, '应传入 plantStrategy')
  assert.ok(call.plantStrategy.wateringQuantization, 'plantStrategy 应包含 wateringQuantization')
  assert.equal(call.shadow, true, '默认应为 shadow 模式')
})

/* ============================================================
 * 3. buildWateringPlanner 收到 transpiration 产出的 intervalFactor
 * ============================================================ */

test('buildWateringPlanner 收到 computeTranspirationIntervalFactor 产出的 intervalFactor', async () => {
  const { app, plannerSpy } = loadAppWithSpies({
    transpirationImpl: () => ({
      intervalFactor: 0.85,
      computedFactor: 1.0,
      shadow: false,
      evidence: { light: true, weather: true }
    })
  })
  await callPlannerRoute(app, { plantId: 1 })
  assert.equal(
    plannerSpy.calls.length,
    1,
    'computedFactor=1.0 时应只调用 1 次 buildWateringPlanner'
  )
  assert.equal(
    plannerSpy.calls[0].transpirationIntervalFactor,
    0.85,
    'buildWateringPlanner 应收到 transpiration 产出的 intervalFactor'
  )
})

test('shadow 模式下 computedFactor != 1.0 时触发二次 buildWateringPlanner 调用', async () => {
  const { app, plannerSpy } = loadAppWithSpies({
    transpirationImpl: () => ({
      intervalFactor: 1.0,
      computedFactor: 0.88,
      shadow: true,
      evidence: { light: true, weather: false }
    })
  })
  await callPlannerRoute(app, { plantId: 1 })
  assert.equal(
    plannerSpy.calls.length,
    2,
    'shadow 模式下 computedFactor != 1.0 应触发 2 次 buildWateringPlanner'
  )
  assert.equal(
    plannerSpy.calls[0].transpirationIntervalFactor,
    1.0,
    '第一次调用应使用 intervalFactor=1.0（业务结果）'
  )
  assert.equal(
    plannerSpy.calls[1].transpirationIntervalFactor,
    0.88,
    '第二次调用应使用 computedFactor=0.88（候选结果）'
  )
})

/* ============================================================
 * 4. 响应字段断言
 * ============================================================ */

test('响应保留既有浇水结果字段', async () => {
  const { app } = loadAppWithSpies()
  const response = await callPlannerRoute(app, { plantId: 1 })
  const data = response.payload.data
  const expectedKeys = [
    'planId',
    'nextWaterDate',
    'nextWaterWindow',
    'nextWaterReason',
    'wateringContext',
    'action',
    'amountRangeMl',
    'potVolumeMl',
    'stopCondition',
    'confidenceLevel',
    'reasonCodes',
    'effectiveHydrationLoad',
    'wetPressureLoad',
    'lastEffectiveRootWateredDaysAgo',
    'rootZoneMoistureIndex',
    'userDoseEcho'
  ]
  for (const key of expectedKeys) {
    assert.ok(key in data, `响应应包含既有字段 ${key}`)
  }
})

test('响应包含 v3 蒸腾审计字段', async () => {
  const { app } = loadAppWithSpies()
  const response = await callPlannerRoute(app, { plantId: 1 })
  const data = response.payload.data
  assert.ok('transpirationIntervalFactor' in data)
  assert.ok('transpirationShadow' in data)
  assert.ok('transpirationComputedFactor' in data)
  assert.ok('transpirationCandidateNextWaterDate' in data)
  assert.ok('transpirationCandidateNextWaterWindow' in data)
  // D0 当日天气来源审计字段
  assert.ok('todayWeatherSource' in data, '响应应包含 todayWeatherSource')
  assert.ok('todayWeatherReason' in data, '响应应包含 todayWeatherReason')
})

/* ============================================================
 * 5. 独立 /watering-advisor 返回 amountRangeMl + D0 审计字段
 * ============================================================ */

test('独立 /watering-advisor：data keys 包含 amountRangeMl + D0 审计字段', async () => {
  const { app } = loadAppWithSpies()
  const response = await app._test.main({
    path: '/user-plants/watering-advisor',
    method: 'POST',
    query: {},
    headers: {},
    body: {
      action: 'compute',
      catalogPlantId: 'test-1',
      potProfile: { potTopDiameterCm: 12, potHeightCm: 10, hasDrainageHole: 'true' },
      weatherDays: [],
      forecastDays: []
    }
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(
    Object.keys(response.payload.data).sort(),
    ['amountRangeMl', 'todayWeatherReason', 'todayWeatherSource'],
    `watering-advisor data keys 应包含 amountRangeMl + D0 审计字段，got ${JSON.stringify(
      Object.keys(response.payload.data)
    )}`
  )
})

/* ============================================================
 * 6. 边界条件
 * ============================================================ */

test('plantId 缺失返回 400', async () => {
  const { app } = loadAppWithSpies()
  const response = await app._test.main({
    path: '/user-plants/watering-planner',
    method: 'POST',
    query: {},
    headers: {},
    body: { wateringEvents: [], weatherDays: [] }
  })
  assert.equal(response.statusCode, 400)
  assert.equal(response.payload.code, 400)
})

test('strategy 返回 null 时返回 404', async () => {
  const { app } = loadAppWithSpies({
    strategyImpl: () => null
  })
  const response = await callPlannerRoute(app, { plantId: 999 })
  assert.equal(response.statusCode, 404)
  assert.equal(response.payload.code, 404)
})

test('GET 方法返回 405', async () => {
  const { app } = loadAppWithSpies()
  const response = await app._test.main({
    path: '/user-plants/watering-planner',
    method: 'GET',
    query: { plantId: '1' },
    headers: {},
    body: {}
  })
  assert.equal(response.statusCode, 405)
})

await runAll()
