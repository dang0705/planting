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
} = require('./cloudfunctions/diagnose-http/app/care-behavior-payload.js')
const {
  buildSyntheticObservedProbeQuestions
} = require('./cloudfunctions/diagnose-http/utils/synthetic-follow-up/builders.js')
const {
  buildRouteEvidenceContext,
  planOutcomeRoutes
} = require('./cloudfunctions/diagnose-http/domain/outcome-route-planner.js')
const {
  _test: diagnosisEngineTest
} = require('./cloudfunctions/diagnose-http/domain/diagnosis-engine.js')
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

const wetRouteAnswerEffects = [
  {
    questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    optionKey: 'often_wet',
    outcomeKey: 'overwatering_root_pressure',
    routeKey: 'watering_root_pressure_route',
    effectType: 'support'
  }
]
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
    async getOutcomeRouteGates() {
      return [
        {
          gateKey: 'gate_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          gateRole: 'display_gate',
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
  featureFlags: { routePlanningEnabled: true },
  canAskAnotherFollowUpRound: false
})

assert.deepEqual(wetRouteDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])

const baselineResult = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-27',
      dailyRecords: [
        { date: '2026-05-25', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-26', watered: true, wateringAmount: 'normal' },
        { date: '2026-05-27', watered: true, wateringAmount: 'normal' }
      ],
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

assert.equal(baselineResult.environmentCareContext.outputs.wateringContext, 'keep_baseline_or_check_soil')

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
    async getOutcomeRouteGates() {
      return [
        {
          gateKey: 'gate_overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          gateRole: 'display_gate',
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
  featureFlags: { routePlanningEnabled: true },
  canAskAnotherFollowUpRound: false
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
assert.equal(restoredWithEmptyIncomingTimeline.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

assert.equal(baselineAnswers[0].optionKey, 'normal_or_stable')

const [timelineQuestion] = buildSyntheticObservedProbeQuestions(
  { symptomKey: 'leaf_yellowing', symptomCn: '叶片发黄' },
  { preferredDimensions: ['watering_frequency_context'] }
)

assert.equal(timelineQuestion.uiVariant, 'care_behavior_timeline')
assert.equal(timelineQuestion.targetDimension, 'watering_frequency_context')

console.log('care-behavior-payload tests passed')
