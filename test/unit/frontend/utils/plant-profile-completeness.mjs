import assert from 'node:assert/strict'

const { getPlantProfileCompletenessDetail, calcPlantProfileCompleteness } =
  await import('../../../../src/utils/plant-profile-completeness.js')

const completePlant = {
  canonicalName: '绿萝',
  plantDate: '2026-06-23',
  careLocation: {
    locationKey: 'shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737
  },
  lightEnvironment: {
    facing: 'south',
    windowType: 'standard',
    position: 'window_side',
    hasDirectSun: true,
    distance: 1
  },
  airEnvironment: {
    airExchange: {
      source: 'window',
      windowDirectionCount: 'one',
      windowOpenFrequency: 'daily'
    },
    canopyOpenness: 'open',
    deviceAirflow: {
      mode: 'none',
      sources: [],
      directSources: [],
      sourceModes: {}
    }
  },
  potProfile: {
    potTopDiameterCm: 18,
    potHeightCm: 16,
    substrateType: 'general',
    hasDrainageHole: true
  }
}

const completeDetail = getPlantProfileCompletenessDetail(completePlant)
assert.equal(completeDetail.score, 100)
assert.equal(completeDetail.requiredMissing, false)
assert.equal(calcPlantProfileCompleteness(completePlant), 100)

const cityMissing = getPlantProfileCompletenessDetail({
  canonicalName: '绿萝',
  plantDate: '2026-06-23',
  lightEnvironment: completePlant.lightEnvironment
})
assert.equal(cityMissing.score, 25)
assert.equal(cityMissing.requiredMissing, true)
assert.equal(cityMissing.items.lightEnvironment.optional, true)

const optionalLightMissing = getPlantProfileCompletenessDetail({
  canonicalName: '绿萝',
  plantDate: '2026-06-23',
  careLocation: completePlant.careLocation
})
assert.equal(optionalLightMissing.score, 60)
assert.equal(optionalLightMissing.requiredMissing, false)

const invalidLight = getPlantProfileCompletenessDetail({
  ...completePlant,
  lightEnvironment: {
    facing: 'invalid-facing',
    windowType: '',
    position: ''
  }
})
assert.equal(invalidLight.score, 90)
assert.equal(invalidLight.items.lightEnvironment.satisfied, false)
assert.equal('location' in invalidLight.items, false)

const emptyDetail = getPlantProfileCompletenessDetail({
  canonicalName: '',
  plantDate: '',
  careLocation: null,
  lightEnvironment: null
})
assert.equal(emptyDetail.score, 0)
assert.ok(completeDetail.score >= 0 && completeDetail.score <= 100)

console.log('plant profile completeness tests passed')
