import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  attachDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/services/visual-mode-route-service.js')

const aggregateResult = {
  diagnosis_session_id: 'diag_1784604381317_xbtqr02b',
  visual_call_batch_id: 'visbatch_1784604381317_bt9yz3ft',
  aggregate_analyzability: 'high',
  aggregated_symptom_candidates: [
    {
      symptom_key: 'silver_streaks',
      strength_level: 'strong',
      confidence_band: 'high',
      admission_readiness: 'ready',
      primary_support_image_id: 'img_live_fixture',
      primary_capture_region: 'unknown'
    },
    {
      symptom_key: 'black_spots_spreading',
      strength_level: 'weak',
      confidence_band: 'medium',
      admission_readiness: 'cautious',
      primary_support_image_id: 'img_live_fixture',
      primary_capture_region: 'unknown'
    },
    {
      symptom_key: 'leaf_bleaching',
      strength_level: 'medium',
      confidence_band: 'medium',
      admission_readiness: 'ready',
      primary_support_image_id: 'img_live_fixture',
      primary_capture_region: 'unknown'
    }
  ],
  admission_records: [
    {
      object_type: 'symptom',
      object_key: 'silver_streaks',
      admission_result: 'formally_admitted',
      visual_normalized_image_result_id: 'visnorm_live_fixture'
    },
    {
      object_type: 'symptom',
      object_key: 'black_spots_spreading',
      admission_result: 'retained_only',
      visual_normalized_image_result_id: 'visnorm_live_fixture'
    },
    {
      object_type: 'symptom',
      object_key: 'leaf_bleaching',
      admission_result: 'formally_admitted',
      visual_normalized_image_result_id: 'visnorm_live_fixture'
    }
  ],
  out_of_pool_symptom_hints: [{ raw_visual_name_en: 'thrips' }],
  partial_salvage: true
}

const routed = attachDiagnosisModeRoute({
  aggregateResult,
  successfulResults: [
    {
      imageId: 'img_live_fixture',
      normalizedResult: {
        capture_region: 'unknown',
        region_ref: 'unknown',
        mode_candidates: []
      }
    }
  ],
  diagnosisProfile: 'pest'
})
const route = routed.diagnosis_mode_route_result

assert.equal(routed.diagnosis_session_id, 'diag_1784604381317_xbtqr02b')
assert.equal(routed.visual_call_batch_id, 'visbatch_1784604381317_bt9yz3ft')
assert.equal(route.nextAction, 'direct_result')
assert.equal(route.routePrimaryAction, 'direct_result')
assert.equal(route.recommendedMode, 'thrips')
assert.equal(route.recommendedDirection, 'thrips')
assert.deepEqual(route.directMatches, [])
assert.deepEqual(route.associatedModes, ['thrips'])
assert.deepEqual(
  route.confirmationCandidates.map(item => item.modeKey),
  ['thrips']
)
assert.deepEqual(
  route.confirmationCandidates[0].matchedEvidence.map(item => item.evidenceKey),
  ['silver_streaks']
)
assert.deepEqual(route.confirmationCandidates[0].candidateEvidence, [])
assert.equal(JSON.stringify(route).includes('black_fecal_spots'), false)
assert.notEqual(route.nextAction, 'request_followup_capture')
assert.equal(route.followupCapturePlan?.reason, 'specific_pest_confirmation_needed')

const genericOnly = attachDiagnosisModeRoute({
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [
      {
        symptom_key: 'surface_glossy_residue',
        strength_level: 'strong',
        confidence_band: 'high'
      },
      { symptom_key: 'sooty_mold', strength_level: 'strong', confidence_band: 'high' },
      { symptom_key: 'wet_soil_surface', strength_level: 'strong', confidence_band: 'high' }
    ],
    admission_records: [
      {
        object_type: 'symptom',
        object_key: 'surface_glossy_residue',
        admission_result: 'formally_admitted'
      },
      { object_type: 'symptom', object_key: 'sooty_mold', admission_result: 'formally_admitted' },
      {
        object_type: 'symptom',
        object_key: 'wet_soil_surface',
        admission_result: 'formally_admitted'
      }
    ]
  },
  successfulResults: [
    {
      normalizedResult: {
        mode_candidates: [
          { mode: 'mealybug', confidence: 0.9 },
          { mode: 'scale_insect', confidence: 0.9 },
          { mode: 'whitefly', confidence: 0.9 },
          { mode: 'fungus_gnat', confidence: 0.9 }
        ]
      }
    }
  ],
  diagnosisProfile: 'pest'
})
const genericRoute = genericOnly.diagnosis_mode_route_result
assert.equal(genericRoute.nextAction, 'uncertain')
assert.deepEqual(genericRoute.associatedModes, [])
assert.deepEqual(genericRoute.confirmationCandidates, [])
assert.deepEqual(genericRoute.directMatches, [])

