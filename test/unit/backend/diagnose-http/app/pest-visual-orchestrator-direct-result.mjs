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

// ---------------------------------------------------------------------------
// Review #13: router return 必须透传 normalizedModeCandidates（含 confidence），
// 供 directEvidenceLedgerForDirectResult 按候选 confidence 过滤。
// ---------------------------------------------------------------------------
const routerWithCandidates = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [{ mode: 'powdery_mildew', confidence: 0.92 }]
})
assert.ok(
  Array.isArray(routerWithCandidates.normalizedModeCandidates),
  'Review #13: router return 应包含 normalizedModeCandidates 数组'
)
assert.ok(
  routerWithCandidates.normalizedModeCandidates.some(
    item => item.modeKey === 'powdery_mildew' && Number.isFinite(Number(item.confidence))
  ),
  'Review #13: normalizedModeCandidates 每项应含 modeKey + confidence'
)

// ---------------------------------------------------------------------------
// Review #18: 非虫害 visibleOutcomes 每项必须含 outcomeKey + problemKey = modeKey，
// 避免 resolveOutcomeIdentityKey 回退到 outcome_N 合成 key。
// ---------------------------------------------------------------------------
assert.ok(
  powderyDirectResponse.visibleOutcomes[0].outcomeKey === 'powdery_mildew',
  'Review #18: visibleOutcomes[0].outcomeKey 应等于 modeKey'
)
assert.ok(
  powderyDirectResponse.visibleOutcomes[0].problemKey === 'powdery_mildew',
  'Review #18: visibleOutcomes[0].problemKey 应等于 modeKey'
)

// ---------------------------------------------------------------------------
// Review #17: 多高置信非虫害病害应输出全部 outcomes + 细分入口 directionChoices。
// powdery_mildew=0.96 + sooty_mold=0.97 应产生 2 个 visibleOutcomes、2 个 candidateModes、
// directionChoices 含两个非虫害选项、routePrimaryAction='choose_direction'。
// finalResult/topProblem 取置信度最高的（sooty_mold=0.97）。
// ---------------------------------------------------------------------------
const multiNonPestRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  admittedEvidence: [],
  visualModeCandidates: [
    { mode: 'powdery_mildew', confidence: 0.96 },
    { mode: 'sooty_mold', confidence: 0.97 }
  ]
})
assert.equal(
  multiNonPestRoute.nextAction,
  'direct_result',
  'Review #17: 多非虫害高置信模式应走 direct_result'
)

const multiNonPestResponse = await buildPestRouteResponse({
  sessionId: 'test_multi_non_pest',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: multiNonPestRoute
  },
  diagnosisProfile: 'full'
})
assert.ok(multiNonPestResponse, 'Review #17: 多非虫害应产生响应')
assert.equal(
  multiNonPestResponse.visibleOutcomes.length,
  2,
  'Review #17: 应输出 2 个 visibleOutcomes（powdery_mildew + sooty_mold）'
)
assert.equal(
  multiNonPestResponse.candidateModes.length,
  2,
  'Review #17: 应输出 2 个 candidateModes'
)
// finalResult/topProblem 取置信度最高（sooty_mold=0.97）
assert.equal(
  multiNonPestResponse.finalResult.problemKey,
  'sooty_mold',
  'Review #17: finalResult 应取置信度最高的 sooty_mold'
)
assert.equal(
  multiNonPestResponse.topProblem.modeKey,
  'sooty_mold',
  'Review #17: topProblem 应取置信度最高的 sooty_mold'
)
// 两个 outcomes 都应含 outcomeKey/problemKey（#18）
assert.ok(
  multiNonPestResponse.visibleOutcomes.every(
    item => item.outcomeKey === item.modeKey && item.problemKey === item.modeKey
  ),
  'Review #17+#18: 每个 visibleOutcomes 项的 outcomeKey/problemKey 应等于 modeKey'
)
// 细分入口：directionChoices 含两个非虫害选项
assert.ok(
  Array.isArray(multiNonPestResponse.directionChoices) &&
    multiNonPestResponse.directionChoices.length === 2,
  'Review #17: 应附加 directionChoices 细分入口含两个选项'
)
assert.ok(
  multiNonPestResponse.directionChoices.some(item => item.modeKey === 'powdery_mildew') &&
    multiNonPestResponse.directionChoices.some(item => item.modeKey === 'sooty_mold'),
  'Review #17: directionChoices 应含 powdery_mildew 和 sooty_mold 两个选项'
)
assert.equal(
  multiNonPestResponse.routePrimaryAction,
  'choose_direction',
  'Review #17: 多非虫害匹配时 routePrimaryAction 应为 choose_direction（细分入口）'
)

