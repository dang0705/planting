'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const HistoryError =
  require('../../../../cloudfunctions/layer/utils/fertilization-history.js').FertilizationHistoryUnavailableError
const planner = require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async sql => {
          if (sql.includes('user_fertilization_reminder_events')) {
            return { data: { executeResultList: [] } }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      getUserPlantInstanceById: async () => ({
        id: 7,
        genus: 'Test',
        fertilizationHistoryStatus: 'unavailable',
        fertilizationMonthly: { available: true, rows: [] }
      })
    }
  }
  if (request === '/opt/utils/fertilization-history') {
    return {
      FertilizationHistoryUnavailableError: HistoryError,
      getUserPlantFertilizationEvents: async () => {
        throw new HistoryError(new Error('table unavailable'))
      },
      insertFertilizationEvent: async () => null
    }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return planner
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  readFertilizationReminder,
  previewFertilizationReminder
} = require('../../../../cloudfunctions/plant-user-http/fertilization-reminder-service.js')
Module._load = originalLoad

const readResult = await readFertilizationReminder('openid-1', 7)
assert.equal(readResult.statusCode, 200)
assert.equal(readResult.data.active, false)
assert.equal(readResult.data.currentMonthConclusion.status, 'monthly_history_unavailable')
assert.deepEqual(readResult.data.currentMonthOptions, [])

const result = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid'
})

assert.equal(result.statusCode, 503)
assert.equal(result.data, null)
assert.match(result.message, /暂时无法读取/u)

console.log('fertilization reminder history unavailable tests passed')
