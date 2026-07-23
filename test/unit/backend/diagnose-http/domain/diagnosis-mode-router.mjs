import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DIAGNOSIS_MODE_REGISTRY,
  LOCKED_SPECIFIC_PEST_MODES,
  resolveDiagnosisModeRoute,
  buildRetakeAuthorization,
  assertRetakeAuthorizationActive
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')
const {
  attachDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/services/visual-mode-route-service.js')
const {
  parseLLMVisualResult
} = require('../../../../../cloudfunctions/diagnose-http/utils/diagnosis-parser.js')
const {
  getQuestionPackageByMode
} = require('../../../../../cloudfunctions/diagnose-http/app/question-package-response.js')
const {
  resolveHighSpecificityConvergencePlan
} = require('../../../../../cloudfunctions/diagnose-http/domain/high-specificity-fast-convergence.js')

function evidence(
  evidenceKey,
  confidenceBand = 'high',
  strengthLevel = 'strong',
  imageId = '',
  captureRegion = ''
) {
  return { evidenceKey, confidenceBand, strengthLevel, imageId, captureRegion }
}

assert.deepEqual(LOCKED_SPECIFIC_PEST_MODES, [
  'spider_mite',
  'mealybug',
  'scale_insect',
  'whitefly',
  'aphid',
  'thrips',
  'leaf_miner',
  'fungus_gnat'
])
assert.equal(DIAGNOSIS_MODE_REGISTRY.yellow_leaf.requiresAiInitialAssessment, false)
assert.equal(DIAGNOSIS_MODE_REGISTRY.yellow_leaf.manualDirectEntryEnabled, true)
assert.equal(DIAGNOSIS_MODE_REGISTRY.spider_mite.requiresAiInitialAssessment, true)
assert.equal(DIAGNOSIS_MODE_REGISTRY.spider_mite.manualDirectEntryEnabled, false)
assert.equal(DIAGNOSIS_MODE_REGISTRY.powdery_mildew.requiresAiInitialAssessment, true)

const weakWebbingRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [evidence('fine_webbing', 'high', 'strong', 'img1', 'leaf_underside')]
})
assert.equal(weakWebbingRoute.nextAction, 'direct_result')
assert.deepEqual(weakWebbingRoute.directMatches, [])
assert.deepEqual(
  weakWebbingRoute.confirmationCandidates.map(item => item.modeKey),
  ['spider_mite']
)
assert.deepEqual(
  weakWebbingRoute.provisionalMatches.map(item => item.modeKey),
  ['spider_mite']
)

const spiderRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('fine_webbing', 'high', 'strong', 'img1', 'leaf_underside'),
    evidence('yellow_speckling', 'medium', 'medium', 'img1', 'leaf_underside')
  ]
})
assert.equal(spiderRoute.nextAction, 'direct_result')
assert.deepEqual(
  spiderRoute.directMatches.map(item => item.modeKey),
  ['spider_mite']
)

const visibleMiteRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('visible_mite_colony', 'high', 'strong', 'img_mite', 'leaf_underside')
  ]
})
assert.equal(visibleMiteRoute.nextAction, 'direct_result')
assert.deepEqual(
  visibleMiteRoute.directMatches.map(item => item.modeKey),
  ['spider_mite']
)

const spiderAliasEvidenceRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('fine_webbing', 'high', 'strong', 'img1', 'leaf_underside'),
    evidence('tiny_moving_dots', 'medium', 'medium', 'img1', 'leaf_underside')
  ]
})
assert.equal(spiderAliasEvidenceRoute.nextAction, 'direct_result')
assert.deepEqual(spiderAliasEvidenceRoute.directMatches, [])
assert.deepEqual(
  spiderAliasEvidenceRoute.confirmationCandidates.map(item => item.modeKey),
  ['spider_mite']
)

const stickySootyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('surface_glossy_residue', 'high', 'strong', 'img_residue', 'leaf_front'),
    evidence('sooty_mold', 'medium', 'medium', 'img_residue', 'leaf_front')
  ],
  visualModeCandidates: [
    { mode: 'mealybug', confidence: 0.82 },
    { mode: 'scale_insect', confidence: 0.78 },
    { mode: 'whitefly', confidence: 0.72 }
  ]
})
assert.equal(stickySootyRoute.nextAction, 'uncertain')
assert.deepEqual(stickySootyRoute.directMatches, [])
assert.deepEqual(stickySootyRoute.confirmationCandidates, [])

const whiteflyCombinationRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('white_flies', 'high', 'strong', 'img_whitefly', 'leaf_underside'),
    evidence('fixed_oval_nymphs', 'medium', 'medium', 'img_whitefly', 'leaf_underside')
  ]
})
assert.equal(whiteflyCombinationRoute.nextAction, 'direct_result')
assert.deepEqual(
  whiteflyCombinationRoute.directMatches.map(item => item.modeKey),
  ['whitefly']
)

const unsupportedCandidateRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [{ mode: 'thrips', confidence: 0.89, regionRef: 'leaf_front' }]
})
assert.equal(unsupportedCandidateRoute.nextAction, 'question_package')
assert.deepEqual(
  unsupportedCandidateRoute.confirmationCandidates.map(item => item.modeKey),
  ['thrips']
)

const explicitAphidWithoutFormalEvidence = parseLLMVisualResult(
  JSON.stringify({
    normalized_organ: 'leaf',
    image_quality_grade: 'good',
    analyzability: 'high',
    capture_region: 'leaf_upper_surface',
    region_ref: 'leaf_upper_surface',
    mode_candidates: [{ mode: 'aphid', confidence: 0.95, region_ref: 'leaf_upper_surface' }],
    symptom_candidates: [
      {
        symptom_key: 'yellow_speckling',
        strength_level: 'strong',
        confidence_band: 'high'
      }
    ]
  }),
  { diagnosisProfile: 'pest' }
)
assert.deepEqual(explicitAphidWithoutFormalEvidence.mode_candidates, [
  { mode: 'aphid', confidence: 0.95, region_ref: 'leaf_upper_surface' }
])
assert.equal(
  explicitAphidWithoutFormalEvidence.symptom_candidates.some(
    item => item.symptom_key === 'aphids_visible'
  ),
  false
)
const explicitAphidRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: explicitAphidWithoutFormalEvidence.symptom_candidates.map(
      item => ({
        ...item,
        primary_support_image_id: 'img_aphid',
        primary_capture_region: 'leaf_upper_surface'
      })
    ),
    admission_records: [
      {
        object_type: 'symptom',
        object_key: 'yellow_speckling',
        admission_result: 'formally_admitted',
        visual_normalized_image_result_id: 'normalized_yellow_speckling'
      }
    ]
  },
  successfulResults: [
    { imageId: 'img_aphid', normalizedResult: explicitAphidWithoutFormalEvidence }
  ]
})
assert.equal(explicitAphidRoute.route_primary_action, 'direct_result')
assert.deepEqual(explicitAphidRoute.diagnosis_mode_route_result.directMatches, [])
assert.deepEqual(
  explicitAphidRoute.diagnosis_mode_route_result.confirmationCandidates.map(item => item.modeKey),
  ['aphid']
)
assert.deepEqual(
  explicitAphidRoute.diagnosis_mode_route_result.confirmationCandidates[0].matchedEvidence,
  []
)

const lowConfidenceAphidRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [{ mode: 'aphid', confidence: 0.89, regionRef: 'leaf_upper_surface' }]
})
assert.equal(lowConfidenceAphidRoute.nextAction, 'question_package')
assert.deepEqual(
  lowConfidenceAphidRoute.confirmationCandidates.map(item => item.modeKey),
  ['aphid']
)

const singleSpiderCandidateRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.75 }]
})
assert.equal(singleSpiderCandidateRoute.nextAction, 'question_package')
assert.deepEqual(
  singleSpiderCandidateRoute.confirmationCandidates.map(item => item.modeKey),
  ['spider_mite']
)
assert.deepEqual(singleSpiderCandidateRoute.confirmationCandidates[0].matchedEvidence, [])

