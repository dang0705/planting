import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const QUESTION_KEY = 'q_specific_pest__thrips_black_spots'
const OPTION_KEY = 'thrips_black_spots_yes'
const THRIPS_SILVER_QUESTION_KEY = 'q_specific_pest__thrips_silver_scarring'
const SPIDER_MITE_WEBBING_QUESTION_KEY = 'q_specific_pest__spider_mite_webbing'
const captured = {
  genericRunnerCalled: false,
  persistedRoundResults: [],
  optionMappingQuestionKeys: [],
  preparedAnswerRevisions: []
}

const questionPackageSnapshot = {
  mode: 'specific_pest_visual',
  sourceMode: 'dynamic_specific_pest_package',
  answerSubmitMode: 'package',
  questionDisplayMode: 'package',
  questionCount: 1,
  candidateModes: ['thrips'],
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'silver_streaks',
      diagnosisMode: 'thrips',
      routeEvidenceRole: 'confirmation_candidate'
    }
  ],
  questionPackage: {
    mode: 'specific_pest_visual',
    sourceMode: 'dynamic_specific_pest_package',
    answerSubmitMode: 'package',
    questionDisplayMode: 'package',
    questionCount: 1,
    candidateModes: ['thrips']
  },
  packageQuestions: [
    {
      questionKey: QUESTION_KEY,
      questionGroupKey: 'thrips_black_spots',
      packageTopic: 'thrips_black_spots',
      candidateModes: ['thrips'],
      options: [
        {
          optionId: OPTION_KEY,
          optionKey: OPTION_KEY,
          mapsToModes: ['thrips'],
          mapsToEvidenceKeys: ['black_fecal_spots'],
          value: 1,
          associationStrength: 1
        },
        {
          optionId: 'thrips_black_spots_no',
          optionKey: 'thrips_black_spots_no',
          mapsToModes: ['thrips'],
          value: -1,
          associationStrength: 1
        },
        { optionId: 'unknown', optionKey: 'unknown', value: 0, associationStrength: 0 }
      ]
    }
  ]
}

const sessionState = {
  userPlantId: 31,
  plantId: 'plant_31',
  nextRound: 2,
  plantContext: {
    userPlantId: 31,
    plantId: 'plant_31',
    plantIdentityId: 'plant_identity_31'
  },
  runtimeSnapshot: { questionPackageSnapshot },
  answeredAnswers: [],
  askedQuestionKeys: [],
  answeredQuestionGroupKeys: [],
  unknownCountByGroup: {},
  observedEvidenceSet: [],
  visualBatchTrace: null,
  visualAggregateSummary: null,
  shadowCompareSummary: null,
  symptomClassRuntime: null
}

function parseRationale(row = {}) {
  return JSON.parse(String(row?.rationale || '{}'))
}

function buildSpecificPestQuestionRow({
  id,
  questionKey,
  questionGroupKey,
  targetSymptomKey,
  round = 1,
  questionOrder = 1,
  asked = 0,
  answerValue = '',
  status = 'pending'
} = {}) {
  return {
    id,
    symptom_key: questionKey,
    question_order: questionOrder,
    question_text: questionKey,
    asked,
    answer_value: answerValue,
    status,
    rationale: JSON.stringify({
      qk: questionKey,
      qg: questionGroupKey,
      tsk: targetSymptomKey,
      r: round
    })
  }
}

function syncAnsweredAnswersFromRows(rows = []) {
  sessionState.answeredAnswers = (Array.isArray(rows) ? rows : [])
    .filter(row => Number(row?.asked || 0) === 1 && String(row?.answer_value || '').trim())
    .map(row => ({
      questionKey: parseRationale(row).qk,
      optionKey: String(row.answer_value || '').trim()
    }))
}

function validateQuestionAnswerOwnershipStub(
  _sessionId,
  answers = [],
  answerRound = 1,
  options = {}
) {
  const rows = Array.isArray(options.questionRows)
    ? options.questionRows
    : sessionState.questionRows || []
  const allowed = new Set()
  for (const row of rows) {
    const rationale = parseRationale(row)
    if (Number(rationale.r || 1) === Number(answerRound || 1) && Number(row.asked || 0) === 0) {
      allowed.add(String(rationale.qk || '').trim())
    }
  }
  if (options.packageQuestionKeys instanceof Set) {
    for (const key of options.packageQuestionKeys) {
      if (key) {
        allowed.add(String(key).trim())
      }
    }
  }
  const invalidQuestionKeys = (Array.isArray(answers) ? answers : [])
    .map(item => String(item?.questionKey || '').trim())
    .filter(questionKey => questionKey && !allowed.has(questionKey))
  return {
    ok: invalidQuestionKeys.length === 0,
    reason: invalidQuestionKeys.length ? 'question_not_in_session_round' : '',
    invalidQuestionKeys,
    questionRows: rows
  }
}

