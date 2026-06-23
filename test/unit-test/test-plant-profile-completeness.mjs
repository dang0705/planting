import assert from 'node:assert/strict'

const { getPlantProfileCompletenessDetail, calcPlantProfileCompleteness } =
  await import('../../src/utils/plant-profile-completeness.js')

const completePlant = {
  canonicalName: '绿萝',
  location: '客厅',
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
  }
}

const completeDetail = getPlantProfileCompletenessDetail(completePlant)
assert.equal(completeDetail.score, 100)
assert.equal(completeDetail.requiredMissing, false)
assert.equal(calcPlantProfileCompleteness(completePlant), 100)

const cityMissing = getPlantProfileCompletenessDetail({
  canonicalName: '绿萝',
  location: '客厅',
  plantDate: '2026-06-23'
})
assert.equal(cityMissing.score, 40)
assert.equal(cityMissing.requiredMissing, true)
assert.equal(cityMissing.items.lightEnvironment.optional, true)

console.log('plant profile completeness tests passed')
