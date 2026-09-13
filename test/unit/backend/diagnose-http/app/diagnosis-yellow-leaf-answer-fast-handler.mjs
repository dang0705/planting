/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  _test: {
    hasSubmittedEnvironmentCareInput,
    buildVisibleOutcome,
    buildRuntimeRouteAnswers,
    buildHydrationEffects,
    buildScoreMap
  }
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-yellow-leaf-answer-fast-handler.js')

const { buildRouteAnswersFromRuntimeEnvironmentCarePayload } = require(
  '../../../../../cloudfunctions/diagnose-http/app/care-behavior-payload.js'
)
const { buildEnvironmentCareContextV7 } = require(
  '../../../../../cloudfunctions/diagnose-http/utils/environment-context-v7.js'
)

assert.equal(
  buildVisibleOutcome(
    { outcomeKey: 'iron_deficiency', actionProfileKey: 'action_nutrient_support_basic' },
    { todayActions: ['先核对补肥情况'], avoidActions: ['不要一次性重肥猛补'] }
  ).actionProfileKey,
  'action_nutrient_support_basic',
  '快路径问答响应必须保留建议归并主键'
)

assert.equal(
  hasSubmittedEnvironmentCareInput({
    environmentWeatherWindow: { historicalDays: [{}], forecastDays: [{}] }
  }),
  false,
  '仅天气预取不能触发完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({ careBehaviorTimeline: { dailyRecords: [{}] } }),
  true,
  '用户提交的养护时间线必须保留完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({ userLightContext: { naturalLightType: 'direct' } }),
  true,
  '用户提交的光照上下文必须保留完整环境计算'
)
assert.equal(
  hasSubmittedEnvironmentCareInput({
    airEnvironmentByQuestionId: { q_air: { airExchange: { source: 'window' } } }
  }),
  true,
  '用户提交的空气环境侧栏必须保留完整环境计算'
)

const submittedWateringAnswer = {
  questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
  optionKey: 'care_behavior_timeline'
}
const routeAnswers = buildRuntimeRouteAnswers(
  [submittedWateringAnswer],
  { outputs: { wateringContext: 'likely_too_wet' } },
  { buildRouteAnswersFromRuntimeEnvironmentCarePayload }
)
assert.equal(routeAnswers[0].optionKey, 'often_wet')
assert.equal(submittedWateringAnswer.optionKey, 'care_behavior_timeline')

const hydrationEffects = buildHydrationEffects({
  behaviorSummary10d: {
    wetPressureLoad: 0.6,
    thoroughWateringCount10d: 1,
    lastEffectiveRootWateredDaysAgo: 2
  }
})
assert.equal(hydrationEffects[0].outcomeKey, 'overwatering_root_pressure')
assert.equal(buildScoreMap(hydrationEffects, [])[0].outcomeKey, 'overwatering_root_pressure')

const frequentNormalWateringContext = buildEnvironmentCareContextV7({
  diagnosisDate: '2026-09-13',
  careBehaviorTimeline: {
    referenceDate: '2026-09-13',
    wateringEvents10d: [
      { date: '2026-09-03', watered: true, amount: 'normal', amountMl: 150 },
      { date: '2026-09-04', watered: true, amount: 'normal', amountMl: 150 },
      { date: '2026-09-09', watered: true, amount: 'normal', amountMl: 150 },
      { date: '2026-09-10', watered: true, amount: 'normal', amountMl: 150 }
    ]
  }
})
const frequentNormalWateringEffects = buildHydrationEffects(frequentNormalWateringContext)
assert.equal(frequentNormalWateringContext.behaviorSummary10d.wetPressureLoad, 0.84)
assert.equal(frequentNormalWateringContext.behaviorSummary10d.thoroughWateringCount10d, 0)
assert.equal(frequentNormalWateringContext.behaviorSummary10d.rootWateringEventCount10d, 4)
assert.equal(frequentNormalWateringEffects[0].optionKey, 'frequent_wet_pressure')
assert.equal(frequentNormalWateringEffects[0].outcomeKey, 'overwatering_root_pressure')

const repeatedHighDoseWateringContext = buildEnvironmentCareContextV7({
  diagnosisDate: '2026-09-13',
  careBehaviorTimeline: {
    referenceDate: '2026-09-13',
    wateringEvents10d: [
      { date: '2026-09-03', watered: true, amount: 'normal', amountMl: 2600 },
      { date: '2026-09-04', watered: true, amount: 'normal', amountMl: 2600 },
      { date: '2026-09-05', watered: true, amount: 'normal', amountMl: 2600 }
    ]
  }
})
const repeatedHighDoseWateringEffects = buildHydrationEffects(repeatedHighDoseWateringContext)
assert.equal(repeatedHighDoseWateringContext.behaviorSummary10d.wetPressureLoad, 0.3)
assert.equal(repeatedHighDoseWateringContext.behaviorSummary10d.thoroughWateringCount10d, 3)
assert.equal(repeatedHighDoseWateringEffects[0].optionKey, 'repeated_high_dose_watering')
assert.equal(repeatedHighDoseWateringEffects[0].outcomeKey, 'overwatering_root_pressure')

console.log('yellow leaf answer environment runtime gate: passed')