async function markQuestionAnswersStub(_sessionId, answers = [], options = {}) {
  const rows = Array.isArray(options.questionRows)
    ? options.questionRows
    : sessionState.questionRows || []
  const updatedAnswers = []
  for (const answer of Array.isArray(answers) ? answers : []) {
    const questionKey = String(answer?.questionKey || '').trim()
    const optionKey = String(answer?.optionKey || '')
      .trim()
      .toLowerCase()
    const row = rows.find(item => String(parseRationale(item).qk || '').trim() === questionKey)
    if (!row || !questionKey || !optionKey) {
      continue
    }
    const rationale = parseRationale(row)
    const isUnknown = optionKey === 'unknown'
    row.asked = 1
    row.answer_value = optionKey
    row.answerValue = optionKey
    row.answer_confidence = isUnknown ? 0 : 1
    row.answerConfidence = isUnknown ? 0 : 1
    row.status = isUnknown ? 'skipped' : optionKey.endsWith('_no') ? 'rejected' : 'confirmed'
    updatedAnswers.push({
      questionKey,
      optionKey,
      answerValue: optionKey,
      answerConfidence: isUnknown ? 0 : 1,
      status: row.status,
      questionGroupKey: String(rationale.qg || '__default__').trim()
    })
  }
  sessionState.questionRows = rows
  syncAnsweredAnswersFromRows(rows)
  return {
    questionRows: rows,
    updatedAnswers,
    pendingWrites: options.awaitPersistence === false ? [] : null
  }
}

Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      getPlantCatalogById: async () => null,
      getUserPlantInstanceById: async () => null
    }
  }
  if (request === '../domain/diagnosis-engine' || request === './domain/diagnosis-engine') {
    return {
      runDiagnosisRound: async () => {
        captured.genericRunnerCalled = true
        throw new Error('generic route runner must not handle a completed pest package')
      }
    }
  }
  if (
    request === '../domain/yellow-leaf-outcome-resolver' ||
    request === './domain/yellow-leaf-outcome-resolver'
  ) {
    return { resolveYellowLeafOutcomeResult: async () => null }
  }
  if (
    request === '../domain/wilting-droop-outcome-resolver' ||
    request === './domain/wilting-droop-outcome-resolver'
  ) {
    return { resolveWiltingDroopOutcomeResult: () => null }
  }
  if (
    request === '../repositories/question-repository' ||
    request === './repositories/question-repository'
  ) {
    return {
      getQuestionOptionMappings: async questionKeys => {
        captured.optionMappingQuestionKeys = questionKeys
        return [
          {
            questionKey: QUESTION_KEY,
            optionKey: 'store_only_option',
            value: 1,
            associationStrength: 1
          }
        ]
      }
    }
  }
  if (request === '../services/session-service' || request === './services/session-service') {
    return {
      getSessionState: async () => sessionState,
      getObservedSymptomsBySession: async () => [],
      validateQuestionAnswerOwnership: validateQuestionAnswerOwnershipStub,
      markQuestionAnswers: markQuestionAnswersStub,
      prepareAnswerRevision: async args => {
        captured.preparedAnswerRevisions.push(args)
        return {
          ok: true,
          keepUntilQuestionId: args.dirtyQuestionKey,
          invalidatedFromQuestionId: args.dirtyQuestionKey
        }
      }
    }
  }
  if (request === '../utils/visual-batch-id' || request === './utils/visual-batch-id') {
    return { resolveLatestVisualCallBatchId: () => 'visual_batch_dynamic_pest' }
  }
  if (request === './visual-runtime' || request === '../app/visual-runtime') {
    return {
      extractVisualSymptomsSafely: async () => null,
      persistRoundResult: async args => {
        captured.persistedRoundResults.push(args)
        return true
      }
    }
  }
  if (
    request === '../repositories/outcome-route-repository' ||
    request === './repositories/outcome-route-repository'
  ) {
    return {
      getOutcomeAnswerEffects: async () => [],
      getDiagnosisOutcomesByKeys: async () => [],
      getOutcomeActionProfiles: async () => []
    }
  }
  if (
    request === '../repositories/diagnosis-review/review-performance' ||
    request === './repositories/diagnosis-review/review-performance'
  ) {
    return {
      createReviewTimingLogger: () => ({ mark: () => {}, finish: () => {} })
    }
  }
  if (request === './static-cache-preloader' || request === '../app/static-cache-preloader') {
    return { triggerStaticRepositoryCachePreload: () => {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  runAnswerDiagnosis
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js')
const {
  buildCompactAnswerRoundResponse
} = require('../../../../../cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js')
const {
  buildFrontendAnswerResponse
} = require('../../../../../cloudfunctions/diagnose-http/app/frontend-response.js')

const result = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [{ questionKey: QUESTION_KEY, optionKey: OPTION_KEY }],
    questionPackage: {
      mode: 'specific_pest_visual',
      answerSubmitMode: 'package',
      questionCount: 1,
      packageQuestions: [
        {
          questionKey: QUESTION_KEY,
          options: [{ optionKey: 'client_spoofed_option', mapsToModes: ['spider_mite'] }]
        }
      ]
    }
  }
})

