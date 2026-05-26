# ranking 到 route 改造计划：文件、方法、变量级方案

本文档包依据以下材料整理：

- 当前代码压缩包：`Archive 2.zip`
- 项目规则压缩包：`rules.zip`
- 诊断运行时粗文档：`diagnosis-runtime-code-logic.md`
- 本次会话中关于“主动瘦身、养护类主轴、多候选 outcome 收敛式路径规划、gate 守卫、LLM prompt 职责边界”的讨论结论

权威优先级：**当前代码 > 项目 rules > 已有运行时说明 > 本次设计讨论**。如果后续实施时发现文档和代码冲突，必须以代码为准，并同步修正文档。


## 一、改造目标

### 1. 目标

把当前诊断流从：

```text
候选 problem → 分数 ranking → 最高问题输出
```

改成：

```text
候选 outcome 集合 → route group 分流 → route/gate 增强、削弱、阻断、展示或不确定 → 收窄为 1～3 个前端可见 outcome
```

### 2. 非目标

第一阶段不要做这些事：

1. 不要一次性删除 ranking。
2. 不要让 LLM 输出主 outcome 或前端可见候选 outcome。
3. 不要做复杂专家系统或全量状态机。
4. 不要把所有病虫害做成细粒度 outcome。
5. 不要让前端直接理解 route 推理细节；前端只接收可见 outcome、主方向、伴随观察方向、下一题和行动建议。

### 3. 过渡原则

第一阶段推荐保持代码兼容：

```text
代码字段 problemKey 暂时可保留
业务语义逐步改为 outcomeKey
```

原因：当前 `problems`、`symptom_problem_evidence`、`question_strategy_v5_real`、`diagnosis_result_explanations` 都以 `problem_key` 为外键。直接全面改名风险大。

推荐路线：

```text
Phase 1：problemKey 作为 outcomeKey 兼容运行
Phase 2：新增 route/gate 表，route 引用 problem_key/outcome_key
Phase 3：result-formatter 增加 primaryOutcome、secondaryOutcomes、visibleOutcomes
Phase 4：再决定是否独立 diagnosis_outcomes 表
```

## 二、总体改造架构

### 当前架构

```text
buildCandidatePriors()
→ candidateProblemKeys
→ computeVisualEvidenceScores()
→ computeQuestionEvidenceAndPenalty()
→ rankings
→ shouldAskFollowUpByRanking
→ buildFollowUps()
→ output ranking guards
→ formatDiagnosisResponse(rankings)
```

### 目标架构

```text
buildCandidatePriors()
→ candidateOutcomeKeys
→ ranking 作为候选排序和审计
→ buildRouteEvidenceContext()
→ planOutcomeRoutes()
→ evaluateOutcomeRouteGates()
→ candidateOutcomeStates
→ routeDecision
   ├─ requiresFollowUp → 区分候选 outcome 的 route question
   ├─ visibleOutcomeKeys → 前端可见 1～3 个方向
   ├─ primaryOutcomeKey / secondaryOutcomeKeys → 主方向与伴随观察方向
   └─ uncertain → 不确定结果 + 可排查方向
→ formatDiagnosisResponse({ primaryOutcome, secondaryOutcomes, visibleOutcomes, routeDecision, rankingsForAudit })
```

## 三、新增文件建议

| 新文件 | 职责 |
|---|---|
| `cloudfunctions/diagnose-http/constants/outcome-route.js` | route 状态、gate 结果、effect 类型等枚举。 |
| `cloudfunctions/diagnose-http/repositories/outcome-route-repository.js` | 读取 outcome route、gate、route question、answer effect、action profile。 |
| `cloudfunctions/diagnose-http/domain/outcome-route-planner.js` | 根据正式证据生成候选 outcome 集合，展开 route group，评估 route 决策。 |
| `cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js` | 判断候选 outcome / route 是否增强、削弱、阻断、可展示、可闭合、需要追问或转不确定。 |
| `cloudfunctions/diagnose-http/domain/outcome-action-resolver.js` | 根据 primaryOutcome、secondaryOutcomes、visibleOutcomes 找行动建议，合并植物养护基线并执行冲突检查。 |
| `cloudfunctions/diagnose-http/utils/outcome-route-contract.js` | 公开字段和内部字段的归一化工具。 |

### 建议新增枚举

