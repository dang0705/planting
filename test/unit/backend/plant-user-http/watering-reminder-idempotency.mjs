import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(
  repoRoot,
  'cloudfunctions/plant-user-http/watering-reminder-service.js'
)
const migrationPath = path.join(
  repoRoot,
  'scripts/sql/ensure-user-watering-event-idempotency-20260829.sql'
)
const createTablePath = path.join(
  repoRoot,
  'scripts/sql/ensure-user-watering-events-table-20260704.sql'
)
const originalLoad = Module._load
const sqlCalls = []
const nativeCalls = []
let failInsert = false

const models = {
  async $runSQL(sql, params) {
    sqlCalls.push({ sql, params })
    if (sql.includes('SELECT id FROM user_plant_instances')) {
      return { data: { executeResultList: [{ id: params.plantId }] } }
    }
    if (sql.includes('SELECT\n       id,') && sql.includes('user_watering_reminder_events')) {
      return {
        data: {
          executeResultList: [
            {
              id: 11,
              user_plant_id: params.plantId,
              plan_id: 'plan-1',
              reminder_type: 'water',
              status: 'active',
              last_watered: null,
              next_water_date: '2026-08-30',
              next_time: '2026-08-30 09:00:00',
              watering_events_json: '[]',
              planner_result_json: '{}',
              calendar_payload_json: '{}'
            }
          ]
        }
      }
    }
    return { data: { executeResultList: [] } }
  }
}

const fakeConnection = {
  async execute(sql, params) {
    nativeCalls.push({ sql, params })
    if (sql.includes('SELECT id') && sql.includes('FOR UPDATE')) {
      return [[{ id: params[0] }], []]
    }
    if (failInsert && sql.includes('INSERT INTO user_watering_reminder_events')) {
      throw new Error('insert failed')
    }
    return [{ affectedRows: 1 }, []]
  }
}

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models }
    }
    if (request === '/opt/utils/plant-knowledge') {
      return {
        getUserPlantWateringEvents: async () => [],
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
        withNativeTransaction: async handler => {
          nativeCalls.push({ type: 'begin' })
          try {
            const result = await handler(fakeConnection)
            nativeCalls.push({ type: 'commit' })
            return result
          } catch (error) {
            nativeCalls.push({ type: 'rollback' })
            throw error
          }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const service = require(sourcePath)
  await assert.rejects(
    service.saveWateringReminder('wx-owner', {
      plantId: 7,
      wateringEvents: []
    }),
    error =>
      error?.statusCode === 409 &&
      error?.requiresWateringHistory === true &&
      error?.message === '请先填写过往浇水日期'
  )
  assert.equal(nativeCalls.length, 0, '缺少过往浇水日期时不应进入提醒写入事务')

  const success = await service.saveWateringReminder('wx-owner', {
    plantId: 7,
    wateringEvents: [{ date: '2026-08-28', watered: true, amount: 'normal' }],
    nextWaterDate: '2099-01-01',
    nextWaterTime: '09:00',
    planId: 'plan-1',
    plannerResult: { amountRangeMl: [1, 2], nextWaterDate: '2099-01-01' }
  })
  assert.equal(success.statusCode, 200)
  assert.equal(nativeCalls.at(-1)?.type, 'commit')
  assert.equal(nativeCalls.filter(call => call.type === 'rollback').length, 0)
  assert.equal(
    nativeCalls.filter(call => call.sql?.includes('UPDATE user_watering_reminder_events')).length,
    1
  )
  assert.equal(
    nativeCalls.filter(call => call.sql?.includes('INSERT INTO user_watering_reminder_events'))
      .length,
    1
  )
  assert.equal(
    nativeCalls.filter(call => call.sql?.includes('UPDATE user_plant_instances')).length,
    1
  )
  const reminderInsert = nativeCalls.find(call =>
    call.sql?.includes('INSERT INTO user_watering_reminder_events')
  )
  assert.equal(reminderInsert.params[6], '2026-08-30', '保存必须使用服务端重新计算的日期')
  assert.doesNotMatch(JSON.stringify(reminderInsert.params), /2099-01-01/u)

  failInsert = true
  await assert.rejects(
    service.saveWateringReminder('wx-owner', {
      plantId: 7,
      wateringEvents: [{ date: '2026-08-28', watered: true, amount: 'normal' }],
      nextWaterDate: '2026-08-31',
      nextWaterTime: '09:00'
    }),
    /insert failed/
  )
  assert.equal(nativeCalls.at(-1)?.type, 'rollback')

  const migration = fs.readFileSync(migrationPath, 'utf8')
  const createTable = fs.readFileSync(createTablePath, 'utf8')
  assert.doesNotMatch(migration, /DELETE duplicate/u)
  assert.match(migration, /uq_user_plant_watering_event/u)
  assert.match(migration, /event_date`, `source`, `plan_id`/u)
  assert.match(createTable, /UNIQUE KEY `uq_user_plant_watering_event`[\s\S]*plan_id/u)
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('watering reminder transaction and idempotency tests passed')