assert.equal(captured.genericRunnerCalled, false)
assert.deepEqual(captured.optionMappingQuestionKeys, [QUESTION_KEY])
assert.equal(result.response.questionRequired, false)
assert.equal(result.response.sessionStatus, 'completed')
assert.deepEqual(
  result.response.visibleOutcomes.map(item => item.outcomeKey),
  ['thrips']
)
assert.equal(captured.persistedRoundResults[0].response.visibleOutcomes[0].outcomeKey, 'thrips')

sessionState.runtimeSnapshot.questionPackageSnapshot = {
  ...questionPackageSnapshot,
  hiddenPrefilledEvidence: [
    {
      evidenceKey: 'spider_mite',
      diagnosisMode: 'spider_mite',
      routeEvidenceRole: 'direct_match'
    }
  ]
}

const unknownRefinementResult = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest_unknown',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [{ questionKey: QUESTION_KEY, optionKey: 'unknown' }],
    questionPackage: {
      mode: 'specific_pest_visual',
      answerSubmitMode: 'package',
      questionCount: 1
    }
  }
})

assert.equal(unknownRefinementResult.response.outcomeType, 'problematic')
assert.deepEqual(
  unknownRefinementResult.response.visibleOutcomes.map(item => item.outcomeKey),
  ['spider_mite', 'thrips']
)
assert.match(unknownRefinementResult.response.visibleOutcomes[1].displayNameCn, /^可能是/)

sessionState.runtimeSnapshot.questionPackageSnapshot = null
sessionState.answeredAnswers = []
sessionState.questionRows = []
captured.genericRunnerCalled = false
const answerRevisionPayloadPackageResult = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest_revision_payload_package',
    roundId: 'round_1',
    requestMode: 'answer_revision',
    dirtyFromQuestionId: QUESTION_KEY,
    answers: [{ questionKey: QUESTION_KEY, optionKey: 'unknown' }],
    questionPackage: {
      ...questionPackageSnapshot,
      hiddenPrefilledEvidence: [],
      questionCount: 1,
      packageQuestions: questionPackageSnapshot.packageQuestions
    }
  }
})

assert.equal(captured.genericRunnerCalled, false)
assert.equal(answerRevisionPayloadPackageResult.response.outcomeType, 'problematic')
assert.deepEqual(
  answerRevisionPayloadPackageResult.response.visibleOutcomes.map(item => item.outcomeKey),
  ['thrips']
)
assert.equal(captured.preparedAnswerRevisions.at(-1)?.dirtyQuestionKey, QUESTION_KEY)

sessionState.nextRound = 2
sessionState.runtimeSnapshot.questionPackageSnapshot = null
sessionState.answeredAnswers = []
sessionState.questionRows = [
  buildSpecificPestQuestionRow({
    id: 101,
    questionKey: THRIPS_SILVER_QUESTION_KEY,
    questionGroupKey: 'thrips_silver_scarring',
    targetSymptomKey: 'thrips',
    questionOrder: 1
  }),
  buildSpecificPestQuestionRow({
    id: 102,
    questionKey: SPIDER_MITE_WEBBING_QUESTION_KEY,
    questionGroupKey: 'spider_mite_webbing',
    targetSymptomKey: 'spider_mite',
    questionOrder: 2
  })
]
captured.genericRunnerCalled = false
captured.persistedRoundResults = []

const partialPayloadPackageResult = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest_partial_payload_package',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [{ questionKey: THRIPS_SILVER_QUESTION_KEY, optionKey: 'unknown' }],
    questionPackage: {
      mode: 'specific_pest_visual',
      answerSubmitMode: 'package',
      questionCount: 1,
      packageQuestions: [
        {
          questionKey: THRIPS_SILVER_QUESTION_KEY,
          options: [{ optionKey: 'unknown', value: 0, associationStrength: 0 }]
        }
      ]
    }
  }
})

