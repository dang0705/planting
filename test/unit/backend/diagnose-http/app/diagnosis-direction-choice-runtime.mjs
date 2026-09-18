import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveDirectionChoiceRoundResult,
  _test: { restorePendingDirectionChoiceRoute }
} = require('../../../../../cloudfunctions/diagnose-http/app/diagnosis-direction-choice-runtime.js')

// ---------------------------------------------------------------------------
// dispatch-20260726-mode-outcome-runtime-recovery-zcode
// 回归测试：具体虫害方向选择提交不再 501，保持具体虫害身份。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Case 1: 单一 aphid=0.95 (model-direct, direct tier) 方向选择提交
// 修复前：aphid 不是 PEST_CATEGORY，buildStaticModeDirectionResult 返回 null，
// requiresAiInitialAssessment=true 误入 AI 分支或抛 501。
// 修复后：PEST_MODE_KEYS.includes('aphid') 命中，路由至 buildPestModeDirectionResult，
// direct tier 提升 >=0.95 候选为 direct_match，输出具体 aphid outcome + finalize。
// ---------------------------------------------------------------------------
const aphidDirectRoute = {
  nextAction: 'choose_direction',
  routePrimaryAction: 'choose_direction',
  directMatches: [],
  confirmationCandidates: [{ modeKey: 'aphid' }],
  associatedModes: ['aphid'],
  directionChoices: [
    {
      modeKey: 'aphid',
      directionKey: 'aphid',
      familyKey: 'pest',
      category: 'pest',
      problemKey: 'aphid',
      userDisplayName: '成群小软虫（蚜虫）',
      pestModeKeys: ['aphid'],
      directModeKeys: [],
      confirmationModeKeys: ['aphid']
    }
  ],
  confidenceTier: 'direct',
  questionBudget: 0,
  normalizedModeCandidates: [{ modeKey: 'aphid', confidence: 0.95 }]
}

const aphidDirectResult = await resolveDirectionChoiceRoundResult({
  payload: { selectedModeKey: 'aphid' },
  openid: 'test_openid',
  sessionId: 'sess_aphid_direct',
  round: 2,
  refreshedSessionState: {
    visualAggregateResult: { diagnosis_mode_route_result: aphidDirectRoute }
  },
  sessionState: {}
})

assert.equal(
  aphidDirectResult.routePrimaryAction,
  'finalize',
  'Case 1: aphid=0.95 直判方向选择应走 finalize，不抛 501'
)
assert.equal(
  aphidDirectResult.selectedModeKey,
  'aphid',
  'Case 1: selectedModeKey 应保持具体 aphid 身份，不回退为 pest 大类'
)
assert.ok(
  aphidDirectResult.visibleOutcomes.length > 0,
  'Case 1: 应有 visibleOutcomes'
)
assert.equal(
  aphidDirectResult.visibleOutcomes[0].outcomeKey,
  'aphid',
  'Case 1: visibleOutcomes 应是具体 aphid outcome'
)
assert.equal(
  aphidDirectResult.finalResult.confidenceLevel,
  'high',
  'Case 1: aphid=0.95 模型直判 confidenceLevel 应为 high'
)
assert.doesNotMatch(
  aphidDirectResult.visibleOutcomes[0].displayNameCn,
  /可能是/,
  'Case 1: aphid=0.95 直判文案不带"可能是"前缀'
)

