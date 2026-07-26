import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const questionRepositoryPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/repositories/question-repository.js')
const originalQuestionRepository = require.cache[questionRepositoryPath]
require.cache[questionRepositoryPath] = {
  id: questionRepositoryPath,
  filename: questionRepositoryPath,
  loaded: true,
  exports: {
    getQuestionsByKeys: async keys =>
      (Array.isArray(keys) ? keys : []).map(questionKey => ({
        questionKey,
        questionTextUserCn: '最近浇水和土壤状态更接近哪种？',
        questionTextCn: '最近浇水和土壤状态更接近哪种？',
        helpTextCn: '按最近一周实际情况选择。',
        defaultOptionKey: 'unknown',
        questionType: 'single_choice'
      })),
    getQuestionOptionMappings: async keys =>
      (Array.isArray(keys) ? keys : []).flatMap(questionKey => [
        {
          questionKey,
          optionKey: 'unknown',
          optionTextUserCn: '不确定',
          isDefault: true
        }
      ])
  }
}
const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-question-package.js')
const {
  resolveSpecificPestAnswerResult
} = require('../../../../../cloudfunctions/diagnose-http/app/specific-pest-answer-resolver.js')
const {
  resolveManualSymptomMode
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js')
const {
  buildPestRouteResponse
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-visual-orchestrator.js')
const {
  resolveDirectionChoiceRoundResult
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-direction-choice-runtime.js')
const {
  resolveDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')

const thripsPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['thrips'],
  hiddenPrefilledEvidence: [{ evidenceKey: 'silver_scarring', diagnosisMode: '' }]
})
assert.equal(thripsPackage.questionCount, 1)
assert.deepEqual(thripsPackage.packageTopics, ['thrips_black_spots'])

const thripsBlackSpotAlreadyVisiblePackage = buildSpecificPestQuestionPackage({
  candidateModes: ['thrips'],
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'black_fecal_spots',
      diagnosisMode: 'thrips',
      routeEvidenceRole: 'candidate_match'
    }
  ]
})
assert.equal(thripsBlackSpotAlreadyVisiblePackage.questionCount, 1)
assert.deepEqual(thripsBlackSpotAlreadyVisiblePackage.packageTopics, ['thrips_silver_scarring'])

const whiteflyThripsPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['whitefly', 'thrips'],
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'surface_glossy_residue',
      diagnosisMode: 'whitefly',
      routeEvidenceRole: 'confirmation_support'
    }
  ]
})
assert.equal(whiteflyThripsPackage.questionCount, 2)
assert.deepEqual(whiteflyThripsPackage.packageTopics, ['whitefly_adults', 'thrips_silver_scarring'])
assert.deepEqual(
  whiteflyThripsPackage.packageQuestions.map(item => item.candidateModes),
  [['whitefly'], ['thrips']]
)

const singleYellowVisualRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    {
      evidenceKey: 'yellowing_patchy',
      confidenceBand: 'high',
      strengthLevel: 'strong',
      imageId: 'img_yellow',
      captureRegion: 'leaf_front'
    }
  ],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.86, regionRef: 'leaf_front' }]
})
assert.equal(singleYellowVisualRoute.nextAction, 'question_package')
const singleYellowVisualResponse = await buildPestRouteResponse({
  sessionId: 'diag_yellow_visual',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_yellow_visual',
    diagnosis_mode_route_result: singleYellowVisualRoute
  },
  diagnosisProfile: 'full'
})
assert.equal(singleYellowVisualResponse.stage, 'question_package')
assert.equal(singleYellowVisualResponse.selectedModeKey, 'yellow_leaf')
assert.equal(singleYellowVisualResponse.questionPackage.mode, 'yellow_leaf')
assert.equal(singleYellowVisualResponse.questionPackage.questionCount, 3)
assert.equal(singleYellowVisualResponse.questions.length, 3)

const singleWiltVisualRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    {
      evidenceKey: 'leaf_droop',
      confidenceBand: 'high',
      strengthLevel: 'strong',
      imageId: 'img_wilt',
      captureRegion: 'whole_plant'
    }
  ],
  visualModeCandidates: [{ mode: 'wilting_droop', confidence: 0.9, regionRef: 'whole_plant' }]
})
assert.equal(singleWiltVisualRoute.nextAction, 'question_package')
const singleWiltVisualResponse = await buildPestRouteResponse({
  sessionId: 'diag_wilt_visual',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_wilt_visual',
    diagnosis_mode_route_result: singleWiltVisualRoute
  },
  diagnosisProfile: 'full'
})
assert.equal(singleWiltVisualResponse.stage, 'question_package')
assert.equal(singleWiltVisualResponse.selectedModeKey, 'wilting_droop')
assert.equal(singleWiltVisualResponse.questionPackage.mode, 'wilting_droop')
assert.equal(singleWiltVisualResponse.questionPackage.questionCount, 5)
assert.equal(singleWiltVisualResponse.questions.length, 5)

const singleSpiderCandidateRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.75 }]
})
const singleSpiderCandidateResponse = await buildPestRouteResponse({
  sessionId: 'diag_spider_candidate_visual',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_spider_candidate_visual',
    diagnosis_mode_route_result: singleSpiderCandidateRoute
  },
  diagnosisProfile: 'pest'
})
assert.equal(singleSpiderCandidateResponse.routePrimaryAction, 'question_package')
assert.equal(singleSpiderCandidateResponse.questionPackage.mode, 'specific_pest_visual')
assert.deepEqual(singleSpiderCandidateResponse.questionPackage.candidateModes, ['spider_mite'])
assert.ok(singleSpiderCandidateResponse.questions.length > 0)

assert.match(JSON.stringify(thripsPackage.packageQuestions), /补齐图片尚未确定的不同维度线索/)

const multiPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['thrips', 'whitefly', 'unknown_mode']
})
assert.equal(multiPackage.mode, 'specific_pest_visual')
assert.equal(multiPackage.dynamicQuestionPackage, true)
assert.equal(multiPackage.fixedQuestionPackage, false)
assert.equal(multiPackage.questionCount, 2)
assert.deepEqual(multiPackage.packageTopics, ['thrips_silver_scarring', 'whitefly_adults'])
assert.equal(multiPackage.packageQuestions[1].riskLevel, 'medium')
assert.equal(multiPackage.packageQuestions[1].requiresExplicitConsent, true)

const surfacePackage = buildSpecificPestQuestionPackage({
  candidateModes: ['aphid'],
  hiddenPrefilledEvidence: [{ evidenceKey: 'new_growth_clusters' }]
})
assert.equal(surfacePackage.questionCount, 2)
const surfaceQuestion = surfacePackage.packageQuestions.find(
  item => item.packageTopic === 'surface_residue'
)
assert.ok(surfaceQuestion)
assert.equal(surfaceQuestion.text, '叶片或枝条表面有没有发亮、发黏，像沾了糖水一样的透明痕迹？')
assert.deepEqual(
  surfaceQuestion.options.map(item => [item.optionKey, item.text, item.answerValue]),
  [
    ['surface_residue_sticky_yes', '有，摸起来或看起来明显发黏', 'positive'],
    ['surface_residue_unsure', '只有发亮的痕迹，不确定是否发黏', 'unknown'],
    ['surface_residue_no', '没有看到', 'negative'],
    ['unknown', '不方便确认 / 看不清', 'unknown']
  ]
)

const zeroQuestionPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['whitefly'],
  hiddenPrefilledEvidence: [
    { evidenceKey: 'white_flies' },
    { evidenceKey: 'fixed_oval_nymphs' },
    { evidenceKey: 'surface_glossy_residue' },
    { evidenceKey: 'sooty_mold' }
  ]
})
assert.equal(zeroQuestionPackage.questionCount, 0)

const unknownOnlyResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_unknown',
  answers: [{ questionKey: surfaceQuestion.questionKey, optionKey: 'unknown' }],
  questionPackage: surfacePackage
})
assert.equal(unknownOnlyResult.outcomeType, 'problematic')
assert.deepEqual(
  unknownOnlyResult.visibleOutcomes.map(item => item.problemKey),
  ['aphid']
)
assert.match(unknownOnlyResult.visibleOutcomes[0].displayNameCn, /^可能是/)
assert.equal(unknownOnlyResult.confidenceLevel, 'low')
assert.match(unknownOnlyResult.summaryCard.title, /可能的虫害方向/)
assert.doesNotMatch(unknownOnlyResult.explanation.whyItHappens, /蜜露|甜黏/)

const unsureSurfaceResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_unsure_surface',
  answers: [{ questionKey: surfaceQuestion.questionKey, optionKey: 'surface_residue_unsure' }],
  questionPackage: surfacePackage
})
assert.equal(unsureSurfaceResult.outcomeType, 'problematic')
assert.deepEqual(
  unsureSurfaceResult.visibleOutcomes.map(item => item.problemKey),
  ['aphid']
)
assert.match(unsureSurfaceResult.visibleOutcomes[0].displayNameCn, /^可能是/)
assert.equal(unsureSurfaceResult.confidenceLevel, 'low')
assert.doesNotMatch(unsureSurfaceResult.explanation.whyItHappens, /蜜露|甜黏/)

const allNegativeRefinementPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['thrips', 'spider_mite']
})
const allNegativeRefinementResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_all_negative_specific_pest_refinement',
  answers: allNegativeRefinementPackage.packageQuestions.map(question => ({
    questionKey: question.questionKey,
    optionKey: `${question.packageTopic}_no`
  })),
  questionPackage: allNegativeRefinementPackage
})
assert.equal(allNegativeRefinementResult.outcomeType, 'problematic')
assert.deepEqual(
  allNegativeRefinementResult.visibleOutcomes.map(item => item.problemKey),
  ['thrips']
)
assert.match(allNegativeRefinementResult.visibleOutcomes[0].displayNameCn, /^可能是/)
assert.equal(allNegativeRefinementResult.confidenceLevel, 'low')
assert.match(allNegativeRefinementResult.finalResult.summary, /补充回答未能确认关键特征/)

