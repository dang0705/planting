import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const { buildFrontendDiagnosisResponse } = require('./cloudfunctions/diagnose-http/app/frontend-response.js')
const { toQuestionId, toOptionId } = require('./cloudfunctions/diagnose-http/mappers/public-id-mapper.js')
const {
  getQuestionPackageByMode,
  isQuestionPackageAnswerSubmitPayload
} = require('./cloudfunctions/diagnose-http/app/question-package-response.js')
const { planQuestionQueue } = require('./cloudfunctions/diagnose-http/domain/question-queue/question-queue-planner.js')
const {
  buildFollowUpPayload,
  normalizeDiagnosisResult
} = await import('./src/utils/diagnose-flow.js')

function buildQuestion(index) {
  return {
    questionId: `question_${index}`,
    questionKey: `q_observed_probe__leaf_yellowing__package_${index}`,
    targetDimension: `dimension_${index}`,
    targetSymptomKey: `leaf_yellowing_package_${index}`,
    text: `黄叶题目 ${index}`,
    options: [
      {
        optionId: `option_${index}_a`,
        optionKey: `option_${index}_a`,
        text: `选项 ${index}A`
      }
    ]
  }
}

function buildYellowingPackageQuestion(targetDimension) {
  const questionKey = `q_observed_probe__leaf_yellowing__${targetDimension}`
  const optionKey = `${targetDimension}_normal`
  return {
    questionId: toQuestionId(questionKey),
    questionKey,
    targetDimension,
    targetSymptomKey: 'leaf_yellowing',
    text: `黄叶题目 ${targetDimension}`,
    options: [
      {
        optionId: toOptionId(optionKey),
        optionKey,
        text: `选项 ${targetDimension}`
      }
    ]
  }
}

function testYellowingPackageFrontendResponse() {
  const response = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    questionPackage: {
      mode: 'yellow_leaf',
      sourceMode: 'manual_yellowing_care_environment_frontloaded',
      questionCount: 4,
      answerSubmitMode: 'package',
      questionDisplayMode: 'package'
    },
    followUps: [1, 2, 3, 4].map(buildQuestion)
  })
  assert.equal(response.questions.length, 4)
  assert.deepEqual(
    response.questions.map(item => item.questionId),
    ['question_1', 'question_2', 'question_3', 'question_4']
  )
  assert.equal(response.questionPackage.mode, 'yellow_leaf')
  assert.equal(response.questionPackage.sourceMode, 'manual_yellowing_care_environment_frontloaded')
  assert.deepEqual(response.questionPackage.outcomePolicy, {
    allowMultipleOutcomes: true,
    preferSingleOutcome: false
  })
  assert.equal(response.uiHints.questionDisplayMode, 'package')
  assert.equal(response.uiHints.answerSubmitMode, 'package')
  assert.equal(response.uiHints.maxQuestionsThisRound, 4)
}

function testModeToQuestionPackageMapping() {
  const questionPackage = getQuestionPackageByMode('yellow_leaf')
  assert.equal(questionPackage.mode, 'yellow_leaf')
  assert.equal(questionPackage.route, 'yellow_leaf')
  assert.equal(questionPackage.questionCount, 4)
  assert.deepEqual(questionPackage.targetDimensions, [
    'watering_frequency_context',
    'light_change_context',
    'fertilization_growth_context',
    'airflow_humidity_context'
  ])
  assert.equal(questionPackage.answerSubmitMode, 'package')
  assert.equal(questionPackage.questionDisplayMode, 'package')
  assert.equal(questionPackage.fixedQuestionPackage, true)
  assert.deepEqual(questionPackage.outcomePolicy, {
    allowMultipleOutcomes: true,
    preferSingleOutcome: false
  })
  assert.equal(getQuestionPackageByMode('manual_yellowing_care_environment_frontloaded').mode, 'yellow_leaf')
  assert.equal(getQuestionPackageByMode('unsupported_mode'), null)
}