// ---------------------------------------------------------------------------
// Case 2: 单一虫害 + 黄叶方向（cross-family choose_direction）
// aphid=0.75 (medium tier) + yellow_leaf 方向选择提交 aphid。
// 修复后：PEST_MODE_KEYS.includes('aphid') 命中 buildPestModeDirectionResult，
// medium tier 不提升为 direct，走 question_package 确认题，保持具体 aphid 身份。
// ---------------------------------------------------------------------------
const aphidMediumRoute = {
  nextAction: 'choose_direction',
  routePrimaryAction: 'choose_direction',
  directMatches: [],
  confirmationCandidates: [{ modeKey: 'aphid' }],
  associatedModes: ['aphid', 'yellow_leaf'],
  directionChoices: [
    {
      modeKey: 'aphid',
      directionKey: 'aphid',
      familyKey: 'pest',
      category: 'pest',
      problemKey: 'aphid',
      userDisplayName: '成群小软虫（蚜虫）',
      pestModeKeys: ['aphid'],
      directModeKeys: [],
      confirmationModeKeys: ['aphid']
    },
    {
      modeKey: 'yellow_leaf',
      directionKey: 'yellow_leaf',
      familyKey: 'general',
      category: 'general',
      problemKey: 'yellow_leaf',
      userDisplayName: '叶片发黄'
    }
  ],
  confidenceTier: 'medium',
  questionBudget: 2,
  normalizedModeCandidates: [{ modeKey: 'aphid', confidence: 0.75 }]
}

const aphidMediumResult = await resolveDirectionChoiceRoundResult({
  payload: { selectedModeKey: 'aphid' },
  openid: 'test_openid',
  sessionId: 'sess_aphid_medium',
  round: 2,
  refreshedSessionState: {
    visualAggregateResult: { diagnosis_mode_route_result: aphidMediumRoute }
  },
  sessionState: {}
})

assert.equal(
  aphidMediumResult.routePrimaryAction,
  'question_package',
  'Case 2: aphid=0.75 medium tier 应走 question_package 确认题，不伪造直结论'
)
assert.equal(
  aphidMediumResult.selectedModeKey,
  'aphid',
  'Case 2: selectedModeKey 应保持具体 aphid 身份'
)
assert.ok(
  aphidMediumResult.questions.length > 0,
  'Case 2: medium tier 应有确认问题'
)
assert.ok(
  aphidMediumResult.questionPackage.questionCount > 0,
  'Case 2: questionPackage.questionCount 应 > 0'
)

// ---------------------------------------------------------------------------
// Case 3: 多虫害 pest 聚合入口兼容
// aphid=0.96 + spider_mite=0.95 都模型直判，directionChoice 聚合为 pest 大类。
// 提交 selectedModeKey='pest' 应走 buildPestModeDirectionResult，输出两个具体 outcome。
// ---------------------------------------------------------------------------
const multiPestRoute = {
  nextAction: 'choose_direction',
  routePrimaryAction: 'choose_direction',
  directMatches: [],
  confirmationCandidates: [{ modeKey: 'aphid' }, { modeKey: 'spider_mite' }],
  associatedModes: ['aphid', 'spider_mite'],
  directionChoices: [
    {
      modeKey: 'pest',
      directionKey: 'pest',
      familyKey: 'pest',
      category: 'pest',
      problemKey: 'pest',
      userDisplayName: '虫害',
      pestModeKeys: ['aphid', 'spider_mite'],
      directModeKeys: [],
      confirmationModeKeys: ['aphid', 'spider_mite']
    }
  ],
  confidenceTier: 'direct',
  questionBudget: 0,
  normalizedModeCandidates: [
    { modeKey: 'aphid', confidence: 0.96 },
    { modeKey: 'spider_mite', confidence: 0.95 }
  ]
}

const multiPestResult = await resolveDirectionChoiceRoundResult({
  payload: { selectedModeKey: 'pest' },
  openid: 'test_openid',
  sessionId: 'sess_multi_pest',
  round: 2,
  refreshedSessionState: {
    visualAggregateResult: { diagnosis_mode_route_result: multiPestRoute }
  },
  sessionState: {}
})

