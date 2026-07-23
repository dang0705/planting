import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const submitSource = readFileSync('src/pages/diagnose/question-package/question-submit.js', 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(
    'export async function submitQuestionPackageAnswers',
    'async function submitQuestionPackageAnswers'
  )

const calls = {
  build: [],
  mutate: [],
  reset: [],
  history: [],
  toast: []
}
const buildQuestionAnswerPayload = (result, answers, options) => {
  calls.build.push({ result, answers, options })
  return {
    requestMode: options.requestMode,
    questionPackage: result.questionPackage,
    answers: options.questionStack.map(question => ({
      questionKey: question.questionKey,
      optionKey: answers[question.questionKey]
    }))
  }
}
const normalizeDiagnosisResult = value => value
const preserveDiagnosisContinuationContext = (nextResult, previousResult) => ({
  ...nextResult,
  plantId: nextResult.plantId || previousResult.plantId || ''
})
const { submitQuestionPackageAnswers } = new Function(
  'buildQuestionAnswerPayload',
  'normalizeDiagnosisResult',
  'preserveDiagnosisContinuationContext',
  `${submitSource}\nreturn { submitQuestionPackageAnswers }`
)(buildQuestionAnswerPayload, normalizeDiagnosisResult, preserveDiagnosisContinuationContext)

globalThis.uni = {
  showToast: payload => calls.toast.push(payload)
}

async function runPackageSubmit(questionStack, { retake = false } = {}) {
  const currentResult = {
    diagnosisSessionId: 'session_dynamic_pest',
    roundId: 'round_1',
    plantId: 'plant_42',
    questionPackage: {
      mode: 'specific_pest_visual',
      answerSubmitMode: 'package',
      questionCount: questionStack.length,
      candidateModes: ['thrips', 'spider_mite'],
      hiddenPrefilledEvidence: [{ evidenceKey: 'silver_streaks', diagnosisMode: 'thrips' }]
    }
  }
  const questionAnswers = Object.fromEntries(
    questionStack.map(question => [question.questionKey, question.options[0].optionKey])
  )
  const result = { value: currentResult }
  await submitQuestionPackageAnswers({
    result,
    images: ['cloud://pest.jpg'],
    plantName: '绿萝',
    questionAnswers,
    questionStack,
    currentQuestion: questionStack[0],
    isQuestionPackageMode: true,
    careBehaviorTimelineByQuestionId: {},
    lightEnvironmentByQuestionId: {},
    environmentWeatherWindow: null,
    diagnosisAnswerMutation: {
      mutateAsync: async payload => {
        calls.mutate.push(payload)
        return {
          diagnosisSessionId: 'session_dynamic_pest',
          questions: [],
          hasActiveQuestions: false,
          ...(retake
            ? {
                retakeRequest: {
                  status: 'needs_confirmation',
                  requestedCaptureRegion: 'leaf_lower_surface'
                }
              }
            : {})
        }
      }
    },
    diagnoseStore: { addToHistory: payload => calls.history.push(payload) },
    resetQuestionState: questions => calls.reset.push(questions)
  })
  return { currentResult, questionAnswers, result }
}

const thripsQuestion = {
  questionKey: 'q_specific_pest__thrips_black_spots',
  options: [{ optionKey: 'thrips_black_spots_yes' }]
}
await runPackageSubmit([thripsQuestion])
assert.equal(calls.build[0].options.requestMode, 'answer_submit')
assert.equal(calls.build[0].options.questionStack.length, 1)
assert.deepEqual(calls.mutate[0].answers, [
  {
    questionKey: 'q_specific_pest__thrips_black_spots',
    optionKey: 'thrips_black_spots_yes'
  }
])
assert.deepEqual(calls.mutate[0].questionPackage.candidateModes, ['thrips', 'spider_mite'])
assert.equal(
  calls.mutate[0].questionPackage.hiddenPrefilledEvidence[0].evidenceKey,
  'silver_streaks'
)

const secondQuestion = {
  questionKey: 'q_specific_pest__spider_mite_webbing',
  options: [{ optionKey: 'spider_mite_webbing_yes' }]
}
await runPackageSubmit([thripsQuestion, secondQuestion])
assert.equal(calls.build[1].options.requestMode, 'answer_submit')
assert.equal(calls.build[1].options.questionStack.length, 2)
assert.equal(calls.mutate[1].answers.length, 2)

const retakeSubmit = await runPackageSubmit([thripsQuestion], { retake: true })
assert.equal(retakeSubmit.result.value.plantId, 'plant_42')
assert.equal(retakeSubmit.result.value.retakeRequest.status, 'needs_confirmation')
assert.equal(calls.toast.at(-1).title, '请按提示完成补拍')

const pageFlowSource = readFileSync('src/pages/diagnose/question-package/question-flow.js', 'utf8')
const packagePageSource = readFileSync('src/pages/diagnose/question-package.vue', 'utf8')
const pageContextSource = readFileSync(
  'src/pages/diagnose/question-package/page-context.js',
  'utf8'
)
assert.match(pageFlowSource, /computed\(\(\) => isPackageResult\(result\.value\)\)/)
assert.doesNotMatch(
  pageFlowSource,
  /isPackageResult\(result\.value\) && questionStack\.value\.length > 1/
)
assert.match(pageContextSource, /specific_pest_visual/)
assert.match(pageContextSource, /虫害细节确认/)
assert.match(packagePageSource, /@skip="option => skipQuestionRisk\(question, option\)"/)
assert.match(
  pageFlowSource,
  /selectQuestionOption\(question, option\)\s+await handleNextQuestion\(\)/
)

console.log('question package submit tests passed')
