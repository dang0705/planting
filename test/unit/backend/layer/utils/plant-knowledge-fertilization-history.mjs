import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getUserPlantFertilizationEvents,
  getUserPlantFertilizationHistory,
  getUserAssertedFertilizationBaseline,
  FertilizationHistoryUnavailableError,
  insertFertilizationEvent,
  mapFertilizationEventRow
} = require('../../../../../cloudfunctions/layer/utils/fertilization-history.js')

const sqlCalls = []
const models = {
  $runSQL: async (sql, params) => {
    sqlCalls.push({ sql, params })
    if (sql.includes('SELECT')) {
      return {
        data: {
          executeResultList: [
            {
              id: 4,
              event_date: '2026-08-11',
              fertilizer_type: 'liquid',
              amount_value: null,
              amount_unit: null,
              source: 'reminder_complete',
              plan_id: 'plan-1',
              created_at: '2026-08-11 09:00:00'
            }
          ]
        }
      }
    }
    return { data: { executeResultList: [] } }
  }
}

const events = await getUserPlantFertilizationEvents(models, 'openid-1', 7, 20)
assert.deepEqual(events[0], {
  id: 4,
  date: '2026-08-11',
  fertilized: true,
  fertilizerType: 'liquid',
  amount: null,
  amountUnit: null,
  source: 'reminder_complete',
  planId: 'plan-1',
  createdAt: '2026-08-11 09:00:00'
})

const inserted = await insertFertilizationEvent(models, 'openid-1', 7, {
  date: '2026-08-11',
  fertilizerType: 'liquid',
  source: 'reminder_complete',
  planId: 'plan-1'
})
assert.equal(inserted.amountValue, null)
assert.equal(inserted.amountUnit, null)
assert.equal(sqlCalls.filter(call => call.sql.includes('INSERT INTO')).length, 1)
assert.match(sqlCalls.at(-1).sql, /ON DUPLICATE KEY UPDATE id = id/u)

assert.equal(mapFertilizationEventRow({ event_date: 'bad-date' }).date, '')
assert.equal(
  mapFertilizationEventRow({ event_date: '2026-08-11', fertilizer_type: 'unknown' }).fertilizerType,
  ''
)

await assert.rejects(
  getUserPlantFertilizationEvents(
    {
      $runSQL: async () => {
        throw new Error('history table unavailable')
      }
    },
    'openid-1',
    7
  ),
  error => error instanceof FertilizationHistoryUnavailableError
)

const assertedOnlyModels = {
  $runSQL: async sql => {
    if (sql.includes('user_fertilization_events')) {
      return { data: { executeResultList: [] } }
    }
    return {
      data: {
        executeResultList: [
          {
            id: 8,
            user_plant_id: 7,
            plan_id: 'plan-asserted',
            fertilizer_type: 'liquid',
            last_applied_date: '2026-08-01',
            last_date_source: 'user_asserted',
            created_at: '2026-08-12 09:00:00'
          }
        ]
      }
    }
  }
}
const assertedBaseline = await getUserAssertedFertilizationBaseline(
  assertedOnlyModels,
  'openid-1',
  7
)
assert.equal(assertedBaseline.source, 'user_asserted')
assert.equal(assertedBaseline.fertilized, false)
assert.equal(assertedBaseline.date, '2026-08-01')
const persistedHistory = await getUserPlantFertilizationHistory(assertedOnlyModels, 'openid-1', 7)
assert.equal(persistedHistory[0].source, 'user_asserted')

const realEventWinsModels = {
  $runSQL: async sql => {
    if (sql.includes('user_fertilization_events')) {
      return {
        data: {
          executeResultList: [
            {
              id: 9,
              event_date: '2026-08-15',
              fertilizer_type: 'slowRelease',
              source: 'reminder_complete'
            }
          ]
        }
      }
    }
    throw new Error('asserted baseline query must not run when a real event exists')
  }
}
const realHistory = await getUserPlantFertilizationHistory(realEventWinsModels, 'openid-1', 7)
assert.equal(realHistory[0].source, 'reminder_complete')

console.log('fertilization history tests passed')