function highConfidenceImage({
  imageId,
  mode,
  confidence = 0.95,
  inputSlotType = 'leaf',
  modelOrgan = inputSlotType,
  organConflictFlag = 0,
  captureRegion = 'leaf_upper_surface'
}) {
  return {
    imageId,
    inputSlotType,
    visualNormalizedImageResultId: `normalized_${imageId}`,
    captureRegion,
    normalizedResult: {
      normalized_organ: modelOrgan,
      model_detected_organ: modelOrgan,
      organ_conflict_flag: organConflictFlag,
      analyzability: 'high',
      capture_region: captureRegion,
      mode_candidates: [{ mode, confidence, region_ref: captureRegion }]
    }
  }
}

const modelHighDirectRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [],
    admission_records: []
  },
  successfulResults: [highConfidenceImage({ imageId: 'img_model_aphid', mode: 'aphid' })]
}).diagnosis_mode_route_result
assert.equal(modelHighDirectRoute.nextAction, 'direct_result')
assert.equal(modelHighDirectRoute.decision_source, 'model_high_confidence')
assert.deepEqual(modelHighDirectRoute.modelDirectModeKeys, ['aphid'])
assert.equal(modelHighDirectRoute.model_direct_decision_status, 'accepted')
assert.equal(modelHighDirectRoute.secondary_visual_candidates.length, 0)

const highPlusWeakRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'full',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [],
    admission_records: []
  },
  successfulResults: [
    highConfidenceImage({ imageId: 'img_route_high', mode: 'aphid' }),
    highConfidenceImage({
      imageId: 'img_route_weak',
      mode: 'yellow_leaf',
      confidence: 0.5,
      captureRegion: 'leaf_lower_surface'
    })
  ]
}).diagnosis_mode_route_result
assert.equal(highPlusWeakRoute.nextAction, 'direct_result')
assert.deepEqual(highPlusWeakRoute.modelDirectModeKeys, ['aphid'])
assert.equal(highPlusWeakRoute.secondary_visual_candidates.length, 1)
assert.equal(highPlusWeakRoute.secondary_visual_candidates[0].modeKey, 'yellow_leaf')
assert.equal(highPlusWeakRoute.secondary_visual_candidates[0].imageId, 'img_route_weak')
assert.equal(highPlusWeakRoute.secondary_visual_candidates[0].regionRef, 'leaf_lower_surface')

const crossFamilyRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'full',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [],
    admission_records: []
  },
  successfulResults: [
    highConfidenceImage({ imageId: 'img_route_pest', mode: 'aphid' }),
    highConfidenceImage({ imageId: 'img_route_yellow', mode: 'yellow_leaf' })
  ]
}).diagnosis_mode_route_result
assert.equal(crossFamilyRoute.nextAction, 'choose_direction')
assert.equal(crossFamilyRoute.decision_source, 'conflict')
assert.deepEqual(crossFamilyRoute.modelDirectModeKeys, ['aphid', 'yellow_leaf'])
assert.deepEqual(crossFamilyRoute.directionChoices.map(item => item.modeKey), [
  'aphid',
  'yellow_leaf'
])
assert.equal(crossFamilyRoute.visual_conflicts.length, 1)

const modelHighFixedPackageRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'full',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [],
    admission_records: []
  },
  successfulResults: [highConfidenceImage({ imageId: 'img_route_fixed', mode: 'yellow_leaf' })]
}).diagnosis_mode_route_result
assert.equal(modelHighFixedPackageRoute.nextAction, 'question_package')
assert.equal(modelHighFixedPackageRoute.decision_source, 'fixed_question_package')
assert.deepEqual(modelHighFixedPackageRoute.modelDirectModeKeys, ['yellow_leaf'])

const wrongOrganRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [],
    admission_records: []
  },
  successfulResults: [
    highConfidenceImage({
      imageId: 'img_route_wrong_organ',
      mode: 'aphid',
      inputSlotType: 'leaf',
      modelOrgan: 'root',
      organConflictFlag: 1
    })
  ]
}).diagnosis_mode_route_result
assert.equal(wrongOrganRoute.nextAction, 'request_followup_capture')
assert.equal(wrongOrganRoute.decision_source, 'retake')
assert.equal(wrongOrganRoute.followupCapturePlan.reason, 'model_direct_guard_blocked')
assert.equal(wrongOrganRoute.model_direct_decision_status, 'blocked')

console.log('visual mode route service tests passed')
