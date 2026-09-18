import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveSeasonalIntervalFactor,
  resolveSeason
} = require('../../../../../cloudfunctions/layer/utils/seasonal-watering.js')

assert.equal(resolveSeason('2026-07-01'), 'summer')
assert.equal(resolveSeasonalIntervalFactor({ referenceDate: '2026-07-01' }), 1)
assert.equal(
  resolveSeasonalIntervalFactor({
    referenceDate: '2026-07-01',
    wateringQuantization: {
      seasonalGate: { intervalFactors: { summer: 0.95 } }
    }
  }),
  0.95
)
assert.equal(
  resolveSeasonalIntervalFactor({
    referenceDate: '2026-07-01',
    wateringQuantization: {
      seasonalGate: { intervalFactors: { summer: 0.5 } }
    }
  }),
  0.85
)
console.log('seasonal watering tests passed')
