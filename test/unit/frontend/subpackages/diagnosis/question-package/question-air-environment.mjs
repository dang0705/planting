import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, ref } from 'vue'

const source = readFileSync(
  'src/subpackages/diagnosis/question-package/question-air-environment.js',
  'utf8'
)

const airUtils = await import('../../../../../../src/utils/air-environment.js')
const { getQuestionIdentity } =
  await import('../../../../../../src/subpackages/diagnosis/utils/diagnose-question-identity.js')

const validInput = {
  airExchange: { source: 'fresh_air' },
  canopyOpenness: 'open',
  deviceAirflow: { mode: 'none', sources: [], directSources: [], sourceModes: {} }
}

function loadComposable(fetchProfile) {
  const transformed = source
    .replace("import { computed, ref } from 'vue'\n", 'const { computed, ref } = __vue\n')
    .replace(
      "import { fetchUserPlantAirEnvironment, patchUserPlantAirEnvironment } from '@/api/plants-http.js'\n",
      'const { fetchUserPlantAirEnvironment, patchUserPlantAirEnvironment } = __api\n'
    )
    .replace(
      /import \{[\s\S]*?\} from '@\/utils\/air-environment\.js'\n/,
      'const { describeAirEnvironmentInput, isAirEnvironmentAnswerReady, isAirEnvironmentQuestion, isCompleteAirEnvironmentProfile, isSameAirEnvironmentLocationBinding, normalizeAirEnvironmentLocationBinding, sanitizeAirEnvironmentInput } = __airUtils\n'
    )
    .replace(
      "import { getQuestionIdentity as getQuestionId } from '../utils/diagnose-question-identity.js'\n",
      'const getQuestionId = __getQuestionId\n'
    )
    .replaceAll('export ', '')

  return new Function(
    '__vue',
    '__api',
    '__airUtils',
    '__getQuestionId',
    `${transformed}\nreturn { useQuestionAirEnvironment }`
  )(
    { computed, ref },
    {
      fetchUserPlantAirEnvironment: fetchProfile,
      patchUserPlantAirEnvironment: async () => ({ code: 200, data: null })
    },
    airUtils,
    getQuestionIdentity
  ).useQuestionAirEnvironment
}

async function prepare({ savedLocationBinding = {}, currentLocationBinding = {} } = {}) {
  const answers = {}
  const result = ref({ userPlantId: '42' })
  const composable = loadComposable(async () => ({
    code: 200,
    data: {
      input: validInput,
      locationBinding: savedLocationBinding,
      updatedAt: '2026-09-08T00:00:00.000Z'
    }
  }))
  const plantStore = {
    userPlants: [{ id: '42', ...currentLocationBinding }]
  }
  const air = composable({
    result,
    plantStore,
    setQuestionAnswer: (questionId, answer) => {
      answers[questionId] = answer
    }
  })
  const question = { questionKey: 'q_yellow_leaf__air_environment' }
  air.reset([question])
  await Promise.resolve()
  await Promise.resolve()
  return { air, answers, question }
}

{
  const { air, answers, question } = await prepare()
  assert.equal(answers[question.questionKey], 'air_environment_recorded')
  assert.equal(air.isAnswered(question, answers[question.questionKey]), true)
  assert.equal(air.needsConfirmation(question), false)
  assert.equal(air.getSummary(question), '新风换气，有空气流动')
  assert.equal(
    air.freezeForSubmit([question]).snapshotsByQuestionId[question.questionKey].source,
    'saved_profile'
  )
}

{
  const { air, answers, question } = await prepare({
    savedLocationBinding: { careLocationId: 'old', locationKey: 'old-room' },
    currentLocationBinding: { careLocationId: 'new', locationKey: 'new-room' }
  })
  assert.equal(answers[question.questionKey], 'air_environment_recorded')
  assert.equal(air.needsConfirmation(question), true)
  assert.equal(air.isAnswered(question, answers[question.questionKey]), false)
}

console.log(
  'question air-environment saved profile tests passed data_mode=unit_fake test_kind=source_contract_and_state'
)
