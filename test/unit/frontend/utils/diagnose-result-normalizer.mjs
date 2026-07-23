import assert from 'node:assert/strict'
import { normalizeDiagnosisResult } from '../../../../src/utils/diagnose-result-normalizer.js'

const SINGLE_QUESTION_COUNT = 1

const directResult = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_direct_visual',
  stage: 'final',
  status: 'completed',
  questionRequired: false,
  routePrimaryAction: 'finalize',
  visibleOutcomes: [{ outcomeKey: 'thrips', displayNameCn: '可能是蓟马' }],
  directionChoices: [{ modeKey: 'pest', userDisplayName: '继续细分虫害方向' }],
  candidateRefinementAvailable: true,
  questions: [{ questionKey: 'stale_question', text: '不应继续显示' }],
  questionPackage: {
    mode: 'specific_pest_visual',
    questionCount: 2,
    answerSubmitMode: 'package'
  },
  uiHints: {
    answerSubmitMode: 'package',
    maxQuestionsThisRound: 2
  }
})

assert.deepEqual(directResult.questions, [])
assert.equal(directResult.questionPackage, undefined)
assert.equal(directResult.hasActiveQuestions, false)
assert.deepEqual(directResult.directionChoices, [])
assert.equal(directResult.candidateRefinementAvailable, false)

const multiOutcomeDirectResult = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_direct_visual_multi',
  stage: 'final',
  status: 'completed',
  questionRequired: false,
  routePrimaryAction: 'finalize',
  visibleOutcomes: [
    { outcomeKey: 'spider_mite', displayNameCn: '红蜘蛛（叶螨）' },
    { outcomeKey: 'thrips', displayNameCn: '可能是蓟马' }
  ],
  directionChoices: [{ modeKey: 'pest', userDisplayName: '继续细分虫害方向' }],
  candidateRefinementAvailable: true
})

assert.deepEqual(
  multiOutcomeDirectResult.directionChoices.map(item => item.modeKey),
  ['pest']
)
assert.equal(multiOutcomeDirectResult.candidateRefinementAvailable, true)

const activePackage = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_question_package',
  stage: 'question_package',
  status: 'active',
  questionRequired: true,
  questions: [{ questionKey: 'q_one', text: '需要回答的问题' }],
  questionPackage: {
    mode: 'specific_pest_visual',
    questionCount: 1,
    answerSubmitMode: 'package',
    questionDisplayMode: 'package'
  },
  uiHints: {
    answerSubmitMode: 'package',
    maxQuestionsThisRound: 1
  }
})

assert.equal(activePackage.questions.length, SINGLE_QUESTION_COUNT)
assert.equal(activePackage.questionPackage.questionCount, SINGLE_QUESTION_COUNT)
assert.equal(activePackage.hasActiveQuestions, true)

// Fix 1: 0.90-<0.95 很像结果的可选追问问题不能被 directVisualResult early return 清空。
// directVisualResult 为 true 且 optionalFollowUp 为 true 时，questions、hasActiveQuestions、
// uiHints.optionalFollowUp/likelyResult 都必须保留。
const optionalFollowUpDirectResult = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_optional_followup',
  stage: 'final',
  status: 'completed',
  questionRequired: false,
  routePrimaryAction: 'direct_result',
  visibleOutcomes: [{ outcomeKey: 'spider_mite', displayNameCn: '红蜘蛛（叶螨）' }],
  questions: [{ questionKey: 'q_optional', text: '可选排查问题' }],
  questionPackage: {
    mode: 'specific_pest_visual',
    questionCount: 1,
    answerSubmitMode: 'package',
    optionalFollowUp: true,
    likelyResult: true
  },
  uiHints: {
    answerSubmitMode: 'package',
    maxQuestionsThisRound: 1,
    optionalFollowUp: true,
    likelyResult: true
  }
})

assert.equal(
  optionalFollowUpDirectResult.questions.length,
  SINGLE_QUESTION_COUNT,
  'optionalFollowUp 下 questions 不应被 directVisualResult 清空'
)
assert.equal(
  optionalFollowUpDirectResult.hasActiveQuestions,
  true,
  'optionalFollowUp 下 hasActiveQuestions 应为 true'
)
assert.equal(
  optionalFollowUpDirectResult.uiHints.optionalFollowUp,
  true,
  'uiHints.optionalFollowUp 应保留'
)
assert.equal(
  optionalFollowUpDirectResult.uiHints.likelyResult,
  true,
  'uiHints.likelyResult 应保留'
)

// optionalFollowUp 仅在 questionPackage 上设置时也应保留 questions。
const optionalFollowUpFromPackageOnly = normalizeDiagnosisResult({
  diagnosisSessionId: 'diag_optional_followup_pkg',
  stage: 'final',
  status: 'completed',
  questionRequired: false,
  routePrimaryAction: 'direct_result',
  visibleOutcomes: [{ outcomeKey: 'aphid', displayNameCn: '蚜虫' }],
  questions: [{ questionKey: 'q_optional_pkg', text: '可选排查问题' }],
  questionPackage: {
    mode: 'specific_pest_visual',
    questionCount: 1,
    answerSubmitMode: 'package',
    optionalFollowUp: true
  },
  uiHints: {
    answerSubmitMode: 'package',
    maxQuestionsThisRound: 1
  }
})

assert.equal(
  optionalFollowUpFromPackageOnly.questions.length,
  SINGLE_QUESTION_COUNT,
  'questionPackage.optionalFollowUp 也应阻止 questions 被清空'
)
assert.equal(optionalFollowUpFromPackageOnly.hasActiveQuestions, true)
assert.equal(optionalFollowUpFromPackageOnly.uiHints.optionalFollowUp, true)

console.log('diagnosis result normalizer direct/package tests passed')
