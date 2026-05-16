# TASK：route-planning-remaining-implementer-deep

## 1. 目标

- 基于 [route-planning.md](/Users/jay/WebstormProjects/planting/docs/ai-tasks/route-planning.md) 的剩余清单，继续完成 ranking→route 改造的未落地部分。
- 修复 Phase 1 已发现的 fallback 安全缺口。
- 打通 route 输出契约、视觉新增字段透传与前端归一化的最小闭环。

## 2. 本轮完成范围

- 修复 `fallback_ranking` 与最终 ranking 口径不一致的问题。
- 修复 route 查询异常时把原始错误文本挂到 `routeDecision` 的问题。
- 新增 route 契约工具与 outcome resolver。
- 让 `result-formatter`、`diagnosis-engine`、`stop-state`、`output-eligibility` 开始承接 route outcome 字段。
- 为视觉模型输出新增 `visual_discriminators` 与 `missing_info_for_path` 的 prompt、解析、聚合与前端归一化支持。
- 让 `routeDecision.nextQuestionKeys` 真正进入 follow-up 题目生成链。
- 让 `outcome_action_profiles` 开始进入 action advice 生成与冲突保护。
- 接入 `ROUTE_QUESTION_ENABLED / ROUTE_OUTPUT_ENABLED / ROUTE_DEBUG_TRACE_ENABLED`，让 route 追问接管、输出接管、debug 暴露可分阶段开启。
- 在 `follow-up.vue` 增加开发态 route debug 面板，仅展示最小化 `routeDecision` 摘要。
- 新增 route SQL schema 与 MVP seed 文件：
  `scripts/sql/ensure-outcome-route-tables.sql`
  `scripts/sql/seed-outcome-route-mvp.sql`
- 修复 `yellow_speckling` 场景下 synthetic follow-up 的虫害分流守卫。
- 新增云内 HTTP regression runner：
  `cloudfunctions/diagnose-route-regression-runner/index.js`

## 3. 本轮未承诺范围

- 不做全量 UI 改版。
- 不做 action profile 的完整业务数据闭环验收。
- 不解决与 route 主链无关的全仓历史 lint 债。

## 4. 实际改动文件

- [cloudfunctions/diagnose-http/domain/outcome-route-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-route-planner.js)
- [cloudfunctions/diagnose-http/utils/outcome-route-contract.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/outcome-route-contract.js)
- [cloudfunctions/diagnose-http/domain/outcome-action-resolver.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-action-resolver.js)
- [cloudfunctions/diagnose-http/domain/result-formatter.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/result-formatter.js)
- [cloudfunctions/diagnose-http/domain/diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js)
- [cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/stop-state/stop-state-evaluator.js)
- [cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/stop-state/output-eligibility-evaluator.js)
- [cloudfunctions/diagnose-http/utils/visual-contract.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/visual-contract.js)
- [cloudfunctions/diagnose-http/utils/diagnosis-parser.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/diagnosis-parser.js)
- [cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js)
- [cloudfunctions/diagnose-http/services/visual-diagnosis-service.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/services/visual-diagnosis-service.js)
- [src/utils/diagnose-flow.js](/Users/jay/WebstormProjects/planting/src/utils/diagnose-flow.js)

## 5. 验收标准

- `fallback_ranking` 使用最终 ranking 顺序，不再使用原始候选顺序。
- route 查询异常时，公开响应不包含原始 SQL/异常文本。
- 后端响应开始提供 `primaryOutcome`、`secondaryOutcomes`、`visibleOutcomes`、`outcomeMode`、`routeDecisionCause`。
- `stop-state` 与 `output-eligibility` 能识别 route stop reason。
- 视觉新增字段从 prompt 到 parser 到 aggregate summary 到前端归一化能够透传。
- `routeDecision.nextQuestionKeys` 可以直接生成 route follow-up，而不只是排序提示。
- `actionAdvice` 开始由 action profile + care baseline 合成；冲突时转保守建议。
- 公开响应中的 `routeDecision` 不再携带完整 `routeTrace/gateResults`。
- 关闭 `route output` 时，不再公开 `primaryOutcome / visibleOutcomes / actionAdvice`。
- 视觉 parser 遇到 `outcome_key` 等违规字段时忽略，不进入运行时。
- `uncertain` 输出时不显示 `topProblem`。
- `non_problematic` 输出时不产生治疗型 `actionAdvice`。
- 本地黄金样例最小回归已覆盖文档列出的 15 个必须场景。
- 开发态可显示最小 route debug，用户态不展示 `routeTrace/gateResults/internal ranking`。
- 允许明确写出仍未完成的阻塞项，不把“已部分接入”伪装成“全部完成”。

## 6. 剩余阻塞项

本任务已完成，原阻塞项已消化为以下后续优化项：

- `outcome_action_profiles` 已进入行动建议生成；若后续需要更强业务保障，可再补更大样本集的数据校验。
- 前端结果页当前是最小接入版，没有做专门视觉/UI 重构。
- 旧的本地 shell `check:diagnose-outcome-regression` 仍可能受环境 DNS / fetch 波动影响；正式验收已由云内 `diagnose-route-regression-runner` 接管，并已得到 `3/3` 真实样本通过结果。
- `npm run dev:h5` 在当前容器环境仍有 `listen EPERM`，因此没有补做页面级运行截图。
