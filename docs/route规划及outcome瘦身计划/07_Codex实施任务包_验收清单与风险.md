# Codex 实施任务包：验收清单与风险控制

本文档包依据以下材料整理：

- 当前代码压缩包：`Archive 2.zip`
- 项目规则压缩包：`rules.zip`
- 诊断运行时粗文档：`diagnosis-runtime-code-logic.md`
- 本次会话中关于“主动瘦身、养护类主轴、outcome 路径规划、gate 守卫、LLM prompt 职责边界”的讨论结论

权威优先级：**当前代码 > 项目 rules > 已有运行时说明 > 本次设计讨论**。如果后续实施时发现文档和代码冲突，必须以代码为准，并同步修正文档。


## 一、实施总原则

这次不是普通小改，而是诊断主链口径变化。Codex 执行时必须遵守：

1. 不允许直接删除旧 ranking 模式。
2. 不允许绕过正式证据准入。
3. 不允许让 LLM 输出主 outcome / 可见候选 outcome。
4. 不允许把 routeTrace 当成用户可见结果。
5. 不允许把黄叶、孔洞、宽泛斑块等守卫删掉后不补 gate。
6. 每个改动阶段必须能回滚。

## 二、建议分支与 feature flag

建议创建分支：

```text
refactor/diagnosis-outcome-route-mode
```

建议环境开关：

```text
ROUTE_MODE_ENABLED=0/1
ROUTE_QUESTION_ENABLED=0/1
ROUTE_OUTPUT_ENABLED=0/1
ROUTE_DEBUG_TRACE_ENABLED=0/1
```

默认策略：

| 环境 | route mode | route question | route output | debug trace |
|---|---:|---:|---:|---:|
| 本地开发 | 1 | 1 | 1 | 1 |
| 测试环境 | 1 | 1 | 0/1 分阶段 | 1 |
| 生产环境 | 0 起步 | 0 起步 | 0 起步 | 0 |

## 三、任务拆分

### Task 1：建立 route 常量与数据 shape

涉及文件：

```text
cloudfunctions/diagnose-http/constants/outcome-route.js
cloudfunctions/diagnose-http/constants/repository-shapes.js
```

新增：

```text
ROUTE_STATUS
GATE_RESULT
OUTCOME_EFFECT_TYPE
outcomeRouteShape
outcomeGateShape
outcomeRouteQuestionShape
outcomeAnswerEffectShape
outcomeActionProfileShape
```

验收：

- 枚举集中，不散落字符串。
- shape 字段中文含义在注释或文档里明确。

### Task 2：新增数据表配置

涉及文件：

```text
cloudfunctions/diagnose-http/constants/tables.js
src/data-system/config/tables.js
```

新增表：

```text
outcome_routes
outcome_route_gates
outcome_route_questions
outcome_answer_effects
outcome_action_profiles
```

可选：

```text
diagnosis_outcomes
```

验收：

- JSON 字段加入 `jsonColumns`。
- 数字字段加入 `numericColumns`。
- 导入键唯一。
- 表名加入后端 tables 常量。

### Task 3：新增 repository

新增文件：

```text
cloudfunctions/diagnose-http/repositories/outcome-route-repository.js
```

方法：

```js
getOutcomeRoutesByOutcomeKeys(outcomeKeys)
getOutcomeRouteGates(routeKeys)
getOutcomeRouteQuestions(routeKeys)
getOutcomeAnswerEffects(questionKeys)
getOutcomeActionProfiles(actionProfileKeys)
getDiagnosisOutcomesByKeys(outcomeKeys)
```

验收：

- 空数组输入直接返回空数组。
- SQL 使用参数化或项目现有安全封装。
- data_status / enabled 过滤明确。
- 返回字段做 normalize，不把数据库 snake_case 泄漏到 domain 层。

### Task 4：新增 gate evaluator

新增文件：

```text
cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js
```

方法：

```js
matchesRequiredEvidence()
matchesRequiredAnswerEffects()
matchesBlockerEvidence()
evaluateOutcomeRouteGate()
```

验收：

- gate 不直接读取数据库。
- gate 只消费 `routeEvidenceContext`。
- blocker 优先级高于 closure。
- 缺失信息返回 `needsMoreInfo` 而不是强行失败。

