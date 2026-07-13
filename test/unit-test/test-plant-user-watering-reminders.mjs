import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const routeCalls = []

Module._load = function patchedWateringReminderLoad(request, parent, isMain) {
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
        return { openid: 'openid_1' }
      }
    }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      createUserPlantInstance: async () => ({}),
      listUserPlantInstances: async () => ({ list: [], total: 0, page: 1, pageSize: 20 }),
      updateUserPlantInstance: async () => ({}),
      deleteUserPlantInstance: async () => ({}),
      getUserPlantWateringStrategy: async () => null
    }
  }
  if (request === '/opt/utils/watering-planner') {
    return {
      buildWateringPlanner: () => ({}),
      normalizeCareBehaviorTimeline: value => value
    }
  }
  if (request === '/opt/utils/transpiration') {
    return {
      computeTranspirationIntervalFactor: () => ({
        intervalFactor: 1.0,
        computedFactor: 1.0,
        shadow: true,
        evidence: { light: false, weather: false }
      }),
      resolveShadowModeFromEnv: () => true
    }
  }
  if (request.endsWith('/watering-planner-service')) {
    return {
      buildWeatherSummary: () => ({}),
      computeAdhocPlanner: async () => ({ statusCode: 200, data: null, error: null })
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
      readWateringReminder: async (openid, plantId) => {
        routeCalls.push({ type: 'read', openid, plantId })
        return {
          statusCode: 200,
          data: {
            plantId,
            nextWaterDate: '2026-07-08',
            nextTime: '2026-07-08T09:00:00'
          }
        }
      },
      saveWateringReminder: async (openid, body) => {
        routeCalls.push({ type: 'save', openid, body })
        if (body.planId === 'throw_no_table') {
          throw new Error(
            "ER_NO_SUCH_TABLE: Table 'cloud1_dev.user_watering_reminder_events' doesn't exist"
          )
        }
        return {
          statusCode: 200,
          message: '保存成功',
          data: {
            plantId: body.plantId,
            planId: body.planId,
            nextWaterDate: body.nextWaterDate,
            nextTime: body.nextTime
          }
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const app = require('../../cloudfunctions/plant-user-http/app.js')

  const readResponse = await app._test.main({
    path: '/user-plants/watering-reminders',
    method: 'GET',
    query: { plantId: '101' },
    body: {},
    headers: {}
  })
  assert.equal(readResponse.statusCode, 200)
  assert.equal(readResponse.payload.data.plantId, 101)
  assert.deepEqual(routeCalls[0], { type: 'read', openid: 'openid_1', plantId: 101 })

  const saveResponse = await app._test.main({
    path: '/user-plants/watering-reminders',
    method: 'POST',
    query: {},
    headers: {},
    body: {
      plantId: 101,
      planId: 'plan_1',
      nextWaterDate: '2026-07-08',
      nextTime: '2026-07-08T09:00:00',
      calendarPayload: { title: '绿萝浇水提醒' }
    }
  })
  assert.equal(saveResponse.statusCode, 200)
  assert.equal(saveResponse.payload.data.planId, 'plan_1')
  assert.equal(routeCalls[1].type, 'save')
  assert.equal(routeCalls[1].body.calendarPayload.title, '绿萝浇水提醒')

  const failedSaveResponse = await app._test.main({
    path: '/user-plants/watering-reminders',
    method: 'POST',
    query: {},
    headers: {},
    body: {
      plantId: 101,
      planId: 'throw_no_table',
      nextWaterDate: '2026-07-08',
      nextTime: '2026-07-08T09:00:00',
      calendarPayload: { title: '绿萝浇水提醒' }
    }
  })
  assert.equal(failedSaveResponse.statusCode, 500)
  assert.equal(failedSaveResponse.payload.message, '浇水提醒表未就绪或保存失败，请稍后重试')
  assert.equal(failedSaveResponse.payload.data.errorCode, 'WATERING_REMINDER_TABLE_NOT_READY')
  assert.match(failedSaveResponse.payload.data.errorMessage, /user_watering_reminder_events/)
} finally {
  Module._load = originalLoad
}

const serviceSource = fs.readFileSync(
  'cloudfunctions/plant-user-http/watering-reminder-service.js',
  'utf8'
)
assert.match(
  serviceSource,
  /SELECT id FROM user_plant_instances WHERE id = {{plantId}} AND _openid = {{openid}}/
)
assert.match(serviceSource, /UPDATE user_watering_reminder_events[\s\S]+status = 'superseded'/)
assert.match(serviceSource, /INSERT INTO user_watering_reminder_events/)
assert.match(serviceSource, /UPDATE user_plant_instances[\s\S]+last_watered/)
assert.doesNotMatch(serviceSource, /\brepeat\s*:\s*true\b/)

const migration = fs.readFileSync(
  'scripts/sql/ensure-user-watering-reminder-events-table-20260705.sql',
  'utf8'
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS .*user_watering_reminder_events/i)
assert.match(migration, /`cloud1_dev`\.`user_watering_reminder_events`/)
assert.match(migration, /`cloud1-2grufevs395a9d5e`\.`user_watering_reminder_events`/)
assert.doesNotMatch(migration, /\bALTER\b|\bDROP\b|\bTRUNCATE\b|\bDELETE\b/i)
assert.match(migration, /`calendar_payload_json` JSON NULL/)
assert.match(migration, /idx_openid_plant_status_time/)

console.log('plant-user watering reminder route tests passed')
