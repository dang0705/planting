import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load

const {
  planOutcomeRoutes,
  buildRouteEvidenceContext,
  collectVisualRouteSymptomKeys
} = require('../../cloudfunctions/diagnose-http/domain/outcome-route-planner.js')
const {
  parseLLMVisualResult
} = require('../../cloudfunctions/diagnose-http/utils/diagnosis-parser.js')
const {
  formatDiagnosisResponse
} = require('../../cloudfunctions/diagnose-http/domain/result-formatter.js')
const {
  resolveRouteOutcomePayload
} = require('../../cloudfunctions/diagnose-http/domain/outcome-action-resolver.js')
const {
  evaluateStopState
} = require('../../cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js')
const {
  matchesRequiredAnswerEffects
} = require('../../cloudfunctions/diagnose-http/domain/outcome-condition-evaluator.js')
const {
  isCandidateOutcomeOutputEligible
} = require('../../cloudfunctions/diagnose-http/utils/output-eligibility.js')
const {
  evaluateContextRequiredProblemGuard
} = require('../../cloudfunctions/diagnose-http/utils/context-required-problem-guard.js')
const {
  computeQuestionEvidenceAndPenalty
} = require('../../cloudfunctions/diagnose-http/domain/evidence-scoring.js')
const {
  buildNonProblematicRoundResult
} = require('../../cloudfunctions/diagnose-http/domain/non-problematic-resolver.js')
const {
  buildCompactAnswerRoundResponse
} = require('../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js')
const {
  buildPublicRoundResponse
} = require('../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js')
const {
  buildFrontendDiagnosisResponse,
  buildFrontendAnswerResponse
} = require('../../cloudfunctions/diagnose-http/app/frontend-response.js')
const {
  buildSyntheticQuestionOptionMappings
} = require('../../cloudfunctions/diagnose-http/utils/synthetic-question-package.js')
const {
  buildRuntimeSnapshotPayload
} = require('../../cloudfunctions/diagnose-http/services/session-runtime-snapshot-codec.js')
const {
  buildPublicCoreProcess
} = require('../../cloudfunctions/diagnose-http/utils/public-core-process.js')
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
  _test: diagnosisEngineTest
} = require('../../cloudfunctions/diagnose-http/domain/diagnosis-engine.js')
const {
  _test: questionStartRunnerTest
} = require('../../cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js')
const {
  _test: sessionStateWriteServiceTest
} = require('../../cloudfunctions/diagnose-http/services/session-state-write-service.js')
const {
  _test: diagnosisReviewRepositoryTest
} = require('../../cloudfunctions/diagnose-http/repositories/diagnosis-review-repository.js')
const {
  _test: sessionResultReadServiceTest
} = require('../../cloudfunctions/diagnose-http/services/session-result-read-service.js')
Module._load = originalModuleLoad

const { normalizeDiagnosisResult } = await import('../../src/utils/diagnose-flow.js')

function buildObservedEvidenceSet(symptomKeys = []) {
  return (Array.isArray(symptomKeys) ? symptomKeys : []).map((symptomKey, index) => ({
    observedEvidenceSetId: `obs_${index + 1}`,
    evidenceKey: symptomKey,
    evidenceType: 'symptom',
    symptomKey,
    confidence: 0.99,
    sourceType: 'user_answer',
    currentStatus: 'active',
    enteredRuntime: 1
  }))
}

function buildVisualAggregateWithCandidates(symptomKeys = []) {
  return {
    aggregated_symptom_candidates: (Array.isArray(symptomKeys) ? symptomKeys : []).map(
      symptomKey => ({
        symptom_key: symptomKey,
        confidence_band: 'medium',
        strength_level: 'medium',
        admission_readiness: 'cautious',
        support_count: 1
      })
    ),
    admission_records: (Array.isArray(symptomKeys) ? symptomKeys : []).map(symptomKey => ({
      admission_result: 'candidate_retained',
      object_key: symptomKey
    }))
  }
}

function createMockRouteRepository({
  routes = [],
  conditions = [],
  questions = [],
  routeGroups = []
} = {}) {
  return {
    async getOutcomeRoutesByOutcomeKeys(outcomeKeys = []) {
      const safeOutcomeKeys = new Set(outcomeKeys)
      return routes.filter(item => safeOutcomeKeys.has(item.outcomeKey))
    },
    async getOutcomeRouteConditions(routeKeys = []) {
      const safeRouteKeys = new Set(routeKeys)
      return conditions.filter(item => safeRouteKeys.has(item.routeKey))
    },
    async getOutcomeRouteQuestions(routeKeys = []) {
      const safeRouteKeys = new Set(routeKeys)
      return questions.filter(item => safeRouteKeys.has(item.routeKey))
    },
    async getOutcomeRouteGroupsByKeys(routeGroupKeys = []) {
      const safeRouteGroupKeys = new Set(routeGroupKeys)
      return routeGroups.filter(item => safeRouteGroupKeys.has(item.routeGroupKey))
    },
    async getAllActiveOutcomeRouteGroups() {
      return routeGroups
    }
  }
}

async function testRoutePlannerConflict() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    candidateOutcomes: [
      { problemKey: 'underwatering' },
      { problemKey: 'overwatering_root_pressure' }
    ]
  })
  const routeRepository = {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'route_under',
          routeGroupKey: 'watering_split',
          outcomeKey: 'underwatering',
          actionProfileKey: 'ap_under',
          actionConflictGroup: 'water_more'
        },
        {
          routeKey: 'route_over',
          routeGroupKey: 'watering_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'ap_over',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'condition_under',
          routeKey: 'route_under',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {},
          blockerEvidence: {},
          conflictOutcomeKeys: [],
          closureLevel: '',
          onPass: '',
          onFail: '',
          onUnknown: ''
        },
        {
          conditionKey: 'condition_over',
          routeKey: 'route_over',
          conditionRole: 'display_condition',
          requiredEvidence: {},
          requiredAnswerEffects: {},
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
  }

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['underwatering', 'overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })
  assert.equal(decision.conservativePolicy, '')
  assert.deepEqual(decision.visibleOutcomeKeys, ['underwatering', 'overwatering_root_pressure'])
  assert.deepEqual(decision.visibleOutcomeKeys.slice(1), ['overwatering_root_pressure'])
  assert.deepEqual(decision.visibleActionConflictGroups.sort(), ['water_less', 'water_more'])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_action_conflict_unresolved')
}

async function testRoutePlannerKeepsThreeVisibleOutcomesAcrossMixedGroupLimits() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    candidateOutcomes: [
      { problemKey: 'nitrogen_deficiency', evidenceOrder: 1 },
      { problemKey: 'sunburn', evidenceOrder: 2 },
      { problemKey: 'leaf_spot_problem', evidenceOrder: 3 },
      { problemKey: 'overwatering_root_pressure', evidenceOrder: 4 }
    ]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'route_nitrogen',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'nitrogen_deficiency',
        actionProfileKey: 'ap_nitrogen',
        actionConflictGroup: 'fertilizer_more'
      },
      {
        routeKey: 'route_sunburn',
        routeGroupKey: 'light_heat_split_group',
        outcomeKey: 'sunburn',
        actionProfileKey: 'ap_sunburn',
        actionConflictGroup: 'avoid_sun'
      },
      {
        routeKey: 'route_leaf_spot',
        routeGroupKey: 'light_heat_split_group',
        outcomeKey: 'leaf_spot_problem',
        actionProfileKey: 'ap_leaf_spot',
        actionConflictGroup: 'control_moisture'
      },
      {
        routeKey: 'route_overwatering',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'ap_overwatering',
        actionConflictGroup: 'water_less'
      }
    ],
    conditions: [
      {
        conditionKey: 'condition_nitrogen',
        routeKey: 'route_nitrogen',
        conditionRole: 'display_condition',
        requiredEvidence: {},
        requiredAnswerEffects: {},
        blockerEvidence: {},
        conflictOutcomeKeys: [],
        closureLevel: '',
        onPass: '',
        onFail: '',
        onUnknown: ''
      },
      {
        conditionKey: 'condition_sunburn',
        routeKey: 'route_sunburn',
        conditionRole: 'display_condition',
        requiredEvidence: {},
        requiredAnswerEffects: {},
        blockerEvidence: {},
        conflictOutcomeKeys: [],
        closureLevel: '',
        onPass: '',
        onFail: '',
        onUnknown: ''
      },
      {
        conditionKey: 'condition_leaf_spot',
        routeKey: 'route_leaf_spot',
        conditionRole: 'display_condition',
        requiredEvidence: {},
        requiredAnswerEffects: {},
        blockerEvidence: {},
        conflictOutcomeKeys: [],
        closureLevel: '',
        onPass: '',
        onFail: '',
        onUnknown: ''
      },
      {
        conditionKey: 'condition_overwatering',
        routeKey: 'route_overwatering',
        conditionRole: 'display_condition',
        requiredEvidence: {},
        requiredAnswerEffects: {},
        blockerEvidence: {},
        conflictOutcomeKeys: [],
        closureLevel: '',
        onPass: '',
        onFail: '',
        onUnknown: ''
      }
    ],
    routeGroups: [
      { routeGroupKey: 'yellowing_care_split_group', maxVisibleOutcomes: 4 },
      { routeGroupKey: 'light_heat_split_group', maxVisibleOutcomes: 2 }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: [
      'nitrogen_deficiency',
      'sunburn',
      'leaf_spot_problem',
      'overwatering_root_pressure'
    ],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true },
    maxVisibleOutcomes: 3
  })

  assert.deepEqual(decision.visibleOutcomeKeys, [
    'nitrogen_deficiency',
    'sunburn',
    'leaf_spot_problem'
  ])
  assert.deepEqual(decision.visibleOutcomeKeys.slice(1), ['sunburn', 'leaf_spot_problem'])
  assert.deepEqual(decision.visibleActionConflictGroups.sort(), [
    'avoid_sun',
    'control_moisture',
    'fertilizer_more'
  ])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_action_conflict_unresolved')
}

async function testRoutePlannerDoesNotRequireQuestionForMissingCondition() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'wet_route',
        routeGroupKey: 'yellowing_split',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'ap_over',
        actionConflictGroup: 'water_less'
      }
    ],
    conditions: [
      {
        conditionKey: 'soil_condition',
        routeKey: 'wet_route',
        conditionRole: 'split_question_condition',
        requiredEvidence: { symptomKeys: ['soil_moisture_confirmed'] },
        requiredAnswerEffects: {},
        blockerEvidence: {},
        conflictOutcomeKeys: [],
        closureLevel: '',
        onPass: '',
        onFail: '',
        onUnknown: ''
      }
    ],
    questions: [
      {
        routeKey: 'wet_route',
        stepNo: 1,
        questionKey: 'q_soil_moisture_recent',
        conditionKey: 'soil_condition',
        routePackageRole: 'path_split',
        requiredForClosure: true,
        askPriority: 100
      }
    ],
    routeGroups: [{ routeGroupKey: 'yellowing_split', maxVisibleOutcomes: 3 }]
  })

  const withBudget = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })
  const noBudget = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(withBudget.requiresQuestion, false)
  assert.deepEqual(withBudget.nextQuestions, [])
  assert.deepEqual(withBudget.candidateOutcomeStates[0].questionEvidenceKeys, [
    'q_soil_moisture_recent'
  ])
  assert.equal(noBudget.requiresQuestion, false)
}

async function testRoutePlannerConservativeIsConservative() {
  const routeDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
    routeEvidenceContext: buildRouteEvidenceContext({
      candidateOutcomes: [
        { problemKey: 'overwatering_root_pressure', evidenceOrder: 1 },
        { problemKey: 'underwatering', evidenceOrder: 2 }
      ]
    }),
    routeRepository: createMockRouteRepository({
      routes: [],
      conditions: [],
      questions: [],
      routeGroups: []
    }),
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(routeDecision.conservativePolicy, 'uncertain')
  assert.deepEqual(routeDecision.visibleOutcomeKeys, [])
  assert.equal(routeDecision.requiresQuestion, false)
}

function testRouteConservativePayloadNoCandidateOutcomeLeak() {
  const payload = resolveRouteOutcomePayload({
    routeDecision: {
      conservativePolicy: 'uncertain',
      visibleOutcomeKeys: []
    },
    problems: [
      {
        problemKey: 'iron_deficiency',
        displayNameCn: '缺铁',
        userActionCn: '先检查新叶是否黄而叶脉仍绿，必要时补充螯合铁。',
        userPreventionCn: '避免长期用高碱性水或介质。'
      }
    ],
    explanations: [],
    routeOutcomes: [],
    actionProfiles: [],
    plantContext: {},
    observedEvidenceSet: [],
    outcomeType: 'uncertain',
    questionRequired: false
  })

  assert.equal(payload.outcomeMode, 'route_conservative_uncertain')
  assert.deepEqual(payload.visibleOutcomes, [])
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'primaryOutcome'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'secondaryOutcomes'), false)
}

function testRouteVisibleOutcomesSuppressUncertainWhenConcreteExists() {
  const payload = resolveRouteOutcomePayload({
    routeDecision: {
      visibleOutcomeKeys: ['overwatering_root_pressure', 'uncertain_observation'],
      visibleActionConflictGroups: ['watering_stop']
    },
    routeOutcomes: [
      {
        outcomeKey: 'overwatering_root_pressure',
        outcomeType: 'problem_cluster',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '当前更像积水或根系压力。',
        actionProfileKey: 'action_overwatering_basic'
      },
      {
        outcomeKey: 'uncertain_observation',
        outcomeType: 'uncertain',
        displayNameCn: '暂不能稳定判断',
        userDefinitionCn: '当前证据仍不足以安全闭合到具体方向。',
        actionProfileKey: 'action_uncertain_prepare'
      }
    ],
    actionProfiles: [],
    plantContext: {},
    observedEvidenceSet: [],
    outcomeType: 'problematic',
    questionRequired: false
  })

  assert.deepEqual(
    payload.visibleOutcomes.map(item => item.outcomeKey),
    ['overwatering_root_pressure']
  )
  assert.equal(payload.leadingVisibleOutcome.outcomeKey, 'overwatering_root_pressure')
  assert.equal(payload.outcomeMode, 'visible_outcomes')
}

function testSessionResultReadSuppressesUncertainWhenConcreteExists() {
  const fields = sessionResultReadServiceTest.resolveRouteOutcomeFields({
    outcomePayload: {
      outcomeMode: 'visible_outcomes',
      visibleOutcomes: [
        {
          outcomeKey: 'overwatering_root_pressure',
          outcomeType: 'problematic',
          displayNameCn: '积水/根系压力'
        },
        {
          outcomeKey: 'uncertain_observation',
          outcomeType: 'uncertain',
          displayNameCn: '暂不能稳定判断'
        }
      ],
      finalResult: {
        displayName: '积水/根系压力'
      }
    }
  })

  assert.deepEqual(
    fields.visibleOutcomes.map(item => item.outcomeKey),
    ['overwatering_root_pressure']
  )
  assert.deepEqual(
    fields.finalResult.visibleOutcomes.map(item => item.outcomeKey),
    ['overwatering_root_pressure']
  )
}

function testConditionQuestionOptionPairsRequireDeclaredRouteEffectMirror() {
  const routeMirrorMissing = matchesRequiredAnswerEffects(
    {
      questionOptionPairs: [
        'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
      ],
      routeKeys: ['yellowing_sunburn_route']
    },
    {
      answeredQuestionKeySet: new Set(['q_observed_probe__leaf_yellowing__light_change_context']),
      answeredOptionKeySet: new Set(['stronger_direct_light']),
      answeredQuestionOptionPairSet: new Set([
        'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
      ]),
      answerEffectTypeSet: new Set(),
      routeAnswerEffectOutcomeKeySet: new Set(),
      routeAnswerEffectRouteKeySet: new Set()
    }
  )

  assert.equal(routeMirrorMissing, false)

  const routeMirrorMatched = matchesRequiredAnswerEffects(
    {
      questionOptionPairs: [
        'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
      ],
      routeKeys: ['yellowing_sunburn_route']
    },
    {
      answeredQuestionKeySet: new Set(['q_observed_probe__leaf_yellowing__light_change_context']),
      answeredOptionKeySet: new Set(['stronger_direct_light']),
      answeredQuestionOptionPairSet: new Set([
        'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
      ]),
      answerEffectTypeSet: new Set(),
      routeAnswerEffectOutcomeKeySet: new Set(),
      routeAnswerEffectRouteKeySet: new Set(['yellowing_sunburn_route'])
    }
  )

  assert.equal(routeMirrorMatched, true)

  const arrayShapeMatched = matchesRequiredAnswerEffects(
    ['q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'],
    {
      answeredQuestionKeySet: new Set(['q_observed_probe__leaf_yellowing__light_change_context']),
      answeredOptionKeySet: new Set(['stronger_direct_light']),
      answeredQuestionOptionPairSet: new Set([
        'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
      ]),
      answerEffectTypeSet: new Set(),
      routeAnswerEffectOutcomeKeySet: new Set(),
      routeAnswerEffectRouteKeySet: new Set()
    }
  )

  assert.equal(arrayShapeMatched, true)
}