const invalidProfileOrOrganCandidates = parseLLMVisualResult(
  JSON.stringify({
    normalized_organ: 'root',
    mode_candidates: [
      { mode: 'aphid', confidence: 0.95 },
      { mode: 'yellow_leaf', confidence: 0.95 }
    ]
  }),
  { diagnosisProfile: 'pest' }
)
assert.deepEqual(invalidProfileOrOrganCandidates.mode_candidates, [])

const supportedCandidateRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [evidence('silver_scarring', 'medium', 'medium', 'img2', 'leaf_front')],
  visualModeCandidates: [{ mode: 'thrips', confidence: 0.72, regionRef: 'leaf_front' }]
})
assert.equal(supportedCandidateRoute.nextAction, 'direct_result')
assert.deepEqual(
  supportedCandidateRoute.confirmationCandidates.map(item => item.modeKey),
  ['thrips']
)
assert.deepEqual(
  supportedCandidateRoute.confirmationCandidates[0].matchedEvidence.map(item => item.evidenceGroup),
  ['silver_scarring']
)
assert.equal(
  supportedCandidateRoute.evidenceSnapshotId,
  resolveDiagnosisModeRoute({
    diagnosisProfile: 'pest',
    admittedEvidence: [evidence('silver_scarring', 'medium', 'medium', 'img2', 'leaf_front')],
    visualModeCandidates: [{ mode: 'thrips', confidence: 0.72, regionRef: 'leaf_front' }]
  }).evidenceSnapshotId
)

const retainedBlackSpotCompletesThripsRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('silver_streaks', 'high', 'strong', 'img_thrips', 'leaf_upper_surface')
  ],
  retainedVisualEvidence: [
    evidence('black_fecal_spots', 'high', 'medium', 'img_thrips', 'leaf_upper_surface')
  ],
  visualModeCandidates: [{ mode: 'thrips', confidence: 0.9, regionRef: 'leaf_upper_surface' }]
})
assert.equal(retainedBlackSpotCompletesThripsRoute.nextAction, 'direct_result')
assert.deepEqual(
  retainedBlackSpotCompletesThripsRoute.directMatches.map(item => item.modeKey),
  ['thrips']
)

const lowQualityRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateAnalyzability: 'low'
})
assert.equal(lowQualityRoute.nextAction, 'request_followup_capture')

const fullAssociatedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('leaf_yellowing'), evidence('leaf_droop')],
  visualModeCandidates: [
    { mode: 'yellow_leaf', confidence: 0.8 },
    { mode: 'wilting_droop', confidence: 0.75 }
  ]
})
assert.equal(fullAssociatedRoute.nextAction, 'direct_result')
assert.deepEqual(fullAssociatedRoute.associatedModes, ['yellow_leaf', 'wilting_droop'])
assert.deepEqual(
  fullAssociatedRoute.directionChoices.map(item => item.modeKey),
  ['yellow_leaf', 'wilting_droop']
)

const yellowPatchyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('yellowing_patchy')],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.88 }]
})
assert.equal(yellowPatchyRoute.nextAction, 'question_package')
assert.deepEqual(
  yellowPatchyRoute.directMatches.map(item => item.modeKey),
  ['yellow_leaf']
)
assert.equal(DIAGNOSIS_MODE_REGISTRY.yellow_leaf.questionPackageKind, 'fixed_yellow_leaf')
assert.equal(getQuestionPackageByMode('yellow_leaf').questionCount, 4)

const leafDroopRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('leaf_droop')],
  visualModeCandidates: [{ mode: 'wilting_droop', confidence: 0.9 }]
})
assert.equal(leafDroopRoute.nextAction, 'question_package')
assert.deepEqual(
  leafDroopRoute.directMatches.map(item => item.modeKey),
  ['wilting_droop']
)
assert.equal(DIAGNOSIS_MODE_REGISTRY.wilting_droop.questionPackageKind, 'fixed_wilting_droop')
assert.equal(getQuestionPackageByMode('wilting_droop').questionCount, 5)

const specklingYellowRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('yellow_speckling')],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.9 }]
})
// full profile 下 yellow_leaf 候选 0.9 属于合法候选（>=0.60），应进入固定题包问诊路径，
// 而不是回退 uncertain。yellow_leaf 是固定题包模式，不走"很像"直接结论。
assert.equal(specklingYellowRoute.nextAction, 'question_package')
assert.deepEqual(specklingYellowRoute.directMatches, [])
assert.deepEqual(
  specklingYellowRoute.associatedModes,
  ['yellow_leaf']
)
assert.equal(specklingYellowRoute.confidenceTier, 'very_likely')
assert.equal(specklingYellowRoute.likelyResult, true)

const stipplingRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [evidence('stippling', 'high', 'strong', 'img_stippling', 'leaf_underside')]
})
assert.equal(stipplingRoute.nextAction, 'uncertain')
assert.deepEqual(stipplingRoute.directMatches, [])
assert.deepEqual(stipplingRoute.confirmationCandidates, [])

const pestProfileGeneralAssociatedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [evidence('yellowing_patchy'), evidence('leaf_droop')],
  visualModeCandidates: [
    { mode: 'yellow_leaf', confidence: 0.8 },
    { mode: 'wilting_droop', confidence: 0.75 }
  ]
})
assert.deepEqual(pestProfileGeneralAssociatedRoute.confirmationCandidates, [])
assert.equal(pestProfileGeneralAssociatedRoute.nextAction, 'uncertain')

const powderyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('powder_white', 'high', 'strong', 'img_powdery', 'leaf_front')]
})
assert.equal(powderyRoute.nextAction, 'direct_result')
assert.deepEqual(
  powderyRoute.directMatches.map(item => item.modeKey),
  ['powdery_mildew']
)

const pestAndYellowRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix', 'leaf_upper_surface'),
    evidence('visible_mite_colony', 'high', 'strong', 'img_mix', 'leaf_underside')
  ],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.82 }]
})
assert.equal(pestAndYellowRoute.nextAction, 'choose_direction')
assert.equal(pestAndYellowRoute.recommendedDirection, 'pest')
assert.deepEqual(
  pestAndYellowRoute.directMatches.map(item => item.modeKey),
  ['yellow_leaf', 'spider_mite']
)
assert.deepEqual(
  pestAndYellowRoute.directionChoices.map(item => item.modeKey),
  ['pest', 'yellow_leaf']
)
assert.deepEqual(pestAndYellowRoute.directionChoices[0].pestModeKeys, ['spider_mite'])
assert.deepEqual(
  pestAndYellowRoute.pendingDirectPestSnapshot.directMatches.map(item => item.modeKey),
  ['spider_mite']
)

const pestAndPowderyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    evidence('visible_mite_colony', 'high', 'strong', 'img_mix2', 'leaf_underside'),
    evidence('powder_white', 'high', 'strong', 'img_mix2', 'leaf_front')
  ]
})
assert.equal(pestAndPowderyRoute.nextAction, 'choose_direction')
assert.deepEqual(
  pestAndPowderyRoute.directMatches.map(item => item.modeKey),
  ['spider_mite', 'powdery_mildew']
)

const multiPestDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('visible_mite_colony', 'high', 'strong', 'img_pest_mix', 'leaf_underside'),
    evidence('thrips_visible', 'high', 'strong', 'img_pest_mix', 'leaf_front')
  ]
})
assert.equal(multiPestDirectRoute.nextAction, 'direct_result')
assert.deepEqual(
  multiPestDirectRoute.directMatches.map(item => item.modeKey),
  ['spider_mite', 'thrips']
)

const multiPestAndYellowRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_pest_mix2', 'leaf_upper_surface'),
    evidence('visible_mite_colony', 'high', 'strong', 'img_pest_mix2', 'leaf_underside'),
    evidence('thrips_visible', 'high', 'strong', 'img_pest_mix2', 'leaf_front')
  ],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.82 }]
})
assert.equal(multiPestAndYellowRoute.nextAction, 'choose_direction')
assert.deepEqual(
  multiPestAndYellowRoute.directionChoices.map(item => item.modeKey),
  ['pest', 'yellow_leaf']
)
assert.deepEqual(multiPestAndYellowRoute.directionChoices[0].directModeKeys, [
  'spider_mite',
  'thrips'
])

const differentRegionRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('fine_webbing', 'high', 'strong', 'img_a', 'leaf_back'),
    evidence('yellow_speckling', 'medium', 'medium', 'img_b', 'leaf_front')
  ]
})
assert.equal(differentRegionRoute.nextAction, 'direct_result')
assert.deepEqual(differentRegionRoute.directMatches, [])
assert.deepEqual(
  differentRegionRoute.confirmationCandidates.map(item => item.modeKey),
  ['spider_mite']
)

const auth = buildRetakeAuthorization({
  authorizationId: 'retake_test',
  now: 1000,
  durationMs: 3000,
  originVisualCallBatchId: 'visbatch_old',
  requestedCaptureRegion: 'leaf_underside'
})
assert.deepEqual(assertRetakeAuthorizationActive(auth, 3999), {
  retakeAuthorizationId: 'retake_test',
  serverNow: 3999,
  retakeExpiresAt: 4000,
  originVisualCallBatchId: 'visbatch_old',
  requestedCaptureRegion: 'leaf_lower_surface',
  status: 'active'
})
assert.throws(() => assertRetakeAuthorizationActive(auth, 4000), /RETAKE_WINDOW_EXPIRED/)
assert.throws(() => assertRetakeAuthorizationActive(auth, 4001), /RETAKE_WINDOW_EXPIRED/)

const routedAggregate = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [
      {
        symptom_key: 'visible_mite_colony',
        confidence_band: 'high',
        strength_level: 'strong',
        primary_support_image_id: 'img3',
        primary_capture_region: 'leaf_underside'
      }
    ],
    admission_records: [
      {
        object_key: 'visible_mite_colony',
        admission_result: 'formally_admitted',
        visual_normalized_image_result_id: 'visnorm3'
      }
    ]
  },
  successfulResults: [],
  originVisualCallBatchId: 'visbatch_1'
})
assert.equal(routedAggregate.diagnosis_mode_route_result.nextAction, 'direct_result')
assert.deepEqual(
  routedAggregate.diagnosis_mode_route_result.directMatches.map(item => item.modeKey),
  ['spider_mite']
)

const powderyPlanWithoutRouter = resolveHighSpecificityConvergencePlan({
  visualAggregateResult: {
    aggregate_analyzability: 'high',
    admission_records: [],
    aggregated_symptom_candidates: []
  },
  observedEvidenceSet: [],
  candidateOutcomes: [{ problemKey: 'powdery_mildew' }],
  problems: [{ problemKey: 'powdery_mildew', problemRole: 'root_cause' }]
})
assert.equal(powderyPlanWithoutRouter, null)

const powderyPlan = resolveHighSpecificityConvergencePlan({
  visualAggregateResult: {
    aggregate_analyzability: 'high',
    diagnosis_mode_route_result: {
      nextAction: 'direct_result',
      directMatches: [{ modeKey: 'powdery_mildew' }]
    },
    admission_records: [
      {
        visual_admission_record_id: 'admit_powdery',
        object_key: 'powder_white',
        admission_result: 'formally_admitted',
        candidate: {
          symptom_key: 'powder_white',
          confidence_band: 'medium',
          strength_level: 'medium',
          support_count: 2,
          support_organs: ['leaf']
        }
      }
    ],
    aggregated_symptom_candidates: []
  },
  observedEvidenceSet: [
    {
      sourceType: 'visual_admitted',
      symptomKey: 'powder_white',
      sourceRecordId: 'admit_powdery',
      confidence: 0.9
    }
  ],
  symptomDictionary: [{ symptomKey: 'powder_white', signalReliability: 0.9 }],
  candidateOutcomes: [{ problemKey: 'powdery_mildew' }],
  problems: [{ problemKey: 'powdery_mildew', problemRole: 'root_cause' }]
})
assert.equal(powderyPlan.shouldBypassQuestion, true)
assert.equal(powderyPlan.problemKey, 'powdery_mildew')
