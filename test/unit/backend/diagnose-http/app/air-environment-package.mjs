import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load
Module._load = function loadWithLayerAdapter(request, parent, isMain) {
  if (request === '/opt/utils/air-environment-evidence') {
    return require('../../../../../cloudfunctions/layer/utils/air-environment-evidence.js')
  }
  return originalModuleLoad.call(this, request, parent, isMain)
}
const {
  ensurePackageVersionTwo,
  validateAirEnvironmentPackageSidecar
} = require('../../../../../cloudfunctions/diagnose-http/app/air-environment-package.js')
Module._load = originalModuleLoad

const questionKey = 'q_wilting_droop__air_environment'
const snapshot = {
  mode: 'wilting_droop',
  packageVersion: 2,
  packageQuestions: [{ questionKey, packageTopic: 'air_environment', uiVariant: 'air_environment' }]
}
const directInput = {
  airExchange: { source: 'fresh_air' },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'direct', sources: ['fresh_air'] }
}

const recorded = validateAirEnvironmentPackageSidecar({
  questionPackageSnapshot: snapshot,
  answers: [{ questionKey, optionKey: 'air_environment_recorded' }],
  payload: {
    airEnvironmentByQuestionId: { [questionKey]: directInput },
    airEnvironmentSnapshotsByQuestionId: {
      [questionKey]: {
        input: directInput,
        source: 'saved_profile',
        profileUpdatedAt: '2026-08-04T00:00:00.000Z',
        locationBinding: { careLocationId: 'living-room', locationKey: 'window-side' }
      }
    }
  }
})
assert.deepEqual(recorded.byQuestionId, {
  [questionKey]: {
    ...directInput,
    airExchange: { source: 'fresh_air', windowDirectionCount: null, windowOpenFrequency: null }
  }
})
assert.deepEqual(recorded.sourceByQuestionId, { [questionKey]: 'saved_profile' })
assert.deepEqual(
  recorded.routeAnswers.map(item => item.optionKey),
  ['direct_airflow']
)
assert.equal(recorded.evidence[questionKey].air_exchange_level, 'medium')
assert.deepEqual(Object.keys(recorded.evidence[questionKey]).sort(), [
  'air_exchange_level',
  'direct_airflow',
  'local_airflow_present',
  'stagnation_risk'
])

const yellowQuestionKey = 'q_yellow_leaf__air_environment'
const yellow = validateAirEnvironmentPackageSidecar({
  questionPackageSnapshot: {
    mode: 'yellow_leaf',
    packageVersion: 2,
    packageQuestions: [{ questionKey: yellowQuestionKey, packageTopic: 'air_environment' }]
  },
  answers: [{ questionKey: yellowQuestionKey, optionKey: 'air_environment_recorded' }],
  payload: {
    airEnvironmentByQuestionId: { [yellowQuestionKey]: directInput },
    airEnvironmentSnapshotsByQuestionId: {
      [yellowQuestionKey]: {
        input: directInput,
        source: 'temporary',
        profileUpdatedAt: '',
        locationBinding: { careLocationId: '', locationKey: '' }
      }
    }
  }
})
assert.deepEqual(yellow.routeAnswers, [])

const unknown = validateAirEnvironmentPackageSidecar({
  questionPackageSnapshot: snapshot,
  answers: [{ questionKey, optionKey: 'air_environment_unknown' }],
  payload: {}
})
assert.deepEqual(unknown.byQuestionId, {})
assert.deepEqual(unknown.routeAnswers, [])

assert.throws(
  () =>
    validateAirEnvironmentPackageSidecar({
      questionPackageSnapshot: snapshot,
      answers: [{ questionKey, optionKey: 'air_environment_recorded' }],
      payload: {}
    }),
  /空气环境记录不完整/
)
assert.throws(
  () => ensurePackageVersionTwo({ ...snapshot, packageVersion: 1 }),
  error => error?.statusCode === 409
)

console.log('air environment diagnosis package tests passed')
