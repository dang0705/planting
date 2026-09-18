import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const insertedEvents = []
const month = new Date().getMonth() + 1
const plant = {
  id: 7,
  displayName: '补录日期植物',
  genus: 'Test',
  healthStatus: 'unknown',
  fertilizationHistoryStatus: 'empty',
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
        },
        slowRelease: {
          displayText: '约2–3个月1次（容器生长期）',
          sourceNames: ['RHS'],
          schedule: {
            schemaVersion: 1,
            kind: 'interval',
            interval: {
              min: { value: 2, unit: 'month' },
              max: { value: 3, unit: 'month' }
            }
          }
        }
      }
    ]
  }
}

const row = {
  id: 10,
  user_plant_id: 7,
  plan_id: 'plan-user-asserted',
  status: 'active',
  reminder_kind: 'normal',
  fertilizer_type: 'slowRelease',
  rule_month: month,
  rule_snapshot_json_text: JSON.stringify({
    reminderKind: 'normal',
    lastDateSource: 'user_asserted',
    historyLastFertilizerType: '',
    displayText: '约2–3个月1次（容器生长期）',
    schedule: plant.fertilizationMonthly.rows[0].slowRelease.schedule,
    sourceNames: ['RHS']
  }),
  last_applied_date: '2026-08-01',
  last_date_source: 'user_asserted',
  next_check_date: '2026-08-10',
  next_time: '2026-08-10 09:00:00',
  completed_date: null,
  calendar_payload_json_text: null,
  expires_at: null,
  created_at: '2026-08-01 09:00:00',
  updated_at: '2026-08-01 09:00:00'
}

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async sql => {
          if (sql.includes('SELECT') && sql.includes('user_fertilization_reminder_events')) {
            return { data: { executeResultList: [row] } }
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
      getUserPlantFertilizationHistory: async () => [
        {
          date: row.last_applied_date,
          fertilizerType: 'liquid',
          source: 'user_asserted',
          planId: row.plan_id,
          isUserAsserted: true
        }
      ],
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

const result = await completeFertilizationReminder('openid-1', {
  plantId: 7,
  planId: row.plan_id
})

assert.equal(result.statusCode, 200)
assert.equal(insertedEvents.length, 1)
assert.equal(
  insertedEvents[0].date,
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
)
assert.equal(insertedEvents[0].source, 'reminder_complete')

console.log('fertilization reminder user asserted tests passed')