assert.equal(captured.genericRunnerCalled, false)
assert.equal(partialPayloadPackageResult.response.questionRequired, true)
assert.equal(partialPayloadPackageResult.response.sessionStatus, 'awaiting_follow_up')
assert.equal(partialPayloadPackageResult.response.roundId, 'round_1')
assert.deepEqual(
  partialPayloadPackageResult.response.questions.map(item => item.questionKey),
  [SPIDER_MITE_WEBBING_QUESTION_KEY]
)
assert.equal(partialPayloadPackageResult.response.outcomeType || '', '')
assert.equal(
  partialPayloadPackageResult.response.questionPackageSnapshot.packageQuestions.length,
  2
)
assert.equal(partialPayloadPackageResult.response.questionPackage.questionCount, 1)
assert.deepEqual(
  partialPayloadPackageResult.response.questionPackage.packageQuestions.map(
    item => item.questionKey
  ),
  [SPIDER_MITE_WEBBING_QUESTION_KEY]
)
const frontendPartialPayloadPackageResult = buildFrontendAnswerResponse(
  buildCompactAnswerRoundResponse(partialPayloadPackageResult.response)
)
assert.equal(frontendPartialPayloadPackageResult.uiHints.answerSubmitMode, 'package')
assert.equal(frontendPartialPayloadPackageResult.questionPackage.questionCount, 1)
assert.deepEqual(
  frontendPartialPayloadPackageResult.questions.map(item => item.questionKey),
  [SPIDER_MITE_WEBBING_QUESTION_KEY]
)
assert.equal(captured.persistedRoundResults.at(-1).round, 1)
assert.equal(captured.persistedRoundResults.at(-1).response.__skipQuestionRowWrite, true)

const secondPartialAnswerResult = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest_partial_payload_package',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [{ questionKey: SPIDER_MITE_WEBBING_QUESTION_KEY, optionKey: 'unknown' }]
  }
})

assert.equal(secondPartialAnswerResult.response.questionRequired, false)
assert.equal(secondPartialAnswerResult.response.outcomeType, 'problematic')
assert.deepEqual(
  secondPartialAnswerResult.response.visibleOutcomes.map(item => item.outcomeKey),
  ['thrips']
)
assert.match(secondPartialAnswerResult.response.visibleOutcomes[0].displayNameCn, /^可能是/)

sessionState.nextRound = 2
sessionState.runtimeSnapshot.questionPackageSnapshot = null
sessionState.answeredAnswers = []
sessionState.questionRows = [
  buildSpecificPestQuestionRow({
    id: 201,
    questionKey: THRIPS_SILVER_QUESTION_KEY,
    questionGroupKey: 'thrips_silver_scarring',
    targetSymptomKey: 'thrips',
    questionOrder: 1
  }),
  buildSpecificPestQuestionRow({
    id: 202,
    questionKey: SPIDER_MITE_WEBBING_QUESTION_KEY,
    questionGroupKey: 'spider_mite_webbing',
    targetSymptomKey: 'spider_mite',
    questionOrder: 2
  })
]

const allNegativeAnswerResult = await runAnswerDiagnosis({
  openid: 'openid_dynamic_pest',
  payload: {
    diagnosisSessionId: 'session_dynamic_pest_all_negative',
    roundId: 'round_1',
    requestMode: 'answer_submit',
    answers: [
      {
        questionKey: THRIPS_SILVER_QUESTION_KEY,
        optionKey: 'thrips_silver_scarring_no'
      },
      {
        questionKey: SPIDER_MITE_WEBBING_QUESTION_KEY,
        optionKey: 'spider_mite_webbing_no'
      }
    ]
  }
})

assert.equal(allNegativeAnswerResult.response.questionRequired, false)
assert.equal(allNegativeAnswerResult.response.outcomeType, 'problematic')
assert.deepEqual(
  allNegativeAnswerResult.response.visibleOutcomes.map(item => item.outcomeKey),
  ['thrips']
)
assert.match(allNegativeAnswerResult.response.visibleOutcomes[0].displayNameCn, /^可能是/)

sessionState.runtimeSnapshot.questionPackageSnapshot = questionPackageSnapshot
sessionState.answeredAnswers = []
sessionState.questionRows = []

await assert.rejects(
  () =>
    runAnswerDiagnosis({
      openid: 'openid_dynamic_pest',
      payload: {
        diagnosisSessionId: 'session_dynamic_pest',
        roundId: 'round_1',
        requestMode: 'answer_submit',
        answers: [{ questionKey: QUESTION_KEY, optionKey: 'store_only_option' }],
        questionPackage: {
          mode: 'specific_pest_visual',
          answerSubmitMode: 'package',
          questionCount: 1
        }
      }
    }),
  error => error?.statusCode === 400 && /当前会话轮次/.test(error.message)
)

Module._load = originalLoad

console.log('dynamic pest question package answer tests passed')
