import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  fuseWateringPlanWithSoilEvidence,
  normalizeSoilVisualEvidence
} = require('../../../../../cloudfunctions/layer/utils/watering-soil-visual.js')

const basePlan = {
  nextWaterDate: '2026-09-14',
  nextWaterWindow: [2, 3],
  nextWaterReason: '按常规节奏检查盆土。',
  wateringContext: 'baseline',
  action: 'follow_baseline_or_check_soil',
  amountRangeMl: [200, 260],
  soilCheck: { required: true, beforeWatering: true, message: '先检查盆土。' },
  reasonCodes: ['BASELINE_INTERVAL']
}

const analyzedAt = new Date().toISOString()
const wet = fuseWateringPlanWithSoilEvidence(basePlan, {
  accepted: true,
  surfaceState: 'wet',
  standingWater: 'no',
  visibility: 'clear',
  confidence: 0.92,
  analyzedAt
})
assert.equal(wet.wateringContext, 'likely_too_wet')
assert.deepEqual(wet.amountRangeMl, basePlan.amountRangeMl)
assert.equal(wet.nextWaterDate, basePlan.nextWaterDate)
assert.equal(wet.visualSoilEvidence.outcome, 'wet_hold')

const moist = fuseWateringPlanWithSoilEvidence(basePlan, {
  accepted: true,
  surfaceState: 'moist',
  standingWater: 'no',
  visibility: 'clear',
  confidence: 0.95,
  analyzedAt
})
assert.equal(moist.visualSoilEvidence.outcome, 'moist_visible')
assert.equal(moist.visualSoilEvidence.surfaceState, 'moist')
assert.equal(moist.requiresManualSoilConfirmation, true)
assert.equal(moist.wateringContext, basePlan.wateringContext)
assert.equal(moist.action, basePlan.action)

const forcedWet = fuseWateringPlanWithSoilEvidence(
  basePlan,
  {
    accepted: true,
    surfaceState: 'wet',
    standingWater: 'no',
    visibility: 'clear',
    confidence: 0.92,
    analyzedAt
  },
  { forceVisualWetness: true }
)
assert.deepEqual(forcedWet.amountRangeMl, basePlan.amountRangeMl)
assert.equal(forcedWet.action, basePlan.action)
assert.equal(forcedWet.visualSoilEvidence.outcome, 'wet_forced')

const manualWet = fuseWateringPlanWithSoilEvidence(
  basePlan,
  { accepted: true, surfaceState: 'uncertain', visibility: 'clear', confidence: 0.8, analyzedAt },
  { manualSoilState: 'wet' }
)
assert.equal(manualWet.wateringContext, 'likely_too_wet')
assert.deepEqual(manualWet.amountRangeMl, basePlan.amountRangeMl)
assert.equal(manualWet.nextWaterDate, basePlan.nextWaterDate)
assert.equal(manualWet.visualSoilEvidence.outcome, 'manual_wet_hold')

const forcedAlgorithmWet = fuseWateringPlanWithSoilEvidence(
  { ...basePlan, wateringContext: 'likely_too_wet', nextWaterDate: null },
  {
    accepted: true,
    surfaceState: 'wet',
    standingWater: 'no',
    visibility: 'clear',
    confidence: 0.92,
    analyzedAt
  },
  { forceVisualWetness: true }
)
assert.deepEqual(forcedAlgorithmWet.amountRangeMl, basePlan.amountRangeMl)
assert.equal(forcedAlgorithmWet.visualSoilEvidence.outcome, 'algorithm_wet_protected')

const trustedDry = fuseWateringPlanWithSoilEvidence(
  { ...basePlan, wateringContext: 'likely_too_dry', amountRangeMl: [200, 260] },
  {
    accepted: true,
    surfaceState: 'dry',
    standingWater: 'no',
    visibility: 'clear',
    confidence: 0.92,
    analyzedAt
  },
  { forceDryness: true }
)
assert.deepEqual(trustedDry.amountRangeMl, [200, 260])
assert.equal(trustedDry.soilCheck.required, false)
assert.equal(trustedDry.visualSoilEvidence.outcome, 'dry_trusted')

const dry = fuseWateringPlanWithSoilEvidence(basePlan, {
  accepted: true,
  surfaceState: 'dry',
  standingWater: 'no',
  visibility: 'clear',
  confidence: 0.84,
  analyzedAt
})
assert.equal(dry.nextWaterDate, basePlan.nextWaterDate)
assert.deepEqual(dry.amountRangeMl, basePlan.amountRangeMl)
assert.equal(dry.requiresManualSoilConfirmation, true)

const protectedWet = fuseWateringPlanWithSoilEvidence(
  { ...basePlan, wateringContext: 'likely_too_wet', nextWaterDate: null },
  {
    accepted: true,
    surfaceState: 'dry',
    standingWater: 'no',
    visibility: 'clear',
    confidence: 0.9,
    analyzedAt
  }
)
assert.equal(protectedWet.wateringContext, 'likely_too_wet')
assert.deepEqual(protectedWet.amountRangeMl, basePlan.amountRangeMl)
assert.equal(protectedWet.visualSoilEvidence.outcome, 'algorithm_wet_protected')

const expired = normalizeSoilVisualEvidence({
  accepted: true,
  surfaceState: 'wet',
  standingWater: 'no',
  visibility: 'clear',
  confidence: 0.95,
  analyzedAt: '2026-01-01T00:00:00.000Z'
})
assert.equal(expired.fresh, false)
assert.equal(expired.trusted, false)

console.log('watering soil visual fusion tests passed')