文件：`constants/outcome-route.js`

```js
'use strict'

const ROUTE_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  NEEDS_QUESTION: 'needs_question',
  STRENGTHENED: 'strengthened',
  WEAKENED: 'weakened',
  DISPLAY_ELIGIBLE: 'display_eligible',
  CLOSURE_ELIGIBLE: 'closure_eligible',
  CLOSED: 'closed',
  BLOCKED: 'blocked',
  REDIRECTED: 'redirected',
  UNCERTAIN: 'uncertain'
})

const GATE_RESULT = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  BLOCK: 'block',
  NEED_MORE_INFO: 'need_more_info',
  CONFLICT: 'conflict',
  DISPLAY_PASS: 'display_pass',
  ACTION_CONFLICT: 'action_conflict'
})

const OUTCOME_EFFECT_TYPE = Object.freeze({
  SUPPORT: 'support',
  WEAKEN: 'weaken',
  EXCLUDE: 'exclude',
  REDIRECT: 'redirect',
  NEUTRAL: 'neutral'
})

module.exports = {
  ROUTE_STATUS,
  GATE_RESULT,
  OUTCOME_EFFECT_TYPE
}
```

## 四、核心新增方法设计

### 1. `buildRouteEvidenceContext()`

建议位置：

```text
cloudfunctions/diagnose-http/domain/outcome-route-planner.js
```

职责：把当前运行时证据整理成 route/gate 容易消费的结构。

输入建议：

```js
function buildRouteEvidenceContext({
  plantContext,
  observedEvidenceSet,
  derivedEvidenceSet,
  diagnosisDirections,
  symptomClassRuntime,
  answerEffects,
  answers,
  askedQuestionKeys,
  visualAggregateResult,
  routeHints,
  rankings
})
```

输出建议：

```js
{
  plantContext,
  activeSymptomKeys,
  activeEvidenceBySymptomKey,
  derivedEvidenceKeys,
  diagnosisDirectionKeys,
  symptomClassKey,
  answerEffectIndex,
  answeredQuestionKeys,
  negativeSymptomKeys,
  positiveSymptomKeys,
  visualRouteHints,
  rankingIndex
}
```

中文说明：

- `activeSymptomKeys` 只包括 `enteredRuntime=1` 且未废弃的正式证据。
- `answerEffectIndex` 把用户回答整理成 route gate 的支持、削弱、排除、转向信号。
- `rankingIndex` 只是候选排序辅助，不得直接闭合 outcome。

### 2. `planOutcomeRoutes()`

建议位置：

```text
cloudfunctions/diagnose-http/domain/outcome-route-planner.js
```

职责：综合候选 outcome、route group、route 表、gate 表、当前证据，返回本轮多候选收敛决策。

方法签名建议：

```js
async function planOutcomeRoutes({
  candidateOutcomeKeys,
  routeEvidenceContext,
  routeRepository,
  maxVisibleOutcomes = 3,
  maxQuestionCount = 1,
  canAskAnotherFollowUpRound = false,
  featureFlags = {}
})
```

输出建议：

```js
{
  mode: 'multi_outcome_route',
  candidateOutcomeStates,
  activeRouteGroupKeys,
  visibleOutcomeKeys,
  primaryOutcomeKey,
  secondaryOutcomeKeys,
  requiresFollowUp,
  nextQuestionKeys,
  gateResults,
  blockedOutcomeKeys,
  conflictingOutcomePairs,
  routeTrace,
  fallbackPolicy,
  decisionCause,
  lowConfidenceOverride
}
```

中文约束：

- `candidateOutcomeStates` 是 route 模式的核心，不允许只维护一个 active outcome。
- `visibleOutcomeKeys` 最多 1～3 个，且必须通过展示 gate。
- `primaryOutcomeKey` 最多 1 个，`secondaryOutcomeKeys` 最多 2 个。
- 如果候选 outcome 的公开行动建议冲突，必须优先问分流题；不能继续问时输出不确定。

### 3. `evaluateOutcomeRouteGate()`

建议位置：

```text
cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js
```

方法签名建议：

```js
function evaluateOutcomeRouteGate({
  route,
  gate,
  routeEvidenceContext,
  answerEffects
})
```

返回：

