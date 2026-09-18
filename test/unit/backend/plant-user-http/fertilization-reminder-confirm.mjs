'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
const month = new Date().getMonth() + 1
const pendingRow = {
  id: 21,
  user_plant_id: 7,
  plan_id: 'plan-confirm-21',
  status: 'pending',
  reminder_kind: 'first_confirmation',
  fertilizer_type: 'liquid',
  rule_month: month,
  rule_snapshot_json_text: JSON.stringify({
    reminderKind: 'first_confirmation',
    displayText: '每2–3周1次',
    sourceNames: ['RHS']
  }),
  last_applied_date: null,
  last_date_source: 'estimated',
  next_check_date: '2026-08-28',
  next_time: '2026-08-28 09:00:00',
  completed_date: null,
  calendar_payload_json_text: null,
  expires_at: '2099-01-01 00:00:00',
  created_at: '2026-08-17 09:00:00',
  updated_at: '2026-08-17 09:00:00'
}
let activeRow = null

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params = {}) => {
          sqlCalls.push({ sql, params })
          if (sql.includes('SELECT') && sql.includes('user_fertilization_reminder_events')) {
            if (sql.includes("status IN ('active')")) {
              return { data: { executeResultList: activeRow ? [activeRow] : [] } }
            }
            return { data: { executeResultList: [pendingRow] } }
          }
          if (sql.includes("SET status = 'superseded'")) {
            return { data: { executeResultList: [] } }
          }
          if (sql.includes("SET status = 'active'")) {
            pendingRow.status = 'active'
            pendingRow.calendar_payload_json_text = params.calendarPayloadJson
            pendingRow.expires_at = null
            activeRow = { ...pendingRow }
            return { data: { executeResultList: [] } }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return { getUserPlantInstanceById: async () => ({ id: 7, healthStatus: 'normal' }) }
  }
  if (request === '/opt/utils/fertilization-history') {
    return {
      FertilizationHistoryUnavailableError: class extends Error {},
      getUserPlantFertilizationEvents: async () => [],
      insertFertilizationEvent: async () => ({})
    }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  confirmFertilizationReminder
} = require('../../../../cloudfunctions/plant-user-http/fertilization-reminder-service.js')
Module._load = originalLoad

const result = await confirmFertilizationReminder('openid-1', {
  plantId: 7,
  planId: 'plan-confirm-21',
  calendarPayload: { title: '测试植物施肥提醒', startTime: 1, endTime: 2 }
})

assert.equal(result.statusCode, 200)
assert.equal(result.data.status, 'active')
assert.equal(result.data.calendarPayload.status, 'created')
assert.equal(result.data.calendarPayload.createdBy, 'uni.addPhoneCalendar')
assert.ok(sqlCalls.some(call => /SET status = 'superseded'/u.test(call.sql)))
assert.ok(sqlCalls.some(call => /SET status = 'active'/u.test(call.sql)))
assert.doesNotMatch(
  sqlCalls.find(call => /SET status = 'active'/u.test(call.sql)).sql,
  /CASE\s+WHEN status/u
)

console.log('fertilization reminder confirm tests passed')
