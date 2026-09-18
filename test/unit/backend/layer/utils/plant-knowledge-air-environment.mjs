import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const modulePath = require.resolve('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')

const AIR_INPUT = {
  airExchange: {
    source: 'window',
    windowDirectionCount: 'two_or_more',
    windowOpenFrequency: 'daily'
  },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
}

function loadPlantKnowledge(runSQL) {
  const originalLoad = Module._load
  delete require.cache[modulePath]
  Module._load = function patchedCloudbaseLoad(request, parent, isMain) {
    if (request === '/opt/utils/cloudbase') {
      return { models: { $runSQL: runSQL } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require('../../../../../cloudfunctions/layer/utils/plant-knowledge.js')
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

const currentRow = {
  id: 7,
  plant_id: null,
  plant_identity_id: null,
  session_plant_id: null,
  canonical_name: '绿萝',
  recognized_name: '绿萝',
  nickname: '客厅绿萝',
  location: '客厅',
  air_environment_json_text: null,
  updated_at: '2026-08-07T00:00:00.000Z'
}
const calls = []
const plantKnowledge = loadPlantKnowledge(async (sql, params) => {
  calls.push({ sql, params })
  if (/INSERT INTO user_plant_instances/i.test(sql)) {
    currentRow.air_environment_json_text = params.airEnvironmentJson
    return { data: { executeResultList: [] } }
  }
  if (/SELECT LAST_INSERT_ID/i.test(sql)) {
    return { data: { executeResultList: [{ insertId: 7 }] } }
  }
  if (/UPDATE user_plant_instances/i.test(sql)) {
    if (params.airEnvironmentJson !== undefined) {
      currentRow.air_environment_json_text = params.airEnvironmentJson
    }
    return { data: { executeResultList: [] } }
  }
  if (/FROM user_plant_instances up/i.test(sql)) {
    return { data: { executeResultList: [currentRow] } }
  }
  if (/FROM user_watering_events/i.test(sql)) {
    throw new Error('user_watering_events is not available in this unit fixture')
  }
  throw new Error(`unexpected SQL: ${sql}`)
})

const created = await plantKnowledge.createUserPlantInstance({
  openid: 'openid-air',
  nickname: '客厅绿萝',
  airEnvironment: AIR_INPUT,
  airEnvironmentLocationBinding: { careLocationId: 'location-1', locationKey: 'home-living-room' }
})

const insertCall = calls.find(call => /INSERT INTO user_plant_instances/i.test(call.sql))
assert.ok(insertCall)
assert.match(insertCall.sql, /air_environment_json/)
assert.deepEqual(JSON.parse(insertCall.params.airEnvironmentJson).input, AIR_INPUT)
assert.equal(
  JSON.parse(insertCall.params.airEnvironmentJson).locationBinding.careLocationId,
  'location-1'
)
assert.deepEqual(created.airEnvironment.input, AIR_INPUT)

const updatedInput = {
  ...AIR_INPUT,
  deviceAirflow: {
    mode: 'circulating',
    sources: ['fan'],
    directSources: [],
    sourceModes: { fan: 'circulating' }
  }
}
const updated = await plantKnowledge.updateUserPlantInstance('openid-air', 7, {
  airEnvironment: updatedInput,
  locationBinding: { careLocationId: 'location-1', locationKey: 'home-living-room' }
})
const updateCall = calls.find(
  call => /UPDATE user_plant_instances/i.test(call.sql) && call.params.airEnvironmentJson
)
assert.ok(updateCall)
assert.match(updateCall.sql, /air_environment_json\s*=\s*\{\{airEnvironmentJson\}\}/)
assert.deepEqual(JSON.parse(updateCall.params.airEnvironmentJson).input, updatedInput)
assert.deepEqual(updated.airEnvironment.input, updatedInput)

console.log('user plant air environment main resource persistence tests passed')
