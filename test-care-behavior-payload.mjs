import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  resolveRuntimeEnvironmentCarePayload
} = require('./cloudfunctions/diagnose-http/app/care-behavior-payload.js')
const {
  buildSyntheticObservedProbeQuestions
} = require('./cloudfunctions/diagnose-http/utils/synthetic-follow-up/builders.js')

const payload = {
  careBehaviorTimeline: {
    referenceDate: '2026-05-27',
    dailyRecords: [
      { date: '2026-05-25', watered: true, wateringAmount: 'normal' },
      { date: '2026-05-26', watered: true, wateringAmount: 'normal' },
      {
        date: '2026-05-27',
        watered: true,
        wateringAmount: 'normal',
        lightEvent: 'direct_sun_exposure'
      }
    ],
    lastFertilizedBucket: '31_60d'
  },
  environmentWeatherWindow: {
    meta: { diagnosisDate: '2026-05-27' },
    historicalDays: Array.from({ length: 10 }, (_, index) => ({
      date: `2026-05-${String(17 + index).padStart(2, '0')}`,
      tempMaxC: 25,
      tempMinC: 20,
      humidity: index < 5 ? 82 : 65,
      precipMm: index < 2 ? 1 : 0,
      textDay: index < 2 ? '小雨' : '多云'
    })),
    forecastDays: Array.from({ length: 15 }, (_, index) => ({
      date: `2026-05-${String(27 + index).padStart(2, '0')}`,
      tempMaxC: 29,
      tempMinC: 21,
      humidity: 60,
      precipMm: 0,
      uvIndex: index < 3 ? 8 : 4,
      textDay: '晴'
    }))
  }
}

const plantContext = {
  watering: { freq: [4, 8] },
  sunning: { way: '明亮散射光' },
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 45,
  humidityMax: 70,
  uvIndexMax: 6
}

const result = resolveRuntimeEnvironmentCarePayload({
  payload,
  sessionState: {},
  plantContext
})

assert.equal(result.careBehaviorTimeline.dailyRecords.length, 3)
assert.equal(result.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
assert.equal(result.environmentCareContext.outputs.fertilizingAction, 'thin_after_due')
assert.equal(result.environmentCareContext.historicalSummary10d.highHumidityDays, 5)
assert.equal(result.environmentCareContext.forecastSummary15d.aboveGenusUvMaxDays, 3)

const restored = resolveRuntimeEnvironmentCarePayload({
  payload: {},
  sessionState: {
    runtimeSnapshot: {
      careBehaviorTimeline: result.careBehaviorTimeline,
      environmentCareContext: result.environmentCareContext
    }
  },
  plantContext
})

assert.equal(restored.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
assert.equal(restored.careBehaviorTimeline.lastFertilizedBucket, '31_60d')

const restoredWithEmptyIncomingTimeline = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-28',
      dailyRecords: [],
      lastFertilizedBucket: 'unknown'
    }
  },
  sessionState: {
    runtimeSnapshot: {
      careBehaviorTimeline: result.careBehaviorTimeline,
      environmentCareContext: result.environmentCareContext
    }
  },
  plantContext
})

assert.equal(restoredWithEmptyIncomingTimeline.careBehaviorTimeline.dailyRecords.length, 3)
assert.equal(restoredWithEmptyIncomingTimeline.careBehaviorTimeline.lastFertilizedBucket, '31_60d')
assert.equal(restoredWithEmptyIncomingTimeline.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

const [timelineQuestion] = buildSyntheticObservedProbeQuestions(
  { symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' },
  { preferredDimensions: ['watering_frequency_context'] }
)

assert.equal(timelineQuestion.uiVariant, 'care_behavior_timeline')
assert.equal(timelineQuestion.targetDimension, 'watering_frequency_context')

console.log('care-behavior-payload tests passed')
