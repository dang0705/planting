import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildFrontendDiagnosisResponse
} = require('../../../../cloudfunctions/diagnose-http/app/frontend-response.js')
const {
  toQuestionId,
  toOptionId
} = require('../../../../cloudfunctions/diagnose-http/mappers/public-id-mapper.js')
const {
  getQuestionPackageByMode,
  isQuestionPackageAnswerSubmitPayload,
  resolveResponseQuestions
} = require('../../../../cloudfunctions/diagnose-http/app/question-package-response.js')
const {
  _test: staticQuestionPackageStartTest
} = require('../../../../cloudfunctions/diagnose-http/app/static-question-package-start.js')
const {
  buildWiltingDroopPackageQuestions
} = require('../../../../cloudfunctions/diagnose-http/app/wilting-droop-question-package.js')
const {
  WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
  loadRegisteredPackageQuestion
} = require('../../../../cloudfunctions/diagnose-http/app/diagnosis-question-registry.js')

const WATERING_TOPIC = 'watering_frequency_context'
const DB_STUB_WATERING_TEXT = 'DB mock：请选择过去 10 天内哪些天浇了水？'
const DB_STUB_WATERING_HELP = 'DB mock：结合天气和浇水记录判断干湿。'
const DB_STUB_OPTIONS = [
  { optionKey: 'care_behavior_timeline', text: 'DB mock：养护记录已提供', isDefault: true },
  { optionKey: 'unknown', text: 'DB mock：不确定 / 记不清', isDefault: false }
]

function buildQuestionRepositoryStub({
  includeQuestion = true,
  includeOptions = true
} = {}) {
  return {
    async getQuestionsByKeys(questionKeys = []) {
      if (!includeQuestion || !questionKeys.includes(WATERING_FREQUENCY_CONTEXT_QUESTION_KEY)) {
        return []
      }
      return [
        {
          questionKey: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
          questionTextUserCn: DB_STUB_WATERING_TEXT,
          questionTextCn: 'DB mock：内部题干',
          questionType: 'single_choice',
          targetSymptomKey: 'leaf_yellowing',
          questionGroupKey: 'db_mock_watering_group',
          helpTextCn: DB_STUB_WATERING_HELP,
          whyThisQuestionCn: 'DB mock：为什么问这题'
        }
      ]
    },
    async getQuestionOptionMappings(questionKeys = []) {
      if (!includeOptions || !questionKeys.includes(WATERING_FREQUENCY_CONTEXT_QUESTION_KEY)) {
        return []
      }
      return DB_STUB_OPTIONS.map(option => ({
        questionKey: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
        optionKey: option.optionKey,
        optionTextUserCn: option.text,
        optionTextCn: option.text
      }))
    }
  }
}