async function testRoutePlannerNextQuestions() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
  })
  const routeRepository = {
    async getOutcomeRoutesByOutcomeKeys() {
      return [
        {
          routeKey: 'wet_route',
          routeGroupKey: 'yellowing_split',
          outcomeKey: 'overwatering_root_pressure',
          actionProfileKey: 'ap_over',
          actionConflictGroup: 'water_less'
        }
      ]
    },
    async getOutcomeRouteConditions() {
      return [
        {
          conditionKey: 'soil_condition',
          routeKey: 'wet_route',
          conditionRole: 'split_question_condition',
          requiredEvidence: { symptomKeys: ['soil_moisture_confirmed'] },
          requiredAnswerEffects: {},
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
      return [
        {
          routeKey: 'wet_route',
          stepNo: 1,
          questionKey: 'q_soil_moisture_recent',
          conditionKey: 'soil_condition',
          routePackageRole: 'path_split',
          requiredForClosure: true,
          askPriority: 100
        }
      ]
    },
    async getOutcomeRouteGroupsByKeys() {
      return [{ routeGroupKey: 'yellowing_split', maxVisibleOutcomes: 3 }]
    }
  }

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(decision.requiresQuestion, false)
  assert.deepEqual(decision.nextQuestions, [])
  assert.deepEqual(decision.candidateOutcomeStates[0].questionEvidenceKeys, [
    'q_soil_moisture_recent'
  ])
}

async function testRoutePlannerConsumesSqlAnswerEffects() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['uniform_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      }
    ],
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing', 'uniform_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure'],
        maxVisibleOutcomes: 3
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: {
          anySymptomKeys: ['leaf_yellowing', 'uniform_yellowing']
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: []
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
}

async function testWiltingWetSoilAnswerExpandsToWiltingRouteEvidence() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['wilting_wet_soil']),
    answers: [
      {
        questionKey: 'q_root_rot_wet_soil_wilt',
        optionKey: 'yes'
      }
    ],
    askedQuestionKeys: ['q_root_rot_wet_soil_wilt'],
    candidateOutcomes: [{ problemKey: 'root_rot' }]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'wilting_wet_soil_route',
        routeGroupKey: 'wilting_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      },
      {
        routeKey: 'wilting_dry_soil_route',
        routeGroupKey: 'wilting_care_split_group',
        outcomeKey: 'underwatering',
        actionProfileKey: 'action_underwatering_basic',
        actionConflictGroup: 'watering_add'
      }
    ],
    routeGroups: [
      {
        routeGroupKey: 'wilting_care_split_group',
        entrySymptomKeys: ['wilting'],
        candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
        maxVisibleOutcomes: 2
      }
    ],
    conditions: [
      {
        conditionKey: 'wilting_wet_condition',
        routeKey: 'wilting_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { symptomKeys: ['wilting'] },
        requiredAnswerEffects: {
          questionOptionPairs: ['q_root_rot_wet_soil_wilt:yes']
        },
        blockerEvidence: {
          questionOptionPairs: ['q_root_rot_wet_soil_wilt:no']
        },
        conflictOutcomeKeys: ['underwatering']
      },
      {
        conditionKey: 'wilting_dry_condition',
        routeKey: 'wilting_dry_soil_route',
        conditionRole: 'display',
        requiredEvidence: { symptomKeys: ['wilting'] },
        requiredAnswerEffects: {
          questionOptionPairs: ['q_root_rot_wet_soil_wilt:no']
        },
        blockerEvidence: {
          questionOptionPairs: ['q_root_rot_wet_soil_wilt:yes']
        },
        conflictOutcomeKeys: ['overwatering_root_pressure']
      }
    ],
    questions: [
      {
        routeKey: 'wilting_wet_soil_route',
        stepNo: 1,
        questionKey: 'q_root_rot_wet_soil_wilt',
        conditionKey: 'wilting_wet_condition',
        routePackageRole: 'critical_split',
        requiredForClosure: true,
        askPriority: 96
      },
      {
        routeKey: 'wilting_dry_soil_route',
        stepNo: 1,
        questionKey: 'q_root_rot_wet_soil_wilt',
        conditionKey: 'wilting_dry_condition',
        routePackageRole: 'critical_split',
        requiredForClosure: true,
        askPriority: 96
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['root_rot'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(routeEvidenceContext.activeSymptomKeys, [
    'wilting_wet_soil',
    'wilting',
    'soil_wet'
  ])
  assert.deepEqual(decision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
  assert.deepEqual(decision.decisionCause.decisionCauseDetails.symptomMatchedRouteGroupKeys, [
    'wilting_care_split_group'
  ])

  const dryRouteEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['wilting_dry_soil']),
    answers: [
      {
        questionKey: 'q_root_rot_wet_soil_wilt',
        optionKey: 'no'
      }
    ],
    askedQuestionKeys: ['q_root_rot_wet_soil_wilt'],
    candidateOutcomes: [{ problemKey: 'root_rot' }]
  })
  const dryDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['root_rot'],
    routeEvidenceContext: dryRouteEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(dryRouteEvidenceContext.activeSymptomKeys, [
    'wilting_dry_soil',
    'wilting',
    'soil_dry'
  ])
  assert.deepEqual(dryDecision.visibleOutcomeKeys, ['underwatering'])
  assert.equal(dryDecision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
}

async function testRoutePlannerPassedAlternativeRouteSurvivesContradictedSplit() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet'
      }
    ],
    askedQuestionKeys: ['q_observed_probe__leaf_yellowing__watering_frequency_context'],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      },
      {
        routeKey: 'yellowing_dry_soil_alternative_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_underwatering_basic',
        actionConflictGroup: 'watering_add'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {}
      },
      {
        conditionKey: 'dry_soil_contradicted_condition',
        routeKey: 'yellowing_dry_soil_alternative_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'
          ],
          routeKeys: ['yellowing_dry_soil_alternative_route']
        },
        blockerEvidence: {}
      }
    ],
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure'],
        maxVisibleOutcomes: 1
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
}

async function testRoutePlannerSameRouteBlockerOverridesPass() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__root_rot_context',
        optionKey: 'clear_rot_smell'
      }
    ],
    candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
  })
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ]
        },
        blockerEvidence: {}
      },
      {
        conditionKey: 'root_rot_blocker_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {},
        blockerEvidence: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__root_rot_context:clear_rot_smell'
          ]
        }
      }
    ],
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure'],
        maxVisibleOutcomes: 1
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, [])
  assert.equal(decision.candidateOutcomeStates[0].state, 'blocked')
}

async function testYellowingCareContextOnlyDoesNotCloseWaterConflict() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area',
        outcomeKey: 'underwatering',
        routeKey: 'yellowing_dry_soil_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [
      { problemKey: 'overwatering_root_pressure', evidenceOrder: 1 },
      { problemKey: 'underwatering', evidenceOrder: 2 }
    ]
  })
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
        maxVisibleOutcomes: 3
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      },
      {
        routeKey: 'yellowing_dry_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'underwatering',
        actionProfileKey: 'action_underwatering_basic',
        actionConflictGroup: 'watering_add'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'
          ]
        },
        conflictOutcomeKeys: ['underwatering']
      },
      {
        conditionKey: 'dry_soil_confirmation_condition',
        routeKey: 'yellowing_dry_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'
          ],
          routeKeys: ['yellowing_dry_soil_route']
        },
        blockerEvidence: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ]
        },
        conflictOutcomeKeys: ['overwatering_root_pressure']
      }
    ],
    questions: [
      {
        routeKey: 'yellowing_wet_soil_route',
        stepNo: 2,
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        conditionKey: 'wet_soil_confirmation_condition',
        routePackageRole: 'context_probe',
        requiredForClosure: true,
        askPriority: 240
      },
      {
        routeKey: 'yellowing_dry_soil_route',
        stepNo: 2,
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        conditionKey: 'dry_soil_confirmation_condition',
        routePackageRole: 'context_probe',
        requiredForClosure: true,
        askPriority: 240
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, [])
  assert.equal(decision.requiresQuestion, false)
  assert.deepEqual(decision.nextQuestions, [])
  assert.deepEqual(decision.candidateOutcomeStates[0].questionEvidenceKeys, [
    'q_observed_probe__leaf_yellowing__watering_frequency_context'
  ])
}

async function testVisualCandidateYellowingExpandsRouteGroupAndPlansWateringContext() {
  const visualAggregateResult = buildVisualAggregateWithCandidates(['problematic_leaf_yellowing'])
  assert.deepEqual(collectVisualRouteSymptomKeys(visualAggregateResult), [
    'problematic_leaf_yellowing',
    'leaf_yellowing'
  ])

  const routeEvidenceContext = buildRouteEvidenceContext({
    visualAggregateResult,
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'watering_area',
        outcomeKey: 'underwatering',
        routeKey: 'yellowing_dry_soil_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [{ problemKey: 'iron_deficiency', evidenceOrder: 1 }]
  })

  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
        maxVisibleOutcomes: 3
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      },
      {
        routeKey: 'yellowing_dry_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'underwatering',
        actionProfileKey: 'action_underwatering_basic',
        actionConflictGroup: 'watering_add'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: ['underwatering']
      },
      {
        conditionKey: 'dry_soil_confirmation_condition',
        routeKey: 'yellowing_dry_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_dry'
          ],
          routeKeys: ['yellowing_dry_soil_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: ['overwatering_root_pressure']
      }
    ],
    questions: [
      {
        routeKey: 'yellowing_wet_soil_route',
        stepNo: 2,
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        conditionKey: 'wet_soil_confirmation_condition',
        routePackageRole: 'context_probe',
        requiredForClosure: true,
        askPriority: 240
      },
      {
        routeKey: 'yellowing_dry_soil_route',
        stepNo: 2,
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        conditionKey: 'dry_soil_confirmation_condition',
        routePackageRole: 'context_probe',
        requiredForClosure: true,
        askPriority: 240
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['iron_deficiency'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.activeRouteGroupKeys, ['yellowing_care_split_group'])
  assert.equal(
    decision.decisionCause.decisionCauseDetails.symptomMatchedRouteGroupKeys[0],
    'yellowing_care_split_group'
  )
  assert.equal(decision.requiresQuestion, false)
  assert.deepEqual(decision.nextQuestions, [])
  assert.deepEqual(decision.candidateOutcomeStates[0].questionEvidenceKeys, [
    'q_observed_probe__leaf_yellowing__watering_frequency_context'
  ])
}

async function testYellowingFrontloadedCareStartsWithWateringQuestion() {
  const questions = diagnosisEngineTest.filterQuestionsByAnsweredRouteConstraints(
    [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        targetSymptomKey: 'leaf_yellowing',
        packageTopic: 'yellowing_care_area_condition'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        targetSymptomKey: 'leaf_yellowing',
        packageTopic: 'watering_frequency_context'
      }
    ],
    {
      answers: [],
      askedQuestionRows: [],
      symptomClassRuntime: {
        currentClassKey: 'yellowing_mode'
      }
    }
  )

  assert.deepEqual(
    questions.map(item => item.questionKey),
    ['q_observed_probe__leaf_yellowing__watering_frequency_context']
  )
}

async function testYellowingFrontloadedCareAdvancesAfterWateringQuestion() {
  const questions = diagnosisEngineTest.filterQuestionsByAnsweredRouteConstraints(
    [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        targetSymptomKey: 'leaf_yellowing',
        packageTopic: 'watering_frequency_context'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        targetSymptomKey: 'leaf_yellowing',
        packageTopic: 'light_change_context'
      }
    ],
    {
      answers: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          optionKey: 'often_wet'
        }
      ],
      askedQuestionRows: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          targetSymptomKey: 'leaf_yellowing',
          packageTopic: 'watering_frequency_context'
        }
      ],
      symptomClassRuntime: {
        currentClassKey: 'yellowing_mode'
      }
    }
  )

  const questionKeys = questions.map(item => item.questionKey)
  assert.equal(
    questionKeys.includes('q_observed_probe__leaf_yellowing__yellowing_care_area_condition'),
    false
  )
  assert.equal(
    questionKeys.includes('q_observed_probe__leaf_yellowing__light_change_context'),
    true
  )
}

async function testYellowingRouteDoesNotHoldVisibleOutcomeForMissingPackageGroups() {
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure', 'uncertain_observation'],
        maxVisibleOutcomes: 2
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure'
      },
      {
        routeKey: 'yellowing_uncertain_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'uncertain_observation'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: []
      }
    ],
    questions: [
      {
        routeKey: 'yellowing_wet_soil_route',
        stepNo: 2,
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        conditionKey: 'wet_soil_confirmation_condition',
        routePackageRole: 'context_probe',
        requiredForClosure: true,
        askPriority: 240
      }
    ]
  })
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        optionKey: 'unknown'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
        optionKey: 'unknown'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__airflow_humidity_context',
        optionKey: 'unknown'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        optionKey: 'often_wet',
        outcomeKey: 'overwatering_root_pressure',
        routeKey: 'yellowing_wet_soil_route',
        effectType: 'support'
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure', 'uncertain_observation'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(decision.requiresQuestion, false)
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
}

