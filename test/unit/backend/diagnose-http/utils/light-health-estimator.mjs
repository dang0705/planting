import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  estimateLightHealth
} = require('../../../../../cloudfunctions/diagnose-http/utils/light-health-estimator.js')
const {
  buildEnvironmentCareContextV7
} = require('../../../../../cloudfunctions/diagnose-http/utils/environment-context-v7.js')

const weatherWindow = {
  weatherEvidenceInsufficient: false,
  plantFeatures: {
    weatherLightFactor10d: 1,
    lightConfidence: 'high',
    lightEvidenceInsufficient: false
  },
  historicalDays: [],
  forecastDays: []
}
const brightDiffusePlant = {
  sunning: { way: '明亮散射光', freq: [4, 6], unit: '小时/天' }
}
const userEnvironment = (naturalLightType, entryMethod = 'open_environment') => ({
  schemaVersion: 2,
  naturalLightType,
  entryMethod: naturalLightType === 'almost_none' ? null : entryMethod,
  hasSupplementalLight: false,
  captureSource: 'user'
})

const low = estimateLightHealth({
  plantContext: brightDiffusePlant,
  userLightContext: userEnvironment('almost_none'),
  plantFeatures: weatherWindow.plantFeatures
})
assert.equal(low.lightHealthLevel, '明显不足')
assert.equal(low.lightHealthEvidence.direction, 'low')
assert.ok(low.lightHealthScore < 40)

const suitable = estimateLightHealth({
  plantContext: brightDiffusePlant,
  userLightContext: userEnvironment('bright_diffuse'),
  plantFeatures: weatherWindow.plantFeatures
})
assert.equal(suitable.lightHealthLevel, '适合')
assert.equal(suitable.lightHealthScore, 100)

const strong = estimateLightHealth({
  plantContext: brightDiffusePlant,
  userLightContext: userEnvironment('direct'),
  plantFeatures: weatherWindow.plantFeatures
})
assert.equal(strong.lightHealthLevel, '明显偏强')
assert.equal(strong.lightHealthEvidence.direction, 'strong')

const migrated = estimateLightHealth({
  plantContext: brightDiffusePlant,
  userLightContext: {
    ...userEnvironment('direct'),
    captureSource: 'migrated_v1'
  },
  plantFeatures: weatherWindow.plantFeatures
})
assert.equal(migrated.lightHealthScore, null)
assert.equal(migrated.lightHealthLevel, '待确认')
assert.equal(migrated.lightHealthEvidence.direction, 'unknown')

const missingWeather = estimateLightHealth({
  plantContext: brightDiffusePlant,
  userLightContext: userEnvironment('bright_diffuse'),
  plantFeatures: {
    weatherLightFactor10d: 0.3,
    lightConfidence: 'none',
    lightEvidenceInsufficient: true
  }
})
assert.equal(missingWeather.lightHealthScore, null)
assert.equal(missingWeather.lightHealthLevel, '可能适合')
assert.match(missingWeather.lightHealthReason, /建议重新确认光照环境/)
assert.equal(missingWeather.lightHealthEvidence.exposure.evidence.weatherLightFactor, 1)

const freqFallback = estimateLightHealth({
  plantContext: { sunning: { way: '', freq: [6, 8] } },
  userLightContext: userEnvironment('direct'),
  plantFeatures: weatherWindow.plantFeatures
})
assert.equal(freqFallback.lightHealthScore, null)
assert.equal(freqFallback.lightHealthEvidence.profile.source, 'sunning_freq_fallback')
assert.equal(freqFallback.lightHealthEvidence.profile.confidence, 'low')

const currentWeakRecentStronger = buildEnvironmentCareContextV7({
  plantContext: brightDiffusePlant,
  environmentWeatherWindow: weatherWindow,
  userLightContext: userEnvironment('weak_diffuse'),
  recentLightChange: 'stronger_direct_light'
})
assert.equal(currentWeakRecentStronger.outputs.recentLightChange, 'stronger_direct_light')
assert.ok(
  currentWeakRecentStronger.outputs.lightContext.includes('recent_light_increase_stress')
)
assert.equal(
  currentWeakRecentStronger.outputs.lightHealthEvidence.exposure.evidence.naturalLightType,
  'weak_diffuse'
)

const sameCurrentRecentWeaker = buildEnvironmentCareContextV7({
  plantContext: brightDiffusePlant,
  environmentWeatherWindow: weatherWindow,
  userLightContext: userEnvironment('weak_diffuse'),
  recentLightChange: 'weaker_light'
})
assert.equal(sameCurrentRecentWeaker.outputs.recentLightChange, 'weaker_light')
assert.ok(sameCurrentRecentWeaker.outputs.lightContext.includes('recent_light_decrease'))
assert.equal(
  sameCurrentRecentWeaker.outputs.lightHealthEvidence.exposure.estimatedExposureIndex,
  currentWeakRecentStronger.outputs.lightHealthEvidence.exposure.estimatedExposureIndex
)

console.log('light health estimator V2 tests passed')
