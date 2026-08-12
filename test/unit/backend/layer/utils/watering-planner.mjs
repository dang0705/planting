import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildWateringPlanner } = require('../../../../../cloudfunctions/layer/utils/watering-planner.js')

const baseInput = {
  wateringStrategy: { freq: [5, 8], way: '见干浇透' },
  historical: {},
  forecast: {},
  behaviorTimeline: { referenceDate: '2026-07-01', watering_events_10d: [] },
  potProfile: {
    potTopDiameterCm: 12,
    potBottomDiameterCm: 8,
    potHeightCm: 10,
    hasDrainageHole: 'true',
    substrateType: 'general'
  },
  referenceDate: '2026-07-01'
}

const baseline = buildWateringPlanner(baseInput)
assert.equal(baseline.nextWaterDate, '2026-07-02')
assert.equal(baseline.seasonalIntervalFactor, 1)
assert.equal(baseline.soilCheck.required, true)
assert.equal(baseline.soilCheck.beforeWatering, true)

const seasonal = buildWateringPlanner({
  ...baseInput,
  wateringQuantization: { seasonalGate: { intervalFactors: { summer: 0.9 } } }
})
assert.equal(seasonal.seasonalIntervalFactor, 0.9)
assert.deepEqual(seasonal.nextWaterWindow, baseline.nextWaterWindow)
assert.deepEqual(seasonal.amountRangeMl, baseline.amountRangeMl)

const wet = buildWateringPlanner({
  ...baseInput,
  historical: { highHumidityDays: 10, maxConsecutiveHighHumidityDays: 10 },
  behaviorTimeline: {
    referenceDate: '2026-07-01',
    watering_events_10d: [
      { date: '2026-06-30', watered: true, amount: 'thorough' },
      { date: '2026-06-29', watered: true, amount: 'thorough' },
      { date: '2026-06-28', watered: true, amount: 'thorough' }
    ]
  },
  wateringQuantization: { seasonalGate: { intervalFactors: { summer: 0.9 } } }
})
assert.equal(wet.wateringContext, 'likely_too_wet')
assert.equal(wet.nextWaterDate, null)
assert.equal(wet.soilCheck.required, true)
console.log('watering planner tests passed')
