import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildRouteEvidenceContext,
  planOutcomeRoutes
} = require('../../cloudfunctions/diagnose-http/domain/outcome-route-planner.js')

const MANIFEST_PATH = 'test/e2e/terminal-e2e/manifests/route-planning-golden-cases.manifest.json'

const OUTCOME_KEYS = [
  'overwatering_root_pressure',
  'underwatering',
  'low_light_growth_weakness',
  'sunburn',
  'dry_air_stress',
  'leaf_spot_problem',
  'structural_damage_old_injury',
  'chewing_pest_damage',
  'normal_leaf_aging',
  'stable_natural_marking',
  'uncertain_observation'
]

function buildObservedEvidenceSet(symptomKeys = []) {
  return symptomKeys.map((symptomKey, index) => ({
    observedEvidenceSetId: `golden_obs_${index + 1}`,
    evidenceKey: symptomKey,
    evidenceType: 'symptom',
    symptomKey,
    confidence: 0.99,
    sourceType: 'golden_case',
    currentStatus: 'active',
    enteredRuntime: 1
  }))
}

function condition({
  conditionKey,
  routeKey,
  anySymptomKeys,
  questionOptionPairs = [],
  blockerPairs = [],
  conflictOutcomeKeys = []
}) {
  return {
    conditionKey,
    routeKey,
    conditionRole: 'display',
    requiredEvidence: { anySymptomKeys },
    requiredAnswerEffects: {
      questionOptionPairs,
      routeKeys: [routeKey]
    },
    blockerEvidence: blockerPairs.length ? { anyQuestionOptionPairs: blockerPairs } : {},
    conflictOutcomeKeys
  }
}

function question({ routeKey, conditionKey, questionKey, stepNo, askPriority = 200 }) {
  return {
    routeKey,
    conditionKey,
    questionKey,
    stepNo,
    routePackageRole: 'path_split',
    requiredForClosure: true,
    askPriority
  }
}