async function testYellowingRouteUsesHistoricalGroupedAnswersForClosure() {
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['overwatering_root_pressure'],
        maxVisibleOutcomes: 1
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_wet_soil_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'action_overwatering_basic',
        actionConflictGroup: 'watering_stop'
      }
    ],
    conditions: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        routeKey: 'yellowing_wet_soil_route',
        conditionRole: 'display',
        requiredEvidence: {
          anySymptomKeys: ['leaf_yellowing']
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
          ],
          routeKeys: ['yellowing_wet_soil_route']
        },
        blockerEvidence: {}
      }
    ]
  })
  const historicalAnswers = [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
      optionKey: 'often_wet'
    },
    {
      questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
      optionKey: 'normal_or_stable'
    },
    {
      questionKey: 'q_observed_probe__leaf_yellowing__fertilization_growth_context',
      optionKey: 'normal_light_fertilizer'
    }
  ]
  const currentAnswers = [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__yellowing_progression_speed',
      optionKey: 'slow_stable'
    }
  ]
  const routeAnswerRecords = diagnosisEngineTest.collectRouteAnswerRecordsForDecision({
    answers: currentAnswers,
    answeredQuestionAnswerRecords: historicalAnswers
  })
  const currentOnlyDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      routeAnswerEffects: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          optionKey: 'often_wet',
          outcomeKey: 'overwatering_root_pressure',
          routeKey: 'yellowing_wet_soil_route',
          effectType: 'support'
        }
      ],
      answers: currentAnswers,
      askedQuestionKeys: routeAnswerRecords.map(item => item.questionKey),
      candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
    }),
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })
  const historicalDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['overwatering_root_pressure'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      routeAnswerEffects: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          optionKey: 'often_wet',
          outcomeKey: 'overwatering_root_pressure',
          routeKey: 'yellowing_wet_soil_route',
          effectType: 'support'
        }
      ],
      answers: routeAnswerRecords,
      askedQuestionKeys: routeAnswerRecords.map(item => item.questionKey),
      candidateOutcomes: [{ problemKey: 'overwatering_root_pressure' }]
    }),
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(currentOnlyDecision.visibleOutcomeKeys, [])
  assert.deepEqual(historicalDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(historicalDecision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')
}

async function testRouteFastPathBackfillsHistoricalRouteAnswerEffects() {
  const currentAnswers = [
    {
      questionKey: 'q_observed_probe__root_stress__observed_state',
      optionKey: 'with_wilting_or_drop'
    }
  ]
  const historicalAnswers = [
    {
      questionKey: 'q_observed_probe__watering_context',
      optionKey: 'often_wet'
    },
    {
      questionKey: 'q_observed_probe__light_change_context',
      optionKey: 'stronger_direct_light'
    },
    {
      questionKey: 'q_observed_probe__fertilization_growth_context',
      optionKey: 'low_or_no_fertilizer'
    }
  ]
  const routeAnswerRecords = diagnosisEngineTest.collectRouteAnswerRecordsForDecision({
    answers: currentAnswers,
    answeredQuestionAnswerRecords: historicalAnswers
  })
  const routeAnswerEffectQuestionKeys = routeAnswerRecords.map(item => item.questionKey)
  const preloadedRouteAnswerEffects = [
    {
      questionKey: 'q_observed_probe__root_stress__observed_state',
      optionKey: 'with_wilting_or_drop',
      outcomeKey: 'root_stress',
      routeKey: 'root_stress_route',
      effectType: 'support'
    }
  ]
  const missingQuestionKeys = routeAnswerEffectQuestionKeys.filter(
    questionKey => questionKey !== 'q_observed_probe__root_stress__observed_state'
  )

  const resolution = await diagnosisEngineTest.resolveRouteAnswerEffectsForFastPath({
    routeAnswerEffectQuestionKeys,
    preloadedRouteAnswerEffects,
    routeAnswerEffectsFetcher: async questionKeys => {
      assert.deepEqual([...questionKeys].sort(), [...missingQuestionKeys].sort())
      return [
        {
          questionKey: 'q_observed_probe__watering_context',
          optionKey: 'often_wet',
          outcomeKey: 'overwatering_root_pressure',
          routeKey: 'watering_root_pressure_route',
          effectType: 'support'
        },
        {
          questionKey: 'q_observed_probe__light_change_context',
          optionKey: 'stronger_direct_light',
          outcomeKey: 'sunburn',
          routeKey: 'light_stress_route',
          effectType: 'support'
        },
        {
          questionKey: 'q_observed_probe__fertilization_growth_context',
          optionKey: 'low_or_no_fertilizer',
          outcomeKey: 'nutrient_deficiency',
          routeKey: 'fertilizer_deficiency_route',
          effectType: 'support'
        },
        {
          questionKey: 'q_observed_probe__fertilization_growth_context',
          optionKey: 'low_or_no_fertilizer',
          outcomeKey: 'nitrogen_deficiency',
          routeKey: 'fertilizer_deficiency_route',
          effectType: 'support'
        }
      ]
    }
  })

  assert.equal(resolution.ok, true)
  assert.deepEqual([...resolution.missingQuestionKeys].sort(), [...missingQuestionKeys].sort())
  assert.deepEqual([...resolution.fetchedQuestionKeys].sort(), [...missingQuestionKeys].sort())
  assert.equal(resolution.usedPreloadedOnly, false)

  const matchedOutcomeKeys = diagnosisEngineTest.collectMatchedRouteEffectOutcomeKeys(
    resolution.routeAnswerEffects,
    routeAnswerRecords
  )
  assert.deepEqual(
    [...matchedOutcomeKeys].sort(),
    [
      'nitrogen_deficiency',
      'nutrient_deficiency',
      'overwatering_root_pressure',
      'root_stress',
      'sunburn'
    ].sort()
  )

  const emptyPreloadResolution = await diagnosisEngineTest.resolveRouteAnswerEffectsForFastPath({
    routeAnswerEffectQuestionKeys,
    preloadedRouteAnswerEffects: [],
    routeAnswerEffectsFetcher: async questionKeys => {
      assert.deepEqual([...questionKeys].sort(), [...routeAnswerEffectQuestionKeys].sort())
      return []
    }
  })

  assert.equal(emptyPreloadResolution.ok, true)
  assert.deepEqual(
    [...emptyPreloadResolution.fetchedQuestionKeys].sort(),
    [...routeAnswerEffectQuestionKeys].sort()
  )

  const failedResolution = await diagnosisEngineTest.resolveRouteAnswerEffectsForFastPath({
    routeAnswerEffectQuestionKeys,
    preloadedRouteAnswerEffects,
    routeAnswerEffectsFetcher: async () => {
      throw new Error('boom')
    }
  })

  assert.equal(failedResolution.ok, false)
  assert.deepEqual(
    [...failedResolution.fetchedQuestionKeys].sort(),
    [...missingQuestionKeys].sort()
  )
}

async function testYellowingCareContextAnswerKeepsRouteQuestionEvidence() {
  const buildYellowingRouteRepository = () =>
    createMockRouteRepository({
      routeGroups: [
        {
          routeGroupKey: 'yellowing_care_split_group',
          entrySymptomKeys: ['leaf_yellowing'],
          candidateOutcomeKeys: [
            'overwatering_root_pressure',
            'underwatering',
            'normal_leaf_aging',
            'low_light_growth_weakness',
            'sunburn'
          ],
          maxVisibleOutcomes: 3
        }
      ],
      routes: [
        {
          routeKey: 'yellowing_wet_soil_route',
          routeGroupKey: 'yellowing_care_split_group',
          outcomeKey: 'overwatering_root_pressure'
        },
        {
          routeKey: 'yellowing_low_light_route',
          routeGroupKey: 'yellowing_care_split_group',
          outcomeKey: 'low_light_growth_weakness'
        },
        {
          routeKey: 'yellowing_old_leaf_route',
          routeGroupKey: 'yellowing_care_split_group',
          outcomeKey: 'normal_leaf_aging'
        }
      ],
      conditions: [
        {
          conditionKey: 'wet_soil_confirmation_condition',
          routeKey: 'yellowing_wet_soil_route',
          conditionRole: 'display',
          requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:watering_area',
              'q_observed_probe__leaf_yellowing__watering_frequency_context:often_wet'
            ],
            routeKeys: ['yellowing_wet_soil_route']
          },
          blockerEvidence: {},
          conflictOutcomeKeys: []
        },
        {
          conditionKey: 'yellowing_low_light_condition',
          routeKey: 'yellowing_low_light_route',
          conditionRole: 'display',
          requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:light_area',
              'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'
            ],
            routeKeys: ['yellowing_low_light_route']
          },
          blockerEvidence: {},
          conflictOutcomeKeys: []
        },
        {
          conditionKey: 'old_leaf_aging_condition',
          routeKey: 'yellowing_old_leaf_route',
          conditionRole: 'display',
          requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
          requiredAnswerEffects: {
            questionOptionPairs: [
              'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:old_lower_leaves_first'
            ],
            routeKeys: ['yellowing_old_leaf_route']
          },
          blockerEvidence: {},
          conflictOutcomeKeys: []
        }
      ],
      questions: [
        {
          routeKey: 'yellowing_wet_soil_route',
          stepNo: 2,
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          conditionKey: 'wet_soil_confirmation_condition',
          routePackageRole: 'context_probe',
          requiredForClosure: true,
          askPriority: 240
        },
        {
          routeKey: 'yellowing_low_light_route',
          stepNo: 2,
          questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
          conditionKey: 'yellowing_low_light_condition',
          routePackageRole: 'context_probe',
          requiredForClosure: true,
          askPriority: 240
        },
        {
          routeKey: 'yellowing_old_leaf_route',
          stepNo: 1,
          questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
          conditionKey: 'old_leaf_aging_condition',
          routePackageRole: 'critical_split',
          requiredForClosure: true,
          askPriority: 230
        }
      ]
    })

  const lightDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: [
      'overwatering_root_pressure',
      'low_light_growth_weakness',
      'normal_leaf_aging'
    ],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      answers: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
          optionKey: 'light_area'
        }
      ],
      routeAnswerEffects: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
          optionKey: 'light_area',
          outcomeKey: 'low_light_growth_weakness',
          routeKey: 'yellowing_low_light_route',
          effectType: 'support'
        }
      ]
    }),
    routeRepository: buildYellowingRouteRepository(),
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(lightDecision.requiresQuestion, false)
  assert.deepEqual(lightDecision.candidateOutcomeStates[0].questionEvidenceKeys, [
    'q_observed_probe__leaf_yellowing__light_change_context'
  ])

  const unknownDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: [
      'overwatering_root_pressure',
      'low_light_growth_weakness',
      'normal_leaf_aging'
    ],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      answers: [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
          optionKey: 'unknown'
        }
      ]
    }),
    routeRepository: buildYellowingRouteRepository(),
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(
    unknownDecision.candidateOutcomeStates.some(state =>
      (state.questionEvidenceKeys || []).includes(
        'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern'
      )
    ),
    false
  )
}

async function testYellowingLowLightRouteClosesWithActionAdvice() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'light_area'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        optionKey: 'weaker_light'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'light_area',
        outcomeKey: 'low_light_growth_weakness',
        routeKey: 'yellowing_low_light_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        optionKey: 'weaker_light',
        outcomeKey: 'low_light_growth_weakness',
        routeKey: 'yellowing_low_light_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [
      { problemKey: 'iron_deficiency', evidenceOrder: 1 },
      { problemKey: 'low_light_growth_weakness', evidenceOrder: 2 }
    ]
  })
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: [
          'overwatering_root_pressure',
          'underwatering',
          'normal_leaf_aging',
          'low_light_growth_weakness'
        ],
        maxVisibleOutcomes: 3
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_low_light_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'low_light_growth_weakness',
        actionProfileKey: 'action_low_light_basic',
        actionConflictGroup: 'increase_light'
      }
    ],
    conditions: [
      {
        conditionKey: 'yellowing_low_light_condition',
        routeKey: 'yellowing_low_light_route',
        conditionRole: 'display',
        requiredEvidence: {
          anySymptomKeys: ['leaf_yellowing']
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:light_area',
            'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'
          ],
          routeKeys: ['yellowing_low_light_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: []
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['iron_deficiency'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(decision.conservativePolicy, '')
  assert.deepEqual(decision.visibleOutcomeKeys, ['low_light_growth_weakness'])
  assert.deepEqual(decision.visibleActionProfileKeys, ['action_low_light_basic'])
  assert.deepEqual(decision.visibleActionConflictGroups, ['increase_light'])
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')

  const response = formatDiagnosisResponse({
    sessionId: 'diag_yellowing_low_light_route',
    round: 3,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'iron_deficiency',
        problemCn: '缺铁',
        evidenceWeight: 0.91,
        evidenceOrder: 1
      },
      {
        problemKey: 'low_light_growth_weakness',
        problemCn: '光照不足/生长偏弱',
        evidenceWeight: 0.88,
        evidenceOrder: 2
      }
    ],
    problems: [],
    routeOutcomes: [
      {
        outcomeKey: 'low_light_growth_weakness',
        outcomeNameCn: '光照不足/生长偏弱',
        displayNameCn: '光照不足/生长偏弱',
        userDefinitionCn: '当前更像长期光照不足引起的偏弱和黄化。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      uncertainLegalityReason: '',
      decisionCause: decision.decisionCause
    },
    routeDecision: decision,
    actionProfiles: [
      {
        actionProfileKey: 'action_low_light_basic',
        todayActions: ['把植株移到更稳定明亮散射光处'],
        threeDayActions: ['3 天内观察新叶节间是否继续拉长'],
        sevenDayObserve: ['7 天内观察整体株型是否稳定'],
        avoidActions: ['不要突然暴晒或一次性大幅施肥'],
        retakeOrEscalate: []
      }
    ]
  })

  assert.equal(response.outcomeType, 'problematic')
  assert.equal(response.visibleOutcomes[0].outcomeKey, 'low_light_growth_weakness')
  assert.equal(response.finalResult.displayName, '光照不足/生长偏弱')
  assert.equal(response.finalResult.summary.includes('缺铁'), false)
  assert.equal(response.actionAdvice.todayActions[0], '把植株移到更稳定明亮散射光处')
  assert.equal(response.nextSteps[0].text, '把植株移到更稳定明亮散射光处')
  assert.equal(
    response.nextSteps.some(item => String(item?.text || '').includes('螯合铁')),
    false
  )
  assert.equal(response.whatToAvoid[0], '不要突然暴晒或一次性大幅施肥')

  const persistedAdvice = sessionStateWriteServiceTest.resolvePersistedAdviceTexts(response)
  assert.equal(persistedAdvice.treatment, '把植株移到更稳定明亮散射光处')
  assert.equal(persistedAdvice.prevention, '不要突然暴晒或一次性大幅施肥')

  const compact = buildCompactAnswerRoundResponse(response)
  assert.equal(compact.actionAdvice.todayActions[0], '把植株移到更稳定明亮散射光处')

  const normalized = normalizeDiagnosisResult(compact)
  assert.equal(normalized.actionAdvice.todayActions[0], '把植株移到更稳定明亮散射光处')
  assert.equal(normalized.nextSteps[0].text, '把植株移到更稳定明亮散射光处')
  assert.equal(normalized.treatmentText.includes('螯合铁'), false)

  const frontendAnswer = buildFrontendAnswerResponse({
    ...response,
    visibleOutcomes: response.visibleOutcomes.map(item => ({
      ...item,
      actionAdviceItems: response.actionAdvice.todayActions,
      avoidAdviceItems: response.actionAdvice.avoidActions
    })),
    outputEligibility: { status: 'visible', reasons: ['route_ready'] },
    routeDecisionCause: decision.decisionCause,
    visualBatchTrace: [{ batchId: 'batch_should_not_return' }],
    visualAggregateSummary: { sample: true },
    summaryCard: {
      title: '光照不足/生长偏弱',
      subtitle: '重复摘要',
      severity: 'medium',
      statusText: '已完成'
    }
  })
  assert.equal(frontendAnswer.actionAdvice, undefined)
  assert.equal(frontendAnswer.nextSteps, undefined)
  assert.equal(frontendAnswer.whatToAvoid, undefined)
  assert.equal(frontendAnswer.summaryCard, undefined)
  assert.equal(frontendAnswer.outputEligibility, undefined)
  assert.equal(frontendAnswer.routeDecisionCause, undefined)
  assert.equal(frontendAnswer.visualBatchTrace, undefined)
  assert.equal(frontendAnswer.visualAggregateSummary, undefined)
  assert.equal(frontendAnswer.finalResult.visibleOutcomes, undefined)
  assert.equal(frontendAnswer.finalResult.actionAdvice, undefined)
  assert.deepEqual(
    frontendAnswer.visibleOutcomes.map(item => item.outcomeKey),
    ['low_light_growth_weakness']
  )
  assert.equal(
    frontendAnswer.visibleOutcomes[0].actionAdviceItems[0],
    '把植株移到更稳定明亮散射光处'
  )
  assert.equal(JSON.stringify(frontendAnswer).length < 2500, true)

  const normalizedFrontendAnswer = normalizeDiagnosisResult(frontendAnswer)
  assert.equal(normalizedFrontendAnswer.visibleOutcomes[0].outcomeKey, 'low_light_growth_weakness')
}

function testRouteActionProfilesLimitedToVisibleOutcomes() {
  const profileKeys = diagnosisEngineTest.resolveVisibleRouteActionProfileKeys(
    {
      visibleOutcomeKeys: ['leaf_spot_problem'],
      visibleActionProfileKeys: ['action_leaf_spot_basic']
    },
    [
      {
        outcomeKey: 'leaf_spot_problem',
        actionProfileKey: 'action_leaf_spot_basic'
      },
      {
        outcomeKey: 'nutrient_deficiency',
        actionProfileKey: 'action_nutrient_support_basic'
      },
      {
        outcomeKey: 'root_stress',
        actionProfileKey: 'action_root_stress_basic'
      }
    ]
  )

  assert.deepEqual(profileKeys, ['action_leaf_spot_basic'])
}

function testLeafSpotRouteAdviceDoesNotAppendYellowingFertilizerGuidance() {
  const payload = resolveRouteOutcomePayload({
    routeDecision: {
      visibleOutcomeKeys: ['leaf_spot_problem'],
      visibleActionConflictGroups: ['control_moisture']
    },
    routeOutcomes: [
      {
        outcomeKey: 'leaf_spot_problem',
        outcomeType: 'problem_cluster',
        outcomeCategory: 'leaf_spot',
        displayNameCn: '叶斑类问题',
        userDefinitionCn: '当前更像叶斑类问题。',
        actionProfileKey: 'action_leaf_spot_basic'
      }
    ],
    actionProfiles: [
      {
        actionProfileKey: 'action_leaf_spot_basic',
        todayActions: ['先减少叶面长期潮湿', '改善通风'],
        threeDayActions: ['3 天内观察斑点是否继续扩散'],
        sevenDayObserve: ['7 天内记录新斑点是否出现'],
        avoidActions: ['不要继续频繁喷水到叶面'],
        retakeOrEscalate: []
      }
    ],
    plantContext: {
      fertilization: {
        type: '薄肥',
        freq: [15, 30],
        unit: '天'
      }
    },
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing', 'spreading_spots']),
    outcomeType: 'problematic'
  })

  assert.deepEqual(payload.actionAdvice.todayActions, ['先减少叶面长期潮湿', '改善通风'])
  assert.deepEqual(payload.actionAdvice.avoidActions, ['不要继续频繁喷水到叶面'])
  assert.deepEqual(payload.visibleOutcomes[0].actionAdviceItems, [
    '先减少叶面长期潮湿',
    '改善通风',
    '3 天内观察斑点是否继续扩散',
    '7 天内记录新斑点是否出现'
  ])
  assert.deepEqual(payload.visibleOutcomes[0].avoidAdviceItems, ['不要继续频繁喷水到叶面'])
}

function testYellowingOutcomeAdviceAddsPestAndNaturalAgingReview() {
  const payload = resolveRouteOutcomePayload({
    routeDecision: {
      visibleOutcomeKeys: ['low_light_growth_weakness'],
      visibleActionConflictGroups: ['increase_light']
    },
    routeOutcomes: [
      {
        outcomeKey: 'low_light_growth_weakness',
        outcomeType: 'problem_cluster',
        outcomeCategory: 'light',
        displayNameCn: '光照不足/生长偏弱',
        userDefinitionCn: '当前更像光照不足。',
        actionProfileKey: 'action_low_light_basic'
      }
    ],
    actionProfiles: [
      {
        actionProfileKey: 'action_low_light_basic',
        todayActions: ['移到更明亮的散射光处'],
        threeDayActions: ['观察新生长是否恢复'],
        sevenDayObserve: [],
        avoidActions: ['不要突然暴晒'],
        retakeOrEscalate: []
      }
    ],
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    outcomeType: 'problematic'
  })

  const adviceText = JSON.stringify(payload.actionAdvice)
  assert.equal(adviceText.includes('叶背、叶柄和叶面是否有小虫'), true)
  assert.equal(adviceText.includes('老叶自然代谢'), true)
  assert.equal(
    payload.visibleOutcomes[0].actionAdviceItems.some(text => text.includes('老叶自然代谢')),
    true
  )
}

function testYellowingWeakLeafAgeEvidenceDoesNotCloseNutrientOutcomes() {
  const roleMap = new Map([
    ['iron_deficiency', 'root_cause'],
    ['nitrogen_deficiency', 'root_cause'],
    ['nutrient_deficiency', 'root_cause']
  ])
  const runtimeOptions = {
    symptomClassRuntime: {
      currentClassKey: 'yellowing_mode'
    }
  }

  for (const symptomKey of ['yellow_new_leaves', 'yellow_lower_leaves', 'uniform_yellowing']) {
    const observedEvidenceSet = buildObservedEvidenceSet([symptomKey])
    assert.equal(
      isCandidateOutcomeOutputEligible(
        { problemKey: 'iron_deficiency', problemRole: 'root_cause' },
        observedEvidenceSet,
        roleMap,
        runtimeOptions
      ),
      false
    )
    assert.equal(
      isCandidateOutcomeOutputEligible(
        { problemKey: 'nitrogen_deficiency', problemRole: 'root_cause' },
        observedEvidenceSet,
        roleMap,
        runtimeOptions
      ),
      false
    )
    assert.equal(
      isCandidateOutcomeOutputEligible(
        { problemKey: 'nutrient_deficiency', problemRole: 'root_cause' },
        observedEvidenceSet,
        roleMap,
        runtimeOptions
      ),
      false
    )
  }

  assert.equal(
    isCandidateOutcomeOutputEligible(
      { problemKey: 'nitrogen_deficiency', problemRole: 'root_cause' },
      buildObservedEvidenceSet(['fertilization_gap']),
      roleMap,
      runtimeOptions
    ),
    true
  )
}

function testYellowingNutrientGuardDoesNotForceLeafAgeQuestion() {
  const guard = evaluateContextRequiredProblemGuard({
    candidateOutcomes: [{ problemKey: 'nutrient_deficiency' }],
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answerEffects: []
  })

  assert.equal(guard.applies, true)
  assert.equal(guard.hasRequiredContext, false)
  assert.deepEqual(guard.preferredQuestionKeys, ['q_leaf_yellowing_fertilization_background'])
  assert.equal(guard.preferredQuestionKeys.includes('q_leaf_yellowing_new_growth_bias'), false)
}

function testSessionYellowingLeafAgeAnswerDoesNotAffectEvidenceScoring() {
  const result = computeQuestionEvidenceAndPenalty({
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        optionKey: 'old_lower_leaves_first'
      }
    ],
    questions: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        packageTopic: 'yellowing_leaf_age_pattern'
      }
    ],
    optionMappings: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        optionKey: 'old_lower_leaves_first',
        mapsToSymptomKey: 'yellow_lower_leaves',
        value: 1,
        associationStrength: 1,
        directProblemAdjustments: [
          {
            problemKey: 'nitrogen_deficiency',
            effectValue: 0.4
          }
        ]
      }
    ],
    candidateProblemKeys: ['nitrogen_deficiency'],
    symptomDictionary: [
      {
        symptomKey: 'yellow_lower_leaves',
        signalReliability: 1
      }
    ],
    evidenceEdges: [
      {
        problemKey: 'nitrogen_deficiency',
        symptomKey: 'yellow_lower_leaves',
        associationStrength: 1,
        edgeReliability: 1
      }
    ]
  })

  assert.deepEqual(result.answerEffects, [])
  assert.equal(result.questionScores.nitrogen_deficiency, 0)
}

