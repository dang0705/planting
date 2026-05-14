# TASK：route-outcome-slimming-phase1-implementer-deep

## 1. 目标

- 在 `diagnose-http` 中完成 ranking→route 第一阶段代码接入：route 进入 SQL 表面与运行时观测链路。
- 保持 ranking 默认行为不变，仅新增 `routeDecision` 观测字段，不接管追问与最终输出。
- 新增 route 常量、repository、gate/planner 骨架，支持空数据安全 fallback。

## 2. 非目标

- 不生成 route 业务数据 seed。
- 不创建或执行真实 SQL 迁移脚本。
- 不部署，不做 CloudBase 发布。
- 不删除 ranking，不改默认输出，不做前端 route 可视化展示。

## 3. 涉及模块

- 云函数后端：`cloudfunctions/diagnose-http/*`
- 数据系统表配置：`src/data-system/config/tables.js`
- route/outcome 规划文档约束：`docs/route规划及outcome瘦身计划/*`

## 4. 涉及文件

- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/constants/tables.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/constants/tables.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/constants/outcome-route.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/constants/outcome-route.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/repositories/outcome-route-repository.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/repositories/outcome-route-repository.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/outcome-route-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-route-planner.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js)
- ✅ 本轮实际改过：[src/data-system/config/tables.js](/Users/jay/WebstormProjects/planting/src/data-system/config/tables.js)

## 5. 需要读取的规则

- [docs/ai-rules/project-hard-rules.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/project-hard-rules.md)
- [docs/ai-rules/language-policy.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/language-policy.md)
- [docs/ai-rules/diagnosis-replay.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/diagnosis-replay.md)
- [docs/ai-rules/cloudbase-auth-database.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/cloudbase-auth-database.md)

## 6. 是否涉及旧 agent 能力

- 模块化守门：是（新增 route 模块但不破坏 ranking 主链）
- 代码逻辑字典：否（未新增 `docs/code-logics`）
- new-rules 遵循：是（按 route/outcome 文档口径实现第一阶段观测）

## 7. 执行步骤

1. 补齐 route 表名常量与 data-system 表配置（JSON/numeric 列定义）。
2. 新增 route 常量、repository、gate evaluator、planner 骨架。
3. 在 `diagnosis-engine.js` ranking 后接入 `routeDecision` 观测。
4. 保持 follow-up 与 output 仍由 ranking 逻辑驱动。
5. 进行聚焦语法校验与脚本存在性检查。

## 8. 风险

- route 表不存在时，开启观测开关将走 fallback，不影响主链但会产生 fallback 诊断信息。
- 目前 route 数据为空时，`candidateOutcomeStates` 只能提供骨架态，业务解释能力有限。

## 9. 验收标准

- 新增 6 张 route 相关表 + 可选 `diagnosis_outcomes` 的配置与读取能力。
- `outcome-route-repository` 空输入返回空数组，过滤条件明确。
- `planOutcomeRoutes()` 返回完整结构字段，数据缺口回落 `fallback_ranking`。
- `diagnosis-engine` 仅新增观测，不改变 `shouldAskFollowUpByRanking` 与默认输出。

## 10. 建议派发

- `task_planner`：无需
- `code_explorer`：可选（后续 Phase 2 追问接管前复核调用链）
- `architect_reviewer`：建议（Phase 2 前确认 route 决策边界）
- `implementer_fast` / `implementer_deep`：Phase 2 继续由 `implementer_deep`
- `qa_reviewer`：必须（做行为不变回归 + route fallback 回归）
- `docs_keeper`：可选（后续补规则说明）
- `release_ops`：暂不需要（本轮无部署）
