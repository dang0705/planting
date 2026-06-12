import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getQuestionPackageByMode,
  isQuestionPackageAnswerSubmitPayload
} = require('../../cloudfunctions/diagnose-http/app/question-package-response.js')
const {
  buildStaticQuestionPackageStartRoundResult
} = require('../../cloudfunctions/diagnose-http/app/static-question-package-start.js')
const {
  resolveWiltingDroopOutcomeResult
} = require('../../cloudfunctions/diagnose-http/domain/wilting-droop-outcome-resolver.js')
const {
  buildFrontendAnswerResponse
} = require('../../cloudfunctions/diagnose-http/app/frontend-response.js')

function buildAnswers(optionKeys = []) {
  const questionKeys = [
    'q_wilting_droop__watering_frequency_context',
    'q_wilting_droop__shape',
    'q_wilting_droop__rhythm_environment',
    'q_wilting_droop__recent_stress',
    'q_wilting_droop__high_risk'
  ]
  return questionKeys.map((questionKey, index) => ({
    questionKey,
    optionKey: optionKeys[index] || 'none_unknown'
  }))
}

function resolveCase(optionKeys) {
  const questionPackage = getQuestionPackageByMode('wilting_droop')
  return resolveWiltingDroopOutcomeResult({
    sessionId: 'diag_wilting_test',
    round: 2,
    answers: buildAnswers(optionKeys),
    questionPackage,
    plantContext: { plantId: 'plant_catalog_1', userPlantId: 'user_plant_1' }
  })
}

function outcomeNames(result) {
  return (result.visibleOutcomes || []).map(item => item.displayNameCn)
}

function allResultText(result) {
  return JSON.stringify(result)
}

function assertNoPriorityFields(result) {
  const forbiddenKeys = [
    'rank',
    'score',
    'confidence',
    'probability',
    'mainCause',
    'main_cause'
  ]
  const visit = value => {
    if (!value || typeof value !== 'object') {
      return
    }
    for (const [key, child] of Object.entries(value)) {
      assert.equal(
        forbiddenKeys.some(forbidden => key.toLowerCase().includes(forbidden.toLowerCase())),
        false,
        `forbidden priority field: ${key}`
      )
      visit(child)
    }
  }
  visit(result.visibleOutcomes)
  assert.doesNotMatch(allResultText(result), /最可能原因|概率排序|主因排序|probability/i)
}

function testPackageConfigAndStart() {
  const questionPackage = getQuestionPackageByMode('wilt_droop')
  assert.equal(questionPackage.mode, 'wilting_droop')
  assert.equal(questionPackage.route, 'wilting_droop')
  assert.equal(questionPackage.questionCount, 5)
  assert.deepEqual(questionPackage.outcomePolicy, {
    allowMultipleOutcomes: true,
    preferSingleOutcome: false
  })

  const startResult = buildStaticQuestionPackageStartRoundResult({
    sessionId: 'diag_start',
    option: {
      classKey: 'wilting_droop_mode',
      classNameCn: '枯萎 / 发蔫模式',
      symptomKey: 'wilting_droop',
      symptomCn: '枯萎 / 发蔫'
    },
    plantContext: { plantId: 'plant_catalog_1' },
    round: 1
  })
  assert.equal(startResult.questionPackage.mode, 'wilting_droop')
  assert.equal(startResult.questions.length, 5)
  assert.equal(startResult.questions[0].uiVariant, 'care_behavior_timeline')
  assert.equal(startResult.questions[0].packageTopic, 'watering_frequency_context')

  assert.equal(
    isQuestionPackageAnswerSubmitPayload({
      payload: {
        requestMode: 'answer_submit',
        questionPackage,
        uiHints: { answerSubmitMode: 'package', questionDisplayMode: 'package' }
      },
      answers: buildAnswers([
        'often_dry',
        'whole_plant_droop',
        'daytime_recovers',
        'none_unknown',
        'none_unknown'
      ]),
      requestMode: 'answer_submit'
    }),
    true
  )
}

