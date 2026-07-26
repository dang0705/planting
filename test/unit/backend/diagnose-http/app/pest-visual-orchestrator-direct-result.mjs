import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')
const {
  buildPestRouteResponse,
  directEvidenceLedgerForDirectResult,
  routeFixedQuestionPackageMode
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
// Fix 3: 固定题包模式（yellow_leaf/wilting_droop）优先走 question_package。
// full profile 下 yellow_leaf + wilting_droop 都在 directMatches 时，
// 路由层直接走 question_package 而非 direct_result。
// routeFixedQuestionPackageMode 多模式时选取 directMatches 中的第一个。
// ---------------------------------------------------------------------------
const fixedPackageAssociatedRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('leaf_yellowing'), evidence('leaf_droop')],
  visualModeCandidates: [
    { mode: 'yellow_leaf', confidence: 0.8 },
    { mode: 'wilting_droop', confidence: 0.75 }
  ]
})
assert.equal(fixedPackageAssociatedRoute.nextAction, 'question_package')
assert.deepEqual(fixedPackageAssociatedRoute.associatedModes, [
  'yellow_leaf',
  'wilting_droop'
])

// 多固定题包模式时 routeFixedQuestionPackageMode 选取 directMatches 中的第一个
const fixedPackageStaticModeKey = routeFixedQuestionPackageMode(fixedPackageAssociatedRoute)
assert.equal(
  fixedPackageStaticModeKey,
  'yellow_leaf',
  'Fix 3: 多固定题包模式时选取 directMatches 中的第一个'
)

// 单独 yellow_leaf 候选在路由层应进入 question_package（固定题包路径），
// 不应产生 direct_result。这验证了固定题包模式在路由层就不走 direct final。
const singleYellowLeafRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [evidence('leaf_yellowing', 'high', 'strong', 'img_yl', 'leaf_front')],
  visualModeCandidates: [{ mode: 'yellow_leaf', confidence: 0.96, regionRef: 'leaf_front' }]
})
assert.equal(
  singleYellowLeafRoute.nextAction,
  'question_package',
  'Fix 3: 单独 yellow_leaf 候选应走 question_package 固定题包路径'
)
assert.notEqual(
  singleYellowLeafRoute.nextAction,
  'direct_result',
  'Fix 3: 固定题包模式不应在路由层产生 direct_result'
)

// ---------------------------------------------------------------------------
// Fix 4: 非虫害 direct final 的 outcomeType 必须使用 problematic，不能使用 diagnosis。
// powdery_mildew 是 visual_direct_only 模式，可直接结论。
// ---------------------------------------------------------------------------
const powderyDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'powdery_mildew', confidence: 0.92 }]
})
assert.equal(powderyDirectRoute.nextAction, 'direct_result')

const powderyDirectResponse = await buildPestRouteResponse({
  sessionId: 'test_powdery_direct',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: powderyDirectRoute
  },
  diagnosisProfile: 'full'
})
assert.ok(powderyDirectResponse, 'Fix 4: powdery_mildew visual_direct_only 应有 direct result')
assert.ok(powderyDirectResponse.finalResult, 'Fix 4: 应有 finalResult')
assert.equal(
  powderyDirectResponse.finalResult.outcomeType,
  'problematic',
  'Fix 4: finalResult.outcomeType 必须是 problematic'
)
assert.equal(
  powderyDirectResponse.visibleOutcomes[0].outcomeType,
  'problematic',
  'Fix 4: visibleOutcomes[0].outcomeType 必须是 problematic'
)
assert.notEqual(
  powderyDirectResponse.finalResult.outcomeType,
  'diagnosis',
  'Fix 4: finalResult.outcomeType 不能是 diagnosis'
)

// ---------------------------------------------------------------------------
// Fix 5: >=0.95 单虫害候选若允许 0 题直达，最终文案/置信度/locked evidence
// 必须与 direct tier 一致，不能仍显示"可能是"低置信。
// aphid 候选 0.95 → confidenceTier=direct → 0 题 → direct_result。
// directEvidenceLedgerForDirectResult 应为 aphid 合成 direct_match evidence，
// 使 resolveSpecificPestAnswerResult 输出 direct 级置信度和不带"可能是"的文案。
// ---------------------------------------------------------------------------
const directAphidRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' }
  ]
})
assert.equal(directAphidRoute.nextAction, 'direct_result')
assert.equal(directAphidRoute.confidenceTier, 'direct')

