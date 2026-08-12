'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
const plant = {
  id: 7,
  displayName: '测试植物',
  canonicalName: '测试植物',
  genus: 'Test',
  fertilizationMonthly: {
    available: true,
    rows: [
      {
        month: new Date().getMonth() + 1,
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
        slowRelease: null
      }
    ]
  }
}

Module._load = function loadWithCloudbaseStub(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params) => {
          sqlCalls.push({ sql, params })
          if (sql.includes('SELECT') && sql.includes('user_fertilization_reminder_events')) {
            return { data: { executeResultList: [] } }
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
      insertFertilizationEvent: async () => ({})
    }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  previewFertilizationReminder
} = require('../../../../cloudfunctions/plant-user-http/fertilization-reminder-service.js')
Module._load = originalLoad

const result = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid'
})

assert.equal(result.statusCode, 200)
assert.equal(result.data.reminderKind, 'first_confirmation')
assert.equal(result.data.lastAppliedDate, null)
assert.equal(result.data.ruleSnapshot.schedule.interval.min.value, 2)
assert.equal(result.data.ruleSnapshot.sourceNames[0], 'RHS')
const insertCall = sqlCalls.find(call => call.sql.includes('INSERT INTO'))
assert.ok(insertCall)
assert.equal(JSON.parse(insertCall.params.ruleSnapshotJson).schedule.interval.min.value, 2)
assert.equal(JSON.parse(insertCall.params.ruleSnapshotJson).fertilizerType, 'liquid')
assert.match(insertCall.sql, /NULLIF\(\{\{lastAppliedDate\}\}, ''\)/u)
assert.equal(insertCall.params.lastAppliedDate, '')

console.log('fertilization reminder service tests passed')
