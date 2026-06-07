import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerRuntime
} = require('./cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js')
const {
  buildPackageAnswerRuntimeState
} = require('./cloudfunctions/diagnose-http/app/answer-runtime-state.js')

const questionPackageSnapshot = {
  mode: 'yellow_leaf',
  answerSubmitMode: 'package',
  packageQuestions: [
    {
      questionKey: 'q_package_1',
      questionGroupKey: 'care_water',
      targetDimension: 'watering_frequency',
      targetSymptomKey: 'leaf_yellowing',
      questionText: '浇水频率如何？'
    },
    {
      questionKey: 'q_package_2',
      questionGroupKey: 'care_light',
      targetDimension: 'light_change',
      targetSymptomKey: 'leaf_yellowing',
      questionText: '光照是否变化？'
    }
  ]
}
const answers = [
  { questionKey: 'q_package_1', optionKey: 'normal' },
  { questionKey: 'q_package_2', optionKey: 'unknown' }
]

const resolvedSnapshot = resolveQuestionPackageSnapshot({
  runtimeSnapshot: {
    questionPackageSnapshot
  }
})
assert.equal(resolvedSnapshot.packageQuestions.length, 2)

const ownership = resolvePackageAnswerOwnership({
  questionPackageSnapshot: resolvedSnapshot,
  answers
})
assert.equal(ownership.ok, true)
assert.deepEqual(ownership.invalidQuestionKeys, [])

const invalidOwnership = resolvePackageAnswerOwnership({
  questionPackageSnapshot: resolvedSnapshot,
  answers: [{ questionKey: 'outside_package', optionKey: 'yes' }]
})
assert.equal(invalidOwnership.ok, false)
assert.deepEqual(invalidOwnership.invalidQuestionKeys, ['outside_package'])

const packageRuntime = buildPackageAnswerRuntime({
  questionPackageSnapshot: resolvedSnapshot,
  answers,
  optionMappings: [
    { questionKey: 'q_package_1', optionKey: 'normal', value: 1, associationStrength: 0.8 },
    {
      questionKey: 'q_package_2',
      optionKey: 'unknown',
      value: 0,
      associationStrength: 0,
      text: '不确定'
    }
  ]
})
assert.deepEqual(
  packageRuntime.updatedAnswers.map(item => ({
    questionKey: item.questionKey,
    optionKey: item.optionKey,
    status: item.status,
    questionGroupKey: item.questionGroupKey
  })),
  [
    {
      questionKey: 'q_package_1',
      optionKey: 'normal',
      status: 'confirmed',
      questionGroupKey: 'care_water'
    },
    {
      questionKey: 'q_package_2',
      optionKey: 'unknown',
      status: 'skipped',
      questionGroupKey: 'care_light'
    }
  ]
)
assert.equal(packageRuntime.askedQuestionRows.length, 2)
const packageRuntimeState = buildPackageAnswerRuntimeState({
  questionPackageSnapshot: resolvedSnapshot,
  answers,
  optionMappings: [
    { questionKey: 'q_package_1', optionKey: 'normal', value: 1, associationStrength: 0.8 },
    {
      questionKey: 'q_package_2',
      optionKey: 'unknown',
      value: 0,
      associationStrength: 0,
      text: '不确定'
    }
  ]
})
assert.deepEqual(packageRuntimeState.runtimeAnswers, answers)
assert.deepEqual(packageRuntimeState.runtimeUnknownCountByGroup, {
  care_water: 0,
  care_light: 1
})

Module._load = originalLoad

console.log('package answer ownership runtime tests passed')