function buildQuestion(index) {
  return {
    questionId: `question_${index}`,
    questionKey: `q_observed_probe__leaf_yellowing__package_${index}`,
    packageTopic: `dimension_${index}`,
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

function buildYellowingPackageQuestion(packageTopic) {
  const questionKey = `q_observed_probe__leaf_yellowing__${packageTopic}`
  const optionKey = `${packageTopic}_normal`
  return {
    questionId: toQuestionId(questionKey),
    questionKey,
    packageTopic,
    targetSymptomKey: 'leaf_yellowing',
    text: `黄叶题目 ${packageTopic}`,
    options: [
      {
        optionId: toOptionId(optionKey),
        optionKey,
        text: `选项 ${packageTopic}`
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
    response.questions.map(item => item.questionKey),
    [
      'q_observed_probe__leaf_yellowing__package_1',
      'q_observed_probe__leaf_yellowing__package_2',
      'q_observed_probe__leaf_yellowing__package_3',
      'q_observed_probe__leaf_yellowing__package_4'
    ]
  )
  assert.deepEqual(
    response.questions.map(item => Object.prototype.hasOwnProperty.call(item, 'questionId')),
    [false, false, false, false]
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
  assert.deepEqual(questionPackage.packageTopics, [
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
  ].map(packageTopic => ({
    questionKey: `q_observed_probe__leaf_yellowing__${packageTopic}`,
    optionKey: `${packageTopic}_normal`
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

function pickWateringQuestion(questions = []) {
  return questions.find(item => item.packageTopic === WATERING_TOPIC)
}

function assertNoRuntimeGeneratedQuestionId(question = {}) {
  assert.equal(Object.prototype.hasOwnProperty.call(question, 'questionId'), false)
  assert.notEqual(question.questionKey, toQuestionId(question.questionKey))
  assert.doesNotMatch(question.questionKey, /random|uuid|timestamp|date_now|math_random/i)
}

async function testSharedWateringQuestionRegistryAcrossPackages() {
  const repository = buildQuestionRepositoryStub()
  const yellowWatering = pickWateringQuestion(
    await staticQuestionPackageStartTest.buildYellowingStaticQuestions({ repository })
  )
  const wiltingWatering = pickWateringQuestion(
    await buildWiltingDroopPackageQuestions({ repository })
  )
  assert.ok(yellowWatering)
  assert.ok(wiltingWatering)

  assert.equal(yellowWatering.questionKey, WATERING_FREQUENCY_CONTEXT_QUESTION_KEY)
  assert.equal(wiltingWatering.questionKey, WATERING_FREQUENCY_CONTEXT_QUESTION_KEY)
  assert.equal(yellowWatering.text, DB_STUB_WATERING_TEXT)
  assert.equal(yellowWatering.helpText, DB_STUB_WATERING_HELP)

  for (const field of ['text', 'questionText', 'helpText', 'type', 'uiVariant', 'renderMode']) {
    assert.equal(yellowWatering[field], wiltingWatering[field], field)
  }
  assert.deepEqual(
    yellowWatering.options.map(({ optionKey, text, isDefault }) => ({ optionKey, text, isDefault })),
    DB_STUB_OPTIONS
  )
  assert.deepEqual(
    wiltingWatering.options.map(({ optionKey, text, isDefault }) => ({ optionKey, text, isDefault })),
    DB_STUB_OPTIONS
  )
  assertNoRuntimeGeneratedQuestionId(yellowWatering)
  assertNoRuntimeGeneratedQuestionId(wiltingWatering)
}

async function testRegisteredQuestionFailsWhenDbRowsAreMissing() {
  await assert.rejects(
    () => loadRegisteredPackageQuestion({
      packageTopic: WATERING_TOPIC,
      repository: buildQuestionRepositoryStub({ includeQuestion: false })
    }),
    /缺少数据库题目定义/
  )
  await assert.rejects(
    () => loadRegisteredPackageQuestion({
      packageTopic: WATERING_TOPIC,
      repository: buildQuestionRepositoryStub({ includeOptions: false })
    }),
    /缺少数据库选项定义/
  )
}

async function testFrontendQuestionKeyOnlyPackageAnswerPayload() {
  const {
    createQuestionAnswerMap,
    buildQuestionAnswerPayload
  } = await import('../../../../src/utils/diagnose-question-answer-payload.js')
  const {
    normalizeQuestions
  } = await import('../../../../src/utils/diagnose-result-normalizer.js')
  const questions = [
    {
      questionKey: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
      packageTopic: WATERING_TOPIC,
      uiVariant: 'care_behavior_timeline',
      renderMode: 'care_behavior_timeline',
      defaultOptionKey: 'care_behavior_timeline',
      options: [
        {
          optionKey: 'care_behavior_timeline',
          text: 'DB mock：养护记录已提供',
          isDefault: true
        }
      ]
    }
  ]
  const answerMap = createQuestionAnswerMap(questions)
  answerMap[WATERING_FREQUENCY_CONTEXT_QUESTION_KEY] = 'care_behavior_timeline'
  const payload = buildQuestionAnswerPayload(
    {
      diagnosisSessionId: 'diag_package_key_only',
      roundId: 'round_1',
      questions,
      questionPackage: { mode: 'yellow_leaf' },
      uiHints: { answerSubmitMode: 'package', questionDisplayMode: 'package' }
    },
    answerMap,
    { questionStack: questions }
  )

  assert.deepEqual(payload.answers, [
    {
      questionKey: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
      optionKey: 'care_behavior_timeline'
    }
  ])

  const normalizedQuestions = normalizeQuestions(questions, { limit: 4 })
  assert.equal(normalizedQuestions[0].questionKey, WATERING_FREQUENCY_CONTEXT_QUESTION_KEY)
  assert.equal(Object.prototype.hasOwnProperty.call(normalizedQuestions[0], 'questionId'), false)
}

function testQuestionRegistryDoesNotOwnCopyOrRouteOutcomeWeights() {
  const registry = readFileSync(
    'cloudfunctions/diagnose-http/app/diagnosis-question-registry.js',
    'utf8'
  )
  assert.doesNotMatch(registry, /outcome-route|outcome-resolver|effectStrength|routeWeight/)
  assert.doesNotMatch(registry, /过去的10天内|养护记录已提供|不确定 \/ 记不清/)
}

testYellowingPackageFrontendResponse()
testModeToQuestionPackageMapping()
testQuestionsAreOnlyPackageQuestionSource()
testPackageAnswerSubmitPayload()
testGenericPackageAnswerSubmitIsTerminalQuestioningPayload()
testYellowingCompletePackageAnswersAreTerminalQuestioningPayload()
testNonPackageFourAnswerSubmitIsNotTerminalQuestioningPayload()
testPackageSubmitTerminalQuestioningRuntimeWiring()
await testSharedWateringQuestionRegistryAcrossPackages()
await testRegisteredQuestionFailsWhenDbRowsAreMissing()
await testFrontendQuestionKeyOnlyPackageAnswerPayload()
testQuestionRegistryDoesNotOwnCopyOrRouteOutcomeWeights()

console.log('question package tests passed')