const refinementMatrixPackage = buildSpecificPestQuestionPackage({
  candidateModes: ['thrips', 'spider_mite']
})
const refinementQuestionByMode = new Map(
  refinementMatrixPackage.packageQuestions.flatMap(question =>
    question.candidateModes.map(mode => [mode, question])
  )
)
const refinementOptionFor = (mode, answerState) => {
  if (answerState === 'unknown') {
    return 'unknown'
  }
  const question = refinementQuestionByMode.get(mode)
  return `${question.packageTopic}_${answerState}`
}
const refinementMatrixCases = [
  {
    name: 'yes/yes keeps both confirmed modes',
    states: { thrips: 'yes', spider_mite: 'yes' },
    expectedModes: ['thrips', 'spider_mite'],
    probablePattern: [/^蓟马/, /^红蜘蛛/]
  },
  {
    name: 'yes/no keeps thrips',
    states: { thrips: 'yes', spider_mite: 'no' },
    expectedModes: ['thrips'],
    probablePattern: [/^蓟马/]
  },
  {
    name: 'no/yes keeps spider mite',
    states: { thrips: 'no', spider_mite: 'yes' },
    expectedModes: ['spider_mite'],
    probablePattern: [/^红蜘蛛/]
  },
  {
    name: 'no/no falls back to highest visual candidate',
    states: { thrips: 'no', spider_mite: 'no' },
    expectedModes: ['thrips'],
    probablePattern: [/^可能是/]
  },
  {
    name: 'unknown/unknown falls back to highest visual candidate',
    states: { thrips: 'unknown', spider_mite: 'unknown' },
    expectedModes: ['thrips'],
    probablePattern: [/^可能是/]
  },
  {
    name: 'unknown/no keeps unresolved thrips candidate',
    states: { thrips: 'unknown', spider_mite: 'no' },
    expectedModes: ['thrips'],
    probablePattern: [/^可能是/]
  },
  {
    name: 'no/unknown keeps unresolved spider mite candidate',
    states: { thrips: 'no', spider_mite: 'unknown' },
    expectedModes: ['spider_mite'],
    probablePattern: [/^可能是/]
  },
  {
    name: 'yes/unknown keeps confirmed thrips and possible spider mite',
    states: { thrips: 'yes', spider_mite: 'unknown' },
    expectedModes: ['thrips', 'spider_mite'],
    probablePattern: [/^蓟马/, /^可能是/]
  },
  {
    name: 'unknown/yes keeps confirmed spider mite and possible thrips',
    states: { thrips: 'unknown', spider_mite: 'yes' },
    expectedModes: ['spider_mite', 'thrips'],
    probablePattern: [/^红蜘蛛/, /^可能是/]
  }
]
for (const item of refinementMatrixCases) {
  const result = resolveSpecificPestAnswerResult({
    sessionId: `diag_specific_pest_matrix_${item.name}`,
    answers: Object.entries(item.states).map(([mode, answerState]) => ({
      questionKey: refinementQuestionByMode.get(mode).questionKey,
      optionKey: refinementOptionFor(mode, answerState)
    })),
    questionPackage: refinementMatrixPackage
  })
  assert.equal(result.outcomeType, 'problematic', item.name)
  assert.deepEqual(
    result.visibleOutcomes.map(outcome => outcome.problemKey),
    item.expectedModes,
    item.name
  )
  assert.notEqual(result.finalResult.problemKey, '', item.name)
  result.visibleOutcomes.forEach((outcome, index) => {
    assert.match(outcome.displayNameCn, item.probablePattern[index], item.name)
  })
}

const positiveResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_positive',
  answers: [{ questionKey: surfaceQuestion.questionKey, optionKey: 'surface_residue_sticky_yes' }],
  questionPackage: surfacePackage
})
assert.equal(positiveResult.outcomeType, 'problematic')
assert.deepEqual(
  positiveResult.visibleOutcomes.map(item => item.problemKey),
  ['aphid']
)
assert.match(positiveResult.explanation.whyItHappens, /小虫可能留下甜黏的透明分泌物（也叫蜜露）。/)

const visualPrefillSurfaceResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_visual_surface',
  answers: [],
  questionPackage: {
    ...surfacePackage,
    hiddenPrefilledEvidence: [
      {
        evidenceKey: 'surface_glossy_residue',
        diagnosisMode: 'aphid',
        routeEvidenceRole: 'confirmation_support'
      }
    ]
  }
})
assert.doesNotMatch(visualPrefillSurfaceResult.explanation.whyItHappens, /蜜露|甜黏/)

const evidenceSet = buildSpecificPestObservedEvidenceSet({
  candidateModes: ['thrips', 'whitefly']
})
assert.deepEqual(
  evidenceSet.map(item => item.diagnosisMode),
  ['thrips', 'whitefly']
)

const productionThripsRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    {
      evidenceKey: 'silver_scarring',
      confidenceBand: 'medium',
      strengthLevel: 'medium',
      imageId: 'img_thrips',
      captureRegion: 'leaf_front'
    }
  ],
  visualModeCandidates: [{ mode: 'thrips', confidence: 0.72 }]
})
const productionThripsResponse = await buildPestRouteResponse({
  sessionId: 'diag_thrips',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_thrips',
    diagnosis_mode_route_result: productionThripsRoute
  },
  diagnosisProfile: 'pest'
})
assert.equal(productionThripsResponse.routePrimaryAction, 'finalize')
assert.deepEqual(
  productionThripsResponse.visibleOutcomes.map(item => item.problemKey),
  ['thrips']
)
assert.match(productionThripsResponse.visibleOutcomes[0].displayNameCn, /^可能是/)
assert.equal(productionThripsResponse.candidateRefinementAvailable, false)
assert.deepEqual(productionThripsResponse.directionChoices, [])
const staleSinglePestRefinementResponse = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_thrips_stale_refinement',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: {
      diagnosis_mode_route_result: productionThripsRoute
    }
  },
  sessionState: {}
})
assert.equal(staleSinglePestRefinementResponse.questionRequired, false)
assert.deepEqual(
  staleSinglePestRefinementResponse.visibleOutcomes.map(item => item.problemKey),
  ['thrips']
)
assert.deepEqual(staleSinglePestRefinementResponse.directionChoices, [])

const directSpiderConfirmThripsRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    {
      evidenceKey: 'visible_mite_colony',
      confidenceBand: 'high',
      strengthLevel: 'strong',
      imageId: 'img_spider_thrips',
      captureRegion: 'leaf_lower_surface'
    },
    {
      evidenceKey: 'silver_scarring',
      confidenceBand: 'medium',
      strengthLevel: 'medium',
      imageId: 'img_spider_thrips',
      captureRegion: 'leaf_upper_surface'
    }
  ],
  visualModeCandidates: [{ mode: 'thrips', confidence: 0.72 }]
})
assert.equal(directSpiderConfirmThripsRoute.nextAction, 'direct_result')
const directSpiderConfirmThripsResponse = await buildPestRouteResponse({
  sessionId: 'diag_spider_thrips',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_spider_thrips',
    diagnosis_mode_route_result: directSpiderConfirmThripsRoute
  },
  diagnosisProfile: 'pest'
})
assert.deepEqual(
  directSpiderConfirmThripsResponse.visibleOutcomes.map(item => item.problemKey),
  ['spider_mite', 'thrips']
)
assert.deepEqual(directSpiderConfirmThripsResponse.provisionalModes, ['thrips'])
assert.equal(directSpiderConfirmThripsResponse.candidateRefinementAvailable, true)
assert.equal(directSpiderConfirmThripsResponse.summaryCard.title, '可能的虫害方向')
assert.match(directSpiderConfirmThripsResponse.visibleOutcomes[0].displayNameCn, /^红蜘蛛/)
assert.match(directSpiderConfirmThripsResponse.visibleOutcomes[1].displayNameCn, /^可能是/)
assert.deepEqual(
  directSpiderConfirmThripsResponse.directionChoices.map(item => item.modeKey),
  ['pest']
)
const directPestRefinementResponse = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_spider_thrips',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: {
      diagnosis_mode_route_result: directSpiderConfirmThripsRoute
    }
  },
  sessionState: {}
})
assert.equal(directPestRefinementResponse.questionRequired, true)
assert.equal(directPestRefinementResponse.questionPackage.questionCount <= 2, true)
assert.equal(
  directPestRefinementResponse.questionPackage.hiddenPrefilledEvidence.some(
    item => item.diagnosisMode === 'spider_mite' && item.routeEvidenceRole === 'direct_match'
  ),
  true
)
const persistedDirectionChoiceOnlyRefinementResponse = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_spider_thrips_persisted_choice_only',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: null,
    directionChoices: [
      {
        modeKey: 'pest',
        userDisplayName: '继续细分虫害方向',
        pestModeKeys: ['thrips'],
        directModeKeys: ['spider_mite'],
        confirmationModeKeys: ['thrips']
      }
    ]
  },
  sessionState: {}
})
assert.equal(persistedDirectionChoiceOnlyRefinementResponse.questionRequired, true)
assert.deepEqual(persistedDirectionChoiceOnlyRefinementResponse.questionPackage.candidateModes, [
  'thrips'
])
assert.equal(
  persistedDirectionChoiceOnlyRefinementResponse.questionPackage.hiddenPrefilledEvidence.some(
    item => item.diagnosisMode === 'spider_mite' && item.routeEvidenceRole === 'direct_match'
  ),
  true
)
const persistedSummaryEvidenceRefinementResponse = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_spider_thrips_summary_evidence',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: null,
    visualAggregateSummary: {
      aggregatedSymptomCandidates: [
        {
          symptomKey: 'stippling',
          confidenceBand: 'high',
          strengthLevel: 'strong',
          primarySupportImageId: 'visimg_summary',
          primaryCaptureRegion: 'leaf_lower_surface'
        },
        {
          symptomKey: 'black_fecal_spots',
          confidenceBand: 'high',
          strengthLevel: 'strong',
          primarySupportImageId: 'visimg_summary',
          primaryCaptureRegion: 'leaf_lower_surface'
        }
      ],
      admissionRecords: [
        {
          objectKey: 'stippling',
          admissionResult: 'formally_admitted',
          candidate: {
            symptomKey: 'stippling',
            confidenceBand: 'high',
            strengthLevel: 'strong',
            primarySupportImageId: 'visimg_summary',
            primaryCaptureRegion: 'leaf_lower_surface'
          }
        },
        {
          objectKey: 'black_fecal_spots',
          admissionResult: 'formally_admitted',
          candidate: {
            symptomKey: 'black_fecal_spots',
            confidenceBand: 'high',
            strengthLevel: 'strong',
            primarySupportImageId: 'visimg_summary',
            primaryCaptureRegion: 'leaf_lower_surface'
          }
        }
      ]
    },
    directionChoices: [
      {
        modeKey: 'pest',
        userDisplayName: '继续细分虫害方向',
        pestModeKeys: ['thrips', 'spider_mite'],
        directModeKeys: [],
        confirmationModeKeys: ['thrips', 'spider_mite']
      }
    ]
  },
  sessionState: {}
})
assert.equal(persistedSummaryEvidenceRefinementResponse.questionRequired, true)
assert.deepEqual(
  persistedSummaryEvidenceRefinementResponse.questionPackage.hiddenPrefilledEvidence
    .filter(item => ['black_fecal_spots', 'stippling'].includes(item.evidenceKey))
    .map(item => `${item.modeKey}:${item.evidenceKey}`)
    .sort(),
  ['spider_mite:stippling', 'thrips:black_fecal_spots', 'thrips:stippling']
)
assert.deepEqual(persistedSummaryEvidenceRefinementResponse.questionPackage.packageTopics, [
  'thrips_silver_scarring',
  'spider_mite_webbing'
])
const directPlusUnknownCandidateResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_spider_thrips_unknown_refine',
  answers: [
    {
      questionKey:
        persistedDirectionChoiceOnlyRefinementResponse.questionPackage.packageQuestions[0]
          .questionKey,
      optionKey: 'unknown'
    }
  ],
  questionPackage: persistedDirectionChoiceOnlyRefinementResponse.questionPackage
})
assert.equal(directPlusUnknownCandidateResult.outcomeType, 'problematic')
assert.deepEqual(
  directPlusUnknownCandidateResult.visibleOutcomes.map(item => item.problemKey),
  ['spider_mite', 'thrips']
)
assert.match(directPlusUnknownCandidateResult.visibleOutcomes[1].displayNameCn, /^可能是/)

const productionWhiteflyRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    {
      evidenceKey: 'white_flies',
      confidenceBand: 'medium',
      strengthLevel: 'medium',
      imageId: 'img_whitefly_candidate',
      captureRegion: 'leaf_underside'
    }
  ],
  visualModeCandidates: [{ mode: 'whitefly', confidence: 0.72 }]
})
const productionWhiteflyResponse = await buildPestRouteResponse({
  sessionId: 'diag_whitefly',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_whitefly',
    diagnosis_mode_route_result: productionWhiteflyRoute
  },
  diagnosisProfile: 'pest'
})
assert.equal(productionWhiteflyResponse.routePrimaryAction, 'finalize')
assert.deepEqual(
  productionWhiteflyResponse.visibleOutcomes.map(item => item.problemKey),
  ['whitefly']
)

const lowConfidenceAdultsRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    {
      evidenceKey: 'white_flies',
      confidenceBand: 'low',
      strengthLevel: 'weak',
      imageId: 'img_whitefly_low',
      captureRegion: 'leaf_underside'
    },
    {
      evidenceKey: 'fixed_oval_nymphs',
      confidenceBand: 'medium',
      strengthLevel: 'medium',
      imageId: 'img_whitefly_low',
      captureRegion: 'leaf_underside'
    }
  ],
  visualModeCandidates: [{ mode: 'whitefly', confidence: 0.72 }]
})
const lowConfidenceAdultsResponse = await buildPestRouteResponse({
  sessionId: 'diag_whitefly_low',
  aggregateResult: {
    visual_call_batch_id: 'visbatch_whitefly_low',
    diagnosis_mode_route_result: lowConfidenceAdultsRoute
  },
  diagnosisProfile: 'pest'
})
assert.equal(lowConfidenceAdultsResponse.routePrimaryAction, 'finalize')
assert.deepEqual(
  lowConfidenceAdultsResponse.visibleOutcomes.map(item => item.problemKey),
  ['whitefly']
)