// ---------------------------------------------------------------------------
// Review #17 对照组：单非虫害模式不应附加 directionChoices，routePrimaryAction='finalize'。
// ---------------------------------------------------------------------------
assert.equal(
  powderyDirectResponse.routePrimaryAction,
  'finalize',
  'Review #17 对照: 单非虫害模式 routePrimaryAction 应为 finalize（无细分入口）'
)
assert.ok(
  !Array.isArray(powderyDirectResponse.directionChoices),
  'Review #17 对照: 单非虫害模式不应附加 directionChoices'
)

// ---------------------------------------------------------------------------
// dispatch-20260726-model-mode-precedence-zcode: aphid=0.95 模型直判不被
// leaf_yellowing 证据派生模式污染。端到端验证：
// - 路由层 associatedModes 只含 aphid，无 yellow_leaf 污染
// - nextAction=direct_result，无 cross-family choose_direction
// - visibleOutcomes 只含具体 aphid outcome（不压缩为 pest 大类）
// - 无关 directionChoices 不产生
// - confidenceLevel 为 high（非 low），文案不带"可能是"
// ---------------------------------------------------------------------------
const aphidModelDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' }
  ]
})
assert.deepEqual(
  aphidModelDirectRoute.associatedModes,
  ['aphid'],
  'model-mode-precedence: aphid 模型直判 associatedModes 不应被 yellow_leaf 污染'
)
assert.equal(
  aphidModelDirectRoute.nextAction,
  'direct_result',
  'model-mode-precedence: aphid=0.95 走 direct_result，无 cross-family 阻断'
)

const aphidModelDirectResponse = await buildPestRouteResponse({
  sessionId: 'test_aphid_model_direct',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: aphidModelDirectRoute
  },
  diagnosisProfile: 'pest'
})
assert.ok(
  aphidModelDirectResponse,
  'model-mode-precedence: aphid 模型直判应有响应'
)
assert.ok(
  aphidModelDirectResponse.visibleOutcomes.length > 0,
  'model-mode-precedence: aphid 模型直判应有 visibleOutcomes'
)
assert.equal(
  aphidModelDirectResponse.visibleOutcomes[0].outcomeKey,
  'aphid',
  'model-mode-precedence: visibleOutcomes 应是具体 aphid，不压缩为 pest 大类'
)
assert.equal(
  aphidModelDirectResponse.visibleOutcomes.length,
  1,
  'model-mode-precedence: 单 aphid 模型直判只输出 1 个 outcome'
)
assert.doesNotMatch(
  aphidModelDirectResponse.visibleOutcomes[0].displayNameCn,
  /可能是/,
  'model-mode-precedence: aphid=0.95 直判文案不带"可能是"前缀'
)
assert.notEqual(
  aphidModelDirectResponse.confidenceLevel,
  'low',
  'model-mode-precedence: aphid=0.95 直判 confidenceLevel 不能是 low'
)
assert.ok(
  !Array.isArray(aphidModelDirectResponse.directionChoices) ||
    aphidModelDirectResponse.directionChoices.length === 0,
  'model-mode-precedence: 单 aphid 模型直判不应产生无关 directionChoices'
)
assert.equal(
  aphidModelDirectResponse.routePrimaryAction,
  'finalize',
  'model-mode-precedence: 单 aphid 模型直判 routePrimaryAction 应为 finalize'
)

