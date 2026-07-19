import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

const OUTCOMES = {
  low_light_growth_weakness: {
    outcomeKey: 'low_light_growth_weakness',
    sourceProblemKey: 'low_light_growth_weakness',
    outcomeType: 'problematic',
    outcomeCategory: 'light',
    displayNameCn: '光照不足/生长偏弱',
    userDefinitionCn: '当前更像长期光照不足引起的徒长与偏弱。',
    actionProfileKey: 'action_low_light_basic',
    riskLevel: 'low'
  },
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
  action_low_light_basic: {
    actionProfileKey: 'action_low_light_basic',
    todayActions: ['把植株移到更稳定明亮散射光处'],
    avoidActions: ['不要突然暴晒']
  },
  action_sunburn_basic: {
    actionProfileKey: 'action_sunburn_basic',
    todayActions: ['先移离正午直射光'],
    avoidActions: ['不要马上重肥']
  }
}

Module._load = function loadWithRepositoryStub(request, parent, isMain) {
  if (request === '../repositories/outcome-route-repository') {
    return {
      async getDiagnosisOutcomesByKeys(keys = []) {
        return keys.map(key => OUTCOMES[key]).filter(Boolean)
      },
      async getOutcomeActionProfiles(keys = []) {
        return keys.map(key => ACTIONS[key]).filter(Boolean)
      }
    }
  }
  return originalModuleLoad.call(this, request, parent, isMain)
}

const {
  resolveRuntimeEnvironmentCarePayload
} = require('../../../cloudfunctions/diagnose-http/app/care-behavior-payload.js')
const {
  resolveYellowLeafOutcomeResult
} = require('../../../cloudfunctions/diagnose-http/domain/yellow-leaf-outcome-resolver.js')
const {
  matchesRequiredAnswerEffects
} = require('../../../cloudfunctions/diagnose-http/domain/outcome-condition-evaluator.js')
const {
  compactEnvironmentCareContextForPublic
} = require('../../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js')

Module._load = originalModuleLoad