function buildRouteRepository() {
  const q = {
    yellowCare: 'q_observed_probe__leaf_yellowing__yellowing_care_area_condition',
    yellowWater: 'q_observed_probe__leaf_yellowing__watering_frequency_context',
    yellowAge: 'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern',
    wiltSoil: 'q_observed_probe__wilting__soil_moisture_context',
    lightChange: 'q_observed_probe__light__recent_light_change',
    leafEdge: 'q_observed_probe__leaf_edge__air_humidity_context',
    leafSpot: 'q_observed_probe__leaf_spot__spread_and_humidity',
    leafHoles: 'q_observed_probe__leaf_holes__fresh_or_old',
    stableMarking: 'q_observed_probe__stable_marking__change_context'
  }

  const routes = [
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
    },
    {
      routeKey: 'yellowing_old_leaf_route',
      routeGroupKey: 'yellowing_care_split_group',
      outcomeKey: 'normal_leaf_aging',
      actionProfileKey: 'action_observe_only',
      actionConflictGroup: 'observe_only'
    },
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
      actionConflictGroup: 'reduce_light'
    },
    {
      routeKey: 'wilting_wet_soil_route',
      routeGroupKey: 'wilting_water_split_group',
      outcomeKey: 'overwatering_root_pressure',
      actionProfileKey: 'action_overwatering_basic',
      actionConflictGroup: 'watering_stop'
    },
    {
      routeKey: 'wilting_dry_soil_route',
      routeGroupKey: 'wilting_water_split_group',
      outcomeKey: 'underwatering',
      actionProfileKey: 'action_underwatering_basic',
      actionConflictGroup: 'watering_add'
    },
    {
      routeKey: 'leggy_low_light_route',
      routeGroupKey: 'light_split_group',
      outcomeKey: 'low_light_growth_weakness',
      actionProfileKey: 'action_low_light_basic',
      actionConflictGroup: 'increase_light'
    },
    {
      routeKey: 'sunburn_recent_exposure_route',
      routeGroupKey: 'light_split_group',
      outcomeKey: 'sunburn',
      actionProfileKey: 'action_sunburn_basic',
      actionConflictGroup: 'reduce_light'
    },
    {
      routeKey: 'dry_air_leaf_edge_route',
      routeGroupKey: 'leaf_edge_split_group',
      outcomeKey: 'dry_air_stress',
      actionProfileKey: 'action_dry_air_basic',
      actionConflictGroup: 'increase_humidity'
    },
    {
      routeKey: 'leaf_spot_humid_route',
      routeGroupKey: 'leaf_spot_split_group',
      outcomeKey: 'leaf_spot_problem',
      actionProfileKey: 'action_leaf_spot_basic',
      actionConflictGroup: 'isolate_and_reduce_leaf_wetness'
    },
    {
      routeKey: 'holes_chewing_pest_route',
      routeGroupKey: 'leaf_holes_split_group',
      outcomeKey: 'chewing_pest_damage',
      actionProfileKey: 'action_chewing_pest_basic',
      actionConflictGroup: 'inspect_and_remove_pests'
    },
    {
      routeKey: 'holes_old_injury_route',
      routeGroupKey: 'leaf_holes_split_group',
      outcomeKey: 'structural_damage_old_injury',
      actionProfileKey: 'action_observe_only',
      actionConflictGroup: 'observe_only'
    },
    {
      routeKey: 'stable_natural_marking_route',
      routeGroupKey: 'stable_marking_group',
      outcomeKey: 'stable_natural_marking',
      actionProfileKey: 'action_observe_only',
      actionConflictGroup: 'observe_only'
    },
    {
      routeKey: 'mixed_water_conflict_wet_route',
      routeGroupKey: 'mixed_water_conflict_group',
      outcomeKey: 'overwatering_root_pressure',
      actionProfileKey: 'action_overwatering_basic',
      actionConflictGroup: 'watering_stop'
    },
    {
      routeKey: 'mixed_water_conflict_dry_route',
      routeGroupKey: 'mixed_water_conflict_group',
      outcomeKey: 'underwatering',
      actionProfileKey: 'action_underwatering_basic',
      actionConflictGroup: 'watering_add'
    }
  ]

  const yellowSymptoms = [
    'leaf_yellowing',
    'uniform_yellowing',
    'yellow_lower_leaves',
    'old_lower_leaf_yellowing',
    'ambiguous_leaf_discoloration'
  ]
  const wiltingSymptoms = ['leaf_wilting', 'soft_wilting', 'wilting_with_wet_soil', 'wilting_with_dry_soil']
  const lowLightSymptoms = ['leggy_growth', 'weak_new_growth', 'pale_new_growth']
  const sunburnSymptoms = ['sunburn_patch', 'bleached_leaf_patch', 'scorched_leaf_patch']
  const leafEdgeSymptoms = ['leaf_tip_browning', 'crispy_leaf_edge', 'brown_leaf_edge']
  const leafSpotSymptoms = ['leaf_spot', 'spreading_leaf_spots', 'brown_leaf_spot']
  const holeSymptoms = ['leaf_holes', 'fresh_chewed_edge', 'new_leaf_holes', 'old_leaf_tear', 'stable_leaf_damage']
  const stableMarkingSymptoms = [
    'stable_natural_marking_pattern',
    'stable_variegation',
    'long_term_stable_marking'
  ]

  const gates = [
    condition({
      conditionKey: 'wet_soil_confirmation_condition',
      routeKey: 'yellowing_wet_soil_route',
      anySymptomKeys: yellowSymptoms,
      questionOptionPairs: [`${q.yellowCare}:watering_area`, `${q.yellowWater}:often_wet`],
      blockerPairs: [`${q.yellowWater}:often_dry`, `${q.yellowCare}:light_area`],
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    }),
    condition({
      conditionKey: 'dry_soil_confirmation_condition',
      routeKey: 'yellowing_dry_soil_route',
      anySymptomKeys: yellowSymptoms,
      questionOptionPairs: [`${q.yellowCare}:watering_area`, `${q.yellowWater}:often_dry`],
      blockerPairs: [`${q.yellowWater}:often_wet`, `${q.yellowCare}:light_area`],
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    }),
    condition({
      conditionKey: 'yellowing_old_leaf_condition',
      routeKey: 'yellowing_old_leaf_route',
      anySymptomKeys: yellowSymptoms,
      questionOptionPairs: [`${q.yellowAge}:old_lower_leaves_first`],
      blockerPairs: [`${q.yellowAge}:new_leaves_first`]
    }),
    condition({
      conditionKey: 'yellowing_low_light_condition',
      routeKey: 'yellowing_low_light_route',
      anySymptomKeys: yellowSymptoms,
      questionOptionPairs: [`${q.yellowCare}:light_area`, `${q.lightChange}:weaker_light`],
      blockerPairs: [`${q.yellowCare}:watering_area`, `${q.lightChange}:stronger_direct_light`]
    }),
    condition({
      conditionKey: 'yellowing_sunburn_condition',
      routeKey: 'yellowing_sunburn_route',
      anySymptomKeys: yellowSymptoms,
      questionOptionPairs: [`${q.yellowCare}:light_area`, `${q.lightChange}:stronger_direct_light`],
      blockerPairs: [`${q.yellowCare}:watering_area`, `${q.lightChange}:weaker_light`]
    }),
    condition({
      conditionKey: 'wilting_wet_soil_condition',
      routeKey: 'wilting_wet_soil_route',
      anySymptomKeys: wiltingSymptoms,
      questionOptionPairs: [`${q.wiltSoil}:soil_wet`],
      blockerPairs: [`${q.wiltSoil}:soil_dry`],
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    }),
    condition({
      conditionKey: 'wilting_dry_soil_condition',
      routeKey: 'wilting_dry_soil_route',
      anySymptomKeys: wiltingSymptoms,
      questionOptionPairs: [`${q.wiltSoil}:soil_dry`],
      blockerPairs: [`${q.wiltSoil}:soil_wet`],
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    }),
    condition({
      conditionKey: 'leggy_low_light_condition',
      routeKey: 'leggy_low_light_route',
      anySymptomKeys: lowLightSymptoms,
      questionOptionPairs: [`${q.lightChange}:weaker_light`],
      blockerPairs: [`${q.lightChange}:stronger_direct_light`]
    }),
    condition({
      conditionKey: 'sunburn_recent_exposure_condition',
      routeKey: 'sunburn_recent_exposure_route',
      anySymptomKeys: sunburnSymptoms,
      questionOptionPairs: [`${q.lightChange}:stronger_direct_light`],
      blockerPairs: [`${q.lightChange}:weaker_light`]
    }),
    condition({
      conditionKey: 'dry_air_leaf_edge_condition',
      routeKey: 'dry_air_leaf_edge_route',
      anySymptomKeys: leafEdgeSymptoms,
      questionOptionPairs: [`${q.leafEdge}:dry_air_low_humidity`]
    }),
    condition({
      conditionKey: 'leaf_spot_humid_condition',
      routeKey: 'leaf_spot_humid_route',
      anySymptomKeys: leafSpotSymptoms,
      questionOptionPairs: [`${q.leafSpot}:spreading_or_humid`]
    }),
    condition({
      conditionKey: 'holes_chewing_pest_condition',
      routeKey: 'holes_chewing_pest_route',
      anySymptomKeys: holeSymptoms,
      questionOptionPairs: [`${q.leafHoles}:fresh_chewing_or_frass`],
      blockerPairs: [`${q.leafHoles}:old_stable_damage`]
    }),
    condition({
      conditionKey: 'holes_old_injury_condition',
      routeKey: 'holes_old_injury_route',
      anySymptomKeys: holeSymptoms,
      questionOptionPairs: [`${q.leafHoles}:old_stable_damage`],
      blockerPairs: [`${q.leafHoles}:fresh_chewing_or_frass`]
    }),
    condition({
      conditionKey: 'stable_natural_marking_condition',
      routeKey: 'stable_natural_marking_route',
      anySymptomKeys: stableMarkingSymptoms,
      questionOptionPairs: [`${q.stableMarking}:stable_long_term_pattern`]
    }),
    {
      conditionKey: 'mixed_water_conflict_wet_condition',
      routeKey: 'mixed_water_conflict_wet_route',
      conditionRole: 'display',
      requiredEvidence: { anySymptomKeys: ['mixed_stress_signs'] },
      requiredAnswerEffects: {},
      blockerEvidence: {},
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    },
    {
      conditionKey: 'mixed_water_conflict_dry_condition',
      routeKey: 'mixed_water_conflict_dry_route',
      conditionRole: 'display',
      requiredEvidence: { anySymptomKeys: ['mixed_stress_signs'] },
      requiredAnswerEffects: {},
      blockerEvidence: {},
      conflictOutcomeKeys: ['overwatering_root_pressure', 'underwatering']
    }
  ]

  const questions = [
    question({
      routeKey: 'yellowing_wet_soil_route',
      conditionKey: 'wet_soil_confirmation_condition',
      questionKey: q.yellowCare,
      stepNo: 1,
      askPriority: 250
    }),
    question({
      routeKey: 'yellowing_wet_soil_route',
      conditionKey: 'wet_soil_confirmation_condition',
      questionKey: q.yellowWater,
      stepNo: 2,
      askPriority: 240
    }),
    question({
      routeKey: 'yellowing_dry_soil_route',
      conditionKey: 'dry_soil_confirmation_condition',
      questionKey: q.yellowCare,
      stepNo: 1,
      askPriority: 250
    }),
    question({
      routeKey: 'yellowing_dry_soil_route',
      conditionKey: 'dry_soil_confirmation_condition',
      questionKey: q.yellowWater,
      stepNo: 2,
      askPriority: 240
    }),
    question({
      routeKey: 'yellowing_old_leaf_route',
      conditionKey: 'yellowing_old_leaf_condition',
      questionKey: q.yellowAge,
      stepNo: 1
    }),
    question({
      routeKey: 'yellowing_low_light_route',
      conditionKey: 'yellowing_low_light_condition',
      questionKey: q.yellowCare,
      stepNo: 1
    }),
    question({
      routeKey: 'yellowing_low_light_route',
      conditionKey: 'yellowing_low_light_condition',
      questionKey: q.lightChange,
      stepNo: 2
    }),
    question({
      routeKey: 'yellowing_sunburn_route',
      conditionKey: 'yellowing_sunburn_condition',
      questionKey: q.yellowCare,
      stepNo: 1
    }),
    question({
      routeKey: 'yellowing_sunburn_route',
      conditionKey: 'yellowing_sunburn_condition',
      questionKey: q.lightChange,
      stepNo: 2
    }),
    question({
      routeKey: 'wilting_wet_soil_route',
      conditionKey: 'wilting_wet_soil_condition',
      questionKey: q.wiltSoil,
      stepNo: 1
    }),
    question({
      routeKey: 'wilting_dry_soil_route',
      conditionKey: 'wilting_dry_soil_condition',
      questionKey: q.wiltSoil,
      stepNo: 1
    }),
    question({
      routeKey: 'leggy_low_light_route',
      conditionKey: 'leggy_low_light_condition',
      questionKey: q.lightChange,
      stepNo: 1
    }),
    question({
      routeKey: 'sunburn_recent_exposure_route',
      conditionKey: 'sunburn_recent_exposure_condition',
      questionKey: q.lightChange,
      stepNo: 1
    }),
    question({
      routeKey: 'dry_air_leaf_edge_route',
      conditionKey: 'dry_air_leaf_edge_condition',
      questionKey: q.leafEdge,
      stepNo: 1
    }),
    question({
      routeKey: 'leaf_spot_humid_route',
      conditionKey: 'leaf_spot_humid_condition',
      questionKey: q.leafSpot,
      stepNo: 1
    }),
    question({
      routeKey: 'holes_chewing_pest_route',
      conditionKey: 'holes_chewing_pest_condition',
      questionKey: q.leafHoles,
      stepNo: 1
    }),
    question({
      routeKey: 'holes_old_injury_route',
      conditionKey: 'holes_old_injury_condition',
      questionKey: q.leafHoles,
      stepNo: 1
    }),
    question({
      routeKey: 'stable_natural_marking_route',
      conditionKey: 'stable_natural_marking_condition',
      questionKey: q.stableMarking,
      stepNo: 1
    })
  ]

  const routeGroups = [
    {
      routeGroupKey: 'yellowing_care_split_group',
      entrySymptomKeys: yellowSymptoms,
      candidateOutcomeKeys: [
        'overwatering_root_pressure',
        'underwatering',
        'normal_leaf_aging',
        'low_light_growth_weakness',
        'sunburn'
      ],
      maxVisibleOutcomes: 3
    },
    {
      routeGroupKey: 'wilting_water_split_group',
      entrySymptomKeys: wiltingSymptoms,
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      maxVisibleOutcomes: 3
    },
    {
      routeGroupKey: 'light_split_group',
      entrySymptomKeys: [...lowLightSymptoms, ...sunburnSymptoms],
      candidateOutcomeKeys: ['low_light_growth_weakness', 'sunburn'],
      maxVisibleOutcomes: 3
    },
    {
      routeGroupKey: 'leaf_edge_split_group',
      entrySymptomKeys: leafEdgeSymptoms,
      candidateOutcomeKeys: ['dry_air_stress'],
      maxVisibleOutcomes: 1
    },
    {
      routeGroupKey: 'leaf_spot_split_group',
      entrySymptomKeys: leafSpotSymptoms,
      candidateOutcomeKeys: ['leaf_spot_problem'],
      maxVisibleOutcomes: 1
    },
    {
      routeGroupKey: 'leaf_holes_split_group',
      entrySymptomKeys: holeSymptoms,
      candidateOutcomeKeys: ['chewing_pest_damage', 'structural_damage_old_injury'],
      maxVisibleOutcomes: 2
    },
    {
      routeGroupKey: 'stable_marking_group',
      entrySymptomKeys: stableMarkingSymptoms,
      candidateOutcomeKeys: ['stable_natural_marking'],
      maxVisibleOutcomes: 1
    },
    {
      routeGroupKey: 'mixed_water_conflict_group',
      entrySymptomKeys: ['mixed_stress_signs'],
      candidateOutcomeKeys: ['overwatering_root_pressure', 'underwatering'],
      maxVisibleOutcomes: 3
    }
  ]

  return {
    routes,
    conditions: gates,
    questions,
    routeGroups,
    async getOutcomeRoutesByOutcomeKeys(outcomeKeys = []) {
      const outcomeKeySet = new Set(outcomeKeys)
      return routes.filter(route => outcomeKeySet.has(route.outcomeKey))
    },
    async getOutcomeRouteConditions(routeKeys = []) {
      const routeKeySet = new Set(routeKeys)
      return gates.filter(routeGate => routeKeySet.has(routeGate.routeKey))
    },
    async getOutcomeRouteQuestions(routeKeys = []) {
      const routeKeySet = new Set(routeKeys)
      return questions.filter(routeQuestion => routeKeySet.has(routeQuestion.routeKey))
    },
    async getOutcomeRouteGroupsByKeys(routeGroupKeys = []) {
      const routeGroupKeySet = new Set(routeGroupKeys)
      return routeGroups.filter(routeGroup => routeGroupKeySet.has(routeGroup.routeGroupKey))
    },
    async getAllActiveOutcomeRouteGroups() {
      return routeGroups
    }
  }
}