```js
{
  gateKey,
  gateRole,
  result,
  passed,
  blocked,
  needsMoreInfo,
  missingQuestionKeys,
  supportedBy,
  blockedBy,
  conflictWith,
  decisionCause
}
```

### 4. `resolveVisibleOutcomes()`

建议位置：

```text
cloudfunctions/diagnose-http/domain/outcome-route-planner.js
```

职责：当多个候选 outcome 经过 route/gate 评估后，决定哪些 outcome 可以前端可见，哪个作为主方向，哪些作为伴随观察方向，或者是否应输出不确定。

规则：

1. 多条 route 收敛到同一个 outcome：合并证据，提升该 outcome 的展示资格和可信度。
2. 多个 outcome 同时满足展示 gate 且行动建议相容：允许前端展示 1～3 个；其中最多 1 个为主方向，其余为伴随观察方向。
3. 多个 outcome 同时满足展示 gate 但行动建议冲突：优先问关键分流题；不能再问时输出不确定 + 保守建议，不同时给互相冲突的动作。
4. 被 blocker gate 阻断的 outcome 不得前端展示。
5. 不确定结果中可以展示“最值得排查的方向”，但必须通过展示 gate，且不得泄漏内部最高 ranking。

## 五、现有文件逐项改造表

### 1. `domain/diagnosis-engine.js`

| 当前位置/方法 | 当前变量/调用 | 改造动作 |
|---|---|---|
| 约第 4376 行 `runDiagnosisRound()` | 主运行入口 | 增加 route mode 运行分支，但不要复制整条主链。 |
| 约第 4448 行 | `observedEvidenceForResolution` | 保留；route 只能使用正式证据。 |
| 约第 4493 行 | `diagnosisDirectionsForResolution` | 作为 route 入口条件。 |
| 约第 4500 行 | `symptomClassRuntime` | 作为 route 入口条件和 gate 上下文。 |
| 约第 4822 行 | `candidatePriors` | 过渡期继续生成候选；语义改为候选 outcome 先验。 |
| 约第 4838 行 | `candidateProblemKeys` | 新增别名 `candidateOutcomeKeys`，不要立即全局重命名。 |
| 约第 4924 行 | `visualScores` | 保留；输入 `routeEvidenceContext`。 |
| 约第 4932 行 | `questionScores, penalties, answerEffects` | 保留；`answerEffects` 是 gate 判断核心输入。 |
| 约第 4954 行 | `rankings` | 降级为候选排序和审计。 |
| 约第 5120 行 | `shouldAskFollowUpByRanking` | 改为 `shouldAskFollowUp = routeDecision.requiresFollowUp || fallbackRankingAsk`。 |
| 约第 5282 行 | `buildFollowUps()` | route 模式下先生成 route 问题，旧逻辑作为 fallback。 |
| 约第 5350 行 | `evaluateFollowUpStopPolicy()` | 增加 routeDecision 输入；候选集合已收窄至可展示范围，且通过 action safety gate 时允许停止。 |
| 约第 5423 行后 | 输出 ranking 守卫 | 保留高风险守卫；但优先判断候选 outcome 是否通过展示 gate、闭合 gate 和行动安全 gate。 |
| 约第 5967 行 | `stopDecision` | 增加 `stopReason='route_visible_outcomes_ready'`、`route_uncertain_closed` 等停止原因；`decisionCause` 来源于 route/gate。 |
| 约第 6000 行 | `formatDiagnosisResponse()` | 传入 `primaryOutcome`、`secondaryOutcomes`、`visibleOutcomes`、`routeDecision`。 |

建议新增引用：

```js
const {
  buildRouteEvidenceContext,
  planOutcomeRoutes
} = require('./outcome-route-planner')
```

建议插入位置：

```text
rankings 生成完成、fastConvergencePlan 之后、shouldAskFollowUpByRanking 之前。
```

示意代码：

```js
const candidateOutcomeKeys = candidateProblemKeys

const routeEvidenceContext = buildRouteEvidenceContext({
  plantContext,
  observedEvidenceSet: labeledObservedEvidenceForResolution,
  derivedEvidenceSet: derivedEvidenceForResolution,
  diagnosisDirections: diagnosisDirectionsForResolution,
  symptomClassRuntime,
  answerEffects,
  answers,
  askedQuestionKeys,
  visualAggregateResult,
  routeHints: visualRouteContext.routeHints,
  rankings
})

const routeDecision = await planOutcomeRoutes({
  candidateOutcomeKeys,
  routeEvidenceContext,
  canAskAnotherFollowUpRound,
  featureFlags: { routeModeEnabled: true }
})
```

