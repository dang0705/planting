'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const planner = require('../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
const month = new Date().getMonth() + 1
const interval = {
  schemaVersion: 1,
  kind: 'interval',
  interval: {
    min: { value: 2, unit: 'week' },
    max: { value: 3, unit: 'week' }
  }
}

const plant = {
  id: 7,
  displayName: '测试植物',
  genus: 'Test',
  fertilizationHistoryStatus: 'available',
  fertilizationMonthly: {
    available: true,
    rows: [
      {
        month,
        liquid: { displayText: '每2–3周1次', sourceNames: ['RHS'], schedule: interval },
        slowRelease: null
      }
    ]
  }
}

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async sql => {
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
      FertilizationHistoryUnavailableError: class extends Error {},
      getUserPlantFertilizationEvents: async () => [],
      insertFertilizationEvent: async () => ({})
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

const inactive = await readFertilizationReminder('openid-1', 7)
assert.equal(inactive.statusCode, 200)
assert.equal(inactive.data.active, false)
assert.equal(inactive.data.currentMonthOptions[0].type, 'liquid')
assert.equal(inactive.data.currentMonthConclusion.status, 'monthly_fixed_interval')

plant.fertilizationGuard = {
  schemaVersion: 1,
  status: 'deferred',
  reasonCode: 'root_stress',
  source: 'diagnosis',
  sourceDiagnosisId: 'diagnosis-1',
  createdDate: '2098-01-01',
  expiresAt: '2099-01-08'
}

const guarded = await readFertilizationReminder('openid-1', 7)
assert.equal(guarded.data.currentMonthConclusion.status, 'monthly_deferred')
assert.equal(guarded.data.fertilizationGuard.reasonCode, 'root_stress')

const preview = await previewFertilizationReminder('openid-1', {
  plantId: 7,
  fertilizerType: 'liquid'
})
assert.equal(preview.statusCode, 422)
assert.equal(preview.data.blockingReason, 'fertilization_guard')

console.log('fertilization reminder P1 contract tests passed')
