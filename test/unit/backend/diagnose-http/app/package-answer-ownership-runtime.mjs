import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerOptionMappings,
  mergePackageAnswerOptionMappings,
  buildPackageAnswerRuntime
} = require('../../../../../cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js')
const {
  buildPackageAnswerRuntimeState
} = require('../../../../../cloudfunctions/diagnose-http/app/answer-runtime-state.js')
const {
  buildSpecificPestQuestionPackage
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-question-package.js')
const {
  resolveSpecificPestAnswerResult
} = require('../../../../../cloudfunctions/diagnose-http/app/specific-pest-answer-resolver.js')
const {
  isCompleteQuestionPackageSnapshotAnswerSubmit,
  _test: retakeRuntimeTest
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-answer-retake-runtime.js')
const {
  attachDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/services/visual-mode-route-service.js')
const {
  _test: roundRuntimePersistenceTest
} = require('../../../../../cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js')

const questionPackageSnapshot = {
  mode: 'yellow_leaf',
  answerSubmitMode: 'package',
  packageQuestions: [
    {
      questionKey: 'q_package_1',
      questionGroupKey: 'care_water',
      packageTopic: 'watering_frequency',
      targetSymptomKey: 'leaf_yellowing',
      uiVariant: 'care_behavior_timeline',
      questionText: '浇水频率如何？',
      options: [
        { optionKey: 'normal', optionId: 'opt_bm9ybWFs', text: '正常' },
        { optionKey: 'unknown', optionId: 'opt_dW5rbm93bg', text: '不确定' }
      ]
    },
    {
      questionKey: 'q_package_2',
      questionGroupKey: 'care_light',
      packageTopic: 'light_change',
      targetSymptomKey: 'leaf_yellowing',
      questionText: '光照是否变化？',
      options: [
        { optionKey: 'stronger', optionId: 'opt_c3Ryb25nZXI', text: '更强' },
        { optionKey: 'unknown', optionId: 'opt_dW5rbm93bg', text: '不确定' }
      ]
    }
  ]
}
const answers = [
  { questionKey: 'q_package_1', optionKey: 'normal' },
  { questionKey: 'q_package_2', optionKey: 'unknown' }
]

const resolvedSnapshot = resolveQuestionPackageSnapshot({
  runtimeSnapshot: {
    questionPackageSnapshot
  }
})
assert.equal(resolvedSnapshot.packageQuestions.length, 2)

const ownership = resolvePackageAnswerOwnership({
  questionPackageSnapshot: resolvedSnapshot,
  answers
})
assert.equal(ownership.ok, true)
assert.deepEqual(ownership.invalidQuestionKeys, [])
assert.deepEqual(ownership.invalidOptionPairs, [])

const invalidOwnership = resolvePackageAnswerOwnership({
  questionPackageSnapshot: resolvedSnapshot,
  answers: [{ questionKey: 'outside_package', optionKey: 'yes' }]
})
assert.equal(invalidOwnership.ok, false)
assert.deepEqual(invalidOwnership.invalidQuestionKeys, ['outside_package'])
assert.deepEqual(invalidOwnership.invalidOptionPairs, ['outside_package::yes'])

const invalidSnapshotOptionOwnership = resolvePackageAnswerOwnership({
  questionPackageSnapshot: resolvedSnapshot,
  answers: [{ questionKey: 'q_package_1', optionKey: 'store_only_option' }]
})
assert.equal(invalidSnapshotOptionOwnership.ok, false)
assert.deepEqual(invalidSnapshotOptionOwnership.invalidQuestionKeys, [])
assert.deepEqual(invalidSnapshotOptionOwnership.invalidOptionPairs, [
  'q_package_1::store_only_option'
])

const snapshotOptionMappings = buildPackageAnswerOptionMappings(resolvedSnapshot)
assert.deepEqual(
  snapshotOptionMappings.map(item => `${item.questionKey}::${item.optionKey}`),
  [
    'q_package_1::care_behavior_timeline',
    'q_package_1::normal',
    'q_package_1::unknown',
    'q_package_2::stronger',
    'q_package_2::unknown'
  ]
)

const timelineRuntime = buildPackageAnswerRuntime({
  questionPackageSnapshot: resolvedSnapshot,
  answers: [
    { questionKey: 'q_package_1', optionKey: 'care_behavior_timeline' },
    { questionKey: 'q_package_2', optionKey: 'unknown' }
  ],
  optionMappings: snapshotOptionMappings
})
assert.equal(timelineRuntime.updatedAnswers[0].optionKey, 'care_behavior_timeline')
assert.equal(
  mergePackageAnswerOptionMappings(
    [{ questionKey: 'q_package_1', optionKey: 'normal', value: 1, associationStrength: 0.8 }],
    snapshotOptionMappings
  ).find(item => item.questionKey === 'q_package_1' && item.optionKey === 'normal')
    .associationStrength,
  0.8
)

const packageRuntime = buildPackageAnswerRuntime({
  questionPackageSnapshot: resolvedSnapshot,
  answers,
  optionMappings: [
    { questionKey: 'q_package_1', optionKey: 'normal', value: 1, associationStrength: 0.8 },
    {
      questionKey: 'q_package_2',
      optionKey: 'unknown',
      value: 0,
      associationStrength: 0,
      text: '不确定'
    }
  ]
})
assert.deepEqual(
  packageRuntime.updatedAnswers.map(item => ({
    questionKey: item.questionKey,
    optionKey: item.optionKey,
    status: item.status,
    questionGroupKey: item.questionGroupKey
  })),
  [
    {
      questionKey: 'q_package_1',
      optionKey: 'normal',
      status: 'confirmed',
      questionGroupKey: 'care_water'
    },
    {
      questionKey: 'q_package_2',
      optionKey: 'unknown',
      status: 'skipped',
      questionGroupKey: 'care_light'
    }
  ]
)
assert.equal(packageRuntime.askedQuestionRows.length, 2)
const packageRuntimeState = buildPackageAnswerRuntimeState({
  questionPackageSnapshot: resolvedSnapshot,
  answers,
  optionMappings: snapshotOptionMappings
})
assert.deepEqual(packageRuntimeState.runtimeAnswers, answers)
assert.deepEqual(packageRuntimeState.runtimeUnknownCountByGroup, {
  care_water: 0,
  care_light: 1
})

const dynamicPestPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite', 'thrips'],
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'visible_mite_colony',
      diagnosisMode: 'spider_mite',
      routeEvidenceRole: 'direct_match'
    },
    {
      evidenceKey: 'silver_scarring',
      diagnosisMode: 'thrips',
      routeEvidenceRole: 'confirmation_support'
    }
  ]
})
const dynamicPestSnapshot = roundRuntimePersistenceTest.buildQuestionPackageSnapshot({
  questionRequired: true,
  questions: dynamicPestPackage.packageQuestions,
  questionPackage: dynamicPestPackage
})
const dynamicPestAnswers = dynamicPestSnapshot.packageQuestions.map(question => ({
  questionKey: question.questionKey,
  optionKey: question.options.find(option => option.answerValue === 'positive')?.optionKey
}))
assert.equal(
  roundRuntimePersistenceTest.shouldPersistQuestionPackageSnapshot({
    questionRequired: true,
    questions: dynamicPestPackage.packageQuestions,
    questionPackage: dynamicPestPackage
  }),
  true
)
assert.equal(
  isCompleteQuestionPackageSnapshotAnswerSubmit({
    requestMode: 'answer_submit',
    questionPackageSnapshot: dynamicPestSnapshot,
    answers: dynamicPestAnswers
  }),
  true
)
assert.equal(
  resolvePackageAnswerOwnership({
    questionPackageSnapshot: dynamicPestSnapshot,
    answers: dynamicPestAnswers
  }).ok,
  true
)
assert.deepEqual(
  resolveSpecificPestAnswerResult({
    sessionId: 'diag_dynamic_pest',
    answers: dynamicPestAnswers,
    questionPackage: dynamicPestSnapshot
  }).visibleOutcomes.map(item => item.problemKey),
  ['thrips', 'spider_mite']
)

