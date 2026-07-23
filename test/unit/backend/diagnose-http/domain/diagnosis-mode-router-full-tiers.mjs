import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveDiagnosisModeRoute,
  candidateConfidenceTier,
  maxQuestionsForTier,
  _test
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')
const {
  buildSpecificPestQuestionPackage
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-question-package.js')
const {
  attachLikelyOptionalQuestion
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-visual-orchestrator.js')

function evidence(
  evidenceKey,
  confidenceBand = 'high',
  strengthLevel = 'strong',
  imageId = '',
  captureRegion = ''
) {
  return { evidenceKey, confidenceBand, strengthLevel, imageId, captureRegion }
}

// ---------------------------------------------------------------------------
// 1. 置信度分档工具函数
// ---------------------------------------------------------------------------
assert.equal(candidateConfidenceTier(0.59), 'low')
assert.equal(candidateConfidenceTier(0.60), 'medium')
assert.equal(candidateConfidenceTier(0.79), 'medium')
assert.equal(candidateConfidenceTier(0.80), 'high')
assert.equal(candidateConfidenceTier(0.89), 'high')
assert.equal(candidateConfidenceTier(0.90), 'very_likely')
assert.equal(candidateConfidenceTier(0.94), 'very_likely')
assert.equal(candidateConfidenceTier(0.95), 'direct')
assert.equal(candidateConfidenceTier(0.99), 'direct')

// 分档对应题数：<0.60=3, 0.60-<0.80=2, 0.80-<0.90=1, 0.90-<0.95=1, >=0.95=0
assert.equal(maxQuestionsForTier('low'), 3)
assert.equal(maxQuestionsForTier('medium'), 2)
assert.equal(maxQuestionsForTier('high'), 1)
assert.equal(maxQuestionsForTier('very_likely'), 1)
assert.equal(maxQuestionsForTier('direct'), 0)

// ---------------------------------------------------------------------------
// 2. 单黄叶候选（full profile，低置信度 0.6 进入问诊路径，不 uncertain）
// ---------------------------------------------------------------------------
const singleYellowLow = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('yellow_speckling')],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.6 }]
})
assert.equal(singleYellowLow.nextAction, 'question_package')
assert.deepEqual(singleYellowLow.associatedModes, ['yellow_leaf'])
assert.equal(singleYellowLow.confidenceTier, 'medium')
assert.equal(singleYellowLow.questionBudget, 2)

// ---------------------------------------------------------------------------
// 3. 单虫害候选（full profile，0.7 走问诊包）
// ---------------------------------------------------------------------------
const singlePestMedium = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.7 }]
})
assert.equal(singlePestMedium.nextAction, 'question_package')
assert.deepEqual(singlePestMedium.associatedModes, ['spider_mite'])
assert.equal(singlePestMedium.confidenceTier, 'medium')
assert.equal(singlePestMedium.questionBudget, 2)

// ---------------------------------------------------------------------------
// 4. 单真菌/霉菌候选（powdery_mildew，visual_direct_only）
// 0.85 走"很像"直接结果（very_likely + 非 fixed package + visual_direct_only）
// ---------------------------------------------------------------------------
const singleMoldHigh = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'powdery_mildew', confidence: 0.85 }]
})
assert.equal(singleMoldHigh.nextAction, 'direct_result')
assert.deepEqual(singleMoldHigh.associatedModes, ['powdery_mildew'])
assert.equal(singleMoldHigh.confidenceTier, 'high')
assert.equal(singleMoldHigh.likelyResult, false)

// 0.92 走"很像"直接结果
const singleMoldVeryLikely = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'powdery_mildew', confidence: 0.92 }]
})
assert.equal(singleMoldVeryLikely.nextAction, 'direct_result')
assert.equal(singleMoldVeryLikely.confidenceTier, 'very_likely')
assert.equal(singleMoldVeryLikely.likelyResult, true)

// ---------------------------------------------------------------------------
// 5. confidence 边界：0.95 直接结论（direct，0 题）
// ---------------------------------------------------------------------------
const directConclusionRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.95 }]
})
assert.equal(directConclusionRoute.nextAction, 'direct_result')
assert.equal(directConclusionRoute.confidenceTier, 'direct')
assert.equal(directConclusionRoute.directConclusion, true)
assert.equal(directConclusionRoute.questionBudget, 0)

// ---------------------------------------------------------------------------
// 6. 题数分档：3/2/1/0 题
// ---------------------------------------------------------------------------
// <0.60 候选 + 无证据：full profile 下合法候选无论 confidence 高低都进入路由，
// 走 low tier（最多 3 题），不回退 uncertain。
const lowTierRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.55 }]
})
assert.notEqual(lowTierRoute.nextAction, 'uncertain')
assert.equal(lowTierRoute.nextAction, 'question_package')
assert.deepEqual(lowTierRoute.associatedModes, ['spider_mite'])
assert.equal(lowTierRoute.confidenceTier, 'low')
assert.equal(lowTierRoute.questionBudget, 3)