追问决策改造示意：

```js
const fallbackAskByRanking = shouldAskFollowUpByRanking
const hasRouteVisibleResult = Array.isArray(routeDecision?.visibleOutcomeKeys) && routeDecision.visibleOutcomeKeys.length > 0
const shouldAskFollowUp = routeDecision?.requiresFollowUp || (!hasRouteVisibleResult && fallbackAskByRanking)
```

输出决策改造示意：

```js
const visibleOutcomeKeys = routeDecision?.visibleOutcomeKeys || []
const primaryOutcomeKey = routeDecision?.primaryOutcomeKey || null
const secondaryOutcomeKeys = routeDecision?.secondaryOutcomeKeys || []

const stopDecision = visibleOutcomeKeys.length > 0 && !routeDecision?.requiresFollowUp
  ? {
      outcomeVisible: true,
      stopReason: primaryOutcomeKey ? 'route_visible_outcomes_ready' : 'route_uncertain_with_candidates',
      decisionCause: routeDecision.decisionCause,
      routeGroupKeys: routeDecision.activeRouteGroupKeys,
      primaryOutcomeKey,
      secondaryOutcomeKeys,
      visibleOutcomeKeys
    }
  : existingStopDecision
```

### 2. `domain/evidence-scoring.js`

当前方法：

```text
computeVisualEvidenceScores()，约第 43 行
computeQuestionEvidenceAndPenalty()，约第 172 行
```

改造原则：

1. 不要删除。
2. 不再让分数直接决定最终结果。
3. 新增 route evidence 消费函数时优先放在新文件，不污染旧评分逻辑。

可选新增方法：

```js
function normalizeRankingEvidenceForRoute({ rankings, answerEffects })
```

中文作用：把 ranking 的分数、问题角色、证据来源整理成 route planner 的参考输入。

### 3. `repositories/question-repository.js`

当前关键方法：

```text
getQuestionStrategies(problemKeys)，约第 231 行
```

当前策略表字段：

```text
problemKey
questionGroupKey
questionKey
priorityScore
triggerType
strategyNoteCn
```

改造建议：

1. Phase 1 不删 `getQuestionStrategies()`。
2. 新增 route 问题读取不要塞进这个文件太多逻辑，建议建 `outcome-route-repository.js`。
3. 如果短期复用，则可把 `problem_key` 当作 `outcome_key` 使用。

### 4. `domain/question-selector.js`

当前职责：构造和排序候选追问。

改造动作：

1. 增加一个入口参数：`routeDecision` 或 `routePlannedQuestionKeys`。
2. 如果 route 已经给出 `nextQuestionKeys`，优先按这些 key 取题。
3. 旧的通用候选池作为 fallback。

建议函数语义：

```js
buildFollowUps({
  rankings,
  routeDecision,
  routePlannedQuestionKeys,
  ...existingArgs
})
```

但更干净的做法是：

```text
route planner 自己返回 followUps 所需 questionKeys
question-selector 只在 route 不可用时工作
```

### 5. `domain/result-formatter.js`

当前方法：

```text
formatDiagnosisResponse()，约第 296 行
```

当前关键逻辑：

```text
primary ranking → finalResult / topProblem
outcomeType === uncertain 时压制问题性展示
```

改造动作：

1. 增加参数：

```js
formatDiagnosisResponse({
  rankings,
  primaryOutcome,
  secondaryOutcomes,
  visibleOutcomes,
  routeDecision,
  outcomeActionProfile,
  ...existingArgs
})
```

2. 新增优先级：

```text
primaryOutcome / visibleOutcomes 存在 → 使用 routeDecision 构造公开结果
secondaryOutcomes 只作为伴随观察方向，不抢主方向
governedLowConfidence / uncertain → 不展示 topProblem，但可展示通过 gate 的可排查方向
否则才回退 primary ranking
```

3. 公共响应增加内部可审计但前端可忽略字段：

```js
primaryOutcome
secondaryOutcomes
visibleOutcomes
outcomeMode
routeDecisionCause
routeTrace // debug only
gateResults // debug only
rankingsForAudit // debug only
```

