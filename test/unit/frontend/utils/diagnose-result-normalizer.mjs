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

console.log('diagnosis result normalizer direct/package tests passed')
