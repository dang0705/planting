import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

const captured = {
  runDiagnosisRoundArgs: null,
  persistRoundResultArgs: null,
  markQuestionAnswersArgs: null,
  getQuestionOptionMappingsArgs: null,
  routeAnswerEffectsArgs: null
}

const sessionState = {
  userPlantId: 17,
  plantId: 'plant_17',
  plantContext: {
    userPlantId: 17,
    plantId: 'plant_17',
    plantIdentityId: 'plant_identity_17',
    genus: 'Epipremnum',
    family: 'Araceae',
    category: 'foliage',
    watering: { freq: [4, 8] },
    fertilization: { freq: [30, 45] },
    sunning: { way: '明亮散射光' },
    humidityMin: 45,
    humidityMax: 70,
    temperatureMin: 18,
    temperatureMax: 28,
    uvIndexMax: 6
  },
  runtimeSnapshot: {},
  answeredAnswers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  followUpRows: [
    {
      asked: 1,
      rationale: JSON.stringify({
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        round: 1,
        questionTextUserCn: '过去 10 天浇水/盆土干湿背景'
      }),
      symptom_key: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      answer_value: 'care_behavior_timeline',
      question_text: '过去 10 天浇水/盆土干湿背景'
    }
  ],
  askedQuestionKeys: [
    'q_observed_probe__leaf_yellowing__watering_frequency_context'
  ],
  answeredQuestionGroupKeys: [],
  unknownCountByGroup: {},
  observedEvidenceSet: [],
  visualBatchTrace: null,
  visualAggregateSummary: null,
  shadowCompareSummary: null,
  symptomClassRuntime: null
}

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      getPlantCatalogById: async () => null,
      getUserPlantInstanceById: async () => null
    }
  }

  if (request === './domain/diagnosis-engine') {
    return {
      runDiagnosisRound: async args => {
        captured.runDiagnosisRoundArgs = args
        return {
          diagnosisSessionId: 'session-bridge-1',
          roundId: 'round_2',
          followUpRequired: true,
          routePrimaryAction: 'ask_first',
          plantContext: sessionState.plantContext,
          topProblem: {
            problemId: 'overwatering_root_pressure',
            summary: '过浇导致根压'
          },
          finalResult: {
            problemId: 'overwatering_root_pressure',
            displayName: '过浇导致根压'
          }
        }
      }
    }
  }

  if (request === './repositories/question-repository') {
    return {
      getQuestionOptionMappings: async questionKeys => {
        captured.getQuestionOptionMappingsArgs = Array.from(questionKeys || [])
        return [
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'care_behavior_timeline'
          },
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'often_wet'
          },
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'normal_or_stable'
          },
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'often_dry'
          },
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'unknown'
          }
        ]
      }
    }
  }

  if (request === './services/session-service') {
    return {
      getSessionState: async () => sessionState,
      getObservedSymptomsBySession: async () => [],
      validateQuestionAnswerOwnership: async (_sessionId, answers, answerRound) => ({
        ok: true,
        followUpRows: sessionState.followUpRows,
        answerRound,
        answers
      }),
      markQuestionAnswers: async (_sessionId, answers) => {
        captured.markQuestionAnswersArgs = answers
        return {
          updatedAnswers: answers,
          followUpRows: sessionState.followUpRows,
          pendingWrites: []
        }
      },
      prepareAnswerRevision: async () => ({ ok: true })
    }
  }

  if (request === './presenters/diagnosis-round-presenter-helpers') {
    return {
      hasConsumedFollowUpRetakeQuota: () => false
    }
  }

  if (request === './utils/visual-batch-id') {
    return {
      resolveLatestVisualCallBatchId: () => 'visual_batch_1'
    }
  }

  if (request === './services/session-follow-up-service') {
    return {
      readQuestionKeyFromRationale: rationale => {
        try {
          return JSON.parse(rationale || '{}')?.questionKey || ''
        } catch {
          return ''
        }
      },
      readQuestionGroupKeyFromRationale: rationale => {
        try {
          return JSON.parse(rationale || '{}')?.questionGroupKey || ''
        } catch {
          return ''
        }
      },
      readRoundFromRationale: rationale => {
        try {
          return Number(JSON.parse(rationale || '{}')?.round || 0) || 0
        } catch {
          return 0
        }
      }
    }
  }

  if (request === './visual-runtime') {
    return {
      extractVisualSymptomsSafely: async () => null,
      persistRoundResult: async args => {
        captured.persistRoundResultArgs = args
        return true
      }
    }
  }

  if (request === './repositories/outcome-route-repository') {
    return {
      getOutcomeAnswerEffects: async questionKeys => {
        captured.routeAnswerEffectsArgs = Array.from(questionKeys || [])
        return [
          {
            questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
            optionKey: 'often_wet',
            outcomeKey: 'overwatering_root_pressure',
            routeKey: 'watering_root_pressure_route',
            effectType: 'support'
          }
        ]
      }
    }
  }

  if (request === './repositories/diagnosis-review/review-performance') {
    return {
      createReviewTimingLogger: () => ({
        mark: () => {},
        finish: () => {}
      })
    }
  }

  if (request === './static-cache-preloader') {
    return {
      triggerStaticRepositoryCachePreload: () => {}
    }
  }

  return originalModuleLoad.call(this, request, parent, isMain)
}