注意：`routeTrace`、`gateResults`、`rankingsForAudit` 初期只在 debug 或开发态返回，用户侧不展示。

### 6. `domain/question-queue/question-queue-planner.js`

当前方法：

```text
planQuestionQueue(response)，约第 89 行
```

改造动作：

队列项新增字段：

```js
{
  outcomeKey,
  routeKey,
  gateKey,
  serviceTarget: 'outcome_route_confirmation'
}
```

用途：

- 回答回来时能知道这个问题服务于哪条 route。
- 防止用户改答后队列和 route 状态错位。

### 7. `domain/stop-state/stop-state-evaluator.js`

当前方法：

```text
evaluateStopState()，约第 80 行
```

改造动作：

合法停止原因增加：

```text
route_visible_outcomes_ready
route_uncertain_with_candidates
route_non_problematic_visible
route_action_safe_closed
```

判断原则：

```text
routeDecision.visibleOutcomeKeys 长度为 1～3
+ routeDecision.requiresFollowUp=false
+ 所有可见 outcome 通过 action safety gate
+ stopDecision.outcomeVisible=true
→ 可停止
```

### 8. `domain/stop-state/output-eligibility-evaluator.js`

当前方法：

```text
evaluateOutputEligibility()，约第 73 行
```

改造动作：

新增 route 输出资格：

```text
route gate 通过
+ outcome 是 final output
+ action profile 不冲突
+ 未触发 blocker gate
```

### 9. `constants/tables.js`

当前表列表约第 3～24 行。

需要新增：

```js
'outcome_routes',
'outcome_route_gates',
'outcome_route_questions',
'outcome_answer_effects',
'outcome_action_profiles'
```

如果 Phase 2 决定独立 outcome 表，再增加：

```js
'diagnosis_outcomes'
```

### 10. `src/data-system/config/tables.js`

当前已有：

- `problems` 配置，约第 536 行。
- `question_library_v5_real` 配置，约第 677 行。
- `question_option_mapping_v5_real` 配置，约第 728 行。
- `diagnosis_result_explanations` 配置，约第 763 行。

需要新增 route 表导入配置。详见 `05_数据表与导入改造方案.md`。

### 11. `utils/symptom-labeler-prompt.js`

当前方法：

```text
buildSymptomLabelerPromptPayload()，约第 368 行
buildSymptomLabelerPrompt()，约第 416 行
```

改造动作：

新增输出字段：

```json
"visual_discriminators": [],
"missing_info_for_path": []
```

禁止新增：

```json
"final_outcome_key": "..."
```

原因：LLM 只能提供路径输入，不能直接决定 outcome。

### 12. `utils/diagnosis-parser.js`

当前方法：

```text
parseStructuredVisualResult()，约第 252 行
```

改造动作：

解析并归一化：

```js
visualDiscriminators
missingInfoForPath
```

字段名转换建议：

```text
visual_discriminators → visualDiscriminators
missing_info_for_path → missingInfoForPath
```

### 13. `services/visual-diagnosis-service.js`

当前职责：视觉结果聚合、正式准入、route hint 透传。

改造动作：

1. `buildVisualDecisionStreamSummary()` 增加 discriminators/missing info 摘要。
2. `buildVisualAggregateResult()` 透传新增字段。
3. 视觉归一化结果存储表如支持 JSON 字段，应持久化；不支持则先放入 aggregate runtime payload。

### 14. 前端文件

涉及文件：

```text
src/utils/diagnose-flow.js
src/pages/diagnose/follow-up.vue
src/http-functions/diagnose/client.js
src/vue-query/diagnose/mutations/useDiagnoseMutation.js
src/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js
```

改造动作：

1. `normalizeDiagnosisResult()` 增加：

```js
primaryOutcome
secondaryOutcomes
visibleOutcomes
outcomeMode
routeDecisionCause
```

2. 结果页展示保持简单：

```text
主要判断 / 可能伴随方向 / 不确定可排查方向
为什么这么判断
今天怎么做
3 天内怎么观察
不要做什么
什么时候复查
```

3. 前端不展示 route 推理细节，除非开发态 debug。

## 六、实施阶段拆分

### Phase 0：冻结当前行为并补黄金样例

产物：

- 当前 ranking 模式黄金样例 50～100 个。
- 记录每例当前输出、追问、stopDecision、outcomeType。