// 验证 directEvidenceLedgerForDirectResult 为 aphid 合成了 direct_match evidence
const directAphidLedger = directEvidenceLedgerForDirectResult(
  directAphidRoute,
  ['aphid'],
  directAphidRoute.confidenceTier
)
assert.ok(
  directAphidLedger.some(
    item =>
      item.routeEvidenceRole === 'direct_match' &&
      (item.diagnosisMode === 'aphid' || item.modeKey === 'aphid')
  ),
  'Fix 5: direct tier 下应为 aphid 合成 direct_match evidence'
)

const directAphidResponse = await buildPestRouteResponse({
  sessionId: 'test_direct_aphid',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: directAphidRoute
  },
  diagnosisProfile: 'pest'
})
assert.ok(directAphidResponse, 'Fix 5: direct tier aphid 应有响应')
assert.ok(directAphidResponse.visibleOutcomes.length > 0, 'Fix 5: 应有 visibleOutcomes')
assert.equal(
  directAphidResponse.visibleOutcomes[0].outcomeKey,
  'aphid',
  'Fix 5: visibleOutcomes[0] 应是 aphid'
)
assert.doesNotMatch(
  directAphidResponse.visibleOutcomes[0].displayNameCn,
  /可能是/,
  'Fix 5: direct tier displayNameCn 不能包含"可能是"前缀'
)
assert.ok(
  directAphidResponse.visibleOutcomes[0].displayNameCn.length > 0,
  'Fix 5: direct tier displayNameCn 应有非空文案'
)
assert.notEqual(
  directAphidResponse.confidenceLevel,
  'low',
  'Fix 5: direct tier confidenceLevel 不能是 low'
)
assert.notEqual(
  directAphidResponse.finalResult.confidenceLevel,
  'low',
  'Fix 5: direct tier finalResult.confidenceLevel 不能是 low'
)

// ---------------------------------------------------------------------------
// Fix 5 对照组：<0.95 的 pest 候选（very_likely tier）应保留"很可能"语义，
// 但不应被错误提升为 direct tier 文案。
// aphid 候选 0.92 → confidenceTier=very_likely → 1 题可选追问 → direct_result
// with likelyResult=true。此时不应合成 direct_match evidence（因为 tier 不是 direct），
// 文案应保留"可能是"前缀。
// ---------------------------------------------------------------------------
const likelyAphidRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.92, regionRef: 'leaf_upper_surface' }
  ]
})
assert.equal(likelyAphidRoute.nextAction, 'direct_result')
assert.equal(likelyAphidRoute.confidenceTier, 'very_likely')
assert.equal(likelyAphidRoute.likelyResult, true)

const likelyAphidLedger = directEvidenceLedgerForDirectResult(
  likelyAphidRoute,
  ['aphid'],
  likelyAphidRoute.confidenceTier
)
assert.ok(
  !likelyAphidLedger.some(
    item =>
      item.routeEvidenceRole === 'direct_match' &&
      (item.diagnosisMode === 'aphid' || item.modeKey === 'aphid')
  ),
  'Fix 5 对照: very_likely tier 不应为 aphid 合成 direct_match evidence'
)

const likelyAphidResponse = await buildPestRouteResponse({
  sessionId: 'test_likely_aphid',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: likelyAphidRoute
  },
  diagnosisProfile: 'pest'
})
assert.ok(likelyAphidResponse, 'Fix 5 对照: very_likely aphid 应有响应')
assert.ok(likelyAphidResponse.visibleOutcomes.length > 0)
assert.equal(likelyAphidResponse.visibleOutcomes[0].outcomeKey, 'aphid')
// very_likely tier 下 aphid 没有正式证据锁定，应显示"可能是"前缀
assert.match(
  likelyAphidResponse.visibleOutcomes[0].displayNameCn,
  /可能是/,
  'Fix 5 对照: very_likely tier 无锁定证据时应保留"可能是"前缀'
)

console.log('pest-visual-orchestrator direct result regression tests passed')