// ---------------------------------------------------------------------------
// dispatch-20260726-model-mode-precedence-zcode: aphid=0.95 + spider_mite=0.96
// 多模型直判（同家族虫害）只保留这两个模型模式，evidence-derived 被排除。
// 端到端 visibleOutcomes 应含两个具体虫害 outcomes。
// ---------------------------------------------------------------------------
const multiPestModelDirectRoute = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_mix2', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' },
    { mode: 'spider_mite', confidence: 0.96, regionRef: 'leaf_underside' }
  ]
})
assert.deepEqual(
  multiPestModelDirectRoute.modelDirectModeKeys,
  ['aphid', 'spider_mite'],
  'model-mode-precedence: 多模型直判都应进入 modelDirectModeKeys'
)
assert.deepEqual(
  multiPestModelDirectRoute.associatedModes,
  ['aphid', 'spider_mite'],
  'model-mode-precedence: 多模型直判只保留模型模式'
)

const multiPestModelDirectResponse = await buildPestRouteResponse({
  sessionId: 'test_multi_pest_model_direct',
  round: 1,
  plantContext: {},
  aggregateResult: {
    diagnosis_mode_route_result: multiPestModelDirectRoute
  },
  diagnosisProfile: 'pest'
})
assert.ok(
  multiPestModelDirectResponse,
  'model-mode-precedence: 多虫害模型直判应有响应'
)
assert.ok(
  multiPestModelDirectResponse.visibleOutcomes.length >= 1,
  'model-mode-precedence: 多虫害模型直判应有 visibleOutcomes'
)
// visibleOutcomes 应只含 aphid / spider_mite，不应混入 yellow_leaf 或 pest 大类
assert.ok(
  multiPestModelDirectResponse.visibleOutcomes.every(
    item => item.outcomeKey === 'aphid' || item.outcomeKey === 'spider_mite'
  ),
  'model-mode-precedence: visibleOutcomes 应只含模型直判的 aphid / spider_mite'
)

// ---------------------------------------------------------------------------
// dispatch-20260726 consolidated rework regression tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rework 1: aphid=0.95 + leaf_yellowing evidence - confidence flows through
// finalResult/topProblem as 'high', displayNameCn without "可能是" prefix.
// ---------------------------------------------------------------------------
const rework1Route = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  admittedEvidence: [
    evidence('leaf_yellowing', 'high', 'strong', 'img_r1', 'leaf_upper_surface')
  ],
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.95, regionRef: 'leaf_upper_surface' }
  ]
})
const rework1Response = await buildPestRouteResponse({
  sessionId: 'test_rework1',
  round: 1,
  plantContext: {},
  aggregateResult: { diagnosis_mode_route_result: rework1Route },
  diagnosisProfile: 'pest'
})
assert.equal(
  rework1Response.visibleOutcomes[0].outcomeKey,
  'aphid',
  'Rework 1: visibleOutcomes 应是具体 aphid'
)
assert.doesNotMatch(
  rework1Response.visibleOutcomes[0].displayNameCn,
  /可能是/,
  'Rework 1: aphid=0.95 直判文案不带"可能是"前缀'
)
assert.equal(
  rework1Response.finalResult.confidenceLevel,
  'high',
  'Rework 1: aphid=0.95 模型直判 finalResult.confidenceLevel 应为 high'
)
assert.equal(
  rework1Response.confidenceLevel,
  'high',
  'Rework 1: aphid=0.95 模型直判 top-level confidenceLevel 应为 high'
)
assert.equal(
  rework1Response.routePrimaryAction,
  'finalize',
  'Rework 1: 单一模型直判 routePrimaryAction 应为 finalize'
)

// ---------------------------------------------------------------------------
// Rework 2: aphid=0.75 specific likely outcome - keeps question_package path
// (medium tier, needs confirmation question). Does not skip to direct_result.
// ---------------------------------------------------------------------------
const rework2Route = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.75, regionRef: 'leaf_upper_surface' }
  ]
})
assert.equal(
  rework2Route.nextAction,
  'question_package',
  'Rework 2: aphid=0.75 应走 question_package（medium tier 需确认）'
)
assert.equal(
  rework2Route.confidenceTier,
  'medium',
  'Rework 2: aphid=0.75 应为 medium tier'
)