const crossFamilyAggregate = {
  visual_call_batch_id: 'visbatch_cross',
  diagnosis_mode_route_result: {
    nextAction: 'choose_direction',
    recommendedDirection: 'pest',
    directMatches: [
      {
        modeKey: 'spider_mite',
        matchedEvidence: [
          { evidenceKey: 'visible_mite_colony', evidenceGroup: 'visible_mite_colony' }
        ]
      },
      {
        modeKey: 'thrips',
        matchedEvidence: [{ evidenceKey: 'thrips_visible', evidenceGroup: 'thrips_visible' }]
      }
    ],
    directionChoices: [
      {
        modeKey: 'pest',
        directionKey: 'pest',
        pestModeKeys: ['spider_mite', 'thrips'],
        directModeKeys: ['spider_mite', 'thrips'],
        confirmationModeKeys: []
      },
      { modeKey: 'yellow_leaf', directionKey: 'yellow_leaf', userDisplayName: '叶片发黄' }
    ],
    pendingDirectPestSnapshot: {
      directMatches: [
        {
          modeKey: 'spider_mite',
          matchedEvidence: [
            { evidenceKey: 'visible_mite_colony', evidenceGroup: 'visible_mite_colony' }
          ]
        },
        {
          modeKey: 'thrips',
          matchedEvidence: [{ evidenceKey: 'thrips_visible', evidenceGroup: 'thrips_visible' }]
        }
      ]
    }
  }
}
const chooseDirectionResponse = await buildPestRouteResponse({
  sessionId: 'diag_choose',
  aggregateResult: crossFamilyAggregate,
  diagnosisProfile: 'full'
})
assert.equal(chooseDirectionResponse.routePrimaryAction, 'choose_direction')
assert.deepEqual(
  chooseDirectionResponse.directMatches.map(item => item.modeKey),
  ['spider_mite', 'thrips']
)
assert.deepEqual(
  chooseDirectionResponse.directionChoices.map(item => item.modeKey),
  ['pest', 'yellow_leaf']
)
assert.deepEqual(
  chooseDirectionResponse.pendingDirectPestSnapshot.directMatches.map(item => item.modeKey),
  ['spider_mite', 'thrips']
)

const selectedPestDirection = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_choose',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: crossFamilyAggregate
  },
  sessionState: {}
})
assert.equal(selectedPestDirection.outcomeType, 'problematic')
assert.deepEqual(
  selectedPestDirection.visibleOutcomes.map(item => item.problemKey),
  ['spider_mite', 'thrips']
)

const pestMixedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [
    {
      evidenceKey: 'leaf_yellowing',
      confidenceBand: 'high',
      strengthLevel: 'strong',
      imageId: 'img_mixed',
      captureRegion: 'leaf_upper_surface'
    },
    {
      evidenceKey: 'visible_mite_colony',
      confidenceBand: 'high',
      strengthLevel: 'strong',
      imageId: 'img_mixed',
      captureRegion: 'leaf_underside'
    },
    {
      evidenceKey: 'silver_scarring',
      confidenceBand: 'medium',
      strengthLevel: 'medium',
      imageId: 'img_mixed',
      captureRegion: 'leaf_front'
    }
  ],
  visualModeCandidates: [
    { mode: 'thrips', confidence: 0.72 },
    { mode: 'yellow_leaf', confidence: 0.8 }
  ]
})
const selectedPestWithConfirmation = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'pest' },
  sessionId: 'diag_choose_question',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: {
      visual_call_batch_id: 'visbatch_mixed',
      diagnosis_mode_route_result: pestMixedRoute
    }
  },
  sessionState: {}
})
assert.deepEqual(
  selectedPestWithConfirmation.visibleOutcomes.map(item => item.problemKey),
  ['spider_mite']
)
assert.deepEqual(selectedPestWithConfirmation.questionPackage.packageTopics, ['thrips_black_spots'])

const diagnosisEnginePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-engine.js')
const originalDiagnosisEngine = require.cache[diagnosisEnginePath]
const powderyDirectionAggregate = {
  visual_call_batch_id: 'visbatch_powdery_direction',
  diagnosis_mode_route_result: {
    nextAction: 'choose_direction',
    recommendedDirection: 'pest',
    directMatches: [
      {
        modeKey: 'spider_mite',
        matchedEvidence: [
          { evidenceKey: 'visible_mite_colony', evidenceGroup: 'visible_mite_colony' }
        ]
      },
      {
        modeKey: 'powdery_mildew',
        matchedEvidence: [{ evidenceKey: 'powder_white', evidenceGroup: 'powder_white' }]
      }
    ],
    directionChoices: [
      {
        modeKey: 'pest',
        directionKey: 'pest',
        pestModeKeys: ['spider_mite'],
        directModeKeys: ['spider_mite'],
        confirmationModeKeys: []
      },
      { modeKey: 'powdery_mildew', directionKey: 'powdery_mildew', userDisplayName: '白粉病' }
    ]
  }
}
require.cache[diagnosisEnginePath] = {
  id: diagnosisEnginePath,
  filename: diagnosisEnginePath,
  loaded: true,
  exports: {
    runDiagnosisRound: async options => ({
      outcomeType: 'problematic',
      selectedModeKey: 'powdery_mildew',
      visualAggregateResult: options.visualAggregateResult
    })
  }
}
const selectedPowderyDirection = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'powdery_mildew' },
  sessionId: 'diag_choose',
  round: 2,
  refreshedSessionState: {
    plantContext: {},
    visualAggregateResult: powderyDirectionAggregate
  },
  sessionState: {}
})
assert.equal(selectedPowderyDirection.selectedModeKey, 'powdery_mildew')
assert.equal(
  selectedPowderyDirection.visualAggregateResult.diagnosis_mode_route_result.nextAction,
  'direct_result'
)
assert.deepEqual(
  selectedPowderyDirection.visualAggregateResult.diagnosis_mode_route_result.directMatches.map(
    item => item.modeKey
  ),
  ['powdery_mildew']
)
if (originalDiagnosisEngine) {
  require.cache[diagnosisEnginePath] = originalDiagnosisEngine
} else {
  delete require.cache[diagnosisEnginePath]
}

assert.equal(resolveManualSymptomMode({ symptomClassKey: 'yellowing_mode' }).modeKey, 'yellow_leaf')
assert.equal(
  resolveManualSymptomMode({ symptomClassKey: 'wilting_droop_mode' }).modeKey,
  'wilting_droop'
)
assert.throws(
  () => resolveManualSymptomMode({ symptomClassKey: 'thrips_damage_mode' }),
  /需要先上传照片识别/
)
assert.throws(
  () => resolveManualSymptomMode({ symptomClassKey: 'powdery_mildew_mode' }),
  /需要先上传照片识别/
)

if (originalQuestionRepository) {
  require.cache[questionRepositoryPath] = originalQuestionRepository
} else {
  delete require.cache[questionRepositoryPath]
}
