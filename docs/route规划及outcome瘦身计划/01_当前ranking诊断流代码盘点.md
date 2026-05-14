# 当前 ranking 诊断流代码盘点

本文档包依据以下材料整理：

- 当前代码压缩包：`Archive 2.zip`
- 项目规则压缩包：`rules.zip`
- 诊断运行时粗文档：`diagnosis-runtime-code-logic.md`
- 本次会话中关于“主动瘦身、养护类主轴、outcome 路径规划、gate 守卫、LLM prompt 职责边界”的讨论结论

权威优先级：**当前代码 > 项目 rules > 已有运行时说明 > 本次设计讨论**。如果后续实施时发现文档和代码冲突，必须以代码为准，并同步修正文档。


## 一、当前主链概述

当前诊断主链入口是：

```text
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
方法：runDiagnosisRound()
当前位置：当前代码包中约第 4376 行
```

当前链路可以概括为：

```text
植物上下文
+ 视觉聚合结果
+ 历史问诊答案
→ 正式观察证据
→ 派生证据
→ 症状模式
→ 诊断方向
→ 候选 problem
→ problem ranking
→ 候选追问
→ 停止策略
→ 输出守卫
→ 结果格式化
```

已有运行时说明中也明确：视觉聚合结果不会直接参与最终输出，必须先进入正式观察证据集合，且 `enteredRuntime=1` 的条目才参与诊断主链。

## 二、当前代码关键路径

### 1. 植物上下文与视觉路由上下文

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 4393～4428 行

关键变量：

| 变量 | 中文含义 | 当前作用 |
|---|---|---|
| `plantContext` | 植物上下文 | 植物身份、属、科、类别、养护基线等。 |
| `visualRouteContext` | 视觉路由上下文 | 从视觉聚合结果中提取 `routeHints`、`routePrimaryAction` 等。 |
| `preferredVisualRouteAction` | 视觉建议的首要动作 | 例如是否先补拍、是否先问诊。 |
| `runtimeOriginVisualCallBatchId` | 本轮视觉调用批次 | 用于证据追溯。 |

### 2. 问诊答案映射为症状证据

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 4436～4447 行

关键调用：

```js
getQuestionOptionMappings(questionKeys)
buildSyntheticFollowUpOptionMappings(questionKeys)
collectPositiveMappedObservedSymptomsFromAnswers(answers, answerOptionMappings)
```

中文解释：

- 系统先取用户已回答问题的选项映射。
- 再补充合成追问的选项映射。
- 然后把用户回答中能确认的事实映射成症状证据。

这些证据目前服务于后续 ranking 和输出守卫。route 模式下，它们仍然保留，但会额外服务于 route gate。

### 3. 正式观察证据集合

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 4448～4465 行

关键调用：

```js
mergeObservedEvidenceSet(...)
buildObservedEvidenceSetFromSymptoms(...)
buildObservedEvidenceSetFromVisualAggregateResult(...)
```

相关文件：

```text
cloudfunctions/diagnose-http/domain/observed-evidence.js
方法：buildObservedEvidenceSetFromVisualAggregateResult()
当前位置：约第 230 行
```

中文解释：

当前系统会把四类证据合并：

1. 历史正式证据。
2. 旧版症状输入转成的证据。
3. 视觉聚合结果中正式准入的证据。
4. 用户问诊回答映射出来的证据。

route 改造必须保留这一层。任何 route 都只能消费正式证据，不允许直接消费视觉原始候选作为闭合依据。

### 4. 派生证据、视觉候选和诊断方向

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 4485～4506 行

关键调用：

```js
buildDerivedEvidenceSet(...)
collectVisualCandidateSymptoms(...)
buildDiagnosisDirections(...)
resolveSymptomClassRuntime(...)
```

相关文件：

```text
cloudfunctions/diagnose-http/utils/diagnosis-directions.js
cloudfunctions/diagnose-http/domain/symptom-classifier.js
```

中文解释：

当前系统已经有“视觉症状模式”和“诊断方向”两层抽象。route 改造不应废弃它们，而应把它们变成 route 入口条件的一部分。

例如：

```text
leaf_spot_complex_mode → 叶斑类 route 候选
pest_direction → 疑似虫害 route 候选
yellowing_direction → 黄叶分流 route 候选
```

### 5. 候选 problem prior 与 ranking

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 4822～5017 行

关键变量与方法：

