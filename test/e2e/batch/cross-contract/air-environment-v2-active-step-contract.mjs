import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  activeQuestionMarkerId,
  completeVisibleAirEnvironmentQuestionFlow,
  ordinaryQuestionFallbackOptionId,
  questionKeysFromLanQuestionStart
} from '../../automator/diagnosis/_shared/question-package-active-step.mjs'

const questionKeys = [
  'q_wilting_ordinary_1',
  'q_wilting_ordinary_2',
  'q_wilting_ordinary_3',
  'q_wilting_droop__air_environment',
  'q_wilting_ordinary_5',
  'q_wilting_ordinary_6'
]
const lanStart = {
  response: {
    data: {
      code: 200,
      data: { questions: questionKeys.map(questionKey => ({ questionKey })) }
    }
  }
}
assert.deepEqual(
  questionKeysFromLanQuestionStart(lanStart),
  questionKeys,
  'only the observed LAN question/start response supplies the ordered question keys'
)
assert.deepEqual(questionKeysFromLanQuestionStart({ response: { data: {} } }), [])
assert.equal(
  ordinaryQuestionFallbackOptionId('q_wilting_droop__recent_stress', [
    {
      questionKey: 'q_wilting_droop__recent_stress',
      options: [{ optionKey: 'none_unknown', optionId: 'none_unknown', text: '都没有 / 不确定' }]
    }
  ]),
  'diagnose-question-package-page-option-q_wilting_droop__recent_stress-none_unknown',
  'ordinary-question fallback follows the observed LAN option id instead of assuming unknown'
)

let activeQuestionKey = questionKeys[0]
const interactions = []
const report = { assertions: [] }
const page = {}
const findElementById = async (_page, id) => {
  interactions.push(`query:${id}`)
  if (id === activeQuestionMarkerId(activeQuestionKey)) {
    return { tap: async () => interactions.push(`tap:${id}`) }
  }
  if (id === `diagnose-question-package-page-option-${activeQuestionKey}-unknown`) {
    return { tap: async () => interactions.push(`tap:${id}`) }
  }
  if (id === 'diagnose-question-package-page-next-button') {
    return {
      tap: async () => {
        interactions.push(`tap:${id}`)
        activeQuestionKey = questionKeys[questionKeys.indexOf(activeQuestionKey) + 1] || ''
      }
    }
  }
  if (
    activeQuestionKey === 'q_wilting_droop__air_environment' &&
    id.startsWith('diagnose-air-environment-q_wilting_droop__air_environment-')
  ) {
    return { tap: async () => interactions.push(`tap:${id}`) }
  }
  return null
}

assert.equal(
  await completeVisibleAirEnvironmentQuestionFlow({
    page,
    questionKeys,
    airQuestionKey: questionKeys[3],
    report,
    findElementById,
    controls: [
      [
        'diagnose-air-environment-q_wilting_droop__air_environment-exchange-source-fresh_air',
        'fresh'
      ],
      [
        'diagnose-air-environment-q_wilting_droop__air_environment-next-step',
        'open local-airflow step'
      ],
      ['diagnose-air-environment-q_wilting_droop__air_environment-canopy-open', 'open'],
      [
        'diagnose-air-environment-q_wilting_droop__air_environment-device-mode-has-airflow',
        'device-airflow'
      ],
      ['diagnose-air-environment-q_wilting_droop__air_environment-device-mode-direct', 'direct'],
      [
        'diagnose-air-environment-q_wilting_droop__air_environment-device-source-fresh_air',
        'fresh-air'
      ],
      ['diagnose-question-package-page-next-button', 'advance air question']
    ]
  }),
  true
)
const ordinaryNextTapIndexes = interactions
  .map((interaction, index) => ({ interaction, index }))
  .filter(({ interaction }) => interaction === 'tap:diagnose-question-package-page-next-button')
  .map(({ index }) => index)
const airMarkerQueryIndex = interactions.indexOf(`query:${activeQuestionMarkerId(questionKeys[3])}`)
assert.ok(
  airMarkerQueryIndex > ordinaryNextTapIndexes[2],
  'the air question is only located through its public active marker after three normal question clicks'
)
assert.equal(
  report.assertions.every(assertion => assertion.passed),
  true
)

const leafSource = readFileSync(
  'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs',
  'utf8'
)
assert.doesNotMatch(
  leafSource,
  /waitForQuestionPackageStep|activeQuestionIndex|currentQuestion|\.data\(\)/
)
assert.match(leafSource, /questionKeysFromLanQuestionStart\(questionStart\)/)
assert.match(leafSource, /recordLanRequestEvidence\(\{/)
assert.match(leafSource, /移出直吹区/)

const sessionBoundarySource = readFileSync(
  'test/e2e/automator/diagnosis/_shared/automator-session-boundary.mjs',
  'utf8'
)
assert.match(sessionBoundarySource, /airEnvironmentByQuestionId/)
assert.match(sessionBoundarySource, /deviceAirflow\?\.mode === 'direct'/)

console.log('air-environment v2 active-step cross-contract passed')