async function testSessionYellowingLeafAgeAnswerDoesNotCloseRoute() {
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'yellowing_old_leaf_route',
        routeGroupKey: 'yellowing_care_routes',
        outcomeKey: 'normal_leaf_aging',
        actionProfileKey: 'action_normal_leaf_aging',
        actionConflictGroup: 'observe'
      }
    ],
    conditions: [
      {
        conditionKey: 'old_leaf_aging_condition',
        routeKey: 'yellowing_old_leaf_route',
        conditionRole: 'display',
        requiredEvidence: { anySymptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:old_lower_leaves_first'
          ],
          routeKeys: ['yellowing_old_leaf_route']
        },
        blockerEvidence: {},
        conflictOutcomeKeys: []
      }
    ],
    questions: [
      {
        routeKey: 'yellowing_old_leaf_route',
        stepNo: 1,
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        conditionKey: 'old_leaf_aging_condition',
        routePackageRole: 'critical_split',
        requiredForClosure: true,
        askPriority: 230,
        packageTopic: 'yellowing_leaf_age_pattern'
      }
    ]
  })

  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        optionKey: 'old_lower_leaves_first',
        packageTopic: 'yellowing_leaf_age_pattern'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
        optionKey: 'old_lower_leaves_first',
        outcomeKey: 'normal_leaf_aging',
        routeKey: 'yellowing_old_leaf_route',
        effectType: 'support',
        evidenceDimension: 'yellowing_leaf_age_pattern'
      }
    ]
  })

  assert.equal(
    routeEvidenceContext.answeredQuestionOptionPairSet.has(
      'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern:old_lower_leaves_first'
    ),
    false
  )
  assert.equal(routeEvidenceContext.routeAnswerEffectOutcomeKeySet.has('normal_leaf_aging'), false)

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['normal_leaf_aging'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(decision.visibleOutcomeKeys, [])
}

function testMultiOutcomeConflictPreservesPerOutcomeAdviceItems() {
  const payload = resolveRouteOutcomePayload({
    routeDecision: {
      visibleOutcomeKeys: ['sunburn', 'fertilizer_repot_stress', 'overwatering_root_pressure'],
      visibleActionConflictGroups: ['avoid_sun', 'reduce_fertilizer', 'water_less']
    },
    routeOutcomes: [
      {
        outcomeKey: 'sunburn',
        displayNameCn: '晒伤/强光刺激',
        userDefinitionCn: '当前更像强光刺激。',
        actionProfileKey: 'action_sunburn_basic'
      },
      {
        outcomeKey: 'fertilizer_repot_stress',
        displayNameCn: '施肥/换盆应激',
        userDefinitionCn: '当前更像近期施肥或换盆后的应激。',
        actionProfileKey: 'action_fertilizer_repot_stress_basic'
      },
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系受影响',
        userDefinitionCn: '当前更像盆土偏湿导致根系受影响。',
        actionProfileKey: 'action_overwatering_root_pressure_basic'
      }
    ],
    actionProfiles: [
      {
        actionProfileKey: 'action_sunburn_basic',
        todayActions: ['移到柔和光线处'],
        threeDayActions: ['观察新叶是否继续焦边'],
        sevenDayObserve: [],
        avoidActions: ['不要突然暴晒'],
        retakeOrEscalate: []
      },
      {
        actionProfileKey: 'action_fertilizer_repot_stress_basic',
        todayActions: ['暂停施肥'],
        threeDayActions: [],
        sevenDayObserve: ['记录新叶恢复情况'],
        avoidActions: ['不要继续追肥'],
        retakeOrEscalate: []
      },
      {
        actionProfileKey: 'action_overwatering_root_pressure_basic',
        todayActions: ['暂停浇水并加强通风'],
        threeDayActions: ['确认盆土是否变干'],
        sevenDayObserve: [],
        avoidActions: ['不要继续保持盆土长期潮湿'],
        retakeOrEscalate: []
      }
    ],
    outcomeType: 'problematic'
  })

  assert.equal(payload.actionAdvice.conflictDetected, true)
  assert.deepEqual(
    payload.visibleOutcomes.map(item => item.displayNameCn),
    ['晒伤/强光刺激', '施肥/换盆应激', '积水/根系受影响']
  )
  assert.deepEqual(
    payload.visibleOutcomes.map(item => item.actionAdviceItems),
    [
      ['移到柔和光线处', '观察新叶是否继续焦边'],
      ['暂停施肥', '记录新叶恢复情况'],
      ['暂停浇水并加强通风', '确认盆土是否变干']
    ]
  )
  assert.deepEqual(
    payload.visibleOutcomes.map(item => item.avoidAdviceItems),
    [['不要突然暴晒'], ['不要继续追肥'], ['不要继续保持盆土长期潮湿']]
  )
}

function testRootStressRouteUsesUserFriendlyDisplayName() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_root_copy',
    round: 3,
    stage: 'final',
    candidateOutcomes: [],
    plantContext: {},
    routeOutcomes: [
      {
        outcomeKey: 'root_stress',
        problemKey: 'root_stress',
        outcomeType: 'problem_cluster',
        outcomeCategory: 'root',
        outcomeNameCn: '根部环境压力',
        displayNameCn: '根部环境压力',
        userDefinitionCn: '当前更像根部周围环境不稳定，疑似闷根或根系受压。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      uncertainLegalityReason: ''
    },
    routeDecision: {
      visibleOutcomeKeys: ['root_stress'],
      visibleActionConflictGroups: ['root_stabilize'],
      decisionCause: {
        decisionCauseKey: 'airflow_root_stress_confirmed',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '通风/湿度变化叠加萎蔫或掉叶，更符合根部环境压力方向。'
      }
    },
    actionProfiles: [
      {
        actionProfileKey: 'action_root_stress_basic',
        titleCn: '先稳定根部环境',
        todayActions: ['先检查盆土干湿、盆底积水和通风状态'],
        avoidActions: ['不要在疑似闷根或根系受压时继续重肥或频繁浇水']
      }
    ]
  })

  assert.equal(response.finalResult.displayName, '根部环境压力')
  assert.equal(response.visibleOutcomes[0].displayNameCn, '根部环境压力')
  assert.equal(response.finalResult.summary.includes('根区压力'), false)
  assert.equal(response.actionAdvice.todayActions[0], '先检查盆土干湿、盆底积水和通风状态')
  assert.equal(response.actionAdvice.avoidActions[0].includes('根区压力'), false)
}

async function testYellowingAirflowLeafSpotRequiresVisibleSpotEvidence() {
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: ['leaf_spot_problem'],
        maxVisibleOutcomes: 1
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_airflow_leaf_spot_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'leaf_spot_problem',
        actionProfileKey: 'action_leaf_spot_basic',
        actionConflictGroup: 'control_moisture'
      }
    ],
    conditions: [
      {
        conditionKey: 'airflow_leaf_spot_condition',
        routeKey: 'yellowing_airflow_leaf_spot_route',
        conditionRole: 'display',
        requiredEvidence: {
          symptomKeys: ['spreading_spots'],
          anySymptomKeys: [
            'leaf_yellowing',
            'uniform_yellowing',
            'yellow_lower_leaves',
            'yellow_new_leaves',
            'interveinal_chlorosis'
          ]
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:airflow_humidity_area',
            'q_observed_probe__leaf_yellowing__yellowing_progression_speed:rapid_spreading'
          ],
          routeKeys: ['yellowing_airflow_leaf_spot_route']
        },
        blockerEvidence: {}
      }
    ]
  })
  const airflowRapidAnswers = [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
      optionKey: 'airflow_humidity_area'
    },
    {
      questionKey: 'q_observed_probe__leaf_yellowing__yellowing_progression_speed',
      optionKey: 'rapid_spreading'
    }
  ]
  const routeAnswerEffects = [
    {
      questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
      optionKey: 'airflow_humidity_area',
      outcomeKey: 'leaf_spot_problem',
      routeKey: 'yellowing_airflow_leaf_spot_route',
      effectType: 'support'
    },
    {
      questionKey: 'q_observed_probe__leaf_yellowing__yellowing_progression_speed',
      optionKey: 'rapid_spreading',
      outcomeKey: 'leaf_spot_problem',
      routeKey: 'yellowing_airflow_leaf_spot_route',
      effectType: 'support'
    }
  ]

  const yellowingOnlyDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['leaf_spot_problem'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      answers: airflowRapidAnswers,
      routeAnswerEffects,
      candidateOutcomes: [{ problemKey: 'leaf_spot_problem', evidenceOrder: 1 }]
    }),
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(yellowingOnlyDecision.visibleOutcomeKeys, [])
  assert.deepEqual(
    yellowingOnlyDecision.candidateOutcomeStates,
    [],
    '纯黄叶候选不得保留叶斑 outcome'
  )
  assert.equal(
    yellowingOnlyDecision.decisionCause.decisionCauseKey,
    'route_conservative_no_candidates'
  )

  const visibleSpotDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['leaf_spot_problem'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing', 'spreading_spots']),
      answers: airflowRapidAnswers,
      routeAnswerEffects,
      candidateOutcomes: [{ problemKey: 'leaf_spot_problem', evidenceOrder: 1 }]
    }),
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(visibleSpotDecision.visibleOutcomeKeys, ['leaf_spot_problem'])

  const yellowingModeWithSpotDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['leaf_spot_problem'],
    routeEvidenceContext: buildRouteEvidenceContext({
      symptomClassRuntime: { currentClassKey: 'yellowing_mode' },
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing', 'spreading_spots']),
      answers: airflowRapidAnswers,
      routeAnswerEffects,
      candidateOutcomes: [{ problemKey: 'leaf_spot_problem', evidenceOrder: 1 }]
    }),
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.deepEqual(
    yellowingModeWithSpotDecision.visibleOutcomeKeys,
    [],
    'yellowing_mode 即使混入斑点证据也不得输出叶斑 outcome'
  )
}

async function testYellowingStrongLightRouteClosesWithSunburnActionAdvice() {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
    answers: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'light_area'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        optionKey: 'stronger_direct_light'
      }
    ],
    routeAnswerEffects: [
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'light_area',
        outcomeKey: 'low_light_growth_weakness',
        routeKey: 'yellowing_low_light_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
        optionKey: 'light_area',
        outcomeKey: 'sunburn',
        routeKey: 'yellowing_sunburn_route',
        effectType: 'support'
      },
      {
        questionKey: 'q_observed_probe__leaf_yellowing__light_change_context',
        optionKey: 'stronger_direct_light',
        outcomeKey: 'sunburn',
        routeKey: 'yellowing_sunburn_route',
        effectType: 'support'
      }
    ],
    candidateOutcomes: [
      { problemKey: 'iron_deficiency', evidenceOrder: 1 },
      { problemKey: 'low_light_growth_weakness', evidenceOrder: 2 }
    ]
  })
  const routeRepository = createMockRouteRepository({
    routeGroups: [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: [
          'overwatering_root_pressure',
          'underwatering',
          'normal_leaf_aging',
          'low_light_growth_weakness',
          'sunburn'
        ],
        maxVisibleOutcomes: 3
      }
    ],
    routes: [
      {
        routeKey: 'yellowing_low_light_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'low_light_growth_weakness',
        actionProfileKey: 'action_low_light_basic',
        actionConflictGroup: 'increase_light'
      },
      {
        routeKey: 'yellowing_sunburn_route',
        routeGroupKey: 'yellowing_care_split_group',
        outcomeKey: 'sunburn',
        actionProfileKey: 'action_sunburn_basic',
        actionConflictGroup: 'avoid_sun'
      }
    ],
    conditions: [
      {
        conditionKey: 'yellowing_low_light_condition',
        routeKey: 'yellowing_low_light_route',
        conditionRole: 'display',
        requiredEvidence: {
          anySymptomKeys: ['leaf_yellowing']
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:light_area',
            'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'
          ],
          routeKeys: ['yellowing_low_light_route']
        },
        blockerEvidence: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
          ]
        },
        conflictOutcomeKeys: []
      },
      {
        conditionKey: 'yellowing_sunburn_condition',
        routeKey: 'yellowing_sunburn_route',
        conditionRole: 'display',
        requiredEvidence: {
          anySymptomKeys: ['leaf_yellowing']
        },
        requiredAnswerEffects: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__yellowing_care_area_condition:light_area',
            'q_observed_probe__leaf_yellowing__light_change_context:stronger_direct_light'
          ],
          routeKeys: ['yellowing_sunburn_route']
        },
        blockerEvidence: {
          questionOptionPairs: [
            'q_observed_probe__leaf_yellowing__light_change_context:weaker_light'
          ]
        },
        conflictOutcomeKeys: []
      }
    ]
  })

  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['iron_deficiency'],
    routeEvidenceContext,
    routeRepository,
    featureFlags: { routePlanningEnabled: true }
  })

  assert.equal(decision.conservativePolicy, '')
  assert.deepEqual(decision.visibleOutcomeKeys, ['sunburn'])
  assert.deepEqual(decision.visibleActionProfileKeys, ['action_sunburn_basic'])
  assert.deepEqual(decision.visibleActionConflictGroups, ['avoid_sun'])
  assert.ok(decision.blockedOutcomeKeys.includes('low_light_growth_weakness'))
  assert.equal(decision.decisionCause.decisionCauseKey, 'route_visible_outcomes_ready')

  const response = formatDiagnosisResponse({
    sessionId: 'diag_yellowing_sunburn_route',
    round: 3,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'iron_deficiency',
        problemCn: '缺铁',
        evidenceWeight: 0.91,
        evidenceOrder: 1
      },
      {
        problemKey: 'sunburn',
        problemCn: '晒伤/强光刺激',
        evidenceWeight: 0.88,
        evidenceOrder: 2
      }
    ],
    problems: [],
    routeOutcomes: [
      {
        outcomeKey: 'sunburn',
        outcomeNameCn: '晒伤/强光刺激',
        displayNameCn: '晒伤/强光刺激',
        userDefinitionCn: '当前更像近期直射明显增强或暴晒引起的强光刺激。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      uncertainLegalityReason: '',
      decisionCause: decision.decisionCause
    },
    routeDecision: decision,
    actionProfiles: [
      {
        actionProfileKey: 'action_sunburn_basic',
        todayActions: ['先移离正午直射光'],
        threeDayActions: ['3 天内观察受损叶片是否继续扩大'],
        sevenDayObserve: ['7 天内观察新叶是否稳定'],
        avoidActions: ['不要马上重肥或重药'],
        retakeOrEscalate: []
      }
    ]
  })

  assert.equal(response.outcomeType, 'problematic')
  assert.equal(response.visibleOutcomes[0].outcomeKey, 'sunburn')
  assert.equal(response.finalResult.displayName, '晒伤/强光刺激')
  assert.equal(response.finalResult.summary.includes('缺铁'), false)
  assert.equal(response.actionAdvice.todayActions[0], '先移离正午直射光')
}