// ---------------------------------------------------------------------------
// Rework 3: missing per-candidate confidence must not promote all to direct_match.
// directEvidenceLedgerForDirectResult 在 routeResult 无 confidence 数据时，
// 不应把所有 pestCandidateModes 提升为 direct_match。
// ---------------------------------------------------------------------------
const rework3RouteResult = {
  confidenceTier: 'direct',
  directMatches: [],
  confirmationCandidates: [{ modeKey: 'aphid' }],
  provisionalMatches: [{ modeKey: 'aphid' }],
  normalizedModeCandidates: [{ modeKey: 'aphid' }]
}
const rework3Ledger = directEvidenceLedgerForDirectResult(
  rework3RouteResult,
  ['aphid'],
  'direct'
)
const rework3DirectMatches = rework3Ledger.filter(
  item => item.routeEvidenceRole === 'direct_match'
)
assert.equal(
  rework3DirectMatches.length,
  0,
  'Rework 3: 缺失 confidence 数据时不应把候选提升为 direct_match'
)

// ---------------------------------------------------------------------------
// Rework 4: non-pest powdery_mildew=0.96 + sooty_mold=0.20 - only individually
// eligible mode (powdery_mildew) enters direct result. sooty_mold=0.20 excluded.
// ---------------------------------------------------------------------------
const rework4Route = resolveDiagnosisModeRoute({
  diagnosisProfile: 'full',
  visualModeCandidates: [
    { mode: 'powdery_mildew', confidence: 0.96 },
    { mode: 'sooty_mold', confidence: 0.20 }
  ]
})
const rework4Response = await buildPestRouteResponse({
  sessionId: 'test_rework4',
  round: 1,
  plantContext: {},
  aggregateResult: { diagnosis_mode_route_result: rework4Route },
  diagnosisProfile: 'full'
})
assert.equal(
  rework4Response.visibleOutcomes.length,
  1,
  'Rework 4: 仅 powdery_mildew=0.96 eligible，sooty_mold=0.20 不应进入 visibleOutcomes'
)
assert.equal(
  rework4Response.visibleOutcomes[0].outcomeKey,
  'powdery_mildew',
  'Rework 4: visibleOutcomes 应只含 powdery_mildew'
)
assert.ok(
  !rework4Response.visibleOutcomes.some(item => item.outcomeKey === 'sooty_mold'),
  'Rework 4: sooty_mold=0.20 不应在 visibleOutcomes 中'
)

// ---------------------------------------------------------------------------
// Rework 5: multiple pest identity - aphid + spider_mite both model-direct.
// directionChoices uses generic 'pest' (multi pest), pestModeKeys lists both.
// visibleOutcomes contains both concrete pest outcomes (not compressed).
// ---------------------------------------------------------------------------
const rework5Route = resolveDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  visualModeCandidates: [
    { mode: 'aphid', confidence: 0.96, regionRef: 'leaf_upper_surface' },
    { mode: 'spider_mite', confidence: 0.95, regionRef: 'leaf_underside' }
  ]
})
assert.equal(
  rework5Route.directionChoices[0].modeKey,
  'pest',
  'Rework 5: 多虫害模式 directionChoices 应聚合为 pest 大类入口'
)
assert.deepEqual(
  rework5Route.directionChoices[0].pestModeKeys,
  ['aphid', 'spider_mite'],
  'Rework 5: pestModeKeys 应含两个具体虫害模式'
)
assert.equal(
  rework5Route.recommendedDirection,
  'pest',
  'Rework 5: 多虫害模式 recommendedDirection 应为 pest'
)
const rework5Response = await buildPestRouteResponse({
  sessionId: 'test_rework5',
  round: 1,
  plantContext: {},
  aggregateResult: { diagnosis_mode_route_result: rework5Route },
  diagnosisProfile: 'pest'
})
assert.equal(
  rework5Response.visibleOutcomes.length,
  2,
  'Rework 5: 多虫害模型直判应输出 2 个 visibleOutcomes'
)
assert.ok(
  rework5Response.visibleOutcomes.some(item => item.outcomeKey === 'aphid') &&
    rework5Response.visibleOutcomes.some(item => item.outcomeKey === 'spider_mite'),
  'Rework 5: visibleOutcomes 应含 aphid 和 spider_mite 两个具体 outcome'
)

console.log('pest-visual-orchestrator direct result regression tests passed')