function buildRouteAnswerEffects(routeRepository) {
  const routesByKey = new Map(routeRepository.routes.map(route => [route.routeKey, route]))
  const effectKeySet = new Set()
  const effects = []
  for (const routeCondition of routeRepository.conditions) {
    const route = routesByKey.get(routeCondition.routeKey)
    const questionOptionPairs = routeCondition.requiredAnswerEffects?.questionOptionPairs || []
    for (const questionOptionPair of questionOptionPairs) {
      const [questionKey, optionKey] = questionOptionPair.split(':')
      if (!route || !questionKey || !optionKey) {continue}
      const effectKey = `${questionKey}:${optionKey}:${route.outcomeKey}:${route.routeKey}`
      if (effectKeySet.has(effectKey)) {continue}
      effectKeySet.add(effectKey)
      effects.push({
        questionKey,
        optionKey,
        outcomeKey: route.outcomeKey,
        routeKey: route.routeKey,
        effectType: 'support'
      })
    }
  }
  return effects
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
}

function expandCases(manifest) {
  return manifest.scenarioGroups.flatMap(group => {
    const cases = []
    for (let index = 0; index < group.count; index++) {
      const symptomKeys = group.symptomVariants[index % group.symptomVariants.length]
      const answers = group.answerVariants[index % group.answerVariants.length]
      cases.push({
        ...group,
        caseKey: `${group.scenarioKey}_${String(index + 1).padStart(3, '0')}`,
        symptomKeys,
        answers,
        canAskAnotherFollowUpRound:
          group.scenarioKey === 'uncertain_or_conflict' && answers.length === 1
      })
    }
    return cases
  })
}

