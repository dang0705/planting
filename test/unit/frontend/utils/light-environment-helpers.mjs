import assert from 'node:assert/strict'

const {
  createDefaultLightEnvironment,
  describeLightEnvironment,
  getLightEnvironmentSignature,
  hasMeaningfulLightEnvironment,
  isUserConfirmedLightEnvironment,
  markLightEnvironmentAsUser,
  migrateLegacyLightEnvironment,
  normalizeOptionalLightEnvironment,
  sanitizeLightEnvironment
} = await import('../../../../src/utils/light-environment.js')

const empty = createDefaultLightEnvironment()
assert.equal(empty.schemaVersion, 2)
assert.equal(empty.naturalLightType, '')
assert.equal(hasMeaningfulLightEnvironment(empty), false)
assert.equal(normalizeOptionalLightEnvironment(empty), null)

const direct = sanitizeLightEnvironment({
  schemaVersion: 2,
  naturalLightType: 'direct',
  entryMethod: 'through_glass',
  hasSupplementalLight: true,
  captureSource: 'user'
})
assert.deepEqual(direct, {
  schemaVersion: 2,
  naturalLightType: 'direct',
  entryMethod: 'through_glass',
  hasSupplementalLight: true,
  captureSource: 'user'
})
assert.equal(isUserConfirmedLightEnvironment(direct), true)
assert.match(describeLightEnvironment(direct), /直射光/)
assert.match(describeLightEnvironment(direct), /已记录补光灯/)

const almostNone = sanitizeLightEnvironment({
  ...direct,
  naturalLightType: 'almost_none',
  entryMethod: 'open_environment'
})
assert.equal(almostNone.entryMethod, null)
assert.equal(almostNone.hasSupplementalLight, true)

const migratedDirect = migrateLegacyLightEnvironment({
  facing: 'south',
  windowType: 'standard',
  position: 'window_side',
  hasDirectSun: true,
  distance: 0.5
})
assert.equal(migratedDirect.naturalLightType, 'direct')
assert.equal(migratedDirect.captureSource, 'migrated_v1')
assert.equal(isUserConfirmedLightEnvironment(migratedDirect), false)

assert.deepEqual(
  migrateLegacyLightEnvironment({
    facing: 'balcony',
    windowType: 'standard',
    position: 'middle',
    hasDirectSun: false
  }),
  {
    schemaVersion: 2,
    naturalLightType: 'weak_diffuse',
    entryMethod: 'open_environment',
    hasSupplementalLight: false,
    captureSource: 'migrated_v1'
  }
)

const migratedGrowLight = migrateLegacyLightEnvironment({ windowType: 'grow_light' })
assert.equal(migratedGrowLight.naturalLightType, 'almost_none')
assert.equal(migratedGrowLight.entryMethod, null)
assert.equal(migratedGrowLight.hasSupplementalLight, true)

const confirmed = markLightEnvironmentAsUser(migratedGrowLight)
assert.equal(confirmed.captureSource, 'user')
assert.equal(isUserConfirmedLightEnvironment(confirmed), true)
assert.notEqual(
  getLightEnvironmentSignature(confirmed),
  getLightEnvironmentSignature(migratedGrowLight)
)

console.log('light environment V2 helper tests passed')
