import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createDiagnosisRecentWeatherReader
} = require('../../cloudfunctions/weather-http/services/recent-weather-diagnosis-reader.js')

const readRecentWeatherForDiagnosis = createDiagnosisRecentWeatherReader({
  async readRecentWeather() {
    return null
  },
  async rebuildRecentWeatherFromArchives() {
    throw new Error('diagnosis miss should not rebuild by default')
  }
})

const missing = await readRecentWeatherForDiagnosis({
  locationKey: 'city:shanghai',
  plantId: 101,
  careLocationId: 'pcl_1',
  source: 'manual_selected',
  diagnosisDate: '2026-06-18'
})

assert.equal(missing.weatherEvidenceInsufficient, true)
assert.equal(missing.locationKey, 'city:shanghai')
assert.equal(missing.plantId, 101)
assert.equal(missing.careLocationId, 'pcl_1')
assert.equal(missing.source, 'manual_selected')
assert.equal(missing.meta.plantId, 101)
assert.equal(missing.meta.careLocationId, 'pcl_1')
assert.equal(missing.meta.source, 'manual_selected')
assert.equal(missing.meta.reason, 'recent_10d_rebuild_deferred')

console.log('diagnosis-weather-care-location tests passed')
