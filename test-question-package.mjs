import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildFrontendDiagnosisResponse
} = require('./cloudfunctions/diagnose-http/app/frontend-response.js')
const {
  toQuestionId,
  toOptionId
} = require('./cloudfunctions/diagnose-http/mappers/public-id-mapper.js')
const {
  getQuestionPackageByMode,
  isQuestionPackageAnswerSubmitPayload,
  resolveResponseQuestions
} = require('./cloudfunctions/diagnose-http/app/question-package-response.js')

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

function buildPackageResponse(overrides = {}) {
  return {
    diagnosisSessionId: 'diag_package',
    roundId: 'round_1',
    stage: 'question_package',
    questionPackage: {
      mode: 'yellow_leaf',
      sourceMode: 'manual_yellowing_care_environment_frontloaded',
      questionCount: 4,
      answerSubmitMode: 'package',
      questionDisplayMode: 'package'
    },
    questions: [1, 2, 3, 4].map(buildQuestion),
    ...overrides
  }
}

function testYellowingPackageFrontendResponse() {
  const response = buildFrontendDiagnosisResponse(buildPackageResponse())
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
  assert.deepEqual(
    Object.keys(response).filter(key => key.toLowerCase().includes('follow')),
    []
  )
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
  assert.equal(
    getQuestionPackageByMode('manual_yellowing_care_environment_frontloaded').mode,
    'yellow_leaf'
  )
  assert.equal(getQuestionPackageByMode('unsupported_mode'), null)
}

function testQuestionsAreOnlyPackageQuestionSource() {
  const sourceQuestions = [1, 2, 3, 4].map(buildQuestion)
  assert.equal(resolveResponseQuestions({ questions: sourceQuestions }).length, 4)
  assert.deepEqual(resolveResponseQuestions({ questions: [] }), [])
  assert.deepEqual(resolveResponseQuestions({}), [])
}

function testPackageAnswerSubmitPayload() {
  const questions = [
    'watering_frequency_context',
    'light_change_context',
    'fertilization_growth_context',
    'airflow_humidity_context'
  ].map(buildYellowingPackageQuestion)
  const payload = {
    ...buildPackageResponse({ questions }),
    requestMode: 'answer_submit',
    uiHints: {
      answerSubmitMode: 'package',
      questionDisplayMode: 'package'
    }
  }
  const answers = questions.map(question => ({
    questionKey: question.questionKey,
    optionKey: question.options[0].optionKey
  }))

  assert.equal(
    isQuestionPackageAnswerSubmitPayload({
      payload,
      answers,
      requestMode: payload.requestMode
    }),
    true
  )
}

function testGenericPackageAnswerSubmitIsTerminalQuestioningPayload() {
  for (const questionCount of [3, 5]) {
    const answers = Array.from({ length: questionCount }, (_, index) => ({
      questionKey: `q_observed_probe__leaf_spots__fixed_package_${index + 1}`,
      optionKey: `option_${index + 1}`
    }))
    assert.equal(
      isQuestionPackageAnswerSubmitPayload({
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
      }),
      true
    )
  }
}

function testYellowingCompletePackageAnswersAreTerminalQuestioningPayload() {
  const answers = [
    'watering_frequency_context',
    'light_change_context',
    'fertilization_growth_context',
    'airflow_humidity_context'
  ].map(targetDimension => ({
    questionKey: `q_observed_probe__leaf_yellowing__${targetDimension}`,
    optionKey: `${targetDimension}_normal`
  }))

  assert.equal(
    isQuestionPackageAnswerSubmitPayload({
      payload: {},
      answers,
      requestMode: 'answer_submit'
    }),
    true
  )
}

function testNonPackageFourAnswerSubmitIsNotTerminalQuestioningPayload() {
  const answers = [1, 2, 3, 4].map(index => ({
    questionKey: `q_generic_${index}`,
    optionKey: `option_${index}`
  }))
  assert.equal(
    isQuestionPackageAnswerSubmitPayload({
      payload: {},
      answers,
      requestMode: 'answer_submit'
    }),
    false
  )
}

function testPackageSubmitTerminalQuestioningRuntimeWiring() {
  const runner = readFileSync('cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js', 'utf8')
  const engine = readFileSync('cloudfunctions/diagnose-http/domain/diagnosis-engine.js', 'utf8')
  assert.match(runner, /isQuestionPackageAnswerSubmitPayload/)
  assert.match(runner, /terminalQuestioningState:\s*isTerminalQuestionPackageSubmit/)
  assert.match(runner, /resolvePackageAnswerOwnership/)
  assert.match(runner, /buildPackageAnswerRuntimeState/)
  const oldQuestioningTerms = [
    `canAskAnother${'Follow'}${'Up'}Round`,
    `const shouldAsk${'Follow'}${'Up'}\\s*=`,
    `const routePlanned${'Follow'}${'Ups'} =`,
    `const generic${'Follow'}${'Ups'} =`
  ]
  for (const term of oldQuestioningTerms) {
    assert.doesNotMatch(engine, new RegExp(term))
  }
}

testYellowingPackageFrontendResponse()
testModeToQuestionPackageMapping()
testQuestionsAreOnlyPackageQuestionSource()
testPackageAnswerSubmitPayload()
testGenericPackageAnswerSubmitIsTerminalQuestioningPayload()
testYellowingCompletePackageAnswersAreTerminalQuestioningPayload()
testNonPackageFourAnswerSubmitIsNotTerminalQuestioningPayload()
testPackageSubmitTerminalQuestioningRuntimeWiring()

console.log('question package tests passed')
