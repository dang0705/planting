# Handoff：route-outcome-slimming-phase1-implementer-deep

## 任务信息

- 任务名：route-outcome-slimming-phase1-implementer-deep
- 创建时间：2026-05-08 16:17:49 +08
- 当前阶段：Phase 1 代码接入完成（观测模式）
- 当前结论：已完成 route 表面接入与双轨观测，ranking 默认行为保持不变

## Main Agent Dispatch Plan

```text
Dispatch Plan:
- 任务类型: implementer_deep 高风险实现（ranking→route Phase 1）
- 选择的 subagent: implementer_deep
- 选择原因: 多文件后端改造，涉及 route/outcome 运行时骨架与 SQL 表接入
- 需要读取的规则文件:
  - docs/ai-rules/project-hard-rules.md
  - docs/ai-rules/language-policy.md
  - docs/ai-rules/diagnosis-replay.md
  - docs/ai-rules/cloudbase-auth-database.md
  - docs/route规划及outcome瘦身计划/00-08
- 是否需要读取 AGENTS.md: 否（主代理已提供边界）
- 预期输出: route 常量/仓库/planner 接入 + diagnosis-engine 观测注入
- 写入权限: 仅任务必要代码文件，不做无关重构
```

## 已读取规则

- [docs/ai-rules/project-hard-rules.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/project-hard-rules.md)
- [docs/ai-rules/language-policy.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/language-policy.md)
- [docs/ai-rules/diagnosis-replay.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/diagnosis-replay.md)
- [docs/ai-rules/cloudbase-auth-database.md](/Users/jay/WebstormProjects/planting/docs/ai-rules/cloudbase-auth-database.md)
- [docs/route规划及outcome瘦身计划/00_总览_阅读顺序.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/00_总览_阅读顺序.md)
- [docs/route规划及outcome瘦身计划/01_当前ranking诊断流代码盘点.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/01_当前ranking诊断流代码盘点.md)
- [docs/route规划及outcome瘦身计划/02_ranking到route改造计划_文件方法变量级.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/02_ranking到route改造计划_文件方法变量级.md)
- [docs/route规划及outcome瘦身计划/03_outcome路径规划设计_概念数据与运行时.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/03_outcome路径规划设计_概念数据与运行时.md)
- [docs/route规划及outcome瘦身计划/04_主动瘦身计划_养护类问题主轴.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/04_主动瘦身计划_养护类问题主轴.md)
- [docs/route规划及outcome瘦身计划/05_数据表与导入改造方案.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/05_数据表与导入改造方案.md)
- [docs/route规划及outcome瘦身计划/06_视觉prompt与前端契约改造.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/06_视觉prompt与前端契约改造.md)
- [docs/route规划及outcome瘦身计划/07_Codex实施任务包_验收清单与风险.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/07_Codex实施任务包_验收清单与风险.md)
- [docs/route规划及outcome瘦身计划/08_本次修订说明_多候选outcome收敛口径.md](/Users/jay/WebstormProjects/planting/docs/route规划及outcome瘦身计划/08_本次修订说明_多候选outcome收敛口径.md)

## 相关文件

- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/constants/tables.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/constants/tables.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/constants/outcome-route.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/constants/outcome-route.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/repositories/outcome-route-repository.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/repositories/outcome-route-repository.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/outcome-route-planner.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/outcome-route-planner.js)
- ✅ 本轮实际改过：[cloudfunctions/diagnose-http/domain/diagnosis-engine.js](/Users/jay/WebstormProjects/planting/cloudfunctions/diagnose-http/domain/diagnosis-engine.js)
- ✅ 本轮实际改过：[src/data-system/config/tables.js](/Users/jay/WebstormProjects/planting/src/data-system/config/tables.js)
- 参考任务卡：[docs/ai-tasks/route-outcome-slimming-phase1-implementer-deep.md](/Users/jay/WebstormProjects/planting/docs/ai-tasks/route-outcome-slimming-phase1-implementer-deep.md)

## 相关知识库

- `docs/code-logics/`：未变更
- `docs/new-rules/`：未变更
- 其他：route 设计依据来自 `docs/route规划及outcome瘦身计划/00-08`

## 结论

- 已落地 route SQL 表面接入：后端常量 + data-system 配置 + repository 查询。
- 已新增 route planner/gate evaluator 最小可运行骨架，返回完整 `routeDecision` 字段结构。
- 已在 `diagnosis-engine` ranking 后插入 route 双轨观测。
- 生产默认仍可关闭 route 观测，缺数据时统一 `fallback_ranking`，不改变旧行为。

## 证据

- `diagnosis-engine` 接入点：ranking 后、`shouldAskFollowUpByRanking` 前插入 `planOutcomeRoutes()`。
- `result.metrics.routeDecision` 与 `result.routeDecision` 已注入，未接管 follow-up / output。
- `src/data-system/config/tables.js` 新增 route 表配置均为 `enabledByDefault: false`，避免默认导入扰动。
- repository 方法空输入直接返回 `[]`，并执行 `enabled/data_status/review_status` 过滤。

## 已完成

- 新增 route 枚举常量文件。
- 新增 outcome-route repository。
- 新增 outcome gate evaluator。
- 新增 outcome route planner。
- 补齐 route 相关 SQL 表名常量。
- 补齐 data-system route 表导入配置（含 JSON / numeric columns）。
- diagnosis-engine 薄接入 routeDecision 观测，不改默认输出。

## 未完成

- 未生成 route 业务数据 seed。
- 未创建或执行 SQL 迁移脚本。
- 未做部署与云端 smoke。
- 未让 route 接管追问（`nextQuestionKeys` 仍未接管）。
- 未让 route 接管最终输出（`visibleOutcomeKeys/primaryOutcomeKey` 仍未接管）。

## 风险

- route 表结构未上线或无数据时，启用观测开关会持续 fallback，导致 routeTrace 仅用于调试。
- gate/planner 当前是骨架实现，业务真实性依赖后续数据任务与 QA 回放验证。
- 当前 worktree 很脏，后续回归需严格限定到目标文件，避免混入他人改动。

## 验证状态

- `npm lint`：未执行（全量代价高，且当前分支存在大量既有脏改）
- `npm test`：未执行（同上）
- `npm build`：未执行（同上）
- 类型检查：项目无独立 typecheck script
- 聚焦验证：
  - `node --check cloudfunctions/diagnose-http/constants/outcome-route.js` 通过
  - `node --check cloudfunctions/diagnose-http/repositories/outcome-route-repository.js` 通过
  - `node --check cloudfunctions/diagnose-http/domain/outcome-gate-evaluator.js` 通过
  - `node --check cloudfunctions/diagnose-http/domain/outcome-route-planner.js` 通过
  - `node --check cloudfunctions/diagnose-http/domain/diagnosis-engine.js` 通过
  - `node --check src/data-system/config/tables.js` 通过

## 文档同步状态

- `docs/code-logics/`：未同步（本轮非 docs_keeper 范围）
- `docs/new-rules/`：未同步（本轮未改规则）
- 其他文档：已新增 implementer_deep task/handoff 文档承接

## 下一步建议

1. 先由数据任务补齐 route 表结构与最小审计数据（dev 环境）。
2. 由 `qa_reviewer` 执行“双轨不变性”回归：开关关闭时行为必须与旧版一致。
3. 进入 Phase 2 前由 `architect_reviewer` 复核 `nextQuestionKeys` 接管边界。
4. Phase 2 再推进 route 接管追问；Phase 3 再推进 route 接管输出。
