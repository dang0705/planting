import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
const insertedEvents = []

const month = new Date().getMonth() + 1
const plant = {
  id: 7,
  displayName: '测试植物',
  genus: 'Test',
  healthStatus: 'unknown',
  fertilizationMonthly: {
    available: true,
    rows: [
      {
        month,
        liquid: {
          displayText: '每2–3周1次',
          sourceNames: ['RHS'],
          schedule: {
            schemaVersion: 1,
            kind: 'interval',
            interval: {
              min: { value: 2, unit: 'week' },
              max: { value: 3, unit: 'week' }
            }
          }
        }
      }
    ]
  }
}

const activeRow = () => ({
  id: 10,
  user_plant_id: 7,
  plan_id: 'plan-10',
  status: 'active',
  reminder_kind: 'first_confirmation',
  fertilizer_type: 'liquid',
  rule_month: month,
  rule_snapshot_json_text: JSON.stringify({
    reminderKind: 'first_confirmation',
    confirmationReasons: ['first_confirmation'],
    displayText: '每2–3周1次',
    schedule: plant.fertilizationMonthly.rows[0].liquid.schedule,
    sourceNames: ['RHS']
  }),
  last_applied_date: null,
  last_date_source: 'estimated',
  next_check_date: '2026-08-10',
  next_time: '2026-08-10 09:00:00',
  completed_date: null,
  calendar_payload_json_text: null,
  expires_at: null,
  created_at: '2026-08-01 09:00:00',
  updated_at: '2026-08-01 09:00:00'
})

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params) => {
          sqlCalls.push({ sql, params })
          if (sql.includes('SELECT') && sql.includes('user_fertilization_reminder_events')) {
            return { data: { executeResultList: [activeRow()] } }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return { getUserPlantInstanceById: async () => plant }
  }
  if (request === '/opt/utils/fertilization-history') {
    return {
      getUserPlantFertilizationEvents: async () => [],
      insertFertilizationEvent: async (_models, _openid, _plantId, event) => {
        insertedEvents.push(event)
        return event
      }
    }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  completeFertilizationReminder
} = require('../../../../cloudfunctions/plant-user-http/fertilization-reminder-service.js')
Module._load = originalLoad

const blocked = await completeFertilizationReminder('openid-1', { plantId: 7, planId: 'plan-10' })
assert.equal(blocked.statusCode, 409)
assert.equal(blocked.data.requiresExtraConfirmation, true)
assert.equal(insertedEvents.length, 0)

const completed = await completeFertilizationReminder('openid-1', {
  plantId: 7,
  planId: 'plan-10',
  extraConfirmation: true
})
assert.equal(completed.statusCode, 200)
assert.equal(completed.data.completedDate, '2026-08-11')
assert.equal(insertedEvents[0].source, 'reminder_complete')
assert.equal(insertedEvents[0].planId, 'plan-10')
assert.ok(sqlCalls.some(call => /SET status = 'completed'/u.test(call.sql)))

console.log('fertilization reminder history tests passed')