function testYellowingPackageFromRouteMode() {
  const response = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package_route_mode',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    followUps: [1, 2, 3, 4].map(buildQuestion),
    metrics: {
      routeDecision: {
        mode: 'manual_yellowing_care_environment_frontloaded'
      }
    }
  })
  assert.equal(response.questions.length, 4)
  assert.equal(response.questionPackage.answerSubmitMode, 'package')
}

function testQuestionPackageQueueKeepsAllQuestions() {
  const questions = [1, 2, 3, 4].map(buildQuestion)
  const questionQueue = planQuestionQueue({
    diagnosisSessionId: 'diag_package_queue',
    roundId: 'round_1',
    stage: 'followup',
    routePrimaryAction: 'ask_first',
    followUpRequired: true,
    questionPackage: getQuestionPackageByMode('yellow_leaf'),
    followUps: questions
  })

  assert.equal(questionQueue.questionItems.length, 4)
  assert.deepEqual(
    questionQueue.questionItems.map(item => item.questionKey),
    questions.map(item => item.questionKey)
  )

  const singleQuestionQueue = planQuestionQueue({
    diagnosisSessionId: 'diag_single_queue',
    roundId: 'round_1',
    stage: 'followup',
    routePrimaryAction: 'ask_first',
    followUpRequired: true,
    followUps: questions
  })
  assert.equal(singleQuestionQueue.questionItems.length, 1)
}

function testEmptyQuestionsFallsBackToFollowUpsForPackage() {
  const response = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package_empty_questions',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    questions: [],
    followUps: [1, 2, 3, 4].map(buildQuestion),
    metrics: {
      routeDecision: {
        mode: 'manual_yellowing_care_environment_frontloaded'
      }
    }
  })
  assert.equal(response.questions.length, 4)
  assert.equal(response.questionPackage.questionCount, 4)
  assert.equal(response.uiHints.maxQuestionsThisRound, 4)
}

function testNormalizeKeepsPackageAndPackageSubmitPayload() {
  const frontendResponse = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package_normalize',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    questionPackage: {
      mode: 'yellow_leaf',
      sourceMode: 'manual_yellowing_care_environment_frontloaded',
      questionCount: 4,
      answerSubmitMode: 'package',
      questionDisplayMode: 'package'
    },
    followUps: [1, 2, 3, 4].map(buildQuestion)
  })
  const normalized = normalizeDiagnosisResult(frontendResponse)
  assert.equal(normalized.questionPackage.mode, 'yellow_leaf')
  assert.equal(normalized.uiHints.maxQuestionsThisRound, 4)
  assert.equal(normalized.uiHints.answerSubmitMode, 'package')
  const answerMap = Object.fromEntries(
    normalized.followUps.map(question => [question.questionId, question.options[0].optionId])
  )
  const payload = buildFollowUpPayload(normalized, answerMap, {
    questionStack: normalized.followUps,
    requestMode: 'answer_submit'
  })
  assert.equal(payload.answers.length, 4)
  assert.equal(payload.requestMode, 'answer_submit')
  assert.equal(payload.questionPackage.mode, 'yellow_leaf')
  assert.equal(payload.uiHints.answerSubmitMode, 'package')
}

function testGenericPackageAnswerSubmitIsTerminalQuestioningPayload() {
  for (const questionCount of [3, 5]) {
    const answers = Array.from({ length: questionCount }, (_, index) => ({
      questionKey: `q_observed_probe__leaf_spots__fixed_package_${index + 1}`,
      optionKey: `option_${index + 1}`
    }))
    assert.equal(isQuestionPackageAnswerSubmitPayload({
      payload: {
        questionPackage: {
          mode: 'leaf_spot',
          sourceMode: 'manual_leaf_spot_environment_frontloaded',
          questionCount,
          answerSubmitMode: 'package',
          questionDisplayMode: 'package'
        },
        uiHints: {
          answerSubmitMode: 'package',
          questionDisplayMode: 'package'
        }
      },
      answers,
      requestMode: 'answer_submit'
    }), true)
  }
}