| 代码名 | 中文含义 | 当前作用 | route 改造后的建议 |
|---|---|---|---|
| `candidatePriors` | 候选问题先验 | 根据植物上下文和症状生成 problem 候选。 | 过渡期改名语义为候选 outcome 先验。 |
| `candidatePriorsWithDirectionCoverage` | 带诊断方向覆盖的候选先验 | 补充诊断方向和直接调整带来的候选。 | 保留为候选 outcome 入口，不再直接决定最终答案。 |
| `candidateProblemKeys` | 候选问题键 | 当前进入 ranking 的 problem key。 | Phase 1 中可继续使用，但业务语义改成 `candidateOutcomeKeys`。 |
| `visualScores` | 视觉证据分 | 来自正式视觉证据和症状-问题边。 | route 模式中作为 route 入口强度，不直接闭合。 |
| `questionScores` | 问诊证据分 | 用户回答贡献的正向问题分。 | route gate 消费为支持/削弱/排除效果。 |
| `penalties` | 惩罚分 | 否定答案等导致的扣分。 | route blocker 消费。 |
| `answerEffects` | 回答效果 | 记录用户回答对问题/症状的影响。 | route gate 的核心输入。 |
| `rankings` | 问题排名 | 生成 `problemKey`、分数、排序号。 | 保留为审计和候选排序，不再作为最终裁判。 |
| `scoreGap` | 第一名和第二名分差 | 决定是否继续追问。 | 逐步替换为 `routeDecision.requiresFollowUp`。 |

当前 ranking 构造逻辑大致为：

```js
visualEvidence = visualScores[problemKey]
questionEvidence = questionScores[problemKey]
penalty = penalties[problemKey]
totalEvidence = visualEvidence + questionWeight * questionEvidence
baseScore = totalEvidence * genusFactor * hostFactor - penalty
finalScore = baseScore + causalityBoost
```

这就是当前“ranking 模式”的核心。

### 6. 是否继续追问由 ranking 驱动

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 5098～5128 行

关键变量：

```js
hasEligibleTop1
followUpHistory
canAskAnotherFollowUpRound
shouldAskFollowUpByRanking
```

当前判断逻辑核心是：

```js
const shouldAskFollowUpByRanking =
  preferredVisualRouteAction !== 'retake_first' &&
  canAskAnotherFollowUpRound &&
  (
    preferredVisualRouteAction === 'ask_first' ||
    !hasEligibleTop1 ||
    rankings[0].finalScore < followUpTopScoreThreshold ||
    scoreGap < followUpGapThreshold
  )
```

中文解释：

当前系统主要看“第一名是否够强、分数是否够高、分差是否够大”来决定是否继续问。这是 ranking 模式的代表性入口。

route 改造后，这一段不能直接删除，但应被降级为兜底参考：

```text
routeDecision.requiresFollowUp 优先
ranking 分数只辅助确定候选 outcome 顺序和审计
```

### 7. 追问生成与过滤

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 5282～5363 行

关键调用：

```js
buildFollowUps(...)
filterFinalVisualPresenceFollowUps(...)
filterFollowUpsByAnsweredRouteConstraints(...)
evaluateFollowUpStopPolicy(...)
```

相关文件：

```text
cloudfunctions/diagnose-http/domain/question-selector.js
cloudfunctions/diagnose-http/repositories/question-repository.js
```

当前问题来源包括：

1. 静态问诊表。
2. 症状模式题组。
3. 动态生成追问。
4. 视觉候选确认题。

route 改造后，追问来源应收敛为：

```text
route 当前 gate 所需问题优先
必要时才回退到旧 buildFollowUps
```

### 8. 输出守卫和最终格式化

文件：`cloudfunctions/diagnose-http/domain/diagnosis-engine.js`

当前位置：约第 5423～6022 行

关键调用与变量：

```js
prioritizeOutputEligibleProblemRankings(...)
scopeRankingsToDiagnosisDirections(...)
stabilizeOutputRankingsAgainstConfirmedGuardShift(...)
evaluateContextRequiredProblemGuard(...)
hasOutputEligibleProblemRanking(...)
hasForceableOutputProblemRanking(...)
governedLowConfidence
stopDecision
formatDiagnosisResponse(...)
```

相关文件：

```text
cloudfunctions/diagnose-http/domain/result-formatter.js
方法：formatDiagnosisResponse()
当前位置：约第 296 行
```

当前输出仍以 `rankings` 中的最高问题为中心。`result-formatter.js` 中的公开输出会根据 `outcomeType` 判断是否压制问题性展示；例如不确定时 `topProblem` 会被置空。

