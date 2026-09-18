import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(repoRoot, 'cloudfunctions/plant-user-http/watering-reminder-service.js')
const originalLoad = Module._load
const sqlCalls = []
const nativeSqlCalls = []
let persistedWateringEvents = []
let reminderRows = []

const models = {
  async $runSQL(sql, params) {
    sqlCalls.push({ sql, params })
    if (sql.includes('FROM user_plant_instances')) {
      return { data: { executeResultList: [{ id: params.plantId }] } }
    }
    if (sql.includes('FROM user_watering_reminder_events')) {
      return { data: { executeResultList: reminderRows } }
    }
    if (sql.includes('FROM user_watering_events')) {
      return { data: { executeResultList: persistedWateringEvents } }
    }
    return { data: { executeResultList: [] } }
  }
}

const fakeConnection = {
  async execute(sql, params) {
    nativeSqlCalls.push({ sql, params })
    if (sql.includes('FROM user_plant_instances')) {
      return [[{ id: params[0] }]]
    }
    if (sql.includes('FROM user_watering_reminder_events')) {
      return [[{ id: 12, plan_id: 'plan-12', next_water_date: '2026-08-30' }]]
    }
    return [[]]
  }
}

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models }
    }
    if (request === '/opt/utils/plant-knowledge') {
      return {
        getUserPlantWateringEvents: async () => persistedWateringEvents,
        getUserPlantWateringStrategy: async () => ({ watering: { freq: [5, 8] } })
      }
    }
    if (request === '/opt/utils/watering-planner') {
      return {
        buildWateringPlanner: () => ({ nextWaterDate: '2026-08-30' }),
        normalizeCareBehaviorTimeline: input => ({
          wateringEvents10d: input.watering_events_10d || [],
          watering_events_10d: input.watering_events_10d || []
        })
      }
    }
    if (request === './watering-planner-service') {
      return {
        buildWeatherSummary: () => ({}),
        injectD0IntoForecastDays: async ({ forecastDays, referenceDate }) => ({
          forecastDays,
          referenceDate: referenceDate || '2026-08-28'
        })
      }
    }
    if (request === '/opt/utils/user-plant-light-environment') {
      return { getUserPlantLightEnvironment: async () => null }
    }
    if (request === '/opt/utils/transpiration') {
      return {
        computeTranspirationIntervalFactor: () => ({ intervalFactor: 1 }),
        resolveShadowModeFromEnv: () => false
      }
    }
    if (request === '/opt/utils/air-environment-evidence') {
      return { resolveAirEnvironmentEvidence: () => null }
    }
    if (request === '/opt/utils/native-mysql') {
      return {
        withNativeTransaction: async handler => handler(fakeConnection)
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const service = require(sourcePath)
  const result = await service.completeWateringReminder('wx_owner', {
    plantId: 7,
    wateredDate: '2026-08-28'
  })

  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.data, {
    plantId: 7,
    lastWatered: '2026-08-28',
    nextWater: null,
    wateringReminder: null,
    planId: 'plan-12'
  })
  assert.ok(
    nativeSqlCalls.some(
      call =>
        call.sql.includes('UPDATE user_plant_instances') &&
        call.sql.includes('next_water = NULL') &&
        call.params[0] === '2026-08-28' &&
        call.params[1] === 7
    )
  )
  assert.equal(
    nativeSqlCalls.filter(call => call.sql.includes('UPDATE user_plant_instances')).length,
    1,
    '植物状态必须在事务中落库'
  )
  assert.ok(nativeSqlCalls.some(call => call.sql.includes("'reminder_complete'")))

  const repeated = await service.completeWateringReminder('wx_owner', {
    plantId: 7,
    wateredDate: '2026-08-28',
    planId: 'plan-12'
  })
  assert.equal(repeated.statusCode, 200)
  assert.ok(
    nativeSqlCalls.filter(call => call.sql.includes('ON DUPLICATE KEY UPDATE')).length >= 2,
    '重复完成通过数据库幂等键处理'
  )

  const invalidDate = await service.completeWateringReminder('wx_owner', {
    plantId: 7,
    wateredDate: '2026-02-30'
  })
  assert.equal(invalidDate.statusCode, 400)
  assert.equal(invalidDate.message, '浇水日期无效')

  const futureDate = await service.completeWateringReminder('wx_owner', {
    plantId: 7,
    wateredDate: '9999-12-31'
  })
  assert.equal(futureDate.statusCode, 400)
  assert.equal(futureDate.message, '浇水日期不能晚于今天')

  persistedWateringEvents = [{ date: '2026-08-28', watered: true, amount: 'normal' }]
  reminderRows = [
    {
      id: 12,
      user_plant_id: 7,
      plan_id: 'plan-12',
      reminder_type: 'water',
      status: 'active',
      next_time: '2026-08-30 09:00:00',
      watering_events_json_text: '[]',
      planner_result_json_text: '{"nextWaterDate":"2026-08-30"}'
    }
  ]
  const read = await service.readWateringReminder('wx_owner', 7)
  assert.equal(read.statusCode, 200)
  assert.deepEqual(read.data.wateringEvents, [])
  assert.deepEqual(read.data.persistedWateringEvents, persistedWateringEvents)
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('watering reminder completion tests passed')
