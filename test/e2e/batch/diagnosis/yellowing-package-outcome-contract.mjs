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
  planOutcomeRoutes,
  buildRouteEvidenceContext
} = require('../../../../cloudfunctions/diagnose-http/domain/outcome-route-planner.js')
const {
  resolveRuntimeEnvironmentCarePayload,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload
} = require('../../../../cloudfunctions/diagnose-http/app/care-behavior-payload.js')

Module._load = originalModuleLoad

const QUESTION_KEYS = {
  watering: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
  light: 'q_observed_probe__leaf_yellowing__light_change_context',
  fertilization: 'q_observed_probe__leaf_yellowing__fertilization_growth_context'
}

const ROUTE_EFFECTS = [
  {
    questionKey: QUESTION_KEYS.watering,
    optionKey: 'often_wet',
    outcomeKey: 'overwatering_root_pressure',
    routeKey: 'yellowing_overwatering_route',
    effectType: 'support'
  },
  {
    questionKey: QUESTION_KEYS.fertilization,
    optionKey: 'recent_heavy_fertilizer_or_repot',
    outcomeKey: 'fertilizer_repot_stress',
    routeKey: 'yellowing_fertilizer_route',
    effectType: 'support'
  },
  {
    questionKey: QUESTION_KEYS.light,
    optionKey: 'stronger_direct_light',
    outcomeKey: 'sunburn',
    routeKey: 'yellowing_sunburn_route',
    effectType: 'support'
  }
]

const ROUTES = [
  {
    routeKey: 'yellowing_overwatering_route',
    routeGroupKey: 'yellowing_care_split_group',
    outcomeKey: 'overwatering_root_pressure',
    actionProfileKey: 'action_overwatering_root_pressure_basic',
    actionConflictGroup: 'water_less'
  },
  {
    routeKey: 'yellowing_fertilizer_route',
    routeGroupKey: 'yellowing_care_split_group',
    outcomeKey: 'fertilizer_repot_stress',
    actionProfileKey: 'action_fertilizer_repot_stress_basic',
    actionConflictGroup: 'reduce_fertilizer'
  },
  {
    routeKey: 'yellowing_sunburn_route',
    routeGroupKey: 'yellowing_care_split_group',
    outcomeKey: 'sunburn',
    actionProfileKey: 'action_sunburn_basic',
    actionConflictGroup: 'avoid_sun'
  }
]

const GATES = [
  {
    conditionKey: 'yellowing_overwatering_condition',
    routeKey: 'yellowing_overwatering_route',
    conditionRole: 'display_condition',
    requiredEvidence: { anySymptomKeys: ['uniform_yellowing'] },
    requiredAnswerEffects: {
      questionOptionPairs: [`${QUESTION_KEYS.watering}:often_wet`],
      routeKeys: ['yellowing_overwatering_route']
    },
    blockerEvidence: {},
    conflictOutcomeKeys: []
  },
  {
    conditionKey: 'yellowing_fertilizer_condition',
    routeKey: 'yellowing_fertilizer_route',
    conditionRole: 'display_condition',
    requiredEvidence: { anySymptomKeys: ['uniform_yellowing'] },
    requiredAnswerEffects: {
      questionOptionPairs: [`${QUESTION_KEYS.fertilization}:recent_heavy_fertilizer_or_repot`],
      routeKeys: ['yellowing_fertilizer_route']
    },
    blockerEvidence: {},
    conflictOutcomeKeys: []
  },
  {
    conditionKey: 'yellowing_sunburn_condition',
    routeKey: 'yellowing_sunburn_route',
    conditionRole: 'display_condition',
    requiredEvidence: { anySymptomKeys: ['uniform_yellowing'] },
    requiredAnswerEffects: {
      questionOptionPairs: [`${QUESTION_KEYS.light}:stronger_direct_light`],
      routeKeys: ['yellowing_sunburn_route']
    },
    blockerEvidence: {},
    conflictOutcomeKeys: []
  }
]

function buildObservedEvidenceSet() {
  return [
    {
      observedEvidenceSetId: 'yellowing_package_contract::uniform_yellowing',
      evidenceKey: 'uniform_yellowing',
      evidenceType: 'symptom',
      symptomKey: 'uniform_yellowing',
      symptomCn: '整叶黄化',
      confidence: 0.99,
      sourceType: 'manual_symptom_mode',
      currentStatus: 'active',
      targetLayer: 'observed_evidence_set'
    }
  ]
}

