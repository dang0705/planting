/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildBatchModelDirectDecision,
  evaluateImageModelDirectDecision
} = require('../../../../../cloudfunctions/diagnose-http/domain/visual-direct-decision.js')

function visualResult({
  imageId,
  inputSlotType = 'leaf',
  modelOrgan = inputSlotType,
  normalizedOrgan = modelOrgan,
  analyzability = 'high',
  modeCandidates = [],
  organConflictFlag = 0,
  captureRegion = 'leaf_upper_surface'
}) {
  return {
    imageId,
    inputSlotType,
    visualNormalizedImageResultId: `normalized_${imageId}`,
    captureRegion,
    normalizedResult: {
      normalized_organ: normalizedOrgan,
      model_detected_organ: modelOrgan,
      organ_conflict_flag: organConflictFlag,
      analyzability,
      capture_region: captureRegion,
      mode_candidates: modeCandidates.map(item => ({
        region_ref: captureRegion,
        ...item
      }))
    }
  }
}

const directOnly = evaluateImageModelDirectDecision(
  visualResult({
    imageId: 'img_direct',
    modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
  }),
  'pest'
)
assert.equal(directOnly.status, 'accepted')
assert.deepEqual(directOnly.acceptedModeKeys, ['aphid'])
assert.deepEqual(directOnly.directableModeKeys, ['aphid'])
assert.equal(directOnly.acceptedCandidates[0].imageId, 'img_direct')
assert.equal(directOnly.acceptedCandidates[0].sourceRecordId, 'normalized_img_direct')
assert.equal(directOnly.acceptedCandidates[0].regionRef, 'leaf_upper_surface')
assert.equal(directOnly.acceptedCandidates[0].modelOrgan, 'leaf')
assert.equal(directOnly.acceptedCandidates[0].guardStatus, 'passed')

const highPlusWeak = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_high',
      modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
    }),
    visualResult({
      imageId: 'img_weak',
      captureRegion: 'leaf_lower_surface',
      modeCandidates: [{ mode: 'yellow_leaf', confidence: 0.5 }]
    })
  ],
  'full'
)
assert.equal(highPlusWeak.status, 'accepted')
assert.deepEqual(highPlusWeak.acceptedModeKeys, ['aphid'])
assert.deepEqual(highPlusWeak.visualConflicts, [])
assert.equal(highPlusWeak.secondaryVisualCandidates.length, 1)
assert.equal(highPlusWeak.secondaryVisualCandidates[0].role, 'secondary_visual_candidate')
assert.equal(highPlusWeak.secondaryVisualCandidates[0].modeKey, 'yellow_leaf')
assert.equal(highPlusWeak.secondaryVisualCandidates[0].imageId, 'img_weak')
assert.equal(highPlusWeak.secondaryVisualCandidates[0].inputSlotType, 'leaf')
assert.equal(highPlusWeak.secondaryVisualCandidates[0].modelOrgan, 'leaf')
assert.equal(highPlusWeak.secondaryVisualCandidates[0].regionRef, 'leaf_lower_surface')

const crossFamily = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_pest',
      modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
    }),
    visualResult({
      imageId: 'img_general',
      modeCandidates: [{ mode: 'yellow_leaf', confidence: 0.95 }]
    })
  ],
  'full'
)
assert.deepEqual(crossFamily.acceptedModeKeys, ['aphid', 'yellow_leaf'])
assert.deepEqual(crossFamily.directableModeKeys, ['aphid'])
assert.deepEqual(crossFamily.fixedPackageModeKeys, ['yellow_leaf'])
assert.equal(crossFamily.visualConflicts.length, 1)
assert.equal(crossFamily.visualConflicts[0].conflictType, 'multiple_high_confidence_families')
assert.deepEqual(crossFamily.visualConflicts[0].modeKeys, ['aphid', 'yellow_leaf'])
assert.deepEqual(crossFamily.visualConflicts[0].families, ['pest', 'general'])
assert.deepEqual(
  crossFamily.visualConflicts[0].candidateSources.map(item => [item.modeKey, item.imageId]),
  [
    ['aphid', 'img_pest'],
    ['yellow_leaf', 'img_general']
  ]
)

const sameFamilyMultipleHigh = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_pest_a',
      modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
    }),
    visualResult({
      imageId: 'img_pest_b',
      captureRegion: 'leaf_lower_surface',
      modeCandidates: [{ mode: 'thrips', confidence: 0.95 }]
    })
  ],
  'pest'
)
assert.deepEqual(sameFamilyMultipleHigh.acceptedModeKeys, ['aphid', 'thrips'])
assert.deepEqual(sameFamilyMultipleHigh.visualConflicts, [])

const fixedPackageHigh = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_yellow',
      modeCandidates: [{ mode: 'yellow_leaf', confidence: 0.95 }]
    })
  ],
  'full'
)
assert.deepEqual(fixedPackageHigh.fixedPackageModeKeys, ['yellow_leaf'])
assert.deepEqual(fixedPackageHigh.directableModeKeys, [])
assert.equal(fixedPackageHigh.fastPathEligible, false)

const organMismatch = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_wrong_slot',
      inputSlotType: 'leaf',
      modelOrgan: 'root',
      normalizedOrgan: 'root',
      organConflictFlag: 1,
      modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
    })
  ],
  'pest'
)
assert.equal(organMismatch.status, 'blocked')
assert.equal(organMismatch.hasOrganConflict, true)
assert.deepEqual(organMismatch.acceptedCandidates, [])
assert.equal(organMismatch.blockedCandidates[0].guardStatus, 'blocked')
assert.ok(organMismatch.blockedCandidates[0].guardReasons.includes('organ_conflict'))
assert.ok(organMismatch.blockedCandidates[0].guardReasons.includes('input_model_organ_mismatch'))
assert.deepEqual(organMismatch.organConflictSources, [
  {
    imageId: 'img_wrong_slot',
    sourceRecordId: 'normalized_img_wrong_slot',
    inputSlotType: 'leaf',
    modelOrgan: 'root',
    analyzability: 'high',
    organConflictFlag: 1
  }
])

const organMismatchWithoutMode = buildBatchModelDirectDecision(
  [
    visualResult({
      imageId: 'img_wrong_slot_empty',
      inputSlotType: 'leaf',
      modelOrgan: 'root',
      normalizedOrgan: 'root',
      organConflictFlag: 1
    })
  ],
  'full'
)
assert.equal(organMismatchWithoutMode.status, 'blocked')
assert.equal(organMismatchWithoutMode.hasOrganConflict, true)
assert.deepEqual(organMismatchWithoutMode.blockedCandidates, [])

const lowQualityHighConfidence = evaluateImageModelDirectDecision(
  visualResult({
    imageId: 'img_low_quality',
    analyzability: 'low',
    modeCandidates: [{ mode: 'aphid', confidence: 0.95 }]
  }),
  'pest'
)
assert.equal(lowQualityHighConfidence.status, 'blocked')
assert.deepEqual(lowQualityHighConfidence.acceptedCandidates, [])
assert.ok(lowQualityHighConfidence.blockedCandidates[0].guardReasons.includes('image_analyzability_low'))

console.log('visual direct decision tests passed data_mode=unit_fake')
