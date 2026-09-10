import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildMinimalPlantContext,
  buildStaticQuestionPackageStartRoundResult
} = require('../../../../../cloudfunctions/diagnose-http/app/static-question-package-start.js')
const {
  getContextRequiredProblemGuard
} = require('../../../../../cloudfunctions/diagnose-http/utils/context-required-problem-guard.js')
const {
  isDisabledYellowingFlowQuestion
} = require('../../../../../cloudfunctions/diagnose-http/utils/yellowing-question-policy.js')

const LIGHT_QUESTION_KEY = 'q_observed_probe__leaf_yellowing__light_change_context'
const REMOVED_LIGHT_QUESTION_KEY = 'q_leaf_yellowing_light_background'
const EXPECTED_LIGHT_QUESTION_COUNT = 1
const FIRST_LIGHT_QUESTION_INDEX = 0

assert.equal(
  buildMinimalPlantContext({ plantId: 'diagnose_tab_anonymous' }).plantId,
  null,
  'anonymous question start must normalize the legacy synthetic plant id to null'
)
assert.equal(
  buildMinimalPlantContext({}).plantId,
  null,
  'anonymous question start must not persist a synthetic plant catalog foreign key'
)

async function buildYellowingStartResult() {
  const wateringQuestionKey = 'q_observed_probe__leaf_yellowing__watering_frequency_context'
  return buildStaticQuestionPackageStartRoundResult({
    sessionId: 'diag_yellowing_light_test',
    option: {
      classKey: 'yellowing_mode',
      classNameCn: '黄叶模式',
      symptomKey: 'uniform_yellowing',
      symptomCn: '整叶黄化'
    },
    plantContext: { plantId: 'plant_catalog_test' },
    round: 1,
    repository: {
      async getQuestionsByKeys(questionKeys = []) {
        return questionKeys.includes(wateringQuestionKey)
          ? [
              {
                questionKey: wateringQuestionKey,
                questionTextUserCn: '浇水记录',
                questionTextCn: '浇水记录',
                questionType: 'single_choice',
                targetSymptomKey: 'leaf_yellowing',
                helpTextCn: '记录最近浇水情况。'
              }
            ]
          : []
      },
      async getQuestionOptionMappings(questionKeys = []) {
        return questionKeys.includes(wateringQuestionKey)
          ? [
              {
                questionKey: wateringQuestionKey,
                optionKey: 'unknown',
                optionTextUserCn: '不确定',
                optionTextCn: '不确定'
              }
            ]
          : []
      }
    }
  })
}

const startResult = await buildYellowingStartResult()
const lightQuestions = startResult.questions.filter(
  item => item.packageTopic === 'light_change_context'
)

assert.equal(
  startResult.questions.some(item => item.questionKey === REMOVED_LIGHT_QUESTION_KEY),
  false,
  '黄叶题包不得再返回旧光照问题'
)
assert.equal(lightQuestions.length, EXPECTED_LIGHT_QUESTION_COUNT, '黄叶固定题包只能保留一个光照题')
assert.equal(lightQuestions[FIRST_LIGHT_QUESTION_INDEX].questionKey, LIGHT_QUESTION_KEY)
assert.deepEqual(
  lightQuestions[FIRST_LIGHT_QUESTION_INDEX].options.map(item => item.optionKey),
  ['stronger_direct_light', 'no_clear_change', 'weaker_light', 'unknown']
)
assert.equal(
  isDisabledYellowingFlowQuestion({ questionKey: REMOVED_LIGHT_QUESTION_KEY }),
  true,
  '旧光照问题必须从黄叶流程中禁用'
)

for (const problemKey of ['low_light', 'sunburn']) {
  const guard = getContextRequiredProblemGuard(problemKey)
  assert.equal(guard.preferredQuestionKeys.includes(LIGHT_QUESTION_KEY), true)
  assert.equal(guard.preferredQuestionKeys.includes(REMOVED_LIGHT_QUESTION_KEY), false)
}
