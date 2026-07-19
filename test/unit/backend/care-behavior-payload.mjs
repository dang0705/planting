import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

Module._load = function loadWithCloudbaseStub(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      getPlantCatalogById: async () => null,
      getUserPlantInstanceById: async () => null
    }
  }
  return originalModuleLoad.call(this, request, parent, isMain)
}

const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('../../../cloudfunctions/diagnose-http/app/care-behavior-payload.js')
const {
  buildSyntheticObservedProbeQuestions
} = require('../../../cloudfunctions/diagnose-http/utils/synthetic-question-package/builders.js')
const {
  buildRouteEvidenceContext,
  planOutcomeRoutes
} = require('../../../cloudfunctions/diagnose-http/domain/outcome-route-planner.js')
const {
  _test: diagnosisEngineTest
} = require('../../../cloudfunctions/diagnose-http/domain/diagnosis-engine.js')
const {
  buildRuntimeSnapshotPayload
} = require('../../../cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js')
Module._load = originalModuleLoad

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

const slowWateringPlantContext = {
  ...plantContext,
  watering: { freq: [7, 12] }
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

const duplicatedAliasResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: [
        { date: '2026-05-22', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-27', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-31', watered: true, wateringAmount: 'normal' }
      ],
      wateringEvents10d: [
        { date: '2026-05-22', watered: true, amount: 'normal' },
        { date: '2026-05-27', watered: true, amount: 'normal' },
        { date: '2026-05-31', watered: true, amount: 'normal' }
      ],
      watering_events_10d: [
        { date: '2026-05-22', watered: true, amount: 'normal' },
        { date: '2026-05-27', watered: true, amount: 'normal' },
        { date: '2026-05-31', watered: true, amount: 'normal' }
      ],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 26,
        tempMinC: 21,
        humidity: 81,
        precipMm: 0,
        textDay: '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 29,
        tempMinC: 21,
        humidity: 60,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext
})

assert.equal(
  duplicatedAliasResult.environmentCareContext.behaviorSummary10d.effectiveHydrationLoad !==
    undefined,
  true
)
assert.equal(
  duplicatedAliasResult.environmentCareContext.watering.wateringContext,
  'likely_too_wet'
)
assert.equal(duplicatedAliasResult.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

const sameDayDuplicateResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: [{ date: '2026-05-31', watered: true, wateringAmount: '' }],
      wateringEvents10d: [{ date: '2026-05-31', watered: true, amount: 'normal' }],
      watering_events_10d: [{ date: '2026-05-31', watered: true, amount: 'heavy' }],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 25,
        tempMinC: 20,
        humidity: 60,
        precipMm: 0,
        textDay: '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 28,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext: slowWateringPlantContext
})

assert.equal(
  sameDayDuplicateResult.environmentCareContext.behaviorSummary10d.effectiveHydrationLoad !==
    undefined,
  true
)
assert.equal(
  sameDayDuplicateResult.environmentCareContext.watering.wateringContext,
  'keep_baseline_or_check_soil'
)

const rainyWetResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: [
        { date: '2026-05-22', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-27', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-31', watered: true, wateringAmount: 'normal' }
      ],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 25,
        tempMinC: 20,
        humidity: 58,
        precipMm: index < 4 ? 8 : 0,
        textDay: index < 4 ? '小雨' : '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 28,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext
})

assert.equal(rainyWetResult.environmentCareContext.historicalSummary10d.rainyDays, 4)
assert.equal(
  rainyWetResult.environmentCareContext.behaviorSummary10d.effectiveHydrationLoad !== undefined,
  true
)
assert.equal(rainyWetResult.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

const wetRouteAnswerEffects = [
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'often_wet',
    outcomeKey: 'overwatering_root_pressure',
    routeKey: 'watering_root_pressure_route',
    effectType: 'support'
  }
]

const rainyWetAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  runtimeEnvironmentCarePayload: rainyWetResult
})

assert.equal(rainyWetAnswers[0].optionKey, 'often_wet')

const rainyWetMatchedOutcomeKeys = diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
  wetRouteAnswerEffects,
  rainyWetAnswers
)
assert.deepEqual(rainyWetMatchedOutcomeKeys, ['overwatering_root_pressure'])