// yellow_leaf 0.55（非虫害合法候选）同样进入 low tier 问诊路径
const lowTierYellowRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.55 }]
})
assert.notEqual(lowTierYellowRoute.nextAction, 'uncertain')
assert.equal(lowTierYellowRoute.nextAction, 'question_package')
assert.deepEqual(lowTierYellowRoute.associatedModes, ['yellow_leaf'])
assert.equal(lowTierYellowRoute.confidenceTier, 'low')
assert.equal(lowTierYellowRoute.questionBudget, 3)

// 无合法候选（空候选 + 无证据）：仍须 uncertain
const noCandidateRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: []
})
assert.equal(noCandidateRoute.nextAction, 'uncertain')
assert.deepEqual(noCandidateRoute.associatedModes, [])

// 0.60-<0.80：medium，budget=2
assert.equal(singlePestMedium.questionBudget, 2)
// 0.80-<0.90：high，budget=1
assert.equal(singleMoldHigh.questionBudget, 1)
// >=0.95：direct，budget=0
assert.equal(directConclusionRoute.questionBudget, 0)

// ---------------------------------------------------------------------------
// 7. 动态问题包按 confidenceTier 决定 maxQuestions
// ---------------------------------------------------------------------------
const pkgLow = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite'],
  confidenceTier: 'low',
  maxQuestions: 3
})
assert.ok(pkgLow, 'low tier 应生成问题包')
assert.equal(pkgLow.maxQuestions, 3)
assert.equal(pkgLow.confidenceTier, 'low')
assert.ok(pkgLow.questionCount <= 3 && pkgLow.questionCount >= 0)

const pkgMedium = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite'],
  confidenceTier: 'medium',
  maxQuestions: 2
})
assert.equal(pkgMedium.maxQuestions, 2)

const pkgHigh = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite'],
  confidenceTier: 'high',
  maxQuestions: 1
})
assert.equal(pkgHigh.maxQuestions, 1)
assert.ok(pkgHigh.questionCount <= 1)

// direct tier：0 题，问题包为空但仍返回结构
const pkgDirect = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite'],
  confidenceTier: 'direct',
  maxQuestions: 0
})
assert.equal(pkgDirect.maxQuestions, 0)
assert.equal(pkgDirect.questionCount, 0)

// ---------------------------------------------------------------------------
// 8. 公共问题去重：同一 questionKey 只出现一次
// ---------------------------------------------------------------------------
const dedupPkg = buildSpecificPestQuestionPackage({
  candidateModes: ['spider_mite', 'thrips'],
  confidenceTier: 'low',
  maxQuestions: 3
})
const questionKeys = dedupPkg.packageQuestions.map(q => q.questionKey)
const uniqueKeys = Array.from(new Set(questionKeys))
assert.deepEqual(questionKeys, uniqueKeys, '问题 key 不应重复')

// ---------------------------------------------------------------------------
// 9. 有候选无问题时不 uncertain：所有 blueprint 被证据锁定
// 给 spider_mite direct 证据，问题应被全部跳过，但仍输出候选结果。
// 这里验证 router 层：候选有 matchedEvidence 时走 direct_result 而非 uncertain。
// ---------------------------------------------------------------------------
const allEvidenceLockedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('visible_mite_colony', 'high', 'strong', 'img1', 'leaf_underside')],
  visualModeCandidates: [{ mode: 'spider_mite', confidence: 0.7 }]
})
// visible_mite_colony 是 spider_mite 的 direct 证据，应进入 directMatches
assert.ok(
  allEvidenceLockedRoute.directMatches.some(m => m.modeKey === 'spider_mite'),
  'spider_mite 有 direct 证据应进入 directMatches'
)
assert.equal(allEvidenceLockedRoute.nextAction, 'direct_result')

// ---------------------------------------------------------------------------
// 10. 多模式候选（full profile）
// ---------------------------------------------------------------------------
const multiModeRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [
    { mode: 'spider_mite', confidence: 0.7 },
    { mode: 'aphid', confidence: 0.65 }
  ]
})
assert.equal(multiModeRoute.nextAction, 'question_package')
assert.deepEqual(multiModeRoute.associatedModes, ['spider_mite', 'aphid'])