const QUESTION_KEY = 'q_observed_probe__leaf_yellowing__light_change_context'
const questionPackage = { mode: 'yellow_leaf', questionCount: 4 }
const weatherWindow = {
  meta: { diagnosisDate: '2026-06-14' },
  historicalDays: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-06-${String(7 + index).padStart(2, '0')}`,
    sunshineHours: 7,
    daylightHours: 12,
    uvIndex: 8,
    textDay: '晴'
  }))
}
const qaStrongWeatherWindow = {
  meta: { diagnosisDate: '2026-06-14' },
  historicalDays: [
    {
      date: '2026-06-14',
      uvIndex: 8,
      uvCategory: 'high'
    }
  ]
}
const plantContext = {
  sunning: { way: '明亮散射光', freq: [2, 4], unit: '小时/天' }
}

function buildCarePayload(
  userLightContext,
  environmentWeatherWindow = weatherWindow,
  inputPlantContext = plantContext
) {
  return resolveRuntimeEnvironmentCarePayload({
    payload: {
      environmentWeatherWindow,
      userLightContext
    },
    sessionState: {},
    plantContext: inputPlantContext
  })
}

const lowLightPayload = buildCarePayload({
  facing: '无窗',
  windowType: '无窗',
  position: '远离窗户',
  hasDirectSun: false,
  distance: 10
})
const strongLightPayload = buildCarePayload({
  facing: '南',
  windowType: '落地窗',
  position: '窗边',
  hasDirectSun: true,
  distance: 0
})
const qaStrongLightPayload = buildCarePayload(
  {
    facing: 'south',
    windowType: 'standard',
    position: 'window_side',
    hasDirectSun: true,
    distance: 0.5
  },
  qaStrongWeatherWindow,
  {}
)

assert.equal(lowLightPayload.environmentCareContext.outputs.lightHealthLevel, '严重不足')
assert.equal(strongLightPayload.environmentCareContext.outputs.lightHealthLevel, '严重偏强')
assert.equal(qaStrongLightPayload.environmentCareContext.outputs.lightHealthLevel, '略偏强')
assert.equal(
  qaStrongLightPayload.environmentCareContext.outputs.lightHealthEvidence.direction,
  'strong'
)
assert.ok(qaStrongLightPayload.environmentCareContext.outputs.lightHealthScore > 84)
assert.notEqual(
  lowLightPayload.environmentCareContext.outputs.lightHealthEvidence.direction,
  strongLightPayload.environmentCareContext.outputs.lightHealthEvidence.direction
)
assert.ok(
  strongLightPayload.environmentCareContext.outputs.lightHealthEvidence.calculation.indoorEqHours >
    lowLightPayload.environmentCareContext.outputs.lightHealthEvidence.calculation.indoorEqHours
)
assert.equal(
  lowLightPayload.environmentCareContext.outputs.lightHealthEvidence.profile.source,
  'plant_context_sunning_freq'
)
const diagonalFacingPayload = buildCarePayload({
  facing: '东北',
  windowType: '有窗',
  position: '窗边',
  hasDirectSun: false,
  distance: 1
})
assert.equal(
  diagonalFacingPayload.environmentCareContext.outputs.lightHealthEvidence.userLightContext.facing,
  'north_east'
)
assert.equal(
  diagonalFacingPayload.environmentCareContext.outputs.lightHealthEvidence.userLightContext
    .facingLabel,
  '东北'
)

assert.equal(
  matchesRequiredAnswerEffects(
    {
      lightHealthDirections: ['low'],
      lightHealthLevels: ['略不足', '明显不足', '严重不足'],
      fallbackQuestionOptionPairs: [`${QUESTION_KEY}:weaker_light`],
      routeKeys: ['yellowing_low_light_route']
    },
    {
      environmentCareContext: lowLightPayload.environmentCareContext,
      answeredQuestionOptionPairSet: new Set(),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_low_light_route'])
    }
  ),
  true
)
assert.equal(
  matchesRequiredAnswerEffects(
    {
      lightHealthDirections: ['strong'],
      lightHealthLevels: ['略偏强', '明显偏强', '严重偏强'],
      fallbackQuestionOptionPairs: [`${QUESTION_KEY}:stronger_direct_light`],
      routeKeys: ['yellowing_sunburn_route']
    },
    {
      environmentCareContext: qaStrongLightPayload.environmentCareContext,
      answeredQuestionOptionPairSet: new Set([`${QUESTION_KEY}:stronger_direct_light`]),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_sunburn_route'])
    }
  ),
  true
)
assert.equal(
  matchesRequiredAnswerEffects(
    {
      lightHealthDirections: ['low'],
      routeKeys: ['yellowing_low_light_route']
    },
    {
      environmentCareContext: lowLightPayload.environmentCareContext,
      answeredQuestionOptionPairSet: new Set(),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_sunburn_route'])
    }
  ),
  false
)
assert.equal(
  matchesRequiredAnswerEffects(
    {
      lightHealthDirections: ['low'],
      fallbackQuestionOptionPairs: [`${QUESTION_KEY}:weaker_light`],
      routeKeys: ['yellowing_low_light_route']
    },
    {
      answeredQuestionOptionPairSet: new Set([`${QUESTION_KEY}:weaker_light`]),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_sunburn_route'])
    }
  ),
  false
)
assert.equal(
  matchesRequiredAnswerEffects(
    {
      lightHealthDirections: ['low'],
      fallbackQuestionOptionPairs: [`${QUESTION_KEY}:weaker_light`],
      routeKeys: ['yellowing_low_light_route']
    },
    {
      answeredQuestionOptionPairSet: new Set([`${QUESTION_KEY}:weaker_light`]),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_low_light_route'])
    }
  ),
  true
)

const snapshotBaseline = resolveRuntimeEnvironmentCarePayload({
  payload: {
    careBehaviorTimeline: {
      referenceDate: '2026-06-14',
      dailyRecords: [{ date: '2026-06-12', watered: true, wateringAmount: 'normal' }]
    },
    environmentWeatherWindow: weatherWindow,
    userLightContext: {
      facing: '无窗',
      windowType: '无窗',
      position: '远离窗户',
      hasDirectSun: false,
      distance: 10
    }
  },
  sessionState: {},
  plantContext
})
const snapshotRecalculatedWithNewLight = resolveRuntimeEnvironmentCarePayload({
  payload: {
    userLightContext: {
      facing: '南',
      windowType: '落地窗',
      position: '窗边',
      hasDirectSun: true,
      distance: 0
    }
  },
  sessionState: {
    runtimeSnapshot: {
      careBehaviorTimeline: snapshotBaseline.careBehaviorTimeline,
      environmentCareContext: snapshotBaseline.environmentCareContext
    }
  },
  plantContext
})

assert.equal(snapshotBaseline.environmentCareContext.outputs.lightHealthLevel, '严重不足')
assert.equal(
  snapshotRecalculatedWithNewLight.environmentCareContext.outputs.lightHealthLevel,
  '严重偏强'
)
assert.notEqual(
  snapshotRecalculatedWithNewLight.environmentCareContext.outputs.lightHealthEvidence.direction,
  snapshotBaseline.environmentCareContext.outputs.lightHealthEvidence.direction
)
assert.ok(
  snapshotRecalculatedWithNewLight.environmentCareContext.outputs.lightHealthEvidence.calculation
    .indoorEqHours >
    snapshotBaseline.environmentCareContext.outputs.lightHealthEvidence.calculation.indoorEqHours
)
assert.equal(snapshotRecalculatedWithNewLight.restoredFromSnapshot, false)
assert.equal(snapshotRecalculatedWithNewLight.careBehaviorTimeline.dailyRecords.length, 1)

const routeAnswerEffects = [
  {
    questionKey: QUESTION_KEY,
    optionKey: 'weaker_light',
    outcomeKey: 'low_light_growth_weakness',
    routeKey: 'yellowing_low_light_route',
    effectType: 'support',
    effectStrength: 1
  },
  {
    questionKey: QUESTION_KEY,
    optionKey: 'stronger_direct_light',
    outcomeKey: 'sunburn',
    routeKey: 'yellowing_sunburn_route',
    effectType: 'support',
    effectStrength: 1
  }
]

const lowLightResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'light_health_low',
  round: 2,
  answers: [{ questionKey: QUESTION_KEY, optionKey: 'stronger_direct_light' }],
  questionPackage,
  plantContext,
  environmentCareContext: lowLightPayload.environmentCareContext,
  routeAnswerEffects
})

assert.equal(lowLightResult.visibleOutcomes[0].outcomeKey, 'low_light_growth_weakness')
assert.match(lowLightResult.routeDecisionCause.decisionCauseText, /光照健康度 evidence/)

const strongLightResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'light_health_strong',
  round: 2,
  answers: [{ questionKey: QUESTION_KEY, optionKey: 'weaker_light' }],
  questionPackage,
  plantContext,
  environmentCareContext: strongLightPayload.environmentCareContext,
  routeAnswerEffects
})

assert.equal(strongLightResult.visibleOutcomes[0].outcomeKey, 'sunburn')

const qaStrongLightResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'light_health_qa_strong',
  round: 2,
  answers: [{ questionKey: QUESTION_KEY, optionKey: 'stronger_direct_light' }],
  questionPackage,
  plantContext,
  environmentCareContext: qaStrongLightPayload.environmentCareContext,
  routeAnswerEffects
})

assert.equal(qaStrongLightResult.visibleOutcomes[0].outcomeKey, 'sunburn')

const compactQaStrongContext = compactEnvironmentCareContextForPublic(
  qaStrongLightPayload.environmentCareContext
)
assert.equal(compactQaStrongContext.outputs.lightHealthScore, 91)
assert.equal(compactQaStrongContext.outputs.lightHealthLevel, '略偏强')
assert.match(compactQaStrongContext.outputs.lightHealthReason, /偏强/)
assert.equal(compactQaStrongContext.outputs.lightHealthEvidence.direction, 'strong')
assert.ok(compactQaStrongContext.outputs.lightHealthEvidence.calculation.directSunExposureHours > 0)

const fallbackResult = await resolveYellowLeafOutcomeResult({
  sessionId: 'light_health_fallback',
  round: 2,
  answers: [{ questionKey: QUESTION_KEY, optionKey: 'stronger_direct_light' }],
  questionPackage,
  plantContext,
  environmentCareContext: null,
  routeAnswerEffects
})

assert.equal(fallbackResult.visibleOutcomes[0].outcomeKey, 'sunburn')
assert.match(fallbackResult.routeDecisionCause.decisionCauseText, /route answer effects/)

console.log('light health estimator and yellowing route tests passed')
