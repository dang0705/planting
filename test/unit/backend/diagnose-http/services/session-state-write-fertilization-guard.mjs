import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params) => {
          sqlCalls.push({ sql, params })
          return { data: { executeResultList: [] } }
        }
      }
    }
  }
  if (request === '../repositories/diagnosis-session-repository') {
    return { upsertDiagnosisSessionRecord: async () => ({}) }
  }
  if (request === '/opt/utils/fertilization-reminder-planner') {
    return require('../../../../../cloudfunctions/layer/utils/fertilization-reminder-planner.js')
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  _test
} = require('../../../../../cloudfunctions/diagnose-http/services/session-state-write-service.js')
Module._load = originalLoad

const mutation = await _test.persistDiagnosisFertilizationGuard({
  sessionId: 'diagnosis-guard-1',
  openid: 'openid-1',
  plantContext: { userPlantId: 7, diagnosisDate: '2026-08-17' },
  response: {
    outcomeType: 'problematic',
    finalResult: { problemId: 'problem_overwatering_root_pressure' }
  }
})

assert.equal(mutation.guard.reasonCode, 'root_stress')
assert.equal(mutation.guard.expiresAt, '2026-08-24')
assert.equal(sqlCalls.length, 1)
assert.equal(sqlCalls[0].params.userPlantId, 7)
assert.equal(JSON.parse(sqlCalls[0].params.guardJson).sourceDiagnosisId, 'diagnosis-guard-1')

sqlCalls.length = 0
const ignored = await _test.persistDiagnosisFertilizationGuard({
  sessionId: 'diagnosis-warning-1',
  openid: 'openid-1',
  plantContext: { userPlantId: 7, diagnosisDate: '2026-08-17' },
  response: {
    outcomeType: 'problematic',
    finalResult: { problemId: 'problem_repot_stress' }
  }
})
assert.equal(ignored, null)
assert.equal(sqlCalls.length, 0)

console.log('diagnosis fertilization guard persistence tests passed')