function testYellowingPackageAnswerSubmitIsTerminalQuestioningPayload() {
  const questions = [
    'watering_frequency_context',
    'light_change_context',
    'fertilization_growth_context',
    'airflow_humidity_context'
  ].map(buildYellowingPackageQuestion)
  const frontendResponse = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package_terminal',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    questionPackage: {
      mode: 'yellow_leaf',
      sourceMode: 'manual_yellowing_care_environment_frontloaded',
      questionCount: 4,
      answerSubmitMode: 'package',
      questionDisplayMode: 'package'
    },
    followUps: questions
  })
  const normalized = normalizeDiagnosisResult(frontendResponse)
  const answerMap = Object.fromEntries(
    normalized.followUps.map(question => [question.questionId, question.options[0].optionId])
  )
  const payload = buildFollowUpPayload(normalized, answerMap, {
    questionStack: normalized.followUps,
    requestMode: 'answer_submit'
  })

  assert.equal(isQuestionPackageAnswerSubmitPayload({
    payload,
    answers: payload.answers,
    requestMode: payload.requestMode
  }), true)
}

function testYellowingPackageWithoutMetadataFallbackIsTerminalQuestioningPayload() {
  const answers = [
    'watering_frequency_context',
    'light_change_context',
    'fertilization_growth_context',
    'airflow_humidity_context'
  ].map(targetDimension => ({
    questionKey: `q_observed_probe__leaf_yellowing__${targetDimension}`,
    optionKey: `${targetDimension}_normal`
  }))

  assert.equal(isQuestionPackageAnswerSubmitPayload({
    payload: {},
    answers,
    requestMode: 'answer_submit'
  }), true)
}

function testNonPackageFourAnswerSubmitIsNotTerminalQuestioningPayload() {
  const answers = [1, 2, 3, 4].map(index => ({
    questionKey: `q_generic_${index}`,
    optionKey: `option_${index}`
  }))
  assert.equal(isQuestionPackageAnswerSubmitPayload({
    payload: {},
    answers,
    requestMode: 'answer_submit'
  }), false)
}

function testNonPackageStillReturnsSingleQuestion() {
  const response = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_single',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    followUps: [1, 2, 3].map(buildQuestion),
    metrics: {
      routeDecision: {
        mode: 'route_planned'
      }
    }
  })
  assert.equal(response.questions.length, 1)
  assert.equal(response.questionPackage, undefined)
  assert.equal(response.uiHints.questionDisplayMode, 'single')
  assert.equal(response.uiHints.answerSubmitMode, 'per_question')
  assert.equal(response.uiHints.maxQuestionsThisRound, 1)
}

function testYellowingSourceWithThreeQuestionsIsNotPackage() {
  const response = buildFrontendDiagnosisResponse({
    diagnosisSessionId: 'diag_package_short',
    roundId: 'round_1',
    stage: 'followup',
    followUpRequired: true,
    followUps: [1, 2, 3].map(buildQuestion),
    metrics: {
      routeDecision: {
        mode: 'manual_yellowing_care_environment_frontloaded'
      }
    }
  })
  assert.equal(response.questionPackage, undefined)
  assert.equal(response.questions.length, 1)
  assert.equal(response.uiHints.questionDisplayMode, 'single')
  assert.equal(response.uiHints.answerSubmitMode, 'per_question')
}

function testFollowUpPageSizeAndSubmitPath() {
  const page = readFileSync('src/pages/diagnose/follow-up.vue', 'utf8')
  const flow = readFileSync('src/pages/diagnose/follow-up/question-flow.js', 'utf8')
  assert.ok(page.split('\n').length < 500)
  assert.match(flow, /isQuestionPackageMode\.value\s*\?\s*followUpQuestionStack\.value/)
  assert.match(flow, /requestMode:\s*'answer_submit'/)
}

function testPackageSubmitTerminalQuestioningRuntimeWiring() {
  const runner = readFileSync('cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js', 'utf8')
  const engine = readFileSync('cloudfunctions/diagnose-http/domain/diagnosis-engine.js', 'utf8')
  assert.match(runner, /isQuestionPackageAnswerSubmitPayload/)
  assert.match(runner, /terminalQuestioningState:\s*isTerminalQuestionPackageSubmit/)
  assert.doesNotMatch(engine, /canAskAnotherFollowUpRound/)
  assert.doesNotMatch(engine, /const shouldAskFollowUp\s*=/)
  assert.doesNotMatch(engine, /const routePlannedFollowUps =/)
  assert.doesNotMatch(engine, /const genericFollowUps =/)
}

