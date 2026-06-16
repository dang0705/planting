import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

const LIGHT_QUESTION_KEY = 'q_observed_probe__leaf_yellowing__light_change_context'
const CARE_AREA_QUESTION_KEY = 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition'

const captured = {
  genericRunnerCalled: false,
  persistedRoundResult: null,
  routeAnswerEffectsArgs: null
}

const questionPackageSnapshot = {
  mode: 'yellow_leaf',
  sourceMode: 'static_question_package',
  questionPackage: {
    mode: 'yellow_leaf',
    questionCount: 2,
    answerSubmitMode: 'package',
    questionDisplayMode: 'package'
  },
  packageQuestions: [
    {
      questionKey: LIGHT_QUESTION_KEY,
      packageTopic: 'light_change_context',
      questionGroupKey: 'light',
      options: [
        { optionKey: 'weaker_light', optionTextUserCn: '最近更阴' },
        { optionKey: 'no_clear_change', optionTextUserCn: '没有明显变化' },
        { optionKey: 'stronger_direct_light', optionTextUserCn: '最近直射增强' }
      ]
    },
    {
      questionKey: CARE_AREA_QUESTION_KEY,
      packageTopic: 'yellowing_care_area_condition',
      questionGroupKey: 'care_area',
      options: [
        { optionKey: 'light_area', optionTextUserCn: '主要在受光侧或窗边' },
        { optionKey: 'watering_area', optionTextUserCn: '主要在盆土/浇水相关区域' }
      ]
    }
  ]
}

const sessionState = {
  userPlantId: 27,
  plantId: 'plant_27',
  nextRound: 2,
  plantContext: {
    userPlantId: 27,
    plantId: 'plant_27',
    plantIdentityId: 'plant_identity_27',
    genus: 'Epipremnum',
    family: 'Araceae',
    sunning: { way: '明亮散射光', freq: [2, 4], unit: '小时/天' },
    uvIndexMax: 6
  },
  runtimeSnapshot: {
    questionPackageSnapshot
  },
  answeredAnswers: [],
  askedQuestionKeys: [],
  answeredQuestionGroupKeys: [],
  unknownCountByGroup: {},
  observedEvidenceSet: [],
  visualBatchTrace: null,
  visualAggregateSummary: null,
  shadowCompareSummary: null,
  symptomClassRuntime: null
}

const OUTCOMES = {
  sunburn: {
    outcomeKey: 'sunburn',
    sourceProblemKey: 'sunburn',
    outcomeType: 'problematic',
    outcomeCategory: 'light',
    displayNameCn: '晒伤/强光刺激',
    userDefinitionCn: '当前更像暴晒或强光刺激后的组织灼伤。',
    actionProfileKey: 'action_sunburn_basic',
    riskLevel: 'medium'
  }
}

const ACTIONS = {
  action_sunburn_basic: {
    actionProfileKey: 'action_sunburn_basic',
    todayActions: ['先移离正午直射光'],
    avoidActions: ['不要马上重肥']
  }
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
  if (request === '../domain/diagnosis-engine' || request === './domain/diagnosis-engine') {
    return {
      runDiagnosisRound: async () => {
        captured.genericRunnerCalled = true
        throw new Error('generic route runner should not be used for terminal package snapshot')
      }
    }
  }
  if (
    request === '../domain/wilting-droop-outcome-resolver' ||
    request === './domain/wilting-droop-outcome-resolver'
  ) {
    return {
      resolveWiltingDroopOutcomeResult: () => null
    }
  }
  if (
    request === '../repositories/question-repository' ||
    request === './repositories/question-repository'
  ) {
    return {
      getQuestionOptionMappings: async () => []
    }
  }
  if (request === '../services/session-service' || request === './services/session-service') {
    return {
      getSessionState: async () => sessionState,
      getObservedSymptomsBySession: async () => []
    }
  }
  if (request === '../utils/visual-batch-id' || request === './utils/visual-batch-id') {
    return {
      resolveLatestVisualCallBatchId: () => 'visual_batch_snapshot_terminal'
    }
  }
  if (request === './visual-runtime' || request === '../app/visual-runtime') {
    return {
      extractVisualSymptomsSafely: async () => null,
      persistRoundResult: async args => {
        captured.persistedRoundResult = args
        return true
      }
    }
  }
  if (
    request === '../repositories/outcome-route-repository' ||
    request === './repositories/outcome-route-repository'
  ) {
    return {
      getOutcomeAnswerEffects: async questionKeys => {
        captured.routeAnswerEffectsArgs = Array.from(questionKeys || [])
        return [
          {
            questionKey: LIGHT_QUESTION_KEY,
            optionKey: 'stronger_direct_light',
            outcomeKey: 'sunburn',
            routeKey: 'yellowing_sunburn_route',
            effectType: 'support',
            effectStrength: 1
          }
        ]
      },
      getDiagnosisOutcomesByKeys: async keys => keys.map(key => OUTCOMES[key]).filter(Boolean),
      getOutcomeActionProfiles: async keys => keys.map(key => ACTIONS[key]).filter(Boolean)
    }
  }
  if (
    request === '../repositories/diagnosis-review/review-performance' ||
    request === './repositories/diagnosis-review/review-performance'
  ) {
    return {
      createReviewTimingLogger: () => ({
        mark: () => {},
        finish: () => {}
      })
    }
  }
  if (request === './static-cache-preloader' || request === '../app/static-cache-preloader') {
    return {
      triggerStaticRepositoryCachePreload: () => {}
    }
  }

  return originalModuleLoad.call(this, request, parent, isMain)
}

const {
  runAnswerDiagnosis
} = require('../../cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js')
const {
  buildFrontendAnswerResponse
} = require('../../cloudfunctions/diagnose-http/app/frontend-response.js')

const result = await runAnswerDiagnosis({
  openid: 'openid_snapshot_terminal',
  payload: {
    diagnosisSessionId: 'session_snapshot_terminal',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [
      {
        questionKey: LIGHT_QUESTION_KEY,
        optionKey: 'stronger_direct_light'
      },
      {
        questionKey: CARE_AREA_QUESTION_KEY,
        optionKey: 'light_area'
      }
    ],
    userLightContext: {
      facing: 'south',
      windowType: 'standard',
      position: 'window_side',
      hasDirectSun: true,
      distance: 0.5
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-06-14' },
      historicalDays: [
        {
          date: '2026-06-14',
          uvIndex: 8,
          uvCategory: 'high'
        }
      ]
    }
  }
})

assert.equal(captured.genericRunnerCalled, false)
assert.ok(captured.routeAnswerEffectsArgs.includes(LIGHT_QUESTION_KEY))
assert.equal(result.response.visibleOutcomes[0].outcomeKey, 'sunburn')
assert.equal(result.response.environmentCareContext.outputs.lightHealthEvidence.direction, 'strong')
assert.equal(
  captured.persistedRoundResult.response.environmentCareContext.outputs.lightHealthEvidence
    .direction,
  'strong'
)

const frontendResponse = buildFrontendAnswerResponse(result.response)
assert.equal(frontendResponse.outcomeType, 'problematic')
assert.equal(frontendResponse.visibleOutcomes[0].outcomeKey, 'sunburn')
assert.equal(
  frontendResponse.environmentCareContext.outputs.lightHealthEvidence.direction,
  'strong'
)
assert.match(frontendResponse.environmentCareContext.outputs.lightHealthLevel, /偏强/)

Module._load = originalModuleLoad

console.log('question package snapshot terminal answer tests passed')