function testRouteExplanationFollowsRoutePrimaryOutcome() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_explanation_primary_switch',
    round: 4,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'iron_deficiency',
        problemCn: '缺铁',
        evidenceWeight: 0.95,
        evidenceOrder: 1
      },
      {
        problemKey: 'sunburn',
        problemCn: '晒伤/强光刺激',
        evidenceWeight: 0.9,
        evidenceOrder: 2
      }
    ],
    problems: [
      {
        problemKey: 'iron_deficiency',
        displayNameCn: '缺铁',
        userDefinitionCn: '当前更像缺铁。',
        problemRole: 'root_cause'
      },
      {
        problemKey: 'sunburn',
        displayNameCn: '晒伤/强光刺激',
        userDefinitionCn: '当前更像强光灼伤。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'iron_deficiency',
        whyItHappensCn: '缺铁是以新叶脉间黄化为主的营养问题。',
        firstAidCn: '先补充螯合铁。',
        avoidCn: '不要盲目加大浇水。'
      },
      {
        problemKey: 'sunburn',
        whyItHappensCn: '叶片在强光直射下受灼伤。',
        whatToCheckNextCn: '检查是否近期直射光明显增强。',
        firstAidCn: '先移离正午直射光。',
        avoidCn: '不要继续暴晒。',
        reassuranceCn: '调整后新叶通常会更稳定。'
      }
    ],
    routeOutcomes: [
      {
        outcomeKey: 'sunburn',
        displayNameCn: '晒伤/强光刺激',
        userDefinitionCn: '当前更像强光灼伤。',
        firstAid: '先移离正午直射光。',
        avoid: '不要继续暴晒。'
      },
      {
        outcomeKey: 'nutrient_deficiency',
        displayNameCn: '营养不足',
        userDefinitionCn: '当前仍有营养不足候选。'
      },
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '当前仍有积水候选。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      stopReasonDetail: 'route_visible_outcomes_ready',
      uncertainLegalityReason: '',
      decisionCause: {
        decisionCauseKey: 'route_visible_outcomes_ready',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    routeDecision: {
      mode: 'multi_outcome_route',
      visibleOutcomeKeys: ['sunburn', 'nutrient_deficiency', 'overwatering_root_pressure'],
      visibleActionConflictGroups: ['avoid_sun', 'fertilizer_more', 'water_less'],
      visibleActionProfileKeys: ['action_sunburn_basic'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'route_visible_outcomes_ready',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    actionProfiles: [
      {
        actionProfileKey: 'action_sunburn_basic',
        todayActions: ['先移离正午直射光'],
        threeDayActions: ['3 天内观察受损叶片是否继续扩大'],
        sevenDayObserve: ['7 天内观察新叶是否稳定'],
        avoidActions: ['不要继续暴晒'],
        retakeOrEscalate: []
      }
    ]
  })

  assert.equal(response.visibleOutcomes[0].outcomeKey, 'sunburn')
  assert.equal(response.outcomeMode, 'visible_outcomes')
  assert.deepEqual(
    response.visibleOutcomes.map(item => item.outcomeKey),
    ['sunburn', 'nutrient_deficiency', 'overwatering_root_pressure']
  )
  assert.deepEqual(
    response.visibleOutcomes.slice(1).map(item => item.outcomeKey),
    ['nutrient_deficiency', 'overwatering_root_pressure']
  )
  assert.doesNotMatch(response.explanation.whyItHappens, /缺铁/)
  assert.match(response.explanation.whyItHappens, /强光|灼伤/)
  assert.doesNotMatch(response.resultExplanation.whyItHappens, /缺铁/)
  assert.match(response.resultExplanation.whyItHappens, /强光|灼伤/)
  assert.match(response.explanation.firstAid, /移离正午直射光/)
  assert.match(response.resultExplanation.firstAid, /移离正午直射光/)
}

function testQuestionCompletedStateUsesRouteConvergenceBranch() {
  const source = readFileSync('./src/pages/diagnose/question-package.vue', 'utf8')

  assert.match(
    source,
    /v-else-if="result && !result\.hasActiveQuestions && !hasRouteConvergenceDetails"/
  )
  assert.match(source, /const hasRouteConvergenceDetails = computed\(\(\) =>/)
}

function testDiagnosisResultPageUsesVisibleOutcomeList() {
  const source = readFileSync('./src/pages/diagnose/diagnose.vue', 'utf8')

  assert.match(source, /function buildOutcomeDisplayItems/)
  assert.match(source, /v-for="item in viewModel\.outcomeItems"/)
  assert.match(source, /normalizeDiagnosisResult\(remoteResult\.value/)
  assert.doesNotMatch(source, /mainIssue:\s*remoteResult\.value\?\.finalResult\?\.displayName/)
}

function testRuntimeSnapshotPersistsInternalRouteDecision() {
  const routeDecision = {
    mode: 'multi_outcome_route',
    visibleOutcomeKeys: ['overwatering_root_pressure'],
    activeRouteGroupKeys: ['yellowing_care_split_group'],
    conditionResults: [
      {
        conditionKey: 'wet_soil_confirmation_condition',
        result: 'pass'
      }
    ],
    routeTrace: [
      {
        outcomeKey: 'overwatering_root_pressure',
        matchedRouteKeys: ['yellowing_wet_soil_route']
      }
    ],
    decisionCause: {
      decisionCauseKey: 'route_visible_outcomes_ready'
    }
  }

  const snapshot = JSON.parse(
    buildRuntimeSnapshotPayload({
      sessionId: 'diag_test_route_snapshot',
      plantContext: {
        plantId: '1'
      },
      response: {
        roundId: 'round_4',
        outcomeType: 'problematic',
        metrics: {
          reliabilityScore: 0.12,
          routeDecisionGap: 0.03,
          routeDecision: null
        },
        __runtimeRouteDecision: routeDecision
      },
      round: 4
    })
  )

  assert.equal(snapshot.metrics, null)
  assert.deepEqual(snapshot.routeDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.deepEqual(snapshot.routeDecision.activeRouteGroupKeys, ['yellowing_care_split_group'])
  assert.equal(
    snapshot.routeDecision.decisionCause.decisionCauseKey,
    'route_visible_outcomes_ready'
  )
  assert.equal(snapshot.routeDecision.routeTrace, undefined)
}

function testManualQuestionStartRouteGroupBridge() {
  const activeSymptomKeys = questionStartRunnerTest.resolveManualStartActiveSymptomKeys(
    buildObservedEvidenceSet(['uniform_yellowing'])
  )
  assert.equal(activeSymptomKeys.includes('uniform_yellowing'), true)
  assert.equal(activeSymptomKeys.includes('leaf_yellowing'), true)

  const candidateOutcomeKeys = questionStartRunnerTest.collectCandidateOutcomeKeysFromRouteGroups(
    [
      {
        routeGroupKey: 'yellowing_care_split_group',
        entrySymptomKeys: ['leaf_yellowing'],
        candidateOutcomeKeys: [
          'overwatering_root_pressure',
          'underwatering',
          'leaf_spot_problem',
          'stable_natural_marking'
        ]
      }
    ],
    activeSymptomKeys
  )
  assert.deepEqual(candidateOutcomeKeys, ['overwatering_root_pressure', 'underwatering'])

  const nonYellowingCandidateOutcomeKeys =
    questionStartRunnerTest.collectCandidateOutcomeKeysFromRouteGroups(
      [
        {
          routeGroupKey: 'leaf_spot_split_group',
          entrySymptomKeys: ['spreading_spots'],
          candidateOutcomeKeys: ['leaf_spot_problem']
        }
      ],
      ['spreading_spots']
    )
  assert.deepEqual(nonYellowingCandidateOutcomeKeys, ['leaf_spot_problem'])
}

async function testManualQuestionStartFastPathBuildsQuestionRound() {
  const observedSymptoms = [
    {
      symptomKey: 'uniform_yellowing',
      symptomCn: '整叶黄化',
      confidence: 0.82,
      source: 'manual_symptom_mode'
    }
  ]
  const observedEvidenceSet = [
    {
      observedEvidenceSetId: 'manual_symptom_mode::yellowing_mode::uniform_yellowing',
      evidenceKey: 'uniform_yellowing',
      evidenceType: 'symptom',
      symptomKey: 'uniform_yellowing',
      symptomCn: '整叶黄化',
      confidence: 0.82,
      sourceType: 'manual_symptom_mode',
      currentStatus: 'active',
      targetLayer: 'observed_evidence_set',
      enteredRuntime: 1
    }
  ]
  const routeRepository = {
    async getAllActiveOutcomeRouteGroups() {
      return [
        {
          routeGroupKey: 'yellowing_care_split_group',
          entrySymptomKeys: ['leaf_yellowing'],
          candidateOutcomeKeys: ['overwatering_root_pressure']
        }
      ]
    }
  }
  const questionRepository = {
    async findQuestionKeysByTargetSymptoms() {
      throw new Error('route-backed package should be used before conservative')
    },
    async getQuestionsByKeys(questionKeys) {
      assert.deepEqual(questionKeys, [
        'q_observed_probe__leaf_yellowing__watering_frequency_context'
      ])
      return [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          questionTextUserCn: '请您选择在过去的10天内，哪几天浇了水？',
          questionGroupKey: 'watering_frequency_context',
          targetSymptomKey: 'leaf_yellowing',
          packageTopic: 'watering_frequency_context',
          packageSection: 'context_probe',
          routePackageRole: 'route_condition',
          questionType: 'single_choice',
          defaultOptionKey: 'care_behavior_timeline'
        }
      ]
    },
    async getQuestionOptionMappings(questionKeys) {
      assert.deepEqual(questionKeys, [
        'q_observed_probe__leaf_yellowing__watering_frequency_context'
      ])
      return [
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          optionKey: 'care_behavior_timeline',
          optionTextUserCn: '按浇水日历判断',
          isDefault: true
        },
        {
          questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
          optionKey: 'unknown',
          optionTextUserCn: '说不清/没留意'
        }
      ]
    }
  }
  const routePlanner = async () => {
    throw new Error(
      'pure yellowing manual start should use care/environment guard before route planning'
    )
  }

  const result = await questionStartRunnerTest.buildManualQuestionStartRoundResult({
    sessionId: 'diag_manual_fast_path',
    plantContext: {
      plantId: '1',
      plantDisplayName: '测试植物'
    },
    observedSymptoms,
    observedEvidenceSet,
    routeRepository,
    questionRepository,
    routePlanner
  })

  assert.equal(result.questionRequired, true)
  assert.equal(result.stage, 'question_package')
  assert.equal(result.sessionStatus, 'awaiting_question_package')
  assert.equal(result.questions.length, 4)
  assert.equal(result.questions[0].selectionSource, 'route_planner')
  assert.deepEqual(
    result.questions.map(item => item.questionKey),
    [
      'q_observed_probe__leaf_yellowing__watering_frequency_context',
      'q_observed_probe__leaf_yellowing__light_change_context',
      'q_observed_probe__leaf_yellowing__fertilization_growth_context',
      'q_observed_probe__leaf_yellowing__airflow_humidity_context'
    ]
  )
  assert.equal(
    result.questions.some(
      item => item.questionKey === 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition'
    ),
    false
  )
  assert.equal(result.__runtimeRouteDecision.mode, 'manual_yellowing_care_environment_frontloaded')
  assert.equal(Number(result.outputEligibility?.eligible || 0), 0)
}

function testVisualParserFields() {
  const parsed = parseLLMVisualResult(
    JSON.stringify({
      normalized_organ: 'leaf',
      image_quality_grade: 'good',
      analyzability: 'high',
      symptom_candidates: [],
      out_of_pool_symptom_candidates: [],
      route_hints: [],
      visual_discriminators: [
        {
          dimension_key: 'visible_pest_trace',
          value_key: 'possible',
          confidence_band: 'medium',
          visible_basis_cn: '叶片上可见疑似虫咬痕迹'
        }
      ],
      outcome_key: 'root_rot',
      missing_info_for_path: [
        {
          dimension_key: 'soil_moisture',
          reason_cn: '图片无法判断盆土内部干湿'
        }
      ]
    })
  )

  assert.equal(parsed.visual_discriminators[0].dimension_key, 'visible_pest_trace')
  assert.equal(parsed.missing_info_for_path[0].dimension_key, 'soil_moisture')
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'outcome_key'), false)
}

function testPestSpecklingStickyNoGuard() {
  const optionMappings = buildSyntheticQuestionOptionMappings(
    ['q_observed_probe__yellow_speckling__surface_stickiness'],
    [
      {
        symptomKey: 'yellow_speckling',
        symptomCn: '叶子上有密密麻麻的小黄点',
        locationKey: 'leaf'
      }
    ]
  )

  const stickyNo = optionMappings.find(
    item =>
      item.questionKey === 'q_observed_probe__yellow_speckling__surface_stickiness' &&
      item.optionKey === 'no'
  )

  assert.ok(stickyNo, 'yellow_speckling surface_stickiness=no 选项不存在')
  assert.ok(
    stickyNo.directProblemAdjustments.some(
      effect => effect.problemKey === 'spider_mites' && Number(effect.effectValue || 0) > 0
    ),
    'yellow_speckling 的黏腻题在 no 时应给红蜘蛛保留正向区分度'
  )
  assert.ok(
    stickyNo.directProblemAdjustments.some(
      effect => effect.problemKey === 'whiteflies' && Number(effect.effectValue || 0) < 0
    ),
    'yellow_speckling 的黏腻题在 no 时应压低蜜露型刺吸害虫方向'
  )
}

function testFormatDiagnosisResponseRouteFields() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_1',
    round: 1,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'overwatering_root_pressure',
        problemCn: '积水/根系压力',
        evidenceWeight: 0.9,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '主要更像积水或根系压力。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'overwatering_root_pressure',
        resultSummaryCn: '主要更像积水或根系压力。',
        firstAidCn: '先暂停浇水并检查根系通风。',
        avoidCn: '不要继续加大浇水。'
      }
    ],
    routeOutcomes: [
      {
        outcomeKey: 'overwatering_root_pressure',
        outcomeNameCn: '积水/根系压力',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '当前路径更支持积水或根系压力。'
      }
    ],
    plantContext: {},
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      stopReasonDetail: 'wet_soil_confirmed',
      uncertainLegalityReason: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmed',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '用户确认盆土长期潮湿。'
      }
    },
    routeDecision: {
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      visibleActionConflictGroups: ['water_less'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmed',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '用户确认盆土长期潮湿。'
      }
    },
    actionProfiles: [
      {
        actionProfileKey: 'ap_over',
        todayActions: ['先暂停浇水并检查根系通风。'],
        threeDayActions: ['3 天内观察土壤是否逐步变干。'],
        sevenDayObserve: [],
        avoidActions: ['不要继续加大浇水。'],
        retakeOrEscalate: []
      }
    ]
  })

  assert.equal(response.visibleOutcomes[0].displayNameCn, '积水/根系压力')
  assert.equal(response.outcomeMode, 'visible_outcomes')
  assert.equal(response.actionAdvice.todayActions[0], '先暂停浇水并检查根系通风。')
  assert.equal(response.finalResult.visibleOutcomes[0].displayNameCn, '积水/根系压力')
}

function testRouteOutputUsesDiagnosisOutcomesAndAvoidsCandidateOutcomeSummaryLeak() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_output_fix_1',
    round: 3,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'iron_deficiency',
        problemCn: '缺铁',
        evidenceWeight: 0.93,
        evidenceOrder: 1
      },
      {
        problemKey: 'overwatering_root_pressure',
        problemCn: '积水/根系压力',
        evidenceWeight: 0.89,
        evidenceOrder: 2
      }
    ],
    problems: [
      {
        problemKey: 'iron_deficiency',
        displayNameCn: '缺铁',
        userDefinitionCn: '当前更像缺铁。',
        problemRole: 'root_cause'
      },
      {
        problemKey: 'overwatering_root_pressure',
        displayNameCn: 'overwatering_root_pressure',
        userDefinitionCn: '',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'iron_deficiency',
        resultSummaryCn: '当前更像缺铁，但还不够确定。'
      }
    ],
    routeOutcomes: [
      {
        outcomeKey: 'overwatering_root_pressure',
        outcomeNameCn: '积水/根系压力',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: ''
      }
    ],
    plantContext: {},
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      stopReasonDetail: 'wet_soil_confirmation_condition',
      uncertainLegalityReason: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmation_condition',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    routeDecision: {
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmation_condition',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    actionProfiles: []
  })

  assert.equal(response.visibleOutcomes[0].displayNameCn, '积水/根系压力')
  assert.equal(response.finalResult.displayName, '积水/根系压力')
  assert.equal(response.topProblem.displayName, '积水/根系压力')
  assert.equal(
    response.finalResult.summary,
    '当前路径已收敛到“积水/根系压力”方向，建议按该路径处理并持续观察变化。'
  )
  assert.equal(
    response.topProblem.summary,
    '当前路径已收敛到“积水/根系压力”方向，建议按该路径处理并持续观察变化。'
  )
  assert.equal(response.finalResult.summary.includes('缺铁'), false)
  assert.equal(response.topProblem.summary.includes('缺铁'), false)
}

function testRouteFinalStopStateCloses() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_stop_1',
    round: 1,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'overwatering_root_pressure',
        problemCn: '积水/根系压力',
        evidenceWeight: 0.9,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '主要更像积水或根系压力。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'overwatering_root_pressure',
        resultSummaryCn: '主要更像积水或根系压力。'
      }
    ],
    plantContext: {},
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      stopReasonDetail: 'yellowing_care_area_condition',
      uncertainLegalityReason: '',
      decisionCause: {
        decisionCauseKey: 'yellowing_care_area_condition',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    routeDecision: {
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'yellowing_care_area_condition',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已形成可公开结果。'
      }
    },
    actionProfiles: []
  })

  const stopState = evaluateStopState({ response })

  assert.equal(stopState.isStopped, 1)
  assert.equal(stopState.stopReason, 'route_visible_outcomes_ready')
}

function testFormatDiagnosisResponseRouteOutputDisabled() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_2',
    round: 1,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'overwatering_root_pressure',
        problemCn: '积水/根系压力',
        evidenceWeight: 0.9,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '主要更像积水或根系压力。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'overwatering_root_pressure',
        resultSummaryCn: '主要更像积水或根系压力。'
      }
    ],
    plantContext: {},
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'problematic_output_ready',
      stopReasonDetail: '',
      uncertainLegalityReason: ''
    },
    routeDecision: {
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmed',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '用户确认盆土长期潮湿。'
      }
    },
    routeOutputEnabled: false,
    actionProfiles: []
  })

  assert.equal(response.topProblem.problemKey, 'overwatering_root_pressure')
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'primaryOutcome'), false)
  assert.equal(response.finalResult.primaryOutcome, undefined)
}

function testRouteModeHidesCandidateOutcomesFromPublicPayload() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_hide_candidateOutcomes_1',
    round: 2,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'iron_deficiency',
        problemCn: '缺铁',
        evidenceWeight: 0.93,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'iron_deficiency',
        displayNameCn: '缺铁',
        userDefinitionCn: '当前更像缺铁。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'iron_deficiency',
        resultSummaryCn: '当前更像缺铁。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'route_conservative_uncertain',
      stopReasonDetail: 'route_conservative_no_routes',
      uncertainLegalityReason: 'route_conservative'
    },
    hideCandidateOutcomes: true
  })

  assert.equal(Object.hasOwn(response, 'candidateOutcomes'), false)
  assert.equal(response.outcomeType, 'uncertain')
  assert.equal(response.topProblem, null)
  assert.equal(response.finalResult.problemId, '')
  assert.equal(response.finalResult.displayName, '暂不能稳定判断')
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'primaryOutcome'), false)
}