const rainyWetRouteDecision = await planOutcomeRoutes({
  candidateOutcomeKeys: rainyWetMatchedOutcomeKeys,
  routeEvidenceContext: buildRouteEvidenceContext({
    answers: rainyWetAnswers,
    routeAnswerEffects: wetRouteAnswerEffects
  }),
  routeRepository: {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'watering_root_pressure_route',
          routeGroupKey: 'watering_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'action_overwatering_root_pressure_basic',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'condition_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
            ]
          },
          blockerEvidence: {},
          conflictOutcomeKeys: [],
          closureLevel: '',
          onPass: '',
          onFail: '',
          onUnknown: ''
        }
      ]
    },
    async getOutcomeRouteQuestions() {
      return []
    },
    async getOutcomeRouteGroupsByKeys() {
      return [
        {
          routeGroupKey: 'watering_split',
          maxVisibleOutcomes: 3
        }
      ]
    }
  },
  featureFlags: { routePlanningEnabled: true }
})

assert.deepEqual(rainyWetRouteDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])

// AC 正样本：baseline [7,12] + 10 天 3 次 => likely_too_wet / often_wet / overwatering route
const baselineWetResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: [
        { date: '2026-05-22', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-27', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-31', watered: true, wateringAmount: 'normal' }
      ],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 26,
        tempMinC: 21,
        humidity: 60,
        precipMm: 0,
        textDay: '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 28,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext: slowWateringPlantContext
})

assert.equal(baselineWetResult.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

const baselineWetAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  runtimeEnvironmentCarePayload: baselineWetResult
})

assert.equal(baselineWetAnswers[0].optionKey, 'often_wet')
assert.deepEqual(
  diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
    wetRouteAnswerEffects,
    baselineWetAnswers
  ),
  ['overwatering_root_pressure']
)

const baselineWetRouteDecision = await planOutcomeRoutes({
  candidateOutcomeKeys: ['overwatering_root_pressure'],
  routeEvidenceContext: buildRouteEvidenceContext({
    answers: baselineWetAnswers,
    routeAnswerEffects: wetRouteAnswerEffects
  }),
  routeRepository: {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'watering_root_pressure_route',
          routeGroupKey: 'watering_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'action_overwatering_root_pressure_basic',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'condition_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
            ]
          },
          blockerEvidence: {},
          conflictOutcomeKeys: [],
          closureLevel: '',
          onPass: '',
          onFail: '',
          onUnknown: ''
        }
      ]
    },
    async getOutcomeRouteQuestions() {
      return []
    },
    async getOutcomeRouteGroupsByKeys() {
      return [
        {
          routeGroupKey: 'watering_split',
          maxVisibleOutcomes: 3
        }
      ]
    }
  },
  featureFlags: { routePlanningEnabled: true }
})

assert.deepEqual(baselineWetRouteDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])

// 10 天 10 次强阳性对照：用于诊断链路补充，不替代 3 次正样本验收
const extremeWetResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(22 + index).padStart(2, '0')}`,
        watered: true,
        wateringAmount: 'normal'
      })),
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 26,
        tempMinC: 21,
        humidity: 60,
        precipMm: 0,
        textDay: '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 28,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext: slowWateringPlantContext
})

assert.equal(extremeWetResult.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
assert.equal(
  extremeWetResult.environmentCareContext.behaviorSummary10d.effectiveHydrationLoad !== undefined,
  true
)

// 反例：baseline [7,12] + 10 天 1 次 + 多雨 => 不应命中过浇
const sparseRainResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: [{ date: '2026-05-31', watered: true, wateringAmount: 'normal' }],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(21 + index).padStart(2, '0')}`,
        tempMaxC: 25,
        tempMinC: 20,
        humidity: 58,
        precipMm: index < 4 ? 8 : 0,
        textDay: index < 4 ? '小雨' : '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-06-${String(1 + index).padStart(2, '0')}`,
        tempMaxC: 28,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext: slowWateringPlantContext
})

assert.equal(
  sparseRainResult.environmentCareContext.outputs.wateringContext,
  'keep_baseline_or_check_soil'
)

const sparseRainAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  runtimeEnvironmentCarePayload: sparseRainResult
})

assert.equal(sparseRainAnswers[0].optionKey, 'normal_or_stable')
assert.deepEqual(
  diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
    wetRouteAnswerEffects,
    sparseRainAnswers
  ),
  []
)

const bridgedWetAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  runtimeEnvironmentCarePayload: result
})

assert.equal(bridgedWetAnswers[0].optionKey, 'often_wet')
const wetRouteEvidenceContext = buildRouteEvidenceContext({
  answers: bridgedWetAnswers,
  routeAnswerEffects: wetRouteAnswerEffects
})
const wetMatchedOutcomeKeys = diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
  wetRouteAnswerEffects,
  bridgedWetAnswers
)
assert.deepEqual(wetMatchedOutcomeKeys, ['overwatering_root_pressure'])
const wetRouteDecision = await planOutcomeRoutes({
  candidateOutcomeKeys: wetMatchedOutcomeKeys,
  routeEvidenceContext: wetRouteEvidenceContext,
  routeRepository: {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'watering_root_pressure_route',
          routeGroupKey: 'watering_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'action_overwatering_root_pressure_basic',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'condition_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
            ]
          },
          blockerEvidence: {},
          conflictOutcomeKeys: [],
          closureLevel: '',
          onPass: '',
          onFail: '',
          onUnknown: ''
        }
      ]
    },
    async getOutcomeRouteQuestions() {
      return []
    },
    async getOutcomeRouteGroupsByKeys() {
      return [
        {
          routeGroupKey: 'watering_split',
          maxVisibleOutcomes: 3
        }
      ]
    }
  },
  featureFlags: { routePlanningEnabled: true }
})

assert.deepEqual(wetRouteDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])

const baselineResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-27',
      dailyRecords: [{ date: '2026-05-24', watered: true, wateringAmount: 'normal' }],
      lastFertilizedBucket: '31_60d'
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-27' },
      historicalDays: Array.from({ length: 10 }, (_, index) => ({
        date: `2026-05-${String(17 + index).padStart(2, '0')}`,
        tempMaxC: 25,
        tempMinC: 20,
        humidity: 60,
        precipMm: 0,
        textDay: '多云'
      })),
      forecastDays: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-05-${String(27 + index).padStart(2, '0')}`,
        tempMaxC: 29,
        tempMinC: 21,
        humidity: 55,
        precipMm: 0,
        uvIndex: 4,
        textDay: '晴'
      }))
    }
  },
  sessionState: {},
  plantContext
})

assert.equal(
  baselineResult.environmentCareContext.outputs.wateringContext,
  'keep_baseline_or_check_soil'
)

const baselineAnswerRouteEffects = [
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'normal_or_stable',
    outcomeKey: 'normal_or_stable',
    routeKey: 'watering_baseline_route',
    effectType: 'support'
  }
]
const baselineAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  runtimeEnvironmentCarePayload: baselineResult
})
const baselineRouteEvidenceContext = buildRouteEvidenceContext({
  answers: baselineAnswers,
  routeAnswerEffects: baselineAnswerRouteEffects
})
const baselineMatchedOutcomeKeys = diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
  wetRouteAnswerEffects,
  baselineAnswers
)
assert.deepEqual(baselineMatchedOutcomeKeys, [])
const baselineRouteDecision = await planOutcomeRoutes({
  candidateOutcomeKeys: ['overwatering_root_pressure'],
  routeEvidenceContext: baselineRouteEvidenceContext,
  routeRepository: {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'watering_root_pressure_route',
          routeGroupKey: 'watering_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'action_overwatering_root_pressure_basic',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'condition_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
            ]
          },
          blockerEvidence: {},
          conflictOutcomeKeys: [],
          closureLevel: '',
          onPass: '',
          onFail: '',
          onUnknown: ''
        }
      ]
    },
    async getOutcomeRouteQuestions() {
      return []
    },
    async getOutcomeRouteGroupsByKeys() {
      return [
        {
          routeGroupKey: 'watering_split',
          maxVisibleOutcomes: 3
        }
      ]
    }
  },
  featureFlags: { routePlanningEnabled: true }
})

assert.deepEqual(baselineRouteDecision.visibleOutcomeKeys, [])

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
assert.equal(
  restoredWithEmptyIncomingTimeline.environmentCareContext.outputs.wateringContext,
  'likely_too_wet'
)

const chlorophytumPlantContext = {
  genus: 'Chlorophytum',
  watering: { freq: [5, 8] },
  temperatureMin: 12,
  temperatureMax: 30,
  humidityMin: 35,
  humidityMax: 70
}
const chlorophytumInitialPayload = {
  careBehaviorTimeline: {
    referenceDate: '2026-06-04',
    dailyRecords: [{ date: '2026-05-29', watered: true, wateringAmount: 'normal' }]
  },
  environmentWeatherWindow: {
    meta: { diagnosisDate: '2026-06-04' },
    historicalDays: Array.from({ length: 10 }, (_, index) => ({
      date: `2026-05-${String(25 + index).padStart(2, '0')}`,
      tempMaxC: 28,
      tempMinC: 18,
      humidity: index < 5 ? 72 : 60,
      precipMm: 0,
      textDay: '多云'
    })),
    forecastDays: []
  }
}
const chlorophytumInitialResult = resolveRuntimeEnvironmentCarePayload({
  payload: chlorophytumInitialPayload,
  sessionState: {},
  plantContext: chlorophytumPlantContext
})
assert.equal(
  chlorophytumInitialResult.environmentCareContext.historicalSummary10d.highHumidityDays,
  5
)
assert.equal(
  chlorophytumInitialResult.environmentCareContext.historicalSummary10d.thresholds
    .humidityMaxPercent,
  70
)

const chlorophytumRuntimeSnapshot = JSON.parse(
  buildRuntimeSnapshotPayload({
    sessionId: 'diag_chlorophytum_high_humidity_snapshot',
    plantContext: chlorophytumPlantContext,
    response: {
      roundId: 'round_1',
      careBehaviorTimeline: chlorophytumInitialResult.careBehaviorTimeline,
      environmentCareContext: chlorophytumInitialResult.environmentCareContext
    },
    round: 1
  })
)
assert.equal(chlorophytumRuntimeSnapshot.plantContext.humidityMax, 70)
assert.equal(
  chlorophytumRuntimeSnapshot.environmentCareContext.environmentWeatherWindow.historicalDays.length,
  10
)

const chlorophytumRecalculatedFromSnapshot = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-06-04',
      dailyRecords: [
        { date: '2026-05-26', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-30', watered: true, wateringAmount: 'normal' },
        { date: '2026-06-03', watered: true, wateringAmount: 'normal' }
      ]
    }
  },
  sessionState: { runtimeSnapshot: chlorophytumRuntimeSnapshot },
  plantContext: chlorophytumRuntimeSnapshot.plantContext
})
const chlorophytumWetPressureStep =
  chlorophytumRecalculatedFromSnapshot.environmentCareContext.watering.calculation.formulas.find(
    step => step.key === 'wet_pressure_score'
  )
const chlorophytumHighHumidityStep =
  chlorophytumRecalculatedFromSnapshot.environmentCareContext.watering.calculation.formulas.find(
    step => step.key === 'high_humidity_pressure_hit'
  )
assert.equal(
  chlorophytumRecalculatedFromSnapshot.environmentCareContext.historicalSummary10d.highHumidityDays,
  5
)
assert.equal(
  chlorophytumRecalculatedFromSnapshot.environmentCareContext.historicalSummary10d.thresholds
    .humidityMaxPercent,
  70
)
assert.equal(chlorophytumHighHumidityStep.inputs.highHumidityDays, 5)
assert.equal(chlorophytumHighHumidityStep.thresholds.wetHighHumidityDaysMin, 4)
assert.equal(chlorophytumHighHumidityStep.thresholds.wetHighHumidityConsecutiveDaysMin, 4)
assert.equal(chlorophytumHighHumidityStep.passed, true)
assert.equal(chlorophytumWetPressureStep.inputs.highHumidityPressureHit, true)
assert.equal(chlorophytumWetPressureStep.inputs.wetPressureHitCount, 1)

assert.equal(baselineAnswers[0].optionKey, 'normal_or_stable')

const [timelineQuestion] = buildSyntheticObservedProbeQuestions(
  { symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' },
  { preferredDimensions: ['watering_frequency_context'] }
)

assert.equal(timelineQuestion.uiVariant, 'care_behavior_timeline')
assert.equal(timelineQuestion.packageTopic, 'watering_frequency_context')

console.log('care-behavior-payload tests passed')
