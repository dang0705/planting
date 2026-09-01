'use strict'
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
    schemaVersion: 2,
    naturalLightType: 'direct',
    entryMethod: 'through_glass',
    hasSupplementalLight: false,
    captureSource: 'user'
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
function loadAppWithSpies(overrides = {}) {
  const originalLoad = Module._load
  const appPath = require.resolve('../../../../cloudfunctions/plant-user-http/app.js')
  delete require.cache[appPath]
  const airEnvironmentEvidenceSpy = {
    calls: [],
    impl: overrides.airEnvironmentEvidenceImpl || (() => null),
    fn(input) {
      airEnvironmentEvidenceSpy.calls.push(input)
      return airEnvironmentEvidenceSpy.impl(input)
    }
  }
  const injectD0Spy = {
    calls: [],
    fn({ forecastDays = [], referenceDate = '' }) {
      injectD0Spy.calls.push({ forecastDays, referenceDate })
      return {
        forecastDays,
        todayWeatherSource: 'missing',
        todayWeatherRecord: null,
        todayWeatherReason: 'test_mock',
        referenceDate: referenceDate || '2026-06-18'
      }
    }
  }
  // transpirationSpy: computeTranspirationIntervalFactor(params) — 单参数对象
  const transpirationSpy = {
    calls: [],
    impl:
      overrides.transpirationImpl ||
      (() => ({
        intervalFactor: 1.0,
        computedFactor: 1.0,
        airFactor: 1.0,
        shadow: true,
        evidence: { light: false, weather: false, air: false }
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
    if (request === '/opt/utils/cloudbase') {
      return { models: { $runSQL: async () => ({ data: { executeResultList: [] } }) } }
    }
    if (request === '/opt/utils/fertilization-history') {
      return {
        getUserPlantFertilizationEvents: async () => [],
        insertFertilizationEvent: async () => ({})
      }
    }
    if (request === '/opt/utils/fertilization-reminder-planner') {
      return {
        calculateFertilizationCheck: () => ({}),
        evaluateMonthlyRule: () => ({ kind: 'interval', available: true, sourceNames: ['test'] }),
        parseDate: value => new Date(String(value))
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
    if (request === '/opt/utils/air-environment-evidence') {
      return { resolveAirEnvironmentEvidence: airEnvironmentEvidenceSpy.fn }
    }
    if (request.endsWith('/air-environment-service')) {
      return {
        readUserPlantAirEnvironment: async () => ({ statusCode: 200, message: 'ok', data: null }),
        saveUserPlantAirEnvironment: async () => ({ statusCode: 200, message: 'ok', data: null })
      }
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
          data: {
            amountRangeMl: [80, 150],
            nextWaterDate: null,
            soilCheck: { required: true, beforeWatering: true, message: '先检查盆土' },
            todayWeatherSource: 'missing',
            todayWeatherReason: 'test_mock'
          },
          error: null
        }),
        injectD0IntoForecastDays: injectD0Spy.fn
      }
    }
    if (request.endsWith('/watering-advisor-service')) {
      return {
        saveAdvisorSession: async () => ({ statusCode: 200, message: 'ok', data: null }),
        confirmAdvisorSessionWatered: async () => ({
          statusCode: 200,
          message: '已记录本次浇水',
          data: { confirmedWateredDate: '2026-06-18' }
        }),
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
    if (request.endsWith('/plant-deletion-service')) {
      return {
        deleteUserPlantCompletely: async () => ({ cleanupPending: false, cleanupAttempted: 0 }),
        drainPendingPlantFileDeletionJobs: async () => ({ attempted: 0, pending: 0 })
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
    return {
      app,
      transpirationSpy,
      plannerSpy,
      lightEnvSpy,
      strategySpy,
      airEnvironmentEvidenceSpy,
      injectD0Spy
    }
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
test('浇水规划接收完整 D0..D+14 天气窗口，并交由 D0 注入器校验', async () => {
  const { app, injectD0Spy } = loadAppWithSpies()
  const referenceDate = '2026-08-30'
  const forecastDays = Array.from({ length: 16 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 7, 30 + index)).toISOString().slice(0, 10),
    source: 'weather_cache_day_latest_sample'
  }))
  await callPlannerRoute(app, { referenceDate, forecastDays })
  assert.equal(injectD0Spy.calls.length, 1)
  assert.equal(injectD0Spy.calls[0].forecastDays.length, 15)
  assert.equal(injectD0Spy.calls[0].forecastDays[0].date, referenceDate)
})
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
    call.lightEnvironment.schemaVersion === 2 &&
      call.lightEnvironment.naturalLightType === 'direct' &&
      call.lightEnvironment.entryMethod === 'through_glass' &&
      'hasSupplementalLight' in call.lightEnvironment &&
      call.lightEnvironment.captureSource === 'user',
    'lightEnvironment 应包含 V2 分类光照契约'
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
  assert.equal(call.airEnvironmentEvidence, null, '没有空气资料时应传入 null')
})
test('buildWateringPlanner 收到 computeTranspirationIntervalFactor 产出的 intervalFactor', async () => {
  const { app, plannerSpy } = loadAppWithSpies({
    transpirationImpl: () => ({
      intervalFactor: 0.85,
      computedFactor: 1.0,
      shadow: false,
      evidence: { light: true, weather: true, air: false },
      airFactor: 1
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
test('我的植物规划忽略客户端盆型覆盖，只使用服务端已保存盆型', async () => {
  const { app, plannerSpy } = loadAppWithSpies()
  await callPlannerRoute(app, {
    potProfile: {
      potTopDiameterCm: 99,
      potBottomDiameterCm: 99,
      potHeightCm: 99,
      hasDrainageHole: 'false'
    }
  })
  assert.deepEqual(plannerSpy.calls[0].potProfile, buildStrategy().potProfile)
})
test('shadow 模式下 computedFactor != 1.0 时触发二次 buildWateringPlanner 调用', async () => {
  const { app, plannerSpy } = loadAppWithSpies({
    transpirationImpl: () => ({
      intervalFactor: 1.0,
      computedFactor: 0.88,
      shadow: true,
      evidence: { light: true, weather: false, air: false },
      airFactor: 1
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
test('空气环境证据进入蒸腾间隔修正，但不改变水量或 WET/DRY 输入', async () => {
  const evidence = {
    air_exchange_level: 'low',
    local_airflow_present: false,
    stagnation_risk: true,
    direct_airflow: false
  }
  const { app, plannerSpy, transpirationSpy, airEnvironmentEvidenceSpy } = loadAppWithSpies({
    airEnvironmentEvidenceImpl: () => evidence
  })
  const airEnvironmentOverride = { exchange: { source: 'window', direction: 'closed' } }
  const response = await callPlannerRoute(app, { plantId: 1, airEnvironmentOverride })
  assert.deepEqual(airEnvironmentEvidenceSpy.calls, [airEnvironmentOverride])
  assert.deepEqual(response.payload.data.airEnvironmentAudit, {
    evidence,
    intervalFactor: 1,
    airFactor: 1,
    computedFactor: 1,
    shadow: true
  })
  assert.deepEqual(transpirationSpy.calls[0].airEnvironmentEvidence, evidence)
  assert.equal(Object.hasOwn(plannerSpy.calls[0], 'airEnvironmentOverride'), false)
  assert.deepEqual(response.payload.data.amountRangeMl, [100, 200])
  assert.equal(response.payload.data.transpirationIntervalFactor, 1)
})
test('独立 /watering-advisor：保留无历史不推导日期并返回盆土检查指导', async () => {
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
  assert.ok('amountRangeMl' in response.payload.data)
  assert.ok('soilCheck' in response.payload.data)
  assert.ok('todayWeatherSource' in response.payload.data)
  assert.equal(response.payload.data.nextWaterDate, null)
})
test('独立 /watering-advisor：确认浇水动作返回可复用的当天事件', async () => {
  const { app } = loadAppWithSpies()
  const response = await app._test.main({
    path: '/user-plants/watering-advisor',
    method: 'POST',
    query: {},
    headers: {},
    body: {
      action: 'confirm_watered',
      catalogPlantId: 'test-1',
      wateredDate: '2026-06-18'
    }
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.data.confirmedWateredDate, '2026-06-18')
})
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
