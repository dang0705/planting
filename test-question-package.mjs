import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const { buildFrontendDiagnosisResponse } = require('./cloudfunctions/diagnose-http/app/frontend-response.js')
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
  assert.equal(response.uiHints.questionDisplayMode, 'package')
  assert.equal(response.uiHints.answerSubmitMode, 'package')
  assert.equal(response.uiHints.maxQuestionsThisRound, 4)
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
testYellowingPackageFromRouteMode()
testEmptyQuestionsFallsBackToFollowUpsForPackage()
testNormalizeKeepsPackageAndPackageSubmitPayload()
testNonPackageStillReturnsSingleQuestion()
testYellowingSourceWithThreeQuestionsIsNotPackage()
testFollowUpPageSizeAndSubmitPath()
await testPackagePersistenceAllowsAllQuestionOwnership()

console.log('question package tests passed')
