import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DIAGNOSIS_MODE_REGISTRY,
  resolveDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')
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

// ---------------------------------------------------------------------------
// full profile：多方向关联候选（yellow_leaf + wilting_droop）走 question_package
// 两者都是固定题包模式，directMatches 中含固定题包模式时优先走问诊路径，
// 不走 direct_result。
// ---------------------------------------------------------------------------
const fullAssociatedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('leaf_yellowing'), evidence('leaf_droop')],
  visualModeCandidates: [
    { mode: 'yellow_leaf', confidence: 0.8 },
    { mode: 'wilting_droop', confidence: 0.75 }
  ]
})
assert.equal(fullAssociatedRoute.nextAction, 'question_package')
assert.deepEqual(fullAssociatedRoute.associatedModes, ['yellow_leaf', 'wilting_droop'])
assert.deepEqual(
  fullAssociatedRoute.directionChoices.map(item => item.modeKey),
  ['yellow_leaf', 'wilting_droop']
)

// ---------------------------------------------------------------------------
// full profile：yellow_leaf 固定题包模式（0.88 进入 question_package）
// ---------------------------------------------------------------------------
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
assert.equal(getQuestionPackageByMode('yellow_leaf').questionCount, 3)

// ---------------------------------------------------------------------------
// full profile：wilting_droop 固定题包模式（0.9 进入 question_package）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// full profile：yellow_speckling 不自动转 yellow_leaf，仍作为证据进入 question_package
// yellow_leaf 候选 0.9 属于合法候选（>=0.60），应进入固定题包问诊路径，
// 而不是回退 uncertain。yellow_leaf 是固定题包模式，不走"很像"直接结论。
// ---------------------------------------------------------------------------
const specklingYellowRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('yellow_speckling')],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.9 }]
})
assert.equal(specklingYellowRoute.nextAction, 'question_package')
assert.deepEqual(specklingYellowRoute.directMatches, [])
assert.deepEqual(
  specklingYellowRoute.associatedModes,
  ['yellow_leaf']
)
assert.equal(specklingYellowRoute.confidenceTier, 'very_likely')
assert.equal(specklingYellowRoute.likelyResult, true)

// ---------------------------------------------------------------------------
// full profile：powdery_mildew visual_direct_only 直接结论
// ---------------------------------------------------------------------------
const powderyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('powder_white', 'high', 'strong', 'img_powdery', 'leaf_front')]
})
assert.equal(powderyRoute.nextAction, 'direct_result')
assert.deepEqual(
  powderyRoute.directMatches.map(item => item.modeKey),
  ['powdery_mildew']
)

// ---------------------------------------------------------------------------
// full profile：虫害 + 黄叶混合 → choose_direction，推荐 pest
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// full profile：虫害 + 白粉混合 → choose_direction
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// full profile：多虫害 + 黄叶混合 → choose_direction
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// high specificity fast convergence plan
// ---------------------------------------------------------------------------
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

console.log('diagnosis-mode-router full profile supplementary tests passed')
