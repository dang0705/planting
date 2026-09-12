'use strict'

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  computeTranspirationIntervalFactor,
  resolveLightFactor,
  resolveWeatherFactor,
  resolveAirFactor,
  applySpeciesConvergence,
  resolveShadowModeFromEnv,
  SHADOW_MODE_DEFAULT,
  FACTOR_MIN,
  FACTOR_MAX
} = require('../../../../../cloudfunctions/layer/utils/transpiration.js')
const {
  computeLightExposure
} = require('../../../../../cloudfunctions/layer/utils/light-exposure.js')

const userEnvironment = (
  naturalLightType,
  {
    entryMethod = 'open_environment',
    captureSource = 'user',
    hasSupplementalLight = false
  } = {}
) => ({
  schemaVersion: 2,
  naturalLightType,
  entryMethod: naturalLightType === 'almost_none' ? null : entryMethod,
  hasSupplementalLight,
  captureSource
})
const weatherEvidence = {
  weatherLightFactor: 1,
  weatherEvidenceInsufficient: false,
  weatherLightConfidence: 'high'
}

assert.equal(SHADOW_MODE_DEFAULT, false)
assert.equal(resolveLightFactor(null), 1)
assert.equal(resolveLightFactor({}), 1)

const strongFactor = resolveLightFactor(
  userEnvironment('direct', { entryMethod: 'open_environment' }),
  [],
  weatherEvidence
)
assert.ok(strongFactor < 1)
assert.ok(1 - strongFactor <= 0.12)

const weakFactor = resolveLightFactor(
  userEnvironment('almost_none'),
  [],
  weatherEvidence
)
assert.ok(weakFactor > 1)
assert.ok(weakFactor - 1 <= 0.12)

const neutralFactor = resolveLightFactor(
  userEnvironment('bright_diffuse'),
  [],
  weatherEvidence
)
assert.equal(neutralFactor, 1)

assert.equal(
  resolveLightFactor(
    userEnvironment('direct', { captureSource: 'migrated_v1' }),
    [],
    weatherEvidence
  ),
  1
)
assert.equal(
  resolveLightFactor(userEnvironment('direct'), [], {
    weatherLightFactor: 0.3,
    weatherEvidenceInsufficient: true
  }),
  1
)

const withoutLamp = resolveLightFactor(userEnvironment('direct'), [], weatherEvidence)
const withLamp = resolveLightFactor(
  userEnvironment('direct', { hasSupplementalLight: true }),
  [],
  weatherEvidence
)
assert.equal(withLamp, withoutLamp)

const exposure = computeLightExposure({
  userLightContext: userEnvironment('direct', { entryMethod: 'through_glass' }),
  weatherLightFactor: 0.6
})
assert.equal(exposure.formulaVersion, 'light_exposure_v2')
assert.equal(exposure.calculationMode, 'categorical')
assert.equal(exposure.estimatedExposureIndex, 0.702)
assert.equal('indoorEqHours' in exposure, false)
assert.equal('uvFactor' in exposure, false)

const transpiration = computeTranspirationIntervalFactor({
  lightEnvironment: userEnvironment('direct'),
  ...weatherEvidence,
  weatherSummary: { hotDryDays: 6, highHumidityDays: 0, coldHumidDays: 0, rainyDays: 0 },
  shadow: false
})
assert.ok(transpiration.intervalFactor < 1)
assert.equal(transpiration.evidence.light, true)

const shadow = computeTranspirationIntervalFactor({
  lightEnvironment: userEnvironment('direct'),
  ...weatherEvidence,
  weatherSummary: { hotDryDays: 6, highHumidityDays: 0, coldHumidDays: 0, rainyDays: 0 },
  shadow: true
})
assert.equal(shadow.intervalFactor, 1)
assert.ok(shadow.computedFactor < 1)

assert.ok(
  resolveWeatherFactor({
    hotDryDays: 6,
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0
  }) < 1
)
assert.ok(
  resolveWeatherFactor({
    hotDryDays: 0,
    highHumidityDays: 6,
    coldHumidDays: 0,
    rainyDays: 0
  }) > 1
)
assert.equal(resolveWeatherFactor(null), 1)

const airFactor = resolveAirFactor({
  air_exchange_level: 'high',
  local_airflow_present: true,
  stagnation_risk: false,
  direct_airflow: false
})
assert.ok(airFactor >= 0.94 && airFactor < 1)
assert.equal(resolveAirFactor(null), 1)

assert.equal(
  applySpeciesConvergence(0.88, {
    wateringQuantization: { dryTolerance: 'high', wetTolerance: 'normal' }
  }),
  0.94
)
assert.equal(
  applySpeciesConvergence(1.12, {
    wateringQuantization: { dryTolerance: 'normal', wetTolerance: 'high' }
  }),
  1.06
)

assert.equal(resolveShadowModeFromEnv({}), false)
assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'false' }), true)
assert.equal(resolveShadowModeFromEnv({ WATERING_TRANSPIRATION_ENABLED: 'true' }), false)
assert.ok(strongFactor >= FACTOR_MIN && strongFactor <= FACTOR_MAX)
assert.ok(weakFactor >= FACTOR_MIN && weakFactor <= FACTOR_MAX)

console.log('transpiration V2 tests passed')