function testDryWaterAndHeatPressure() {
  const result = resolveCase([
    'often_dry',
    'whole_plant_droop',
    'daytime_recovers',
    'none_unknown',
    'none_unknown'
  ])
  const names = outcomeNames(result)
  assert.ok(names.includes('缺水处理'))
  assert.ok(names.includes('降低蒸腾压力'))
  assert.ok(names.includes('全株水分压力'))
  assert.equal(result.visibleOutcomes.length >= 3, true)
  assertNoPriorityFields(result)
}

function testWetAndRootRotBlocksWatering() {
  const result = resolveCase([
    'often_wet',
    'whole_plant_droop',
    'all_day_wilt',
    'none_unknown',
    'black_soft_collapsed_stem_base'
  ])
  const text = allResultText(result)
  assert.ok(outcomeNames(result).includes('停浇查根和排水'))
  assert.ok(result.blockedActionExplanations.some(item => item.actionText === '补足浇水'))
  assert.doesNotMatch(text, /沿盆土缓慢补水/)
  assert.match(result.highRiskWarning, /高危信号/)
  assertNoPriorityFields(result)
}

function testReasonableWaterAirflowAndRepotRecovery() {
  const result = resolveCase([
    'normal_or_stable',
    'unknown',
    'ac_heater_fan_direct',
    'repot_divide_root_prune_soil_change',
    'none_unknown'
  ])
  const names = outcomeNames(result)
  assert.ok(names.includes('水分基本合理'))
  assert.ok(names.includes('移出直吹区'))
  assert.ok(names.includes('换盆后缓苗'))
  for (const actionText of ['立即施肥', '再次换盆', '暴晒']) {
    assert.ok(result.blockedActionExplanations.some(item => item.actionText === actionText))
  }
  assertNoPriorityFields(result)
}

function testLocalWiltAndPestOutcomes() {
  const result = resolveCase([
    'unknown',
    'local_branch_leaf',
    'unknown',
    'none_unknown',
    'pests_webbing_white_fuzz_spots_spreading'
  ])
  const names = outcomeNames(result)
  assert.ok(names.includes('局部检查'))
  assert.ok(names.includes('隔离并进入病虫处理'))
  assertNoPriorityFields(result)
}

function testDryTendencyAndOdorBlocksWaterReplenishment() {
  const result = resolveCase([
    'often_dry',
    'whole_plant_droop',
    'unknown',
    'none_unknown',
    'odor_root_soil_pot_bottom'
  ])
  const text = allResultText(result)
  assert.ok(outcomeNames(result).includes('停浇查根和排水'))
  assert.ok(result.blockedActionExplanations.some(item => item.actionText === '补足浇水'))
  assert.doesNotMatch(text, /沿盆土缓慢补水/)
  assertNoPriorityFields(result)
}

function testFrontendSurfaceFields() {
  const result = resolveCase([
    'often_wet',
    'unknown',
    'unknown',
    'none_unknown',
    'odor_root_soil_pot_bottom'
  ])
  const frontend = buildFrontendAnswerResponse(result)
  assert.equal(frontend.hasActiveQuestions, false)
  assert.ok(frontend.visibleOutcomes.length)
  assert.ok(frontend.blockedActionExplanations.length)
  assert.match(frontend.highRiskWarning, /高危信号/)
  assert.match(frontend.observationPeriod, /24-48/)
  assert.doesNotMatch(allResultText(frontend), /最可能原因/)
}

testPackageConfigAndStart()
testDryWaterAndHeatPressure()
testWetAndRootRotBlocksWatering()
testReasonableWaterAirflowAndRepotRecovery()
testLocalWiltAndPestOutcomes()
testDryTendencyAndOdorBlocksWaterReplenishment()
testFrontendSurfaceFields()

console.log('wilting droop package tests passed')