### Task 5：新增 route planner

新增文件：

```text
cloudfunctions/diagnose-http/domain/outcome-route-planner.js
```

方法：

```js
buildRouteEvidenceContext()
selectCandidateOutcomeRoutes()
planOutcomeRoutes()
resolveLockedOutcome()
chooseNextRouteQuestions()
buildRouteDecisionCause()
```

验收：

- 同 outcome 多 route 命中能合并。
- 多 outcome 冲突能触发追问或不确定。
- 一个 route 不应同时把多个冲突 outcome 标记为主方向；若一个入口症状可达多个 outcome，应使用 route group 管理多候选收敛。
- route 数据缺失时可 fallback ranking。

### Task 6：只读接入 `diagnosis-engine.js`

涉及文件：

```text
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
```

插入位置：

```text
rankings 生成之后，shouldAskFollowUpByRanking 之前。
```

改动：

```js
const routeEvidenceContext = buildRouteEvidenceContext(...)
const routeDecision = await planOutcomeRoutes(...)
```

但第一步只记录：

```js
metrics.routeDecision
```

不改变输出。

验收：

- 所有旧测试/批跑结果不变。
- routeDecision 可在日志或开发响应中查看。

### Task 7：route 接管追问

涉及文件：

```text
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
cloudfunctions/diagnose-http/domain/question-selector.js
cloudfunctions/diagnose-http/domain/question-queue/question-queue-planner.js
cloudfunctions/diagnose-http/repositories/question-queue-repository.js
```

改动：

```text
routeDecision.nextQuestionKeys 优先
旧 buildFollowUps fallback
queue item 写入 outcomeKey/routeKey/gateKey
```

验收：

- 每轮仍只展示一个问题。
- 已问过的问题不重复。
- 用户改答后 queue 能失效或重算。

### Task 8：route 接管输出

涉及文件：

```text
cloudfunctions/diagnose-http/domain/diagnosis-engine.js
cloudfunctions/diagnose-http/domain/result-formatter.js
cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js
cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js
```

改动：

```text
routeDecision.visibleOutcomeKeys / primaryOutcomeKey 优先输出
stopDecision 增加 route_visible_outcomes_ready、route_uncertain_with_candidates
outputEligibility 支持 display gate、closure gate、action safety gate
```

验收：

- ranking 第一名不能绕过 route gate。
- uncertain 不显示 topProblem。
- non-problematic 不显示治疗型建议。
- action profile 缺失时不得输出假建议，应不确定或 fallback 保守建议。

### Task 9：prompt 与视觉解析增强

涉及文件：

```text
cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js
cloudfunctions/diagnose-http/configs/index.js
cloudfunctions/diagnose-http/utils/diagnosis-parser.js
cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js
cloudfunctions/diagnose-http/services/visual-diagnosis-service.js
```

改动：

```text
增加 visual_discriminators
增加 missing_info_for_path
禁止 outcome_key
```

验收：

- prompt 明确禁止诊断、病因、治疗建议。
- parser 能处理缺失字段。
- 新字段不会破坏旧视觉结果。

### Task 10：前端契约兼容

涉及文件：

```text
src/utils/diagnose-flow.js
src/pages/diagnose/follow-up.vue
src/http-functions/diagnose/client.js
src/vue-query/diagnose/mutations/useDiagnoseMutation.js
src/vue-query/diagnose/mutations/useDiagnoseFollowUpMutation.js
```

改动：

```text
normalize primaryOutcome / secondaryOutcomes / visibleOutcomes / actionAdvice / routeDecision
结果页优先显示处理方向和行动建议
开发态可显示 route debug
```

验收：

- 老响应不崩。
- 新响应能展示。
- 不展示 routeKey/gateKey/internal ranking。

## 四、黄金样例验收

每个样例至少记录：

```text
输入症状
植物上下文
视觉正式证据
问诊路径
预期 outcome
预期 route
预期 gate
预期追问
预期行动建议
禁止输出
```

### 必须覆盖的样例