function createRouteRepository() {
  return {
    async getOutcomeRoutesByOutcomeKeys(outcomeKeys = []) {
      const allowed = new Set(outcomeKeys)
      return ROUTES.filter(item => allowed.has(item.outcomeKey))
    },
    async getOutcomeRouteConditions(routeKeys = []) {
      const allowed = new Set(routeKeys)
      return GATES.filter(item => allowed.has(item.routeKey))
    },
    async getOutcomeRouteQuestions() {
      return []
    },
    async getOutcomeRouteGroupsByKeys() {
      return [
        {
          routeGroupKey: 'yellowing_care_split_group',
          entrySymptomKeys: ['uniform_yellowing'],
          candidateOutcomeKeys: [
            'overwatering_root_pressure',
            'fertilizer_repot_stress',
            'sunburn'
          ],
          maxVisibleOutcomes: 3
        }
      ]
    }
  }
}

function buildOverwateringTimelineAnswers() {
  const runtimeEnvironmentCarePayload = resolveRuntimeEnvironmentCarePayload({
    payload: {
      careBehaviorTimeline: {
        referenceDate: '2026-06-07',
        dailyRecords: Array.from({ length: 10 }, (_, index) => ({
          date: `2026-05-${String(29 + index).padStart(2, '0')}`,
          watered: [1, 3, 5, 7].includes(index),
          wateringAmount: 'normal'
        })),
        lastFertilizedBucket: '31_60d'
      }
    },
    plantContext: {
      watering: { freq: [7, 12] }
    }
  })

  assert.equal(
    runtimeEnvironmentCarePayload.environmentCareContext.outputs.wateringContext,
    'likely_too_wet'
  )

  return buildRouteAnswersFromRuntimeEnvironmentCarePayload({
    answers: [
      { questionKey: QUESTION_KEYS.watering, optionKey: 'care_behavior_timeline' },
      { questionKey: QUESTION_KEYS.light, optionKey: 'no_clear_change' },
      { questionKey: QUESTION_KEYS.fertilization, optionKey: 'normal_light_fertilizer' }
    ],
    runtimeEnvironmentCarePayload
  })
}

async function assertYellowingPackageOutcome({ label, answers, expectedOutcomeKey }) {
  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure', 'fertilizer_repot_stress', 'sunburn'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(),
      answers,
      routeAnswerEffects: ROUTE_EFFECTS,
      candidateOutcomes: [
        { problemKey: 'overwatering_root_pressure' },
        { problemKey: 'fertilizer_repot_stress' },
        { problemKey: 'sunburn' }
      ]
    }),
    routeRepository: createRouteRepository(),
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(decision.conservativePolicy, '', label)
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready', label)
  assert.deepEqual(decision.visibleOutcomeKeys, [expectedOutcomeKey], label)
}

await assertYellowingPackageOutcome({
  label: '黄叶过浇 timeline 必须输出积水/根系压力',
  answers: buildOverwateringTimelineAnswers(),
  expectedOutcomeKey: 'overwatering_root_pressure'
})

await assertYellowingPackageOutcome({
  label: '黄叶施浓肥必须输出施肥/换盆应激',
  answers: [
    { questionKey: QUESTION_KEYS.watering, optionKey: 'normal_or_stable' },
    { questionKey: QUESTION_KEYS.light, optionKey: 'no_clear_change' },
    { questionKey: QUESTION_KEYS.fertilization, optionKey: 'recent_heavy_fertilizer_or_repot' }
  ],
  expectedOutcomeKey: 'fertilizer_repot_stress'
})

await assertYellowingPackageOutcome({
  label: '黄叶直晒必须输出强光灼伤',
  answers: [
    { questionKey: QUESTION_KEYS.watering, optionKey: 'normal_or_stable' },
    { questionKey: QUESTION_KEYS.light, optionKey: 'stronger_direct_light' },
    { questionKey: QUESTION_KEYS.fertilization, optionKey: 'normal_light_fertilizer' }
  ],
  expectedOutcomeKey: 'sunburn'
})

console.log('yellowing package outcome contract tests passed')