function assertManifestDistribution(manifest, cases) {
  assert.ok(
    cases.length >= manifest.acceptedCaseRange.min && cases.length <= manifest.acceptedCaseRange.max,
    `golden case count ${cases.length} is outside accepted range`
  )
  assert.equal(cases.length, manifest.totalExpectedCases)
  for (const group of manifest.scenarioGroups) {
    const actualCount = cases.filter(testCase => testCase.scenarioKey === group.scenarioKey).length
    assert.equal(actualCount, group.count, `${group.scenarioKey} count mismatch`)
  }
}

function assertRouteQuestionCoverage(routeRepository, testCase) {
  if (!testCase.expectedRouteKey) {return}
  const routeQuestionKeys = new Set(
    routeRepository.questions
      .filter(routeQuestion => routeQuestion.routeKey === testCase.expectedRouteKey)
      .map(routeQuestion => routeQuestion.questionKey)
  )
  for (const answer of testCase.answers) {
    assert.ok(
      routeQuestionKeys.has(answer.questionKey),
      `${testCase.caseKey} route question missing ${answer.questionKey}`
    )
  }
}

function buildCandidateOutcomesFor(testCase) {
  const expectedOutcomeKey = testCase.expectedOutcomeKey || 'overwatering_root_pressure'
  return [
    { problemKey: 'session_candidate_decoy', evidenceOrder: 1 },
    { problemKey: expectedOutcomeKey, evidenceOrder: 2 },
    ...OUTCOME_KEYS.filter(outcomeKey => outcomeKey !== expectedOutcomeKey).map((outcomeKey, index) => ({
      problemKey: outcomeKey,
      evidenceOrder: index + 3
    }))
  ]
}

