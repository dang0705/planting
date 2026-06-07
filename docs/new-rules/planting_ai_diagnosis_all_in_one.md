# Planting AI 诊断运行规则 All-in-One（code-base 同步版）

更新时间：2026-06-07

## 0. 使用原则

本文件是当前代码有效运行规则的压缩摘要，不是历史规则全集。若它与 `code-base` 冲突，以 `code-base` 为准并修本文档。

本文件已经移除旧大而全 Sxx 规则结构，只保留当前运行时会影响实现、问诊、停止、输出和前端契约的概念。

## 1. 当前诊断主链与问诊模式

当前诊断主链是 **route 模式**；当前问诊题目按 **mode question package** 工作。固定题包的入口是 `getQuestionPackageByMode(mode)`。

不要再使用以下概念作为当前执行依据：

- ranking 分差决定追问。
- score gap 达标停止。
- hypothesis pool 逐题追问协议。
- 固定答满 N 题即可输出。
- 旧 dynamic next-question helpers 作为当前问诊权威。
- 旧 Sxx all-in-one 作为最新结构源。

当前有效主对象是：

- `routeEvidenceContext`
- `planOutcomeRoutes`
- `routeDecision`
- `visibleOutcomeKeys`
- `getQuestionPackageByMode(mode)`
- `questionPackage`
- `uiHints`
- `questionPackageSnapshot`
- `questionQueue`（仅非 package 兼容/运行时校验）
- `stopState`
- `outputEligibility`

## 2. 入口与 handler 差异

问诊相关核心入口：

- `/diagnosis/start`
- `/diagnosis/question/start`
- `/diagnosis/answer`

关键差异：

- `/diagnosis/start`：`runStartDiagnosis -> presentDiagnosisRoundResponse -> buildFrontendResponse`。
- `/diagnosis/question/start`：`runQuestionStartDiagnosis -> buildFrontendResponse`，不经过 presenter。
- `/diagnosis/answer`：`runAnswerDiagnosis -> presentDiagnosisAnswerResponse -> buildFrontendAnswerResponse`；终态只返回结果页必要字段，不返回 trace、output eligibility、route decision cause、环境上下文等大字段。

因此不能把三个入口的响应行为写成完全一致。黄叶 4 题题包主要依赖 `question-start` 直接进入前端响应构造。

## 3. 手动症状模式

`/diagnosis/question/start` 支持固定手动症状模式。请求中的 `symptomClassKey` 会被 `resolveManualSymptomMode` 校验；可选 `symptomKey` 也必须属于该模式。

手动模式会构造：

- 一个 observed symptom。
- 一个 observed evidence。
- `sourceType: manual_symptom_mode`。
- `enteredRuntime: 1`。
- `enteredExplanation: 1`。

若模式是 `yellowing_mode`，之后固定走 `static-question-package-start.js` 的模块级静态题包启动路径；默认路径通过 `persistRoundRuntime(..., { questionPackageSnapshotOnly: true })` 保存题包 snapshot，但静态构造不加载 prior repository、manual fast path 或 `diagnosis-engine`。当前未配置固定题包的手动模式返回 501，不再把 start 主路径转入 `runDiagnosisRound`。

## 4. route planner

route planner 做四件事：

1. 根据候选 outcome、active symptom、answer effects、视觉 route hints 构造 route 判断上下文。
2. 查询 route groups、routes、gates、route questions。
3. 对每个 outcome 评估 gate：pass、fail、block、need_more_info、conflict。
4. 生成 `visibleOutcomeKeys` 或 `nextQuestionKeys`。

常规 route 调用的 `maxQuestionCount` 仍是 1；这只描述非 package 兼容路径，不能作为固定题包的题数权威。

## 5. 题包与非 package 兼容路径

固定题包由 `QUESTION_PACKAGE_BY_MODE` 声明并通过 `getQuestionPackageByMode(mode)` 获取。当前 `yellow_leaf` package 显式包含：

- 4 个目标维度。
- `answerSubmitMode: package`。
- `questionDisplayMode: package`。
- `fixedQuestionPackage: true`。
- `outcomePolicy.allowMultipleOutcomes: true`。
- `outcomePolicy.preferSingleOutcome: false`。

非 package 路径仍保留单题 queue-anchor 兼容语义。旧 selector、旧 dynamic next-question helper、旧 active follow-up residues 不应写成当前事实。

## 6. 黄叶 4 题题包

黄叶手动入口的 `yellowing_mode` 存在模块级静态题包启动路径。它会前置四个护理上下文维度：

1. 浇水频率。
2. 光照变化。
3. 施肥/生长。
4. 通风/湿度。

当四题构造成功，响应包含 active `questions` 和：

```json
{
  "questionPackage": {
    "mode": "yellow_leaf",
    "sourceMode": "manual_yellowing_care_environment_frontloaded",
    "questionCount": 4,
    "answerSubmitMode": "package",
    "questionDisplayMode": "package",
    "fixedQuestionPackage": true,
    "outcomePolicy": {
      "allowMultipleOutcomes": true,
      "preferSingleOutcome": false
    }
  }
}
```

前端可以据此展示 4 题套餐，并在最后一次提交整包答案。