async function testPackagePersistenceAllowsAllQuestionOwnership() {
  const originalLoad = Module._load
  const servicePath = require.resolve('./cloudfunctions/diagnose-http/services/session-follow-up-service.js')
  delete require.cache[servicePath]

  const insertedRows = []
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request.includes('session-follow-up-repository')) {
      return {
        insertFollowUpQuestionsRows: async (sessionId, list = []) => {
          for (const item of list) {
            insertedRows.push({
              id: insertedRows.length + 1,
              diagnosis_id: sessionId,
              symptom_key: item.storageSymptomKey || item.questionKey,
              question_order: item.questionOrder,
              question_text: item.questionText,
              rationale: item.rationale,
              asked: 0,
              answer_value: '',
              status: 'pending'
            })
          }
        },
        listFollowUpRows: async () => insertedRows,
        markFollowUpAnswerRow: async () => {},
        invalidateFollowUpRowsAfterQuestion: async () => ({ invalidatedCount: 0 }),
        insertFollowUpAnswerRevisionEvents: async () => ({ insertedCount: 0 })
      }
    }
    if (request.includes('question-repository')) {
      return { getQuestionsByKeys: async () => [] }
    }
    if (request.includes('question-queue-repository')) {
      return { getQueueBySessionAndRound: async () => null }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const {
      appendFollowUpQuestions,
      validateFollowUpAnswerOwnership
    } = require('./cloudfunctions/diagnose-http/services/session-follow-up-service.js')
    const questions = [1, 2, 3, 4].map(buildQuestion)
    const oneQuestionQueue = {
      questionItems: [
        { questionKey: questions[0].questionKey }
      ]
    }

    await appendFollowUpQuestions('diag_package_persist', 1, questions, {
      questionQueue: oneQuestionQueue,
      assumeNoExisting: true,
      allowUnqueuedQuestions: true
    })
    assert.equal(insertedRows.length, 4)

    const ownership = await validateFollowUpAnswerOwnership(
      'diag_package_persist',
      questions.map(question => ({
        questionKey: question.questionKey,
        optionKey: question.options[0].optionKey
      })),
      1,
      {
        followUpRows: insertedRows,
        queuedQuestionKeys: new Set([questions[0].questionKey])
      }
    )
    assert.equal(ownership.ok, true)
    assert.deepEqual(ownership.invalidQuestionKeys, [])

    insertedRows.length = 0
    await appendFollowUpQuestions('diag_single_persist', 1, questions, {
      questionQueue: oneQuestionQueue,
      assumeNoExisting: true
    })
    assert.equal(insertedRows.length, 1)
    assert.equal(JSON.parse(insertedRows[0].rationale).qk, questions[0].questionKey)
  } finally {
    Module._load = originalLoad
    delete require.cache[servicePath]
  }
}

testYellowingPackageFrontendResponse()
testModeToQuestionPackageMapping()
testYellowingPackageFromRouteMode()
testQuestionPackageQueueKeepsAllQuestions()
testEmptyQuestionsFallsBackToFollowUpsForPackage()
testNormalizeKeepsPackageAndPackageSubmitPayload()
testGenericPackageAnswerSubmitIsTerminalQuestioningPayload()
testYellowingPackageAnswerSubmitIsTerminalQuestioningPayload()
testYellowingPackageWithoutMetadataFallbackIsTerminalQuestioningPayload()
testNonPackageFourAnswerSubmitIsNotTerminalQuestioningPayload()
testNonPackageStillReturnsSingleQuestion()
testYellowingSourceWithThreeQuestionsIsNotPackage()
testFollowUpPageSizeAndSubmitPath()
testPackageSubmitTerminalQuestioningRuntimeWiring()
await testPackagePersistenceAllowsAllQuestionOwnership()

console.log('question package tests passed')
