import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  computeLightExposure,
  normalizeLightProfile,
  normalizeUserLightContext
} = require('../../../../../cloudfunctions/layer/utils/light-exposure.js')

const environment = (
  naturalLightType,
  entryMethod = 'through_glass',
  hasSupplementalLight = false
) => ({
  schemaVersion: 2,
  naturalLightType,
  entryMethod: naturalLightType === 'almost_none' ? null : entryMethod,
  hasSupplementalLight,
  captureSource: 'user'
})
const calculate = (naturalLightType, entryMethod, weatherLightFactor = 1) =>
  computeLightExposure({
    userLightContext: environment(naturalLightType, entryMethod),
    weatherLightFactor,
    weatherLightConfidence: 'high'
  })

const expectedClear = {
  direct: { through_glass: 0.9, open_environment: 1 },
  bright_diffuse: { through_glass: 0.585, open_environment: 0.65 },
  weak_diffuse: { through_glass: 0.315, open_environment: 0.35 },
  almost_none: { through_glass: 0.1, open_environment: 0.1 }
}
for (const [naturalLightType, entryValues] of Object.entries(expectedClear)) {
  for (const [entryMethod, expected] of Object.entries(entryValues)) {
    const result = calculate(naturalLightType, entryMethod)
    assert.equal(result.estimatedExposureIndex, expected)
    assert.equal(result.formulaVersion, 'light_exposure_v2')
    assert.equal(result.calculationMode, 'categorical')
    assert.equal(result.confidence, 'medium')
  }
}

for (const entryMethod of ['through_glass', 'open_environment']) {
  const indices = ['direct', 'bright_diffuse', 'weak_diffuse', 'almost_none'].map(
    type => calculate(type, entryMethod, 0.4).estimatedExposureIndex
  )
  assert.ok(indices[0] >= indices[1])
  assert.ok(indices[1] >= indices[2])
  assert.ok(indices[2] >= indices[3])
}

assert.equal(calculate('direct', 'through_glass', 0.4).evidence.weatherModifier, 0.67)
assert.equal(calculate('bright_diffuse', 'through_glass', 0.4).evidence.weatherModifier, 0.85)
assert.equal(calculate('weak_diffuse', 'through_glass', 0.4).evidence.weatherModifier, 0.91)
assert.equal(calculate('almost_none', 'through_glass', 0.4).evidence.weatherModifier, 1)
assert.equal(calculate('direct', 'through_glass', 1).evidence.entryModifier, 0.9)

const missingWeather = computeLightExposure({
  userLightContext: environment('direct')
})
assert.equal(missingWeather.evidence.weatherLightFactor, 1)
assert.equal(missingWeather.confidence, 'low')

const withLamp = computeLightExposure({
  userLightContext: environment('bright_diffuse', 'through_glass', true),
  weatherLightFactor: 0.6,
  uvFactor: 0.2
})
const withoutLamp = computeLightExposure({
  userLightContext: environment('bright_diffuse', 'through_glass', false),
  weatherLightFactor: 0.6,
  uvFactor: 2
})
assert.equal(withLamp.estimatedExposureIndex, withoutLamp.estimatedExposureIndex)
assert.equal(withLamp.evidence.hasSupplementalLight, true)

const migrated = computeLightExposure({
  userLightContext: {
    facing: 'south',
    windowType: 'standard',
    position: 'window_side',
    hasDirectSun: true,
    distance: 0.5
  },
  weatherLightFactor: 1
})
assert.equal(migrated.evidence.naturalLightType, 'direct')
assert.equal(migrated.evidence.captureSource, 'migrated_v1')
assert.equal(migrated.confidence, 'low')

assert.deepEqual(
  normalizeLightProfile({ sunning: { way: '全日照/半日照', freq: [5, 7] } }).requirementRange,
  [0.65, 0.95]
)
assert.deepEqual(
  normalizeLightProfile({ sunning: { way: '耐阴', freq: [1, 2] } }).requirementRange,
  [0.25, 0.55]
)
assert.deepEqual(
  normalizeLightProfile({ sunning: { way: '', freq: [6, 8] } }).requirementRange,
  [0.8, 1]
)
assert.deepEqual(
  normalizeLightProfile({
    sunning: { way: '明亮散射光', freq: [4, 6] },
    season: 'winter'
  }).requirementRange,
  normalizeLightProfile({
    sunning: { way: '明亮散射光', freq: [4, 6] },
    season: 'summer'
  }).requirementRange
)

assert.equal(normalizeUserLightContext({}).hasMeaningfulInput, false)
assert.equal(
  normalizeUserLightContext({
    schemaVersion: 2,
    naturalLightType: 'almost_none',
    entryMethod: 'open_environment',
    captureSource: 'user'
  }).entryMethod,
  null
)

const productionSource = [
  fs.readFileSync('cloudfunctions/layer/utils/light-exposure.js', 'utf8'),
  fs.readFileSync('cloudfunctions/layer/utils/light-exposure-factors.js', 'utf8')
].join('\n')
assert.doesNotMatch(productionSource, /north\s*:\s*\{[^}]*factor/)
assert.doesNotMatch(productionSource, /indoorEqHours|directSunExposureHours/)

console.log('light exposure V2 tests passed')
