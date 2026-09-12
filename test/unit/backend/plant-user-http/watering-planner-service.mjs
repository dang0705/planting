'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

Module._load = function loadPlannerServiceDependencies(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async () => ({
          data: {
            executeResultList: [
              {
                planner_result_json_text: JSON.stringify({ confirmedWateredDate: '2026-08-09' })
              }
            ]
          }
        })
      }
    }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return { getPlantCatalogById: async () => null }
  }
  if (request === '/opt/utils/weather-day-file-reader') {
    return { injectD0IntoForecastDays: async value => value }
  }
  if (request === '/opt/utils/watering-planner') {
    return { buildWateringPlanner: () => null, normalizeCareBehaviorTimeline: value => value }
  }
  if (request === '/opt/utils/transpiration') {
    return { computeTranspirationIntervalFactor: () => null, resolveShadowModeFromEnv: () => false }
  }
  if (request === '/opt/utils/air-environment-evidence') {
    return { resolveAirEnvironmentEvidence: () => null }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  resolveConfirmedWateringEvents
} = require('../../../../cloudfunctions/plant-user-http/watering-planner-service.js')
Module._load = originalLoad

const confirmedEvents = await resolveConfirmedWateringEvents({
  openid: 'openid-1',
  catalogPlantId: 'plant-1',
  wateringEvents: []
})
assert.deepEqual(confirmedEvents, [{ date: '2026-08-09', watered: true, amount: 'normal' }])

const explicitEvents = await resolveConfirmedWateringEvents({
  openid: 'openid-1',
  catalogPlantId: 'plant-1',
  wateringEvents: [{ date: '2026-08-08', watered: true, amount: 'small' }]
})
assert.deepEqual(explicitEvents, [{ date: '2026-08-08', watered: true, amount: 'small' }])

console.log('watering planner confirmed-history tests passed')
