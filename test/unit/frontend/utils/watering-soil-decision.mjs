'use strict'

// data_mode=unit_fake; test_kind=logic.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：本轮用户需求：盆土湿度只能呈现一条综合结论和一条浇水建议；
// 独立浇水不展示日期及历史/依据等其他信息。
import assert from 'node:assert/strict'
import { buildWateringSoilDecision } from '../../../../src/utils/watering-soil-decision.js'

const manualWet = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'manual_wet_hold' },
  wateringContext: 'likely_too_wet'
})
assert.deepEqual(manualWet, {
  resultText: '盆土整体偏湿，内部仍有水分。',
  actionText: '本次先不要浇水，等盆土进一步变干后再判断。'
})

const surfaceWet = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'wet_hold', surfaceState: 'wet' },
  wateringContext: 'likely_too_wet',
  wateringAction: 'delay_and_check_soil',
  isIndependent: true
})
assert.deepEqual(surfaceWet, {
  resultText: '土表仍湿，结合近期浇水和当前环境，盆内可能尚未干透。',
  actionText: '本次先不要浇水，等盆土进一步变干后再判断。'
})

const algorithmWet = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'algorithm_wet_protected', surfaceState: 'dry' },
  wateringContext: 'likely_too_wet',
  wateringAction: 'delay_and_check_soil'
})
assert.deepEqual(algorithmWet, {
  resultText: '视觉初判土表偏干，但结合近期浇水和当前环境，盆土可能偏湿。',
  actionText: '本次先不要浇水，等盆土进一步变干后再判断。'
})

const moistVisible = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'moist_visible', surfaceMoist: true },
  soilCheck: { message: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。' },
  wateringContext: 'keep_baseline_or_check_soil',
  wateringAction: 'follow_baseline_or_check_soil'
})
assert.deepEqual(moistVisible, {
  resultText: '视觉初判土表尚可但有湿度，结合近期浇水和当前环境，盆内可能较湿。',
  actionText: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。'
})

const dry = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'dry_trusted' },
  soilCheck: { message: '盆土已按干燥处理，建议尽快浇水。' },
  wateringContext: 'likely_too_dry',
  wateringAction: 'increase_soil_check_frequency'
})
assert.deepEqual(dry, {
  resultText: '视觉初判土表偏干，结合浇水记录和当前环境，当前判断偏干。',
  actionText: '建议尽快浇水。'
})

const unknown = buildWateringSoilDecision({
  visualSoilEvidence: { outcome: 'manual_check' },
  soilCheck: { message: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。' },
  wateringContext: 'keep_baseline_or_check_soil',
  wateringAction: 'follow_baseline_or_check_soil'
})
assert.deepEqual(unknown, {
  resultText: '视觉初判未明确，结合近期浇水和当前环境，当前按常规节奏判断。',
  actionText: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。'
})

console.log('watering soil combined decision logic passed')
