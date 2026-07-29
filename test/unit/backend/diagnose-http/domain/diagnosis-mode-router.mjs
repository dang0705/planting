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

// ---------------------------------------------------------------------------
// dispatch-20260726-model-mode-precedence-zcode: 模型高置信 mode 优先路由。
// aphid=0.95 (model-direct) + formally_admitted leaf_yellowing 证据时，
// 证据派生的 yellow_leaf 不能污染 aphid 模型直判路由。
// 路由必须只采用 aphid，associatedModes=[aphid]，nextAction=direct_result，
// 无 cross-family conflict，无 directionChoices 细分入口。
// ---------------------------------------------------------------------------
const aphidWithYellowingEvidenceRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' }
  ]
})
assert.deepEqual(
  aphidWithYellowingEvidenceRoute.modelDirectModeKeys,
  ['aphid'],
  'model-mode-precedence: modelDirectModeKeys 应只含 aphid'
)
assert.deepEqual(
  aphidWithYellowingEvidenceRoute.associatedModes,
  ['aphid'],
  'model-mode-precedence: associatedModes 应只含 aphid，不应被 yellow_leaf 污染'
)
assert.deepEqual(
  aphidWithYellowingEvidenceRoute.directMatches,
  [],
  'model-mode-precedence: evidence-derived yellow_leaf directMatches 应被清空'
)
assert.deepEqual(
  aphidWithYellowingEvidenceRoute.confirmationCandidates.map(item => item.modeKey),
  ['aphid'],
  'model-mode-precedence: confirmationCandidates 应只含 aphid'
)
assert.equal(
  aphidWithYellowingEvidenceRoute.nextAction,
  'direct_result',
  'model-mode-precedence: aphid=0.95 应走 direct_result，不应被 cross-family 阻断'
)
assert.equal(
  aphidWithYellowingEvidenceRoute.confidenceTier,
  'direct',
  'model-mode-precedence: aphid=0.95 应为 direct tier'
)
// directionChoices 不应含 evidence-derived yellow_leaf 选项（即使 buildDirectionChoices
// 仍会为 pest 家族产生入口，也只能含模型直判的 aphid，不应混入 yellow_leaf）
assert.ok(
  aphidWithYellowingEvidenceRoute.directionChoices.every(
    item => item.modeKey !== 'yellow_leaf'
  ),
  'model-mode-precedence: directionChoices 不应含 evidence-derived yellow_leaf'
)
assert.equal(
  aphidWithYellowingEvidenceRoute.recommendedMode,
  'aphid',
  'model-mode-precedence: recommendedMode 应为 aphid'
)

// ---------------------------------------------------------------------------
// 对照组：无 model-direct mode 时，evidence fallback 仍有效。
// 仅 leaf_yellowing 证据 + aphid=0.89 (<0.95) 候选时，evidence-derived yellow_leaf
// 仍可参与路由（pest profile 下 yellow_leaf 不被 pest profile 接收，故无 admission）。
// aphid=0.89 走 question_package（pest profile 严格候选逻辑）。
// ---------------------------------------------------------------------------
const noModelDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.89, regionRef: 'leaf_upper_surface' }
  ]
})
assert.deepEqual(
  noModelDirectRoute.modelDirectModeKeys,
  [],
  'model-mode-precedence: aphid=0.89 <0.95 不应进入 modelDirectModeKeys'
)
assert.equal(
  noModelDirectRoute.nextAction,
  'question_package',
  'model-mode-precedence: 无 model-direct 时 aphid=0.89 走 question_package fallback'
)

// ---------------------------------------------------------------------------
// 多个 >=0.95 模型模式只保留这些模型模式（同家族多虫害）。
// aphid=0.95 + spider_mite=0.96 都在模型直判集合中，evidence-derived 模式被排除。
// ---------------------------------------------------------------------------
const multiModelDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' },
    { mode: 'spider_mite', confidence: 0.96, regionRef: 'leaf_underside' }
  ]
})
assert.deepEqual(
  multiModelDirectRoute.modelDirectModeKeys,
  ['aphid', 'spider_mite'],
  'model-mode-precedence: 多个 >=0.95 模型模式都应进入 modelDirectModeKeys'
)
assert.deepEqual(
  multiModelDirectRoute.associatedModes,
  ['aphid', 'spider_mite'],
  'model-mode-precedence: 多模型模式只保留模型模式，evidence-derived 被排除'
)
assert.equal(
  multiModelDirectRoute.nextAction,
  'direct_result',
  'model-mode-precedence: 多同家族模型模式仍走 direct_result'
)

console.log('diagnosis-mode-router pest profile tests passed')