不要再把 manual fast path、route planner 或 diagnosis-engine 兼容路径写成黄叶 question/start 固定题包的启动路径。

## 7. 黄叶题包的硬边界

必须保留这个事实：黄叶 4 题题包当前是 package 协议，回答归属以 package snapshot 为准，不能被非题包路径拒绝包内其他问题。

已成立：

- `question-start` 响应可一次性返回 4 个 active `questions`。
- `questionPackage` / `uiHints` 可进入前端。
- 前端 normalizer 会按 `questionCount` 保留 4 题。
- 前端题包页面支持 package 展示和整包提交。
- 后端 package persistence 会把有效 `yellow_leaf` package 的 4 个问题写入 `runtimeSnapshot.questionPackageSnapshot.packageQuestions`。
- answer ownership 会基于 `questionPackageSnapshot.packageQuestions` 允许包内 4 个答案一起通过。
- `CareBehaviorTimeline.vue` 的虚拟答案 `care_behavior_timeline` 是浇水题的合法 package answer，后端必须在 route 运行前把可判定的过浇行为转换成 `often_wet`。
- 黄叶过浇行为、施浓肥 / 近期换盆、直晒 / 光照突然增强是强阳性整包验收样本，分别必须产生 `overwatering_root_pressure`、`fertilizer_repot_stress`、`sunburn` visible outcome。

仍需区分：

- 固定题包的题数、归属和停止输入以 `questionPackage`、package snapshot 与整包 answers 为准。
- 非 package 路径不得反向约束黄叶 4 题题包。

因此，文档和 AI 不能把“非 package 默认单题”写成“黄叶 package 只能提交首题”。

## 8. 回答提交

`/diagnosis/answer` 不是无条件重算入口。它会校验：

- session 是否存在。
- 当前 round 是否有效。
- request mode 是否允许。
- answers / images 是否互斥且合规。
- question key 是否属于当前 session 可回答集合。
- option key 是否属于该 question 的合法映射。

package 提交后，系统会用 snapshot 构造本轮 answered runtime，并重跑 `runDiagnosisRound`。

## 9. 停止规则

停止由 `stopState` 判定，不由答题数量判定。

停止要求：

- `stage === final`
- 无 active question queue
- outcome type 是正式值：`problematic`、`non_problematic` 或 `uncertain`
- 有显式 stop decision
- stop reason 属于 final stop reason
- uncertain 必须有合法理由

## 10. 输出资格

输出资格由 `outputEligibility` 判定。只有 stop state 已停止、queue 清空、正式 outcome 与正式 stop decision 均存在时，才是 eligible。

固定题包阶段、stop state 未停止或仍有 active queue 时，输出保守级别是 blocked。

## 11. 公开响应与前端契约

前端响应构造逻辑：

- 有题包：按 `questionPackage.questionCount` 保留 `questions`。
- 无题包：兼容问题默认只保留 1 题。
- package 响应透出 `questions`、`questionPackage` 和 `uiHints`。

前端 normalizer 与题包页面支持：

- 保留 `questionPackage`。
- 按 `questionCount` 展示问题进度。
- package 模式最后一次性提交整包答案。

但后端 answer ownership 仍是硬门槛，前端不能忽略 package metadata 或 option mapping。

## 12. 当前代码源索引

高优先级代码文件：

- `cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js`
- `cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js`
- `cloudfunctions/diagnose-http/app/static-question-package-start.js`
- `cloudfunctions/diagnose-http/app/question-package-response.js`
- `cloudfunctions/diagnose-http/app/frontend-response.js`
- `cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js`
- `cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js`
- `cloudfunctions/diagnose-http/domain/outcome-route-planner.js`
- `cloudfunctions/diagnose-http/domain/diagnosis-engine.js`
- `cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js`
- `cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js`
- `src/utils/diagnose-result-normalizer.js`
- `src/pages/diagnose/follow-up/question-flow.js`
- `src/utils/diagnose-follow-up-payload.js`
- `test-question-start-performance.mjs`

## 13. 修改 checklist

修改问诊或诊断输出前后，必须检查：

- [ ] 是否仍以 route 模式为主事实。
- [ ] 是否没有恢复旧 ranking/score-gap 追问规则。
- [ ] 是否没有恢复旧 dynamic next-question helper 作为当前权威。
- [ ] 固定题包是否仍通过 `getQuestionPackageByMode(mode)`。
- [ ] `/diagnosis/question/start` package 响应是否使用 `questions` 而不是旧数组字段。
- [ ] package snapshot 和归属校验是否覆盖包内所有题。
- [ ] stop state 是否仍能阻止未完成追问输出。
- [ ] output eligibility 是否仍能阻止 active queue 输出。
- [ ] 前端是否保留并使用 `questionPackage` / `uiHints`。
- [ ] `ai_and_memories` 是否更新到最新章节与行号。

## 14. 旧概念处置

旧规则不是全部删除，而是降级：

- 可作为历史背景。
- 不可作为实现依据。
- 不可放入 Facts 层。
- 不可覆盖代码事实。

尤其是问诊、停止、输出资格，只能引用当前 route 模式、stop state 和 output eligibility。