function assertNoCandidateOrderingLeak(decision, testCase) {
  assert.equal(Object.hasOwn(decision, 'candidateOutcomes'), false, `${testCase.caseKey} leaked candidateOutcomes`)
  assert.notEqual(decision.conservativePolicy, 'route_uncertain', `${testCase.caseKey} used candidate_outcome conservative policy`)
  assert.notEqual(decision.visibleOutcomeKeys[0], 'session_candidate_decoy', `${testCase.caseKey} used candidate_outcome decoy`)
}

async function verifyCase({ testCase, routeRepository, routeAnswerEffects }) {
  const routeEvidenceContext = buildRouteEvidenceContext({
    observedEvidenceSet: buildObservedEvidenceSet(testCase.symptomKeys),
    answers: testCase.answers,
    routeAnswerEffects,
    candidateOutcomes: buildCandidateOutcomesFor(testCase)
  })
  const decision = await planOutcomeRoutes({
    candidateOutcomeKeys: OUTCOME_KEYS,
    routeEvidenceContext,
    routeRepository,
    maxVisibleOutcomes: 3,
    maxQuestionCount: 1,
    canAskAnotherFollowUpRound: testCase.canAskAnotherFollowUpRound,
    featureFlags: { routePlanningEnabled: true }
  })

  assertNoCandidateOrderingLeak(decision, testCase)

  if (testCase.expectedOutcomeKey) {
    assert.equal(decision.conservativePolicy, '', `${testCase.caseKey} should be route-authoritative`)
    assert.equal(decision.visibleOutcomeKeys[0], testCase.expectedOutcomeKey, `${testCase.caseKey} leading visible outcome`)
    assert.ok(
      decision.visibleOutcomeKeys.includes(testCase.expectedOutcomeKey),
      `${testCase.caseKey} visible outcome`
    )
    assert.deepEqual(
      decision.visibleActionConflictGroups,
      [testCase.expectedActionConflictGroup],
      `${testCase.caseKey} action conflict group`
    )
    assert.equal(decision.requiresQuestion, false, `${testCase.caseKey} should close without question`)
    assert.equal(
      decision.decisionCause.decisionCauseKey,
      'route_visible_outcomes_ready',
      `${testCase.caseKey} decision cause`
    )
    assert.ok(
      decision.routeTrace.some(trace =>
        trace.routeKeys.includes(testCase.expectedRouteKey) &&
        trace.conditionResults.some(result => result.result === 'pass')
      ),
      `${testCase.caseKey} did not enter expected route`
    )
    assert.equal(
      new Set(decision.visibleActionConflictGroups).size,
      decision.visibleActionConflictGroups.length,
      `${testCase.caseKey} has duplicated action conflict groups`
    )
    return
  }

  const isActionConflict =
    decision.decisionCause.decisionCauseKey === 'route_action_conflict_unresolved'
  if (!isActionConflict) {
    assert.equal(decision.visibleOutcomeKeys.length, 0, `${testCase.caseKey} should not expose visible outcome`)
  }
  assert.ok(
    testCase.expectedDecisionCauseKeys.includes(decision.decisionCause.decisionCauseKey),
    `${testCase.caseKey} unexpected decision cause ${decision.decisionCause.decisionCauseKey}`
  )
  if (decision.decisionCause.decisionCauseKey === 'route_no_visible_outcomes_for_route') {
    assert.deepEqual(decision.visibleOutcomeKeys, [], `${testCase.caseKey} should not expose visible outcomes`)
  }
  if (decision.decisionCause.decisionCauseKey === 'route_action_conflict_unresolved') {
    assert.ok(
      decision.visibleActionConflictGroups.length > 1,
      `${testCase.caseKey} should retain conflicting action groups for audit`
    )
  }
  if (testCase.canAskAnotherFollowUpRound) {
    if (decision.requiresQuestion) {
      for (const questionKey of testCase.expectedFollowUpQuestionKeys) {
        assert.ok(decision.nextQuestionKeys.includes(questionKey), `${testCase.caseKey} missing ${questionKey}`)
      }
    }
  }
}

async function main() {
  const manifest = loadManifest()
  const cases = expandCases(manifest)
  const routeRepository = buildRouteRepository()
  const routeAnswerEffects = buildRouteAnswerEffects(routeRepository)

  assertManifestDistribution(manifest, cases)
  for (const testCase of cases) {
    assertRouteQuestionCoverage(routeRepository, testCase)
    await verifyCase({ testCase, routeRepository, routeAnswerEffects })
  }

  console.log(`Route golden manifest passed: ${cases.length} cases, ${manifest.scenarioGroups.length} groups`)
}

main().catch(error => {
  console.error('Route golden manifest failed')
  console.error(error)
  process.exit(1)
})