route 改造后，结果格式化应从：

```text
primary ranking problem → finalResult
```

改为：

```text
primaryOutcome / secondaryOutcomes / visibleOutcomes → finalResult
```

其中 ranking 只作为：

- 内部审计。
- 兼容旧字段。
- route 候选顺序来源之一。

## 三、当前 ranking 模式的主要问题

### 1. 分数漂移

不同轮次中，轻微问诊证据可能让某个具体 problem 超过原始方向，导致结果跳跃。

典型风险：

```text
视觉像黄叶养护问题
→ 问诊否定某个方向
→ ranking 自动跳到另一个具体病害
→ 用户感觉系统越问越偏
```

### 2. 具体问题粒度过细

当前 ranking 面向 `problemKey`。如果 problem 库持续扩张，细碎问题会互相竞争：

```text
真菌叶斑 / 细菌叶斑 / 水肿 / 晒伤 / 机械伤 / 虫害斑点
```

对于 MVP，用户更需要的是处理方向，而不是具体病原名。

### 3. 问诊目的不够稳定

当前问诊更像“提高排名区分度”，不是“区分当前候选 outcome 集合”。这导致业务审核时很难直接回答：

```text
为什么这次要问这个问题？
问完后会增强、削弱或阻断哪些候选 outcome？
这个回答会把前端可见方向收窄到什么范围？
```

### 4. 输出守卫压力过大

由于 ranking 可以把宽泛证据推向具体问题，后端必须不断加守卫防止越级：

- 宽泛斑块不能直接闭合具体叶斑。
- 黄叶必须分流。
- 孔洞不能默认虫害。
- 不确定不能泄漏最高问题。
- 水肿被否定后不能直接跳真菌叶斑。

route 模式不会让守卫消失，但能把很多“事后补丁”前移到 route gate。

## 四、route 改造的代码切入点

最小侵入切入点是：

```text
ranking 已生成之后，followUp 判断之前
```

也就是在 `diagnosis-engine.js` 中：

```text
candidateProblemKeys / rankings / answerEffects 已有
shouldAskFollowUpByRanking 尚未最终决定追问
```

推荐插入：

```js
const routeEvidenceContext = buildRouteEvidenceContext({...})
const routeDecision = await planOutcomeRoutes({...})
```

然后让：

```text
routeDecision.requiresFollowUp
routeDecision.nextQuestionKeys
routeDecision.visibleOutcomeKeys
routeDecision.primaryOutcomeKey
routeDecision.secondaryOutcomeKeys
routeDecision.lowConfidenceOverride
```

逐步接管：

```text
shouldAskFollowUpByRanking
buildFollowUps
stabilizedOutputRankings → finalResult
```

## 五、现有文件职责结论

| 文件 | 当前职责 | route 改造后职责 |
|---|---|---|
| `diagnosis-engine.js` | 主运行时，ranking 与输出守卫集中地 | 接入 route planner，弱化 ranking 终局权。 |
| `evidence-scoring.js` | 视觉/问诊证据计分 | 保留为候选排序和 route evidence 输入。 |
| `question-repository.js` | 问题、选项、策略读取 | 保留旧策略，新增 route 问题读取或由新仓库读取。 |
| `question-selector.js` | 候选追问生成和排序 | route 模式下变成 fallback，不再主导第一问题。 |
| `result-formatter.js` | 把 ranking/stopDecision 转成公开结果 | 增加 `primaryOutcome`、`secondaryOutcomes`、`visibleOutcomes` 优先格式化。 |
| `observed-evidence.js` | 正式证据准入 | 必须保留，不允许绕过。 |
| `question-queue-planner.js` | 前端问题队列 | 队列项要能带 route/outcome/gate 追溯。 |
| `stop-state-evaluator.js` | 停止状态判断 | 增加候选集合收窄、可见 outcome 准备完成、不确定候选输出等 route 停止状态。 |
| `output-eligibility-evaluator.js` | 输出资格检查 | 增加 display gate、closure gate、action safety gate 通过后的输出资格。 |
| `symptom-labeler-prompt.js` | 视觉 prompt | 增加路径判别特征和缺失信息，但不输出 outcome。 |
| `diagnosis-parser.js` | 解析视觉 JSON | 解析新增字段。 |
| `visual-diagnosis-service.js` | 聚合视觉结果 | 持久化/透传新增路径输入。 |