function testRouteConflictVisibleOutcomesStillProduceRouteBackedFinalResult() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_conflict_visible_1',
    round: 1,
    stage: 'final',
    candidateOutcomes: [],
    problems: [],
    explanations: [],
    plantContext: {},
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'problematic',
      stopReason: 'route_visible_outcomes_ready',
      stopReasonDetail: 'route_action_conflict_unresolved',
      uncertainLegalityReason: '',
      decisionCause: {
        decisionCauseKey: 'route_action_conflict_unresolved',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '候选方向的行动建议存在冲突。'
      }
    },
    routeDecision: {
      visibleOutcomeKeys: ['underwatering', 'overwatering_root_pressure'],
      visibleActionConflictGroups: ['watering_stop', 'watering_add'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'route_action_conflict_unresolved',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '候选方向的行动建议存在冲突。'
      }
    },
    routeOutcomes: [
      {
        outcomeKey: 'underwatering',
        displayNameCn: '缺水压力',
        userDefinitionCn: '当前更像盆土长期偏干或供水不足。',
        actionProfileKey: 'action_underwatering_basic',
        riskLevel: 'medium'
      },
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力',
        userDefinitionCn: '当前更像盆土长期偏湿或根系承压。',
        actionProfileKey: 'action_overwatering_basic',
        riskLevel: 'medium'
      }
    ],
    actionProfiles: []
  })

  assert.equal(response.outcomeType, 'problematic')
  assert.equal(response.finalResult.displayName, '缺水压力')
  assert.equal(response.finalResult.visibleOutcomes[0].problemKey, 'underwatering')
  assert.equal(response.outcomeMode, 'visible_outcomes')
  assert.equal(response.visibleOutcomes.length, 2)
  assert.equal(response.visibleOutcomes[1].displayNameCn, '积水/根系压力')
  assert.equal(response.actionAdvice.conflictDetected, true)
  assert.equal(response.nextSteps.length, 1)
  assert.equal(response.nextSteps[0].type, 'route_conflict_guard')
  assert.match(response.nextSteps[0].text, /补充关键分流信息/)
  assert.doesNotMatch(
    response.nextSteps.map(item => item.text).join(' '),
    /分次补水|温和补肥|处理最明显的问题/
  )
}

function testSessionResultReadServicePreservesRouteMultiOutcomeFields() {
  const routeFields = sessionResultReadServiceTest.resolveRouteOutcomeFields({
    outcomePayload: {
      finalResult: {
        displayName: '强光灼伤',
        summary: '强光灼伤会让叶片更容易失水。',
        primaryOutcome: {
          outcomeKey: 'sunburn',
          problemKey: 'sunburn',
          displayNameCn: '强光灼伤'
        },
        secondaryOutcomes: [
          {
            outcomeKey: 'nutrient_deficiency',
            problemKey: 'nutrient_deficiency',
            displayNameCn: '缺素'
          },
          {
            outcomeKey: 'overwatering_root_pressure',
            problemKey: 'overwatering_root_pressure',
            displayNameCn: '积水/根系压力'
          }
        ],
        visibleOutcomes: [
          {
            outcomeKey: 'sunburn',
            problemKey: 'sunburn',
            displayNameCn: '强光灼伤'
          },
          {
            outcomeKey: 'nutrient_deficiency',
            problemKey: 'nutrient_deficiency',
            displayNameCn: '缺素'
          },
          {
            outcomeKey: 'overwatering_root_pressure',
            problemKey: 'overwatering_root_pressure',
            displayNameCn: '积水/根系压力'
          }
        ],
        outcomeMode: 'primary_with_secondary',
        actionAdvice: {
          conflictDetected: true,
          avoidActions: ['不要大幅浇水']
        },
        routeDecisionCause: {
          decisionCauseKey: 'route_action_conflict_unresolved',
          decisionCauseCategory: 'outcome_route',
          decisionCauseText: '候选方向存在行动冲突。'
        }
      }
    }
  })

  assert.equal(routeFields.visibleOutcomes.length, 3)
  assert.equal(routeFields.outcomeMode, 'visible_outcomes')
  assert.equal(routeFields.actionAdvice.conflictDetected, true)
  assert.equal(routeFields.routeDecisionCause.decisionCauseKey, 'route_action_conflict_unresolved')
  assert.equal(routeFields.finalResult.visibleOutcomes[0].displayNameCn, '强光灼伤')
  assert.equal(routeFields.finalResult.visibleOutcomes.length, 3)

  const mergedRouteFields = sessionResultReadServiceTest.resolveRouteOutcomeFields({
    snapshot: {
      finalResult: {
        displayName: '缺氮/长期营养不足',
        summary: '主结论来自既有 snapshot。'
      }
    },
    outcomePayload: {
      finalResult: {
        primaryOutcome: {
          outcomeKey: 'nitrogen_deficiency',
          problemKey: 'nitrogen_deficiency',
          displayNameCn: '缺氮/长期营养不足'
        },
        secondaryOutcomes: [
          {
            outcomeKey: 'sunburn',
            problemKey: 'sunburn',
            displayNameCn: '强光灼伤'
          },
          {
            outcomeKey: 'nutrient_deficiency',
            problemKey: 'nutrient_deficiency',
            displayNameCn: '缺素'
          }
        ],
        visibleOutcomes: [
          {
            outcomeKey: 'nitrogen_deficiency',
            problemKey: 'nitrogen_deficiency',
            displayNameCn: '缺氮/长期营养不足'
          },
          {
            outcomeKey: 'sunburn',
            problemKey: 'sunburn',
            displayNameCn: '强光灼伤'
          },
          {
            outcomeKey: 'nutrient_deficiency',
            problemKey: 'nutrient_deficiency',
            displayNameCn: '缺素'
          }
        ],
        outcomeMode: 'primary_with_secondary'
      }
    }
  })

  assert.deepEqual(
    mergedRouteFields.visibleOutcomes.map(item => item.outcomeKey),
    ['nitrogen_deficiency', 'sunburn', 'nutrient_deficiency']
  )

  const payloadWinsFields = sessionResultReadServiceTest.resolveRouteOutcomeFields({
    snapshot: {
      primaryOutcome: {
        outcomeKey: 'session_single',
        problemKey: 'session_single',
        displayNameCn: '既有单结论'
      },
      visibleOutcomes: [
        {
          outcomeKey: 'session_single',
          problemKey: 'session_single',
          displayNameCn: '既有单结论'
        }
      ],
      outcomeMode: 'session_single'
    },
    outcomePayload: {
      finalResult: {
        primaryOutcome: {
          outcomeKey: 'sunburn',
          problemKey: 'sunburn',
          displayNameCn: '强光灼伤'
        },
        visibleOutcomes: [
          {
            outcomeKey: 'sunburn',
            problemKey: 'sunburn',
            displayNameCn: '强光灼伤'
          },
          {
            outcomeKey: 'nutrient_deficiency',
            problemKey: 'nutrient_deficiency',
            displayNameCn: '缺素'
          }
        ],
        outcomeMode: 'primary_with_secondary'
      }
    }
  })

  assert.deepEqual(
    payloadWinsFields.visibleOutcomes.map(item => item.outcomeKey),
    ['sunburn', 'nutrient_deficiency']
  )
  assert.equal(payloadWinsFields.outcomeMode, 'visible_outcomes')
}

function testRouteModeDoesNotBuildSessionQuestionsAfterPackageAnswer() {
  const source = readFileSync('./cloudfunctions/diagnose-http/domain/diagnosis-engine.js', 'utf8')

  assert.doesNotMatch(source, /const genericQuestions =/)
  assert.doesNotMatch(source, /const routePlannedQuestions =/)
  assert.doesNotMatch(source, /shouldHoldYellowingRouteOutputForRequiredGroups/)
  assert.doesNotMatch(source, /canAskAnotherQuestionRound/)
  assert.doesNotMatch(source, /const shouldAskQuestion\s*=/)
}

function testUncertainSuppressesTopProblem() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_3',
    round: 1,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'root_rot',
        problemCn: '烂根',
        evidenceWeight: 0.81,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'root_rot',
        displayNameCn: '烂根',
        userDefinitionCn: '当前更像烂根。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'root_rot',
        resultSummaryCn: '当前更像烂根。'
      }
    ],
    plantContext: {},
    questionRequired: false,
    lowConfidence: {
      isLowConfidence: true,
      reasons: ['input_unfillable'],
      advice: ['建议补拍整株、叶背和盆土状态后重新判断。'],
      uncertainLegalityReason: 'input_unfillable'
    },
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'uncertain_output_ready',
      stopReasonDetail: 'input_unfillable',
      uncertainLegalityReason: 'input_unfillable'
    }
  })

  assert.equal(response.outcomeType, 'uncertain')
  assert.equal(response.topProblem, null)
  assert.equal(response.needHumanReview, true)
}

function testUncertainSuppressesRouteFinalResultProblem() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_unc_route_1',
    round: 1,
    stage: 'final',
    candidateOutcomes: [
      {
        problemKey: 'root_rot',
        problemCn: '根腐',
        evidenceWeight: 0.88,
        evidenceOrder: 1
      }
    ],
    problems: [
      {
        problemKey: 'root_rot',
        displayNameCn: '根腐',
        userDefinitionCn: '当前更像根腐。',
        problemRole: 'root_cause'
      }
    ],
    explanations: [
      {
        problemKey: 'root_rot',
        resultSummaryCn: '当前更像根腐。'
      }
    ],
    plantContext: {},
    questionRequired: false,
    lowConfidence: {
      isLowConfidence: true,
      reasons: ['route_action_conflict_unresolved'],
      advice: ['当前路径仍有冲突，不能安全输出具体问题。'],
      uncertainLegalityReason: 'route_uncertain'
    },
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'route_uncertain_with_candidates',
      stopReasonDetail: 'route_action_conflict_unresolved',
      uncertainLegalityReason: 'route_uncertain',
      decisionCause: {
        decisionCauseKey: 'route_action_conflict_unresolved',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径仍有冲突。'
      }
    },
    routeDecision: {
      visibleOutcomeKeys: ['root_rot'],
      decisionCause: {
        decisionCauseKey: 'route_action_conflict_unresolved',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径仍有冲突。'
      }
    },
    actionProfiles: []
  })

  assert.equal(response.outcomeType, 'uncertain')
  assert.equal(response.finalResult.problemId, '')
  assert.equal(response.finalResult.displayName, '暂不能稳定判断')
}

function testPresenterSuppressesUncertainProblemLeak() {
  const compact = buildCompactAnswerRoundResponse({
    diagnosisSessionId: 'diag_presenter_uncertain_1',
    roundId: 'round_2',
    stage: 'final',
    outcomeType: 'uncertain',
    routePrimaryAction: 'uncertain_prepare',
    finalResult: {
      resultId: 'res_xxx',
      problemId: 'p_cm9vdF9yb3Q',
      displayName: '根腐',
      summary: '当前证据仍不足。',
      severity: 'high',
      urgency: 'high'
    },
    topProblem: {
      problemId: 'p_cm9vdF9yb3Q',
      displayName: '根腐',
      summary: '当前更像根腐。',
      severity: 'high',
      urgency: 'high'
    },
    confidenceLevel: 'low',
    needHumanReview: true
  })

  assert.equal(compact.outcomeType, 'uncertain')
  assert.equal(compact.finalResult.problemId, '')
  assert.equal(compact.finalResult.displayName, '暂不能稳定判断')
}

function testPresenterKeepsCareBehaviorEvidenceAndDropsWeatherWindow() {
  const roundResult = {
    diagnosisSessionId: 'diag_care_evidence_1',
    roundId: 'round_2',
    questionRequired: true,
    routePrimaryAction: 'ask_first',
    stopReason: 'route_visible_outcomes_ready',
    outcomeType: 'problematic',
    careBehaviorTimeline: {
      referenceDate: '2026-05-31',
      dailyRecords: Array.from({ length: 12 }, (_, index) => ({
        date: `2026-05-${String(20 + index).padStart(2, '0')}`,
        watered: index === 2 || index === 7 || index === 11,
        wateringAmount: index === 2 || index === 7 || index === 11 ? 'normal' : ''
      })),
      wateringEvents10d: [
        { date: '2026-05-22', watered: true, amount: 'normal' },
        { date: '2026-05-27', watered: true, amount: 'normal' },
        { date: '2026-05-31', watered: true, amount: 'normal' }
      ],
      summary: {
        effectiveHydrationLoad: 0.8,
        lastWateredDaysAgo: 0,
        userHasDirectSunExposure: false
      }
    },
    environmentCareContext: {
      version: 'v7',
      outputs: {
        wateringContext: 'likely_too_wet',
        wateringAction: 'delay_and_check_soil',
        fertilizingAction: 'pause',
        lightContext: []
      },
      behaviorSummary10d: {
        effectiveHydrationLoad: 0.8,
        lastWateredDaysAgo: 0
      },
      watering: {
        wateringContext: 'likely_too_wet',
        action: 'delay_and_check_soil',
        summary: {
          effectiveHydrationLoad: 0.8,
          lastWateredDaysAgo: 0
        }
      },
      historicalSummary10d: {
        windowDays: 10,
        recordCount: 10,
        highHumidityDays: 5,
        lowHumidityDays: 0,
        coldHumidDays: 2,
        hotDryDays: 0,
        hotHumidDays: 0,
        rainyDays: 1
      },
      forecastSummary15d: {
        windowDays: 15,
        recordCount: 15,
        highHumidityDays: 0,
        lowHumidityDays: 0,
        coldHumidDays: 0,
        hotDryDays: 0,
        hotHumidDays: 0,
        rainyDays: 0,
        aboveGenusUvMaxDays: 3
      },
      fertilizing: {
        action: 'pause'
      },
      light: {
        lightContext: []
      },
      careBehaviorTimeline: {
        referenceDate: '2026-05-31',
        wateringEvents10d: [
          { date: '2026-05-22', watered: true, amount: 'normal' },
          { date: '2026-05-27', watered: true, amount: 'normal' },
          { date: '2026-05-31', watered: true, amount: 'normal' }
        ],
        dailyRecords: Array.from({ length: 12 }, (_, index) => ({
          date: `2026-05-${String(20 + index).padStart(2, '0')}`,
          watered: index === 2 || index === 7 || index === 11
        }))
      },
      environmentWeatherWindow: {
        meta: { diagnosisDate: '2026-05-31' },
        historicalDays: Array.from({ length: 25 }, (_, index) => ({
          date: `2026-05-${String(7 + index).padStart(2, '0')}`,
          tempMaxC: 30,
          tempMinC: 21,
          humidity: 81,
          textDay: '晴'
        }))
      }
    },
    environmentWeatherWindow: {
      meta: { diagnosisDate: '2026-05-31' },
      historicalDays: Array.from({ length: 25 }, (_, index) => ({
        date: `2026-05-${String(7 + index).padStart(2, '0')}`,
        tempMaxC: 30,
        tempMinC: 21,
        humidity: 81,
        textDay: '晴'
      }))
    },
    questions: [
      {
        questionId: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        text: '最近 10 天浇水/盆土干湿背景',
        uiVariant: 'care_behavior_timeline',
        packageTopic: 'watering_frequency_context',
        options: [
          {
            optionId: 'opt_dW5rbm93bg',
            optionKey: 'unknown',
            text: '说不清/没留意'
          }
        ]
      }
    ],
    questions: [
      {
        questionId: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        questionKey: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
        text: '最近 10 天浇水/盆土干湿背景',
        uiVariant: 'care_behavior_timeline',
        packageTopic: 'watering_frequency_context',
        options: [
          {
            optionId: 'opt_dW5rbm93bg',
            optionKey: 'unknown',
            text: '说不清/没留意'
          }
        ]
      }
    ]
  }

  const compact = buildCompactAnswerRoundResponse(roundResult)
  const publicRound = buildPublicRoundResponse(roundResult)
  const frontend = buildFrontendDiagnosisResponse(publicRound)

  assert.equal(compact.careBehaviorTimeline.dailyRecords.length, 10)
  assert.equal(compact.careBehaviorTimeline.watering_events_10d.length, 3)
  assert.equal(compact.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
  assert.equal(compact.environmentCareContext.historicalSummary10d.highHumidityDays, 5)
  assert.equal(compact.environmentCareContext.forecastSummary15d.aboveGenusUvMaxDays, 3)
  assert.equal(Object.prototype.hasOwnProperty.call(compact, 'environmentWeatherWindow'), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      compact.environmentCareContext || {},
      'environmentWeatherWindow'
    ),
    false
  )

  assert.equal(publicRound.careBehaviorTimeline.dailyRecords.length, 10)
  assert.equal(publicRound.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
  assert.equal(publicRound.environmentCareContext.historicalSummary10d.highHumidityDays, 5)
  assert.equal(publicRound.environmentCareContext.forecastSummary15d.aboveGenusUvMaxDays, 3)
  assert.equal(Object.prototype.hasOwnProperty.call(publicRound, 'environmentWeatherWindow'), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      publicRound.environmentCareContext || {},
      'environmentWeatherWindow'
    ),
    false
  )

  assert.equal(frontend.careBehaviorTimeline.dailyRecords.length, 10)
  assert.equal(frontend.environmentCareContext.outputs.wateringContext, 'likely_too_wet')
  assert.equal(frontend.environmentCareContext.historicalSummary10d.highHumidityDays, 5)
  assert.equal(frontend.environmentCareContext.forecastSummary15d.aboveGenusUvMaxDays, 3)
  assert.equal(Object.prototype.hasOwnProperty.call(frontend, 'environmentWeatherWindow'), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      frontend.environmentCareContext || {},
      'environmentWeatherWindow'
    ),
    false
  )
}