assert.equal(
  multiPestResult.routePrimaryAction,
  'finalize',
  'Case 3: 多虫害 pest 聚合应走 finalize'
)
assert.equal(
  multiPestResult.selectedModeKey,
  'pest',
  'Case 3: 多虫害 selectedModeKey 应为 pest 聚合入口'
)
assert.equal(
  multiPestResult.visibleOutcomes.length,
  2,
  'Case 3: 多虫害应输出 2 个具体 visibleOutcomes'
)
assert.ok(
  multiPestResult.visibleOutcomes.some(item => item.outcomeKey === 'aphid') &&
    multiPestResult.visibleOutcomes.some(item => item.outcomeKey === 'spider_mite'),
  'Case 3: visibleOutcomes 应含 aphid 和 spider_mite 两个具体 outcome'
)

// 会话快照明确仍在等待方向选择时，不能被重新读取到的视觉终态覆盖。
// 仅恢复服务端保存的候选项，终态会话和客户端伪造项仍然保持拒绝。
const directRouteWithPersistedChoice = {
  ...aphidMediumRoute,
  nextAction: 'direct_result',
  routePrimaryAction: 'direct_result'
}
const persistedChoiceState = {
  routePrimaryAction: 'choose_direction',
  directionChoices: aphidMediumRoute.directionChoices
}
const restoredRoute = restorePendingDirectionChoiceRoute({
  routeResult: directRouteWithPersistedChoice,
  fallbackChoices: persistedChoiceState.directionChoices,
  fallbackChoice: persistedChoiceState.directionChoices[1],
  states: [persistedChoiceState]
})
assert.equal(restoredRoute.nextAction, 'choose_direction')
assert.deepEqual(restoredRoute.directionChoices, persistedChoiceState.directionChoices)
assert.equal(
  restorePendingDirectionChoiceRoute({
    routeResult: directRouteWithPersistedChoice,
    fallbackChoices: persistedChoiceState.directionChoices,
    fallbackChoice: persistedChoiceState.directionChoices[1],
    states: [{ routePrimaryAction: 'direct_result' }]
  }).nextAction,
  'direct_result',
  '终态会话不能仅因残留候选项重新开放方向选择'
)
const originalModuleLoad = Module._load
Module._load = function loadStaticQuestionPackageForDirectionChoice(request, parent, isMain) {
  if (request === './static-question-package-start') {
    return {
      buildStaticQuestionPackageStartRoundResult: async ({ sessionId, round }) => ({
        diagnosisSessionId: sessionId,
        roundId: `round_${round}`,
        routePrimaryAction: 'question_package',
        questionRequired: true,
        questions: [{ questionKey: 'q_yellow_leaf', text: '黄叶确认问题' }],
        questionPackage: { mode: 'yellow_leaf', questionCount: 1 }
      })
    }
  }
  return originalModuleLoad.call(this, request, parent, isMain)
}
try {
  const restoredYellowLeafResult = await resolveDirectionChoiceRoundResult({
    payload: { requestMode: 'direction_choice', selectedModeKey: 'yellow_leaf' },
    openid: 'test_openid',
    sessionId: 'sess_persisted_yellow_leaf_choice',
    round: 2,
    refreshedSessionState: {
      ...persistedChoiceState,
      visualAggregateResult: {
        diagnosis_mode_route_result: directRouteWithPersistedChoice
      }
    },
    sessionState: {}
  })
  assert.equal(restoredYellowLeafResult.selectedModeKey, 'yellow_leaf')
  assert.equal(restoredYellowLeafResult.questionRequired, true)
} finally {
  Module._load = originalModuleLoad
}
const restoredChoiceResult = await resolveDirectionChoiceRoundResult({
  payload: { requestMode: 'direction_choice', selectedModeKey: 'aphid' },
  openid: 'test_openid',
  sessionId: 'sess_persisted_direction_choice',
  round: 2,
  refreshedSessionState: {
    ...persistedChoiceState,
    visualAggregateResult: {
      diagnosis_mode_route_result: directRouteWithPersistedChoice
    }
  },
  sessionState: {}
})
assert.equal(
  restoredChoiceResult.routePrimaryAction,
  'question_package',
  '服务端保存的待选择会话应允许继续处理，而不是返回当前会话不需要选择诊断方向'
)

console.log('diagnosis-direction-choice-runtime regression tests passed')
