import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  normalizeAirEnvironmentInput,
  resolveAirEnvironmentEvidence,
  _test: { normalizeDeviceAirflow }
} = require('../../../../../cloudfunctions/layer/utils/air-environment-evidence.js')

const airExchange = {
  source: 'window',
  windowDirectionCount: 'one',
  windowOpenFrequency: 'daily'
}

const directInput = {
  airExchange,
  canopyOpenness: 'open',
  deviceAirflow: {
    mode: 'direct',
    sources: ['fan', 'air_conditioner'],
    directSources: ['air_conditioner']
  }
}

assert.deepEqual(normalizeDeviceAirflow(directInput.deviceAirflow, airExchange), {
  mode: 'direct',
  sources: ['fan', 'air_conditioner'],
  directSources: ['air_conditioner'],
  sourceModes: { fan: 'circulating', air_conditioner: 'direct' }
})
assert.equal(
  normalizeDeviceAirflow({ ...directInput.deviceAirflow, directSources: [] }, airExchange, {
    requireDirectSource: true
  }),
  null
)
assert.deepEqual(
  normalizeDeviceAirflow(
    { ...directInput.deviceAirflow, directSources: ['air_conditioner', 'fresh_air'] },
    airExchange
  ),
  {
    mode: 'direct',
    sources: ['fan', 'air_conditioner'],
    directSources: ['air_conditioner'],
    sourceModes: { fan: 'circulating', air_conditioner: 'direct' }
  }
)

assert.deepEqual(resolveAirEnvironmentEvidence(directInput), {
  air_exchange_level: 'medium',
  local_airflow_present: true,
  stagnation_risk: false,
  direct_airflow: true,
  direct_airflow_sources: ['air_conditioner']
})

assert.deepEqual(
  normalizeDeviceAirflow(
    {
      mode: 'direct',
      sourceModes: { fan: 'circulating', air_conditioner: 'direct' }
    },
    airExchange,
    { requireDirectSource: true }
  ),
  {
    mode: 'direct',
    sources: ['fan', 'air_conditioner'],
    directSources: ['air_conditioner'],
    sourceModes: { fan: 'circulating', air_conditioner: 'direct' }
  }
)

const legacyInput = normalizeAirEnvironmentInput({
  ...directInput,
  deviceAirflow: { mode: 'direct', sources: ['fan', 'air_conditioner'] }
})
assert.deepEqual(legacyInput.deviceAirflow.directSources, [])
assert.equal(legacyInput.deviceAirflow.sourceModes, null)
assert.equal(
  normalizeAirEnvironmentInput(
    { ...directInput, deviceAirflow: { mode: 'direct', sources: ['fan'] } },
    { requireDirectSource: true }
  ),
  null
)

console.log('air environment evidence direct-source tests passed')
