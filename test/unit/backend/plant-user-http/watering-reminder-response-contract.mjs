/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(
  repoRoot,
  'cloudfunctions/plant-user-http/watering-reminder-service.js'
)
const originalLoad = Module._load

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models: {} }
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
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const service = require(sourcePath)
  const reminder = service._test.mapReminderRow({
    id: 5,
    user_plant_id: 9,
    next_time: '2026-08-28 09:00:00',
    planner_result_json: '{}',
    watering_events_json: '[]',
    calendar_payload_json: '{}'
  })

  assert.equal(reminder.nextTime, '2026-08-28T09:00:00')
  assert.equal(reminder.nextWaterTime, '09:00:00')
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('watering reminder response contract: passed')