function testNonProblematicHasNoTreatmentAdvice() {
  const response = buildNonProblematicRoundResult({
    sessionId: 'diag_4',
    round: 1,
    stage: 'final',
    observedSymptoms: [],
    observedEvidenceSet: [],
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    plantContext: {},
    rule: {
      key: 'normal_leaf_aging',
      label: '自然代谢',
      finalDisplayName: '自然代谢',
      summary: '底部老叶逐步黄化，更符合自然代谢。',
      explanation: {
        whyItHappens: '老叶逐步退出。'
      },
      nextSteps: ['继续正常观察。'],
      whatToAvoid: ['不要因为单片老叶发黄就频繁改养护。']
    }
  })

  assert.equal(response.outcomeType, 'non_problematic')
  assert.equal(response.topProblem, null)
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'actionAdvice'), false)
  assert.equal(response.finalResult.nonProblematicType, 'normal_leaf_aging')
  assert.equal(response.finalResult.displayName, '自然代谢')

  const compact = buildCompactAnswerRoundResponse(response)
  assert.equal(compact.finalResult.nonProblematicType, 'normal_leaf_aging')
}

function testRouteBackedNonProblematicOutcome() {
  const response = formatDiagnosisResponse({
    sessionId: 'diag_route_normal_aging',
    round: 3,
    stage: 'final',
    candidateOutcomes: [],
    problems: [],
    routeOutcomes: [
      {
        outcomeKey: 'normal_leaf_aging',
        outcomeNameCn: '自然代谢',
        outcomeType: 'non_problematic',
        outcomeCategory: 'non_problematic',
        displayNameCn: '自然代谢',
        userDefinitionCn: '底部老叶逐步黄化，更符合自然代谢。'
      }
    ],
    questionRequired: false,
    stopDecision: {
      outcomeLocked: 'non_problematic',
      stopReason: 'route_visible_outcomes_ready',
      uncertainLegalityReason: '',
      stopReasonDetail: 'route_visible_outcomes_ready',
      decisionCause: {
        decisionCauseKey: 'route_visible_outcomes_ready',
        decisionCauseCategory: 'route_output',
        decisionCauseText: '路径已收敛到单一 outcome。',
        decisionCauseDetails: {}
      }
    },
    routeDecision: {
      conservativePolicy: '',
      visibleOutcomeKeys: ['normal_leaf_aging'],
      visibleActionProfileKeys: ['action_non_problematic_observe'],
      visibleActionConflictGroups: ['observe'],
      decisionCause: {
        decisionCauseKey: 'route_visible_outcomes_ready',
        decisionCauseCategory: 'route_output',
        decisionCauseText: '路径已收敛到单一 outcome。',
        decisionCauseDetails: {}
      }
    },
    actionProfiles: [
      {
        actionProfileKey: 'action_non_problematic_observe',
        todayActions: ['继续观察底部老叶变化'],
        threeDayActions: [],
        sevenDayObserve: ['观察是否只发生在底部老叶'],
        avoidActions: ['不要因为单片老叶发黄就频繁改养护'],
        retakeOrEscalate: []
      }
    ]
  })

  assert.equal(response.outcomeType, 'non_problematic')
  assert.equal(response.topProblem, null)
  assert.equal(response.finalResult.problemId, '')
  assert.equal(response.finalResult.nonProblematicType, 'normal_leaf_aging')
  assert.equal(response.finalResult.displayName, '自然代谢')
}

