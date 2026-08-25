'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
let latestHistory = []
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
      getUserPlantFertilizationHistory: async () => latestHistory,
      insertFertilizationEvent: async () => ({})
    }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  cancelFertilizationReminder,
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

const assertedResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid',
  userAssertedLastAppliedDate: '2026-08-01'
})
assert.equal(assertedResult.statusCode, 200)
assert.equal(assertedResult.data.reminderKind, 'normal')
assert.equal(assertedResult.data.lastDateSource, 'user_asserted')
assert.equal(assertedResult.data.lastAppliedDate, '2026-08-01')
const assertedInsertCall = sqlCalls.filter(call => call.sql.includes('INSERT INTO')).at(-1)
assert.equal(assertedInsertCall.params.lastAppliedDate, '2026-08-01')
assert.equal(assertedInsertCall.params.lastDateSource, 'user_asserted')
assert.match(assertedInsertCall.sql, /last_applied_date/u)

latestHistory = [
  {
    date: '2026-08-01',
    fertilizerType: 'liquid',
    source: 'user_asserted',
    isUserAsserted: true
  }
]
const assertedTypeChangeResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'slowRelease'
})
assert.equal(assertedTypeChangeResult.statusCode, 200)
assert.equal(assertedTypeChangeResult.data.lastDateSource, 'user_asserted')
assert.equal(assertedTypeChangeResult.data.ruleSnapshot.historyLastFertilizerType, '')

latestHistory = [
  {
    date: '2026-08-01',
    fertilizerType: 'liquid',
    source: 'reminder_complete'
  }
]
const recordedTypeChangeResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'slowRelease'
})
assert.equal(recordedTypeChangeResult.statusCode, 409)
assert.equal(recordedTypeChangeResult.data.latestFertilizerType, 'liquid')
assert.equal(recordedTypeChangeResult.data.selectedFertilizerType, 'slowRelease')

const invalidAssertedResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid',
  userAssertedLastAppliedDate: 'not-a-date'
})
assert.equal(invalidAssertedResult.statusCode, 400)

plant.fertilizationMonthly.rows[0] = {
  month: new Date().getMonth() + 1,
  liquid: {
    displayText: '暂停施肥',
    sourceNames: ['RHS'],
    schedule: {
      schemaVersion: 1,
      kind: 'interval',
      interval: {
        min: { value: 2, unit: 'week' },
        max: { value: 2, unit: 'week' }
      }
    }
  },
  slowRelease: {
    displayText: '暂停追加',
    sourceNames: ['RHS'],
    schedule: {
      schemaVersion: 1,
      kind: 'interval',
      interval: {
        min: { value: 3, unit: 'month' },
        max: { value: 3, unit: 'month' }
      }
    }
  }
}
latestHistory = []
const pausedLiquidResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid'
})
const pausedSlowReleaseResult = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'slowRelease'
})
assert.equal(pausedLiquidResult.statusCode, 422)
assert.equal(pausedLiquidResult.data.blockingReason, 'monthly_pause')
assert.equal(pausedSlowReleaseResult.statusCode, 422)
assert.equal(pausedSlowReleaseResult.data.blockingReason, 'monthly_pause')

const cancelActiveResult = await cancelFertilizationReminder('openid-1', {
  plantId: 7,
  planId: 'active-plan-7',
  reason: 'calendar_deleted'
})
assert.equal(cancelActiveResult.statusCode, 200)
assert.equal(cancelActiveResult.data.status, 'cancelled')
assert.equal(cancelActiveResult.data.plantId, 7)
const cancelActiveSql = sqlCalls.at(-1)
assert.match(cancelActiveSql.sql, /user_plant_id = \{\{plantId\}\}/u)
assert.match(cancelActiveSql.sql, /status = \{\{status\}\}/u)
assert.equal(cancelActiveSql.params.status, 'active')

console.log('fertilization reminder service tests passed')