1. 黄叶 + 土湿 → 积水/根系压力。
2. 黄叶 + 土干 → 缺水压力或继续分流。
3. 黄叶 + 只有底部老叶 + 新叶正常 → 自然代谢。
4. 萎蔫 + 土湿 → 积水/根系压力。
5. 萎蔫 + 土干 → 缺水压力。
6. 徒长 + 弱光 → 光照不足/生长偏弱。
7. 焦斑 + 最近暴晒 → 晒伤/强光刺激。
8. 焦边 + 空气干/靠空调 → 叶尖焦枯/环境压力。
9. 斑点扩散 + 通风差/喷水 → 叶斑类问题。
10. 孔洞 + 无虫迹 + 不扩散 → 结构损伤/旧伤。
11. 孔洞 + 虫体/虫粪/继续变多 → 疑似虫害痕迹。
12. 艺斑/正常斑纹 → 非问题。
13. 宽泛斑块 + 无法确认 → 不确定。
14. 用户回答互相冲突 → 不确定。
15. LLM 视觉候选强但未正式准入 → 不得输出。

## 五、代码审查清单

### 诊断主链

- [ ] `runDiagnosisRound()` 中没有让视觉原始结果直接进入 final outcome。
- [ ] `routeDecision` 插入点在正式证据构建之后。
- [ ] `rankings` 没有被直接删除。
- [ ] `shouldAskFollowUpByRanking` 被降级，而不是粗暴删除。
- [ ] route 失败时有 fallback 或不确定。

### 数据层

- [ ] 每个 final outcome 有 action profile。
- [ ] 每条 route 有 gate。
- [ ] 中间节点没有被标记为 final output。
- [ ] route 表中中文说明完整。
- [ ] 未审核 route 不启用。

### prompt

- [ ] 没有 outcome_key 输出。
- [ ] 没有治疗建议。
- [ ] 没有推断不可见事实。
- [ ] 新字段长度可控。

### 前端

- [ ] 不展示 internal ranking。
- [ ] 不展示 routeTrace 给用户。
- [ ] uncertain 不显示 topProblem。
- [ ] actionAdvice 缺失有兜底。

## 六、高风险点与处理

### 风险 1：route 数据不完整导致大量不确定

处理：

```text
先只启用 8～12 个高质量 outcome。
每个 outcome 至少 2 条 route。
保留 fallback ranking。
```

### 风险 2：route 过多导致路径爆炸

处理：

```text
每个 outcome 2～4 条 route。
每条 route 1～2 个 gate。
最多 2 轮问诊。
```

### 风险 3：行动建议冲突

处理：

```text
同一 outcome 下不允许补水和停水同时作为核心建议。
冲突时拆 outcome 或把上游节点设为中间节点。
```

### 风险 4：Codex 把 LLM 改成最终裁判

处理：

```text
prompt 文档和代码注释明确禁止 outcome_key。
单测检查视觉响应中 outcome_key 被忽略或报错。
```

### 风险 5：删除旧守卫后出现越级输出

处理：

```text
守卫只能迁移到 gate，不能无替代删除。
```

## 七、建议给 code logic knowledge subagent 的审查问题

每次 PR 提交前问：

1. 这次改动有没有绕过 `observedEvidenceSet`？
2. 有没有让 ranking 继续直接决定主 outcome / 可见候选 outcome？
3. route gate 是否能解释为什么问这个问题？
4. 用户否定后是否能阻断或转向？
5. 不确定结果是否仍然隐藏内部 top problem？
6. 同一个 outcome 的行动建议是否冲突？
7. 有没有把中间节点当最终结果？
8. prompt 有没有让模型输出诊断结论？

## 八、最终完成定义

只有同时满足以下条件，才能认为 ranking 到 route 改造完成：

1. 主要 MVP outcome 由 route group、route、gate 管理候选收敛，并通过展示/闭合/行动安全 gate 后才可前端可见。
2. 追问优先来自 route group 下的关键分流 gate。
3. ranking 只作为候选排序和审计，不作为最终裁判。
4. 结果输出以 primaryOutcome、secondaryOutcomes、visibleOutcomes 和 actionProfile 为中心。
5. 黄金样例通过。
6. 不确定、非问题、用户否定路径约束仍然有效。
7. 视觉 prompt 不输出 outcome。
8. 前端用户侧不展示内部 route/ranking。