async function testGoldenRouteSamples() {
  const routeRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'route_yellow_wet',
        routeGroupKey: 'watering_split',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'ap_over',
        actionConflictGroup: 'water_less'
      },
      {
        routeKey: 'route_yellow_dry',
        routeGroupKey: 'watering_split',
        outcomeKey: 'underwatering',
        actionProfileKey: 'ap_under',
        actionConflictGroup: 'water_more'
      },
      {
        routeKey: 'route_wilt_wet',
        routeGroupKey: 'watering_split',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'ap_over',
        actionConflictGroup: 'water_less'
      },
      {
        routeKey: 'route_wilt_dry',
        routeGroupKey: 'watering_split',
        outcomeKey: 'underwatering',
        actionProfileKey: 'ap_under',
        actionConflictGroup: 'water_more'
      },
      {
        routeKey: 'route_leggy_low_light',
        routeGroupKey: 'light_split',
        outcomeKey: 'low_light_growth_weakness',
        actionProfileKey: 'ap_light',
        actionConflictGroup: 'increase_light'
      },
      {
        routeKey: 'route_sunburn',
        routeGroupKey: 'sun_heat_split',
        outcomeKey: 'sunburn',
        actionProfileKey: 'ap_sun',
        actionConflictGroup: 'avoid_sun'
      },
      {
        routeKey: 'route_dry_air',
        routeGroupKey: 'humidity_split',
        outcomeKey: 'dry_air_stress',
        actionProfileKey: 'ap_humidity',
        actionConflictGroup: 'raise_humidity'
      },
      {
        routeKey: 'route_leaf_spot',
        routeGroupKey: 'spot_split',
        outcomeKey: 'leaf_spot_problem',
        actionProfileKey: 'ap_leaf_spot',
        actionConflictGroup: 'control_moisture'
      },
      {
        routeKey: 'route_old_injury',
        routeGroupKey: 'hole_split',
        outcomeKey: 'structural_damage_old_injury',
        actionProfileKey: 'ap_old_injury',
        actionConflictGroup: 'observe_only'
      },
      {
        routeKey: 'route_chewing_pest',
        routeGroupKey: 'hole_split',
        outcomeKey: 'chewing_pest_damage',
        actionProfileKey: 'ap_pest',
        actionConflictGroup: 'control_pest'
      }
    ],
    conditions: [
      {
        conditionKey: 'condition_yellow_wet',
        routeKey: 'route_yellow_wet',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['leaf_yellowing', 'soil_wet'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_yellow_dry',
        routeKey: 'route_yellow_dry',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['leaf_yellowing', 'soil_dry'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_wilt_wet',
        routeKey: 'route_wilt_wet',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['wilting', 'soil_wet'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_wilt_dry',
        routeKey: 'route_wilt_dry',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['wilting', 'soil_dry'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_leggy_light',
        routeKey: 'route_leggy_low_light',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['leggy_growth', 'weak_light'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_sunburn',
        routeKey: 'route_sunburn',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['scorching_spots', 'recent_strong_sun'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_dry_air',
        routeKey: 'route_dry_air',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['burnt_leaf_edge', 'dry_air_condition'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_leaf_spot',
        routeKey: 'route_leaf_spot',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['spreading_spots', 'poor_ventilation'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_old_injury',
        routeKey: 'route_old_injury',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['holes_in_leaf', 'no_pest_trace', 'not_spreading'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_chewing_pest',
        routeKey: 'route_chewing_pest',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['holes_in_leaf', 'visible_pest_trace'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      }
    ],
    routeGroups: [
      { routeGroupKey: 'watering_split', maxVisibleOutcomes: 1 },
      { routeGroupKey: 'light_split', maxVisibleOutcomes: 1 },
      { routeGroupKey: 'sun_heat_split', maxVisibleOutcomes: 1 },
      { routeGroupKey: 'humidity_split', maxVisibleOutcomes: 1 },
      { routeGroupKey: 'spot_split', maxVisibleOutcomes: 1 },
      { routeGroupKey: 'hole_split', maxVisibleOutcomes: 1 }
    ]
  })

  const cases = [
    {
      label: '黄叶 + 土湿',
      symptomKeys: ['leaf_yellowing', 'soil_wet'],
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      expectedPrimaryOutcomeKey: 'overwatering_root_pressure'
    },
    {
      label: '黄叶 + 土干',
      symptomKeys: ['leaf_yellowing', 'soil_dry'],
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      expectedPrimaryOutcomeKey: 'underwatering'
    },
    {
      label: '萎蔫 + 土湿',
      symptomKeys: ['wilting', 'soil_wet'],
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      expectedPrimaryOutcomeKey: 'overwatering_root_pressure'
    },
    {
      label: '萎蔫 + 土干',
      symptomKeys: ['wilting', 'soil_dry'],
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      expectedPrimaryOutcomeKey: 'underwatering'
    },
    {
      label: '徒长 + 弱光',
      symptomKeys: ['leggy_growth', 'weak_light'],
      candidateOutcomeKeys: ['low_light_growth_weakness'],
      expectedPrimaryOutcomeKey: 'low_light_growth_weakness'
    },
    {
      label: '焦斑 + 暴晒',
      symptomKeys: ['scorching_spots', 'recent_strong_sun'],
      candidateOutcomeKeys: ['sunburn'],
      expectedPrimaryOutcomeKey: 'sunburn'
    },
    {
      label: '焦边 + 干空气',
      symptomKeys: ['burnt_leaf_edge', 'dry_air_condition'],
      candidateOutcomeKeys: ['dry_air_stress'],
      expectedPrimaryOutcomeKey: 'dry_air_stress'
    },
    {
      label: '斑点扩散 + 通风差',
      symptomKeys: ['spreading_spots', 'poor_ventilation'],
      candidateOutcomeKeys: ['leaf_spot_problem'],
      expectedPrimaryOutcomeKey: 'leaf_spot_problem'
    },
    {
      label: '孔洞 + 无虫迹 + 不扩散',
      symptomKeys: ['holes_in_leaf', 'no_pest_trace', 'not_spreading'],
      candidateOutcomeKeys: ['structural_damage_old_injury', 'chewing_pest_damage'],
      expectedPrimaryOutcomeKey: 'structural_damage_old_injury'
    },
    {
      label: '孔洞 + 虫迹',
      symptomKeys: ['holes_in_leaf', 'visible_pest_trace'],
      candidateOutcomeKeys: ['structural_damage_old_injury', 'chewing_pest_damage'],
      expectedPrimaryOutcomeKey: 'chewing_pest_damage'
    }
  ]

  for (const item of cases) {
    const decision = await planOutcomeRoutes({
      candidateOutcomeKeys: item.candidateOutcomeKeys,
      routeEvidenceContext: buildRouteEvidenceContext({
        observedEvidenceSet: buildObservedEvidenceSet(item.symptomKeys),
        candidateOutcomes: item.candidateOutcomeKeys.map((problemKey, index) => ({
          problemKey,
          evidenceOrder: index + 1
        }))
      }),
      routeRepository,
      featureFlags: { routePlanningEnabled: true }
    })

    assert.equal(decision.visibleOutcomeKeys[0], item.expectedPrimaryOutcomeKey, item.label)
    assert.equal(decision.requiresQuestion, false, item.label)
  }
}

function testGoldenNonProblematicSamples() {
  const normalAging = buildNonProblematicRoundResult({
    sessionId: 'diag_np_1',
    round: 1,
    stage: 'final',
    rule: {
      key: 'normal_leaf_aging',
      label: '自然代谢',
      finalDisplayName: '自然代谢',
      summary: '底部老叶逐步黄化，更符合自然代谢。',
      explanation: {},
      nextSteps: ['继续观察新叶状态。'],
      whatToAvoid: ['不要仅因底部老叶黄化就大幅改养护。']
    }
  })
  assert.equal(normalAging.outcomeType, 'non_problematic')
  assert.equal(normalAging.finalResult.displayName, '自然代谢')

  const stableVariegation = buildNonProblematicRoundResult({
    sessionId: 'diag_np_2',
    round: 1,
    stage: 'final',
    rule: {
      key: 'stable_natural_marking',
      label: '艺斑/正常斑纹',
      finalDisplayName: '艺斑/正常斑纹',
      summary: '斑纹长期稳定，更符合正常品种纹路。',
      explanation: {},
      nextSteps: ['继续观察是否长期稳定。'],
      whatToAvoid: ['不要把稳定艺斑误判成病斑。']
    }
  })
  assert.equal(stableVariegation.outcomeType, 'non_problematic')
  assert.equal(stableVariegation.finalResult.displayName, '艺斑/正常斑纹')
}

async function testGoldenUncertainSamples() {
  const conflictRepository = createMockRouteRepository({
    routes: [
      {
        routeKey: 'route_conflict_under',
        routeGroupKey: 'watering_split',
        outcomeKey: 'underwatering',
        actionProfileKey: 'ap_under',
        actionConflictGroup: 'water_more'
      },
      {
        routeKey: 'route_conflict_over',
        routeGroupKey: 'watering_split',
        outcomeKey: 'overwatering_root_pressure',
        actionProfileKey: 'ap_over',
        actionConflictGroup: 'water_less'
      }
    ],
    conditions: [
      {
        conditionKey: 'condition_conflict_under',
        routeKey: 'route_conflict_under',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      },
      {
        conditionKey: 'condition_conflict_over',
        routeKey: 'route_conflict_over',
        conditionRole: 'display_condition',
        requiredEvidence: { symptomKeys: ['leaf_yellowing'] },
        requiredAnswerEffects: {},
        blockerEvidence: {}
      }
    ],
    routeGroups: [{ routeGroupKey: 'watering_split', maxVisibleOutcomes: 2 }]
  })

  const conflictDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: ['underwatering', 'overwatering_root_pressure'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['leaf_yellowing']),
      candidateOutcomes: [
        { problemKey: 'underwatering', evidenceOrder: 1 },
        { problemKey: 'overwatering_root_pressure', evidenceOrder: 2 }
      ]
    }),
    routeRepository: conflictRepository,
    featureFlags: { routePlanningEnabled: true }
  })
  assert.deepEqual(conflictDecision.visibleOutcomeKeys, [
    'underwatering',
    'overwatering_root_pressure'
  ])
  assert.deepEqual(conflictDecision.visibleOutcomeKeys.slice(1), ['overwatering_root_pressure'])
  assert.equal(conflictDecision.decisionCause.decisionCauseKey, 'route_action_conflict_unresolved')

  const broadBlotchUncertain = formatDiagnosisResponse({
    sessionId: 'diag_unc_1',
    round: 1,
    stage: 'final',
    candidateOutcomes: [],
    plantContext: {},
    questionRequired: false,
    lowConfidence: {
      isLowConfidence: true,
      reasons: ['input_unfillable'],
      advice: ['宽泛斑块信息不足，先补充更稳定的图像和背景信息。'],
      uncertainLegalityReason: 'input_unfillable'
    },
    stopDecision: {
      outcomeLocked: 'uncertain',
      stopReason: 'uncertain_output_ready',
      stopReasonDetail: 'input_unfillable',
      uncertainLegalityReason: 'input_unfillable'
    }
  })
  assert.equal(broadBlotchUncertain.outcomeType, 'uncertain')
  assert.equal(broadBlotchUncertain.topProblem, null)

  const visualStrongButNotAdmitted = await planOutcomeRoutes({
    candidateOutcomeKeys: ['leaf_spot_problem'],
    routeEvidenceContext: buildRouteEvidenceContext({
      observedEvidenceSet: buildObservedEvidenceSet(['visual_candidate_only']),
      candidateOutcomes: [{ problemKey: 'leaf_spot_problem', evidenceOrder: 1 }]
    }),
    routeRepository: createMockRouteRepository({
      routes: [
        {
          routeKey: 'route_leaf_spot_condition',
          routeGroupKey: 'spot_split',
          outcomeKey: 'leaf_spot_problem',
          actionProfileKey: 'ap_leaf_spot',
          actionConflictGroup: 'control_moisture'
        }
      ],
      conditions: [
        {
          conditionKey: 'condition_leaf_spot_admission',
          routeKey: 'route_leaf_spot_condition',
          conditionRole: 'display_condition',
          requiredEvidence: { symptomKeys: ['spreading_spots', 'poor_ventilation'] },
          requiredAnswerEffects: {},
          blockerEvidence: {}
        }
      ],
      routeGroups: [{ routeGroupKey: 'spot_split', maxVisibleOutcomes: 1 }]
    }),
    featureFlags: { routePlanningEnabled: true }
  })
  assert.deepEqual(visualStrongButNotAdmitted.visibleOutcomeKeys, [])
}

function testFrontendNormalizationSuitability() {
  const currentResult = normalizeDiagnosisResult({
    diagnosisSessionId: 'session_1',
    roundId: 'round_1',
    stage: 'final',
    outcomeType: 'problematic',
    finalResult: {
      displayName: '烂根',
      summary: '当前更像烂根。',
      severity: 'high'
    },
    questionRequired: false,
    questions: []
  })
  assert.equal(currentResult.diagnosisSessionId, 'session_1')
  assert.equal(Object.prototype.hasOwnProperty.call(currentResult, 'primaryOutcome'), false)
  assert.deepEqual(currentResult.visibleOutcomes, [])
  assert.equal(currentResult.routeDecision, null)

  const routeResult = normalizeDiagnosisResult({
    diagnosisSessionId: 'route_1',
    roundId: 'round_2',
    stage: 'final',
    outcomeType: 'problematic',
    primaryOutcome: {
      outcomeKey: 'overwatering_root_pressure',
      displayNameCn: '积水/根系压力'
    },
    visibleOutcomes: [
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力'
      }
    ],
    actionAdvice: {
      todayActions: ['先暂停浇水。']
    },
    routeDecision: {
      mode: 'multi_outcome_route',
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      activeRouteGroupKeys: ['watering_split'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'wet_soil_confirmed',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '用户确认盆土长期潮湿。'
      },
      routeTrace: [{ routeKey: 'route_hidden' }],
      conditionResults: [{ conditionKey: 'condition_hidden' }]
    },
    finalResult: {
      displayName: '积水/根系压力',
      summary: '当前更像积水/根系压力。'
    },
    questionRequired: false,
    questions: []
  })

  assert.equal(routeResult.visibleOutcomes[0].displayNameCn, '积水/根系压力')
  assert.equal(routeResult.actionAdvice.todayActions[0], '先暂停浇水。')
  assert.deepEqual(routeResult.routeDecision.visibleOutcomeKeys, ['overwatering_root_pressure'])
  assert.equal(Object.prototype.hasOwnProperty.call(routeResult.routeDecision, 'routeTrace'), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(routeResult.routeDecision, 'conditionResults'),
    false
  )

  const multiOutcomeResult = normalizeDiagnosisResult({
    diagnosisSessionId: 'route_multi_1',
    roundId: 'round_2',
    stage: 'final',
    outcomeType: 'problematic',
    primaryOutcome: {
      outcomeKey: 'sunburn',
      displayNameCn: '强光灼伤'
    },
    secondaryOutcomes: [
      {
        outcomeKey: 'nutrient_deficiency',
        displayNameCn: '缺素'
      },
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力'
      }
    ],
    visibleOutcomes: [
      {
        outcomeKey: 'sunburn',
        displayNameCn: '强光灼伤'
      },
      {
        outcomeKey: 'nutrient_deficiency',
        displayNameCn: '缺素'
      },
      {
        outcomeKey: 'overwatering_root_pressure',
        displayNameCn: '积水/根系压力'
      }
    ],
    actionAdvice: {
      todayActions: ['先移离正午直射光。']
    },
    routeDecision: {
      mode: 'multi_outcome_route',
      visibleOutcomeKeys: ['sunburn', 'nutrient_deficiency', 'overwatering_root_pressure'],
      activeRouteGroupKeys: ['light_heat_split_group'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'route_action_conflict_unresolved',
        decisionCauseCategory: 'outcome_route',
        decisionCauseText: '路径已经收敛到多 outcome。'
      }
    },
    finalResult: {
      displayName: '强光灼伤',
      summary: '当前路径已收敛到强光灼伤方向。'
    },
    questionRequired: false,
    questions: []
  })

  assert.equal(multiOutcomeResult.visibleOutcomes[0].displayNameCn, '强光灼伤')
  assert.equal(multiOutcomeResult.visibleOutcomes.length, 3)
  assert.equal(multiOutcomeResult.outcomeMode, 'multi_outcome_route')
  assert.equal(multiOutcomeResult.actionAdvice.todayActions[0], '先移离正午直射光。')

  const mixedUncertainResult = normalizeDiagnosisResult({
    diagnosisSessionId: 'route_mixed_uncertain_1',
    roundId: 'round_2',
    stage: 'final',
    outcomeType: 'problematic',
    visibleOutcomes: [
      {
        outcomeKey: 'overwatering_root_pressure',
        outcomeType: 'problematic',
        displayNameCn: '积水/根系压力'
      },
      {
        outcomeKey: 'uncertain_observation',
        outcomeType: 'uncertain',
        displayNameCn: '暂不能稳定判断'
      }
    ],
    finalResult: {
      displayName: '积水/根系压力',
      summary: '当前路径已收敛到积水/根系压力方向。'
    },
    questionRequired: false,
    questions: []
  })

  assert.deepEqual(
    mixedUncertainResult.visibleOutcomes.map(item => item.outcomeKey),
    ['overwatering_root_pressure']
  )
}

function testDiagnosisReviewDisplaysEnvironmentCareCalculation() {
  const source = readFileSync('./src/pages/profile/diagnosis-review.vue', 'utf8')
  const detailLoaderSource = readFileSync(
    './cloudfunctions/diagnose-http/repositories/diagnosis-review/detail-loaders.js',
    'utf8'
  )
  assert.ok(source.includes('环境与养护计算'))
  assert.ok(source.includes('getEnvironmentCareCalculation(currentDetail)'))
  assert.ok(source.includes('getEnvironmentCareCalculationSummaryRows(currentDetail)'))
  assert.ok(source.includes('getEnvironmentCareCalculationRows(currentDetail)'))
  assert.ok(source.includes('formatEnvironmentCareHighHumidityMetric'))
  assert.ok(source.includes('formatEnvironmentCareThresholdFactors'))
  assert.ok(source.includes('environmentCareCalculation.keyMetrics.highHumidityDays'))
  assert.ok(source.includes('高湿命中：历史高湿天数 >= ${highHumidityDaysMin}'))
  assert.ok(source.includes('历史高湿天数'))
  assert.ok(source.includes('watering.formula'))
  assert.ok(source.includes('fertilizing.formula'))
  assert.ok(source.includes('light.formula'))
  assert.ok(source.includes('formula-line-list'))
  assert.ok(source.includes('formatPlannerFormulaLines'))
  assert.ok(source.includes('substituteFormulaExpression'))
  assert.ok(source.includes('formulaStepLabelMap'))
  assert.ok(source.includes('formulaTermLabelMap'))
  assert.ok(source.includes('公式：${formatFormulaTechnicalLabel(key)}'))
  assert.ok(source.includes('代入：${formatFormulaTechnicalLabel(key)}'))
  assert.ok(source.includes('；结果=${formatFormulaResult(step)}'))
  assert.ok(source.includes('判定=${step.passed ?'))
  assert.ok(source.includes('processLines: formatPlannerFormulaProcessLines'))
  assert.ok(source.includes('high_humidity_pressure_hit'))
  assert.ok(source.includes('计算过程：高湿命中 ='))
  assert.ok(source.includes('计算过程：根区湿度指数 > 0.6 且 湿压负载 > 0.4'))
  assert.ok(source.includes('计算过程：未来干热分支'))
  assert.ok(source.includes('计算过程：缺肥时间桶判断'))
  assert.ok(detailLoaderSource.includes('keyMetrics'))
  assert.ok(detailLoaderSource.includes('thresholdFactors'))
  assert.ok(detailLoaderSource.includes('wetHighHumidityDaysMin'))
  assert.ok(detailLoaderSource.includes('wetHighHumidityConsecutiveDaysMin'))
  assert.ok(detailLoaderSource.includes('highHumidityDays'))
  assert.ok(detailLoaderSource.includes('maxConsecutiveHighHumidityDays'))
}

function testReviewCoreProcessKeepsRoutePath() {
  const coreProcess = buildPublicCoreProcess({
    routeDecision: {
      mode: 'multi_outcome_route',
      activeRouteGroupKeys: ['yellowing_care_split_group'],
      visibleOutcomeKeys: ['overwatering_root_pressure'],
      conservativePolicy: '',
      decisionCause: {
        decisionCauseKey: 'route_visible_outcomes_ready',
        decisionCauseText: 'route 已形成可展示 outcome。'
      },
      candidateOutcomeStates: [
        {
          outcomeKey: 'overwatering_root_pressure',
          state: 'display_eligible',
          routeKeys: ['yellowing_wet_soil_route'],
          missingConditionKeys: []
        }
      ],
      conditionResults: [
        {
          conditionKey: 'wet_soil_confirmation_condition',
          routeKey: 'yellowing_wet_soil_route',
          conditionRole: 'display',
          result: 'pass',
          requiredEvidenceMatched: true,
          requiredAnswerEffectsMatched: true,
          blockerMatched: false
        }
      ],
      routeTrace: [
        {
          outcomeKey: 'overwatering_root_pressure',
          routeKeys: ['yellowing_wet_soil_route'],
          conditionResults: [
            {
              conditionKey: 'wet_soil_confirmation_condition',
              conditionRole: 'display',
              result: 'pass'
            }
          ]
        }
      ]
    }
  })

  assert.deepEqual(coreProcess.route.routeDecision.visibleOutcomeKeys, [
    'overwatering_root_pressure'
  ])
  assert.deepEqual(coreProcess.route.routeDecision.activeRouteGroupKeys, [
    'yellowing_care_split_group'
  ])
  assert.equal(
    coreProcess.route.routeDecision.routeTrace[0].routeKeys[0],
    'yellowing_wet_soil_route'
  )
  assert.equal(coreProcess.route.routeDecision.conditionResults[0].result, 'pass')
}

async function testReviewGovernancePrefersRouteActionAdvice() {
  const governance =
    await diagnosisReviewRepositoryTest.resolveDiagnosisReviewActionAdviceGovernance({
      row: {
        final_problem_key: 'low_light_growth_weakness',
        treatment: '先检查新叶是否黄而叶脉仍绿，必要时补充螯合铁。',
        prevention: '避免长期用高碱性水或介质。'
      },
      runtimeSnapshot: {
        outcomeType: 'problematic',
        finalResult: {
          problemId: 'p_bG93X2xpZ2h0X2dyb3d0aF93ZWFrbmVzcw',
          displayName: '光照不足/生长偏弱',
          summary: '当前更像长期光照不足引起的偏弱和黄化。'
        },
        actionAdvice: {
          todayActions: ['把植株移到更稳定明亮散射光处'],
          avoidActions: ['不要突然暴晒或一次性大幅施肥']
        }
      },
      mapped: {
        outcomeType: 'problematic',
        problemKey: 'low_light_growth_weakness'
      }
    })

  assert.equal(governance.governedAdvice.source, 'route_action_advice')
  assert.equal(governance.governedAdvice.nextSteps[0].text, '把植株移到更稳定明亮散射光处')
  assert.equal(governance.governedAdvice.whatToAvoid[0], '不要突然暴晒或一次性大幅施肥')
  assert.equal(
    governance.governedAdvice.nextSteps.some(item => item.text.includes('螯合铁')),
    false
  )
}

async function main() {
  console.log('=== Route Planning 测试开始 ===\n')
  await testRoutePlannerDoesNotRequireQuestionForMissingCondition()
  console.log('✓ route planner missing evidence does not require another question')
  await testRoutePlannerConflict()
  console.log('✓ route planner 冲突保护')
  await testRoutePlannerKeepsThreeVisibleOutcomesAcrossMixedGroupLimits()
  console.log('✓ route planner mixed group limits keep three visible outcomes')
  await testRoutePlannerConservativeIsConservative()
  console.log('✓ route planner conservative 保守不确定')
  await testRoutePlannerNextQuestions()
  console.log('✓ route planner keeps question evidence without next question')
  testRouteConservativePayloadNoCandidateOutcomeLeak()
  console.log('✓ route conservative payload 不回填 candidate_outcome')
  testRouteVisibleOutcomesSuppressUncertainWhenConcreteExists()
  console.log('✓ concrete route outcome suppresses uncertain visible outcome')
  testSessionResultReadSuppressesUncertainWhenConcreteExists()
  console.log('✓ session result read suppresses uncertain visible outcome')
  testConditionQuestionOptionPairsRequireDeclaredRouteEffectMirror()
  console.log('✓ condition question-option pairs require declared route effect mirror')
  await testRoutePlannerConsumesSqlAnswerEffects()
  console.log('✓ route planner consumes SQL answer effects')
  await testWiltingWetSoilAnswerExpandsToWiltingRouteEvidence()
  console.log('✓ wilting wet-soil answer expands to wilting route evidence')
  await testRoutePlannerPassedAlternativeRouteSurvivesContradictedSplit()
  console.log('✓ route planner passed alternative route survives contradicted split')
  await testRoutePlannerSameRouteBlockerOverridesPass()
  console.log('✓ route planner same-route blocker overrides pass')
  await testYellowingCareContextOnlyDoesNotCloseWaterConflict()
  console.log('✓ yellowing care context only does not close water conflict')
  await testVisualCandidateYellowingExpandsRouteGroupAndPlansWateringContext()
  console.log('✓ visual candidate yellowing expands route group and plans watering context')
  await testYellowingFrontloadedCareStartsWithWateringQuestion()
  console.log('✓ yellowing frontloaded care starts with watering question')
  await testYellowingFrontloadedCareAdvancesAfterWateringQuestion()
  console.log('✓ yellowing frontloaded care advances after watering question')
  await testYellowingRouteDoesNotHoldVisibleOutcomeForMissingPackageGroups()
  console.log('✓ yellowing route fast path does not wait for required groups')
  await testYellowingRouteUsesHistoricalGroupedAnswersForClosure()
  console.log('✓ yellowing route uses historical grouped answers for closure')
  await testRouteFastPathBackfillsHistoricalRouteAnswerEffects()
  console.log('✓ route fast path backfills historical route answer effects')
  await testYellowingCareContextAnswerKeepsRouteQuestionEvidence()
  console.log('✓ yellowing care context answer keeps route question evidence')
  await testYellowingLowLightRouteClosesWithActionAdvice()
  console.log('✓ yellowing low-light route closes with action advice')
  testRouteActionProfilesLimitedToVisibleOutcomes()
  console.log('✓ route action profiles limited to visible outcomes')
  testLeafSpotRouteAdviceDoesNotAppendYellowingFertilizerGuidance()
  console.log('✓ leaf spot route advice does not append yellowing fertilizer guidance')
  testYellowingOutcomeAdviceAddsPestAndNaturalAgingReview()
  console.log('✓ yellowing outcome advice adds pest and natural aging review')
  testYellowingWeakLeafAgeEvidenceDoesNotCloseNutrientOutcomes()
  console.log('✓ yellowing weak leaf-age evidence does not close nutrient outcomes')
  testYellowingNutrientGuardDoesNotForceLeafAgeQuestion()
  console.log('✓ yellowing nutrient guard does not force leaf-age question')
  testSessionYellowingLeafAgeAnswerDoesNotAffectEvidenceScoring()
  console.log('✓ session yellowing leaf-age answer does not affect evidence scoring')
  await testSessionYellowingLeafAgeAnswerDoesNotCloseRoute()
  console.log('✓ session yellowing leaf-age answer does not close route')
  testMultiOutcomeConflictPreservesPerOutcomeAdviceItems()
  console.log('✓ multi-outcome conflict preserves per-outcome advice items')
  testRootStressRouteUsesUserFriendlyDisplayName()
  console.log('✓ root stress route uses user-friendly display name')
  await testYellowingAirflowLeafSpotRequiresVisibleSpotEvidence()
  console.log('✓ yellowing airflow leaf spot requires visible spot evidence')
  await testYellowingStrongLightRouteClosesWithSunburnActionAdvice()
  console.log('✓ yellowing strong-light route closes with sunburn action advice')
  testRuntimeSnapshotPersistsInternalRouteDecision()
  console.log('✓ runtime snapshot persists internal route decision')
  testManualQuestionStartRouteGroupBridge()
  console.log('✓ manual question/start bridges symptom to route group')
  await testManualQuestionStartFastPathBuildsQuestionRound()
  console.log('✓ manual question/start fast path builds guarded question package')
  testVisualParserFields()
  console.log('✓ 视觉新增字段解析')
  testPestSpecklingStickyNoGuard()
  console.log('✓ 黄点虫害黏腻否定守卫')
  testFormatDiagnosisResponseRouteFields()
  console.log('✓ route 结果契约与 action advice')
  testRouteOutputUsesDiagnosisOutcomesAndAvoidsCandidateOutcomeSummaryLeak()
  console.log('✓ route output uses diagnosis_outcomes and avoids candidate_outcome summary leak')
  testRouteExplanationFollowsRoutePrimaryOutcome()
  console.log('✓ route explanation follows route primary outcome')
  testQuestionCompletedStateUsesRouteConvergenceBranch()
  console.log('✓ package completed state uses route convergence branch')
  testDiagnosisResultPageUsesVisibleOutcomeList()
  console.log('✓ diagnosis result page uses visible outcome list')
  testRouteFinalStopStateCloses()
  console.log('✓ route final stop state closes')
  testFormatDiagnosisResponseRouteOutputDisabled()
  console.log('✓ route output feature flag')
  testRouteModeHidesCandidateOutcomesFromPublicPayload()
  console.log('✓ route mode 隐藏 candidateOutcomes')
  testRouteConflictVisibleOutcomesStillProduceRouteBackedFinalResult()
  console.log('✓ route conflict visible outcomes 仍输出 route-backed finalResult')
  testSessionResultReadServicePreservesRouteMultiOutcomeFields()
  console.log('✓ session result read service preserves route multi outcome fields')
  testRouteModeDoesNotBuildSessionQuestionsAfterPackageAnswer()
  console.log('✓ route mode 不允许 session generic question 补位')
  testUncertainSuppressesTopProblem()
  console.log('✓ uncertain suppresses top problem')
  testUncertainSuppressesRouteFinalResultProblem()
  console.log('✓ uncertain suppresses route final result problem')
  testPresenterSuppressesUncertainProblemLeak()
  console.log('✓ presenter suppresses uncertain problem leak')
  testPresenterKeepsCareBehaviorEvidenceAndDropsWeatherWindow()
  console.log('✓ presenter keeps care behavior evidence and drops weather window')
  testNonProblematicHasNoTreatmentAdvice()
  console.log('✓ non-problematic has no treatment advice')
  testRouteBackedNonProblematicOutcome()
  console.log('✓ route-backed non-problematic outcome')
  await testGoldenRouteSamples()
  console.log('✓ golden route samples')
  testGoldenNonProblematicSamples()
  console.log('✓ golden non-problematic samples')
  await testGoldenUncertainSamples()
  console.log('✓ golden uncertain samples')
  testFrontendNormalizationSuitability()
  console.log('✓ frontend normalization suitability')
  testDiagnosisReviewDisplaysEnvironmentCareCalculation()
  console.log('✓ diagnosis review displays environment care calculation')
  testReviewCoreProcessKeepsRoutePath()
  console.log('✓ review core process keeps route path')
  await testReviewGovernancePrefersRouteActionAdvice()
  console.log('✓ review governance prefers route action advice')
  console.log('\n==================================================')
  console.log('✓ Route Planning 本地测试通过')
  console.log('==================================================')
}

main().catch(error => {
  console.error('✗ Route Planning 测试失败:', error)
  process.exit(1)
})