// ---------------------------------------------------------------------------
// 11. 0.90-<0.95 很像结果 + 可选问题：attachLikelyOptionalQuestion
// ---------------------------------------------------------------------------
const baseResolved = {
  routePrimaryAction: 'finalize',
  visibleOutcomes: [
    { outcomeKey: 'spider_mite', displayNameCn: '红蜘蛛（叶螨）', displayName: '红蜘蛛（叶螨）' }
  ],
  finalResult: {
    displayName: '红蜘蛛（叶螨）',
    problemName: '红蜘蛛（叶螨）',
    visibleOutcomes: [{ displayNameCn: '红蜘蛛（叶螨）' }]
  },
  topProblem: { displayName: '红蜘蛛（叶螨）' },
  summaryCard: { title: '虫害方向已确认', subtitle: '已保留方向。' },
  uiHints: {}
}
const likelyResult = attachLikelyOptionalQuestion(baseResolved, {
  candidateModes: ['spider_mite'],
  hiddenPrefilledEvidence: [],
  confidenceTier: 'very_likely',
  questionBudget: 1
})
assert.equal(likelyResult.routePrimaryAction, 'finalize')
assert.equal(likelyResult.hasActiveQuestions, true)
assert.equal(likelyResult.questionRequired, false)
assert.equal(likelyResult.uiHints.optionalFollowUp, true)
assert.equal(likelyResult.uiHints.likelyResult, true)
assert.equal(likelyResult.summaryCard.title, '很像的虫害方向')
// 结论名加"很像"前缀
assert.equal(likelyResult.visibleOutcomes[0].displayNameCn, '很像红蜘蛛（叶螨）')
assert.equal(likelyResult.finalResult.displayName, '很像红蜘蛛（叶螨）')
assert.equal(likelyResult.topProblem.displayName, '很像红蜘蛛（叶螨）')
// 保留 1 个可选问题
assert.equal(likelyResult.questions.length, 1)
assert.equal(likelyResult.questionPackage.optionalFollowUp, true)
assert.equal(likelyResult.questionPackage.likelyResult, true)

// 已有"很像"前缀不重复添加
const alreadyLikely = attachLikelyOptionalQuestion(
  {
    ...baseResolved,
    visibleOutcomes: [{ displayNameCn: '很像红蜘蛛（叶螨）', displayName: '很像红蜘蛛（叶螨）' }]
  },
  { candidateModes: ['spider_mite'], confidenceTier: 'very_likely', questionBudget: 1 }
)
assert.equal(alreadyLikely.visibleOutcomes[0].displayNameCn, '很像红蜘蛛（叶螨）')

// 无可选问题时不挂载（候选 blueprint 全被锁定）
const noOptional = attachLikelyOptionalQuestion(baseResolved, {
  candidateModes: [],
  confidenceTier: 'very_likely',
  questionBudget: 1
})
assert.equal(noOptional.hasActiveQuestions, undefined)

// ---------------------------------------------------------------------------
// 12. isCandidateAdmissible 单元测试
// ---------------------------------------------------------------------------
// full profile: spider_mite 0.6 候选可进入
assert.equal(
  _test.isCandidateAdmissible('spider_mite', 'full', {
    normalizedModeCandidates: [{ modeKey: 'spider_mite', confidence: 0.6 }],
    candidateOnlyModeKeys: ['spider_mite'],
    confirmationEvidenceItems: []
  }),
  true
)
// full profile: yellow_leaf 0.55 合法候选可进入（<0.60 走 low tier，不回退 uncertain）
assert.equal(
  _test.isCandidateAdmissible('yellow_leaf', 'full', {
    normalizedModeCandidates: [{ modeKey: 'yellow_leaf', confidence: 0.55 }],
    candidateOnlyModeKeys: [],
    confirmationEvidenceItems: []
  }),
  true
)
// full profile: spider_mite 0.55 虫害候选同样可进入（<0.60 走 low tier）
assert.equal(
  _test.isCandidateAdmissible('spider_mite', 'full', {
    normalizedModeCandidates: [{ modeKey: 'spider_mite', confidence: 0.55 }],
    candidateOnlyModeKeys: [],
    confirmationEvidenceItems: []
  }),
  true
)
// pest profile: yellow_leaf 候选不进入（非虫害）
assert.equal(
  _test.isCandidateAdmissible('yellow_leaf', 'pest', {
    normalizedModeCandidates: [{ modeKey: 'yellow_leaf', confidence: 0.9 }],
    candidateOnlyModeKeys: ['yellow_leaf'],
    confirmationEvidenceItems: []
  }),
  false
)
// pest profile: spider_mite 单候选 0.6 可进入
assert.equal(
  _test.isCandidateAdmissible('spider_mite', 'pest', {
    normalizedModeCandidates: [{ modeKey: 'spider_mite', confidence: 0.6 }],
    candidateOnlyModeKeys: ['spider_mite'],
    confirmationEvidenceItems: []
  }),
  true
)

// ---------------------------------------------------------------------------
// 13. topCandidateConfidence 单元测试
// ---------------------------------------------------------------------------
assert.equal(
  _test.topCandidateConfidence(
    ['spider_mite', 'aphid'],
    [
      { modeKey: 'spider_mite', confidence: 0.7 },
      { modeKey: 'aphid', confidence: 0.85 }
    ]
  ),
  0.85
)
assert.equal(_test.topCandidateConfidence(['spider_mite'], []), 0)

console.log('diagnosis-mode-router full tiers supplementary tests passed')
