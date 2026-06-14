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
        outcomeKeys.map(key => ({
          outcomeKey: key,
          sourceProblemKey: key,
          outcomeType: 'problematic',
          outcomeCategory: 'yellow_leaf_route',
          displayNameCn: key === 'overwatering_root_pressure' ? '过浇导致根压' : key,
          userDefinitionCn:
            key === 'overwatering_root_pressure' ? '浇水频率偏高，根部处于受压状态。' : '',
          actionProfileKey:
            key === 'overwatering_root_pressure' ? 'action_overwatering_root_pressure_basic' : '',
          riskLevel: 'medium'
        })),
      getOutcomeActionProfiles: async keys =>
        keys.map(key => ({
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
} = require('../../cloudfunctions/diagnose-http/domain/yellow-leaf-outcome-resolver.js')

const result = await resolveYellowLeafOutcomeResult({
  sessionId: 'session-yellow-1',
  round: 2,
  answers: [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'often_wet'
    }
  ],
  questionPackage: {
    mode: 'yellow_leaf',
    sourceMode: 'manual_yellowing_care_environment_frontloaded',
    questionCount: 4,
    answerSubmitMode: 'package',
    questionDisplayMode: 'package'
  },
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

Module._load = originalModuleLoad

console.log('yellow leaf outcome resolver tests passed')