const retakePriorLedger = retakeRuntimeTest.buildRetakePriorEvidenceLedger({
  refreshedSessionState: {
    visualAggregateResult: {
      visual_call_batch_id: 'visbatch_initial',
      aggregated_symptom_candidates: [
        {
          symptom_key: 'fine_webbing',
          evidence_group: 'fine_webbing',
          confidence_band: 'high',
          strength_level: 'strong',
          primary_support_image_id: 'img_initial',
          primary_capture_region: 'leaf_underside',
          primary_visual_normalized_image_result_id: 'visnorm_initial'
        }
      ],
      admission_records: [
        {
          visual_admission_record_id: 'admit_initial',
          object_key: 'fine_webbing',
          admission_result: 'formally_admitted',
          visual_normalized_image_result_id: 'visnorm_initial'
        }
      ]
    },
    observedEvidenceSet: [
      {
        observedEvidenceSetId: 'specific_pest_visual::spider_mite',
        evidenceKey: 'spider_mite',
        evidenceType: 'diagnosis_mode',
        symptomKey: 'spider_mite',
        symptomCn: '红蜘蛛',
        confidence: 0.82,
        sourceType: 'visual_mode_router',
        currentStatus: 'active',
        targetLayer: 'observed_evidence_set',
        sourceRecordId: 'specific_pest_visual'
      },
      {
        evidenceKey: 'diagnosis_mode_legacy',
        sourceType: 'diagnosis_mode',
        diagnosisMode: 'spider_mite'
      }
    ]
  }
})
assert.deepEqual(
  retakePriorLedger.map(item => item.evidenceKey),
  ['fine_webbing']
)
assert.equal(retakePriorLedger[0].sourceType, 'visual_admitted')
assert.equal(retakePriorLedger[0].imageId, 'img_initial')
assert.equal(retakePriorLedger[0].regionRef, 'leaf_lower_surface')
const retakeDigest = retakeRuntimeTest.buildPriorAdmittedEvidenceDigest(retakePriorLedger)
assert.match(retakeDigest, /fine_webbing/)
assert.match(retakeDigest, /visual_admitted/)
assert.match(retakeDigest, /leaf_lower_surface/)
assert.doesNotMatch(retakeDigest, /spider_mite/)

const retakeYellowOnlyRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  priorEvidenceLedger: retakePriorLedger,
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [
      {
        symptom_key: 'yellow_speckling',
        evidence_group: 'yellow_speckling',
        confidence_band: 'medium',
        strength_level: 'medium',
        primary_support_image_id: 'img_followup',
        primary_capture_region: 'leaf_underside',
        primary_visual_normalized_image_result_id: 'visnorm_followup_yellow'
      }
    ],
    admission_records: [
      {
        object_key: 'yellow_speckling',
        admission_result: 'formally_admitted',
        visual_normalized_image_result_id: 'visnorm_followup_yellow'
      }
    ]
  },
  successfulResults: [
    {
      imageId: 'img_followup',
      captureRegion: 'leaf_underside',
      normalizedResult: {
        capture_region: 'leaf_underside',
        mode_candidates: [{ modeKey: 'spider_mite', confidence: 0.8 }]
      }
    }
  ]
})
assert.equal(retakeYellowOnlyRoute.diagnosis_mode_route_result.nextAction, 'direct_result')
assert.deepEqual(retakeYellowOnlyRoute.diagnosis_mode_route_result.directMatches, [])
assert.deepEqual(
  retakeYellowOnlyRoute.diagnosis_mode_route_result.provisionalMatches.map(item => item.modeKey),
  ['spider_mite']
)
assert.deepEqual(
  retakeYellowOnlyRoute.diagnosis_mode_route_result.confirmationCandidates.map(
    item => item.modeKey
  ),
  ['spider_mite']
)

const retakeNewPairRoute = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  priorEvidenceLedger: retakePriorLedger,
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: [
      {
        symptom_key: 'fine_webbing',
        evidence_group: 'fine_webbing',
        confidence_band: 'high',
        strength_level: 'strong',
        primary_support_image_id: 'img_followup_pair',
        primary_capture_region: 'leaf_underside',
        primary_visual_normalized_image_result_id: 'visnorm_followup_web'
      },
      {
        symptom_key: 'yellow_speckling',
        evidence_group: 'yellow_speckling',
        confidence_band: 'medium',
        strength_level: 'medium',
        primary_support_image_id: 'img_followup_pair',
        primary_capture_region: 'leaf_underside',
        primary_visual_normalized_image_result_id: 'visnorm_followup_yellow_pair'
      }
    ],
    admission_records: [
      {
        object_key: 'fine_webbing',
        admission_result: 'formally_admitted',
        visual_normalized_image_result_id: 'visnorm_followup_web'
      },
      {
        object_key: 'yellow_speckling',
        admission_result: 'formally_admitted',
        visual_normalized_image_result_id: 'visnorm_followup_yellow_pair'
      }
    ]
  },
  successfulResults: []
})
assert.equal(retakeNewPairRoute.diagnosis_mode_route_result.nextAction, 'direct_result')
assert.deepEqual(
  retakeNewPairRoute.diagnosis_mode_route_result.directMatches.map(item => item.modeKey),
  ['spider_mite']
)

Module._load = originalLoad

console.log('package answer ownership runtime tests passed')