const { runAnswerDiagnosis } = require('../../cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js')
const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('../../cloudfunctions/diagnose-http/app/care-behavior-payload.js')
const { buildRuntimeSnapshotPayload } = require('../../cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js')

const payload = {
  diagnosisSessionId: 'session-bridge-1',
  roundId: 'round_1',
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'care_behavior_timeline'
    }
  ],
  careBehaviorTimeline: {
    referenceDate: '2026-05-27',
    dailyRecords: [
      { date: '2026-05-25', watered: true, wateringAmount: 'normal' },
      { date: '2026-05-26', watered: true, wateringAmount: 'normal' },
      { date: '2026-05-27', watered: true, wateringAmount: 'normal' }
    ]
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
      uvIndex: 4,
      textDay: '晴'
    }))
  }
}

const runtimeCarePayload = resolveRuntimeEnvironmentCarePayload({
  payload,
  sessionState,
  plantContext: sessionState.plantContext
})

assert.equal(runtimeCarePayload.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

const runtimeRouteAnswers = buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers: payload.answers,
  runtimeEnvironmentCarePayload: runtimeCarePayload
})

assert.equal(runtimeRouteAnswers[0].optionKey, 'often_wet')

const result = await runAnswerDiagnosis({
  payload,
  openid: 'openid_1'
})

assert.equal(captured.markQuestionAnswersArgs[0].optionKey, 'care_behavior_timeline')
assert.equal(captured.runDiagnosisRoundArgs.answers[0].optionKey, 'often_wet')
assert.equal(captured.runDiagnosisRoundArgs.answers[0].questionKey, 'q_observed_probe__leaf_yellowing__watering_frequency_context')
assert.equal(result.response.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
assert.equal(result.response.careBehaviorTimeline.dailyRecords.length, 3)
assert.equal(captured.persistRoundResultArgs.response.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
assert.equal(captured.routeAnswerEffectsArgs[0], 'q_observed_probe__leaf_yellowing__watering_frequency_context')
assert.equal(captured.getQuestionOptionMappingsArgs[0], 'q_observed_probe__leaf_yellowing__watering_frequency_context')
assert.equal(
  captured.runDiagnosisRoundArgs.answerOptionMappings.some(item => item.optionKey === 'often_wet'),
  true
)

const compactSnapshot = JSON.parse(buildRuntimeSnapshotPayload({
  sessionId: 'session-bridge-1',
  plantContext: sessionState.plantContext,
  response: {
    careBehaviorTimeline: {
      referenceDate: '2026-05-27',
      dailyRecords: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-05-${String(index + 1).padStart(2, '0')}`,
        watered: true,
        wateringAmount: 'normal'
      }))
    },
    environmentCareContext: {
      outputs: {
        wateringContext: 'likely_too_wet'
      },
      behaviorSummary10d: {
        wateringCount10d: 30
      },
      watering: {
        wateringContext: 'likely_too_wet'
      }
    }
  }
}))

assert.equal(compactSnapshot.careBehaviorTimeline.dailyRecords.length, 25)
assert.equal(compactSnapshot.environmentCareContext.outputs.wateringContext, 'likely_too_wet')

Module._load = originalModuleLoad

console.log('care-behavior-answer-runner tests passed')