目标：确保重构后知道哪些变化是预期变化。

### Phase 1：问题簇 outcome 化，但不改主链

动作：

1. 在 `problems` 表中新增或替换 MVP 问题簇。
2. 保持 `problem_key` 不变，但命名为 outcome 语义。
3. 修改 `diagnosis_result_explanations`，以行动建议为中心。
4. 保留 ranking 输出，但减少具体病虫害竞争。

验收：

- 结果更粗，但建议更明确。
- 不确定结果仍不泄漏 topProblem。

### Phase 2：新增 route/gate 数据表和仓库

动作：

1. 新增 route/gate/action profile 表。
2. 新增 `outcome-route-repository.js`。
3. 编写基础单元测试或脚本校验：每个 final outcome 至少有一条 route；每条 route 有 gate；每个 final outcome 有 action profile。

### Phase 3：route planner 只读接入

动作：

1. 在 `runDiagnosisRound()` 中调用 `planOutcomeRoutes()`。
2. 先不改变输出，只把 `routeDecision` 放入内部 debug 或 metrics。
3. 对比 ranking 和 routeDecision 是否一致。

验收：

- 不影响线上响应。
- routeDecision 能解释黄金样例中大部分问诊方向。

### Phase 4：route 接管追问

动作：

1. 若 `routeDecision.nextQuestionKeys` 存在，优先生成 route 问题。
2. 旧 `buildFollowUps()` 作为 fallback。
3. 问题队列记录 `outcomeKey/routeKey/gateKey`。

验收：

- 每轮仍最多 1 个问题。
- 同一个 outcome 的不同 route 能提出不同关键问题；同一入口 route group 下的不同 outcome 也能提出关键分流问题。
- 用户否定某方向后 route 能阻断或转向。

### Phase 5：route 接管可见 outcome 收窄与结果展示

动作：

1. `routeDecision.visibleOutcomeKeys` 和 `primaryOutcomeKey` 优先于 primary ranking。
2. `stopDecision.stopReason='route_visible_outcomes_ready'` 或 `route_uncertain_with_candidates`。
3. `formatDiagnosisResponse()` 用 primaryOutcome、secondaryOutcomes、visibleOutcomes 生成结果。

验收：

- 前端可见 outcome 必须通过 display gate 和 action safety gate。
- ranking 第一名不能越过 gate 输出。

### Phase 6：prompt 与视觉路径输入增强

动作：

1. prompt 增加路径判别特征和缺失信息。
2. parser、adapter、aggregate 透传字段。
3. route planner 使用这些字段决定下一步问诊。

验收：

- LLM 不输出 outcome。
- 视觉字段能帮助选择问题，但不能直接闭合。

### Phase 7：删除或降级旧 ranking 终局逻辑

动作：

1. 旧 ranking 保留为审计字段。
2. 具体病害 ranking 不再主导最终输出。
3. 特殊守卫从“结果后拦截”逐步前移为 route gate。

验收：

- 业务可解释性提高。
- 守卫数量不继续无序增长。

## 七、回滚策略

建议加环境开关：

```text
ROUTE_MODE_ENABLED=0/1
ROUTE_QUESTION_ENABLED=0/1
ROUTE_OUTPUT_ENABLED=0/1
```

阶段性含义：

| 开关 | 作用 |
|---|---|
| `ROUTE_MODE_ENABLED` | 是否计算 routeDecision。 |
| `ROUTE_QUESTION_ENABLED` | 是否让 route 接管追问。 |
| `ROUTE_OUTPUT_ENABLED` | 是否让 route 接管最终输出。 |

如果 route 数据不完整，可快速回退 ranking 模式。

## 八、关键验收标准

1. 任何前端可见 outcome 都必须有 route/gate 依据或明确的不确定兜底。
2. 任何 route 闭合都必须有 gate 结果。
3. 视觉原始结果不得直接闭合 outcome，也不得直接生成前端可见候选 outcome。
4. 同一个 outcome 下的行动建议不得互相冲突；多个可见 outcome 同屏展示时，公开行动建议也不得互相冲突。
5. 用户否定某方向后，不得无证据跳到无关 outcome。
6. `uncertain` 不得公开展示 problem-like top result。
7. 前端每轮仍只显示一个问题。
8. 开发态响应可带 routeTrace；用户态不直接展示 routeTrace。
