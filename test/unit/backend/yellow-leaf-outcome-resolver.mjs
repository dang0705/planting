import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

Module._load = function loadWithStubs(request, parent, isMain) {
  if (
    request === './repositories/outcome-route-repository' ||
    request === '../repositories/outcome-route-repository'
  ) {
    return {
      getDiagnosisOutcomesByKeys: async outcomeKeys =>
        outcomeKeys
          .filter(key => key === 'overwatering_root_pressure')
          .map(key => ({
            outcomeKey: key,
            sourceProblemKey: key,
            outcomeType: 'problematic',
            outcomeCategory: 'yellow_leaf_route',
            displayNameCn: '过浇导致根压',
            userDefinitionCn: '浇水频率偏高，根部处于受压状态。',
            actionProfileKey: 'action_overwatering_root_pressure_basic',
            riskLevel: 'medium'
          })),
      getOutcomeActionProfiles: async keys =>
        keys
          .filter(key => key === 'action_overwatering_root_pressure_basic')
          .map(key => ({
            actionProfileKey: key,
            todayActions: ['先停浇，检查盆土和排水。'],
            threeDayActions: [],
            sevenDayObserve: [],
            avoidActions: ['不要继续加水。'],
            retakeOrEscalate: []
          }))
    }
  }

  return originalModuleLoad.call(this, request, parent, isMain)
}

const {
  resolveYellowLeafOutcomeResult
} = require('../../../cloudfunctions/diagnose-http/domain/yellow-leaf-outcome-resolver.js')

const LIGHT_QUESTION_KEY = 'q_observed_probe__leaf_yellowing__light_change_context'
const questionPackage = {
  mode: 'yellow_leaf',
  sourceMode: 'manual_yellowing_care_environment_frontloaded',
  questionCount: 4,
  answerSubmitMode: 'package',
  questionDisplayMode: 'package'
}

const result = await resolveYellowLeafOutcomeResult({
  sessionId: 'session-yellow-1',
  round: 2,
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'often_wet'
    }
  ],
  questionPackage,
  routeAnswerEffects: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'often_wet',
      outcomeKey: 'overwatering_root_pressure',
      routeKey: 'watering_root_pressure_route',
      effectType: 'support',
      effectStrength: 1
    }
  ],
  plantContext: {
    plantId: 'plant_1',
    plantIdentityId: 'plant_identity_1'
  }
})

assert.equal(result.outcomeType, 'problematic')
assert.equal(result.stopReason, 'yellow_leaf_route_package_completed')
assert.deepEqual(
  result.visibleOutcomes.map(item => item.outcomeKey),
  ['overwatering_root_pressure']
)
assert.equal(result.finalResult.displayName, '过浇导致根压')
assert.equal(result.questionPackage.mode, 'yellow_leaf')

const lowLightFallbackResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'session-yellow-low-light',
  round: 2,
  answers: [
    {
      questionKey: LIGHT_QUESTION_KEY,
      optionKey: 'weaker_light'
    }
  ],
  questionPackage,
  environmentCareContext: {
    outputs: {
      lightHealthScore: 0,
      lightHealthLevel: '严重不足',
      lightHealthEvidence: {
        direction: 'low',
        calculation: { score: 0 }
      }
    }
  },
  routeAnswerEffects: []
})
assert.equal(lowLightFallbackResult.outcomeType, 'problematic')
assert.equal(lowLightFallbackResult.visibleOutcomes[0].outcomeKey, 'low_light_growth_weakness')
assert.equal(lowLightFallbackResult.visibleOutcomes[0].displayNameCn, '光照不足/生长偏弱')
assert.equal(lowLightFallbackResult.actionAdvice.todayActions.length > 0, true)

const strongLightFallbackResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'session-yellow-strong-light',
  round: 2,
  answers: [
    {
      questionKey: LIGHT_QUESTION_KEY,
      optionKey: 'stronger_direct_light'
    }
  ],
  questionPackage,
  environmentCareContext: {
    outputs: {
      lightHealthScore: 91,
      lightHealthLevel: '略偏强',
      lightHealthEvidence: {
        direction: 'strong',
        calculation: { score: 91 }
      }
    }
  },
  routeAnswerEffects: []
})
assert.equal(strongLightFallbackResult.outcomeType, 'problematic')
assert.equal(strongLightFallbackResult.visibleOutcomes[0].outcomeKey, 'sunburn')
assert.equal(strongLightFallbackResult.visibleOutcomes[0].displayNameCn, '晒伤/强光刺激')
assert.equal(strongLightFallbackResult.actionAdvice.todayActions.length > 0, true)

const oldPairFallbackResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'session-yellow-old-pair-low-light',
  round: 2,
  answers: [
    {
      questionKey: LIGHT_QUESTION_KEY,
      optionKey: 'weaker_light'
    }
  ],
  questionPackage,
  environmentCareContext: null,
  routeAnswerEffects: [
    {
      questionKey: LIGHT_QUESTION_KEY,
      optionKey: 'weaker_light',
      outcomeKey: 'low_light_growth_weakness',
      routeKey: 'yellowing_low_light_route',
      effectType: 'support',
      effectStrength: 1
    }
  ]
})
assert.equal(oldPairFallbackResult.outcomeType, 'problematic')
assert.equal(oldPairFallbackResult.visibleOutcomes[0].outcomeKey, 'low_light_growth_weakness')

Module._load = originalModuleLoad

console.log('yellow leaf outcome resolver tests passed')
