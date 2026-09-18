// data_mode=unit_fake; test_kind=unit_logic.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveAdvancedAirEnvironmentEvidence,
  resolveAirEnvironmentAssessment,
  resolveAirEnvironmentEvidence,
  resolveQuickAirEnvironmentEvidence
} = require('../../../../../cloudfunctions/layer/utils/air-environment-evidence.js')

const advancedInput = {
  airExchange: {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'daily'
  },
  canopyOpenness: 'enclosed',
  deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
}

assert.deepEqual(
  resolveQuickAirEnvironmentEvidence({
    questionKey: 'air_exchange_frequency',
    optionKey: 'rare'
  }),
  {
    evidence: {
      air_exchange_level: 'low',
      local_airflow_present: 'unknown',
      stagnation_risk: 'unknown',
      direct_airflow: null,
      direct_airflow_sources: []
    },
    assessmentLevel: 'initial',
    converterVersion: 'air_environment_v3'
  }
)
assert.equal(resolveQuickAirEnvironmentEvidence({ optionKey: 'other' }), null)
const legacyEvidence = resolveAirEnvironmentEvidence(advancedInput)
const resolvedAdvanced = resolveAdvancedAirEnvironmentEvidence(advancedInput)
assert.deepEqual(resolvedAdvanced.evidence, legacyEvidence)
assert.equal(resolvedAdvanced.assessmentLevel, 'detailed')

assert.deepEqual(
  resolveAirEnvironmentAssessment({
    schemaVersion: 3,
    mode: 'quick',
    quickAnswer: { questionKey: 'air_exchange_frequency', optionKey: 'frequent' },
    advancedInput
  }),
  {
    evidence: {
      air_exchange_level: 'high',
      local_airflow_present: 'unknown',
      stagnation_risk: 'unknown',
      direct_airflow: null,
      direct_airflow_sources: []
    },
    assessmentLevel: 'initial',
    converterVersion: 'air_environment_v3'
  }
)
assert.deepEqual(resolveAirEnvironmentAssessment(advancedInput), resolvedAdvanced)
assert.equal(resolveAirEnvironmentAssessment(null), null)
assert.equal(resolveAirEnvironmentAssessment({ schemaVersion: 3, mode: 'quick' }), null)

console.log('air environment v3 backend dispatcher passed')
