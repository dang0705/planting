import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getUserPlantFertilizationEvents,
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

console.log('fertilization history tests passed')
