## 1. Dispatch Plan

- 任务类型: 高风险诊断流只读审计，涉及 ranking/青花值、route、outcome、gate、问诊路径、runtime。
- 已派发 subagent: code_explorer、architect_reviewer。
- 选择原因: 用户明确要求不可跳过；code_explorer 负责代码定位，architect_reviewer 负责架构边界。
- 写入权限: 无。本轮未改代码、未跑迁移、未部署。
- 说明: 收到你提醒后，我停止全库扩散搜索，最终以 docs/route规划及outcome瘦身计划 已列出的路径、函数、变量为主，只做了少量定点核对。

## 2. 已读取文档

已按序读取：

- 00_总览_阅读顺序.md
- 01_当前ranking诊断流代码盘点.md
- 02_ranking到route改造计划_文件方法变量级.md
- 03_outcome路径规划设计_概念数据与运行时.md
- 04_主动瘦身计划_养护类问题主轴.md
- 05_数据表与导入改造方案.md
- 06_视觉prompt与前端契约改造.md
- 07_Codex实施任务包_验收清单与风险.md
- 08_本次修订说明_多候选outcome收敛口径.md

## 3. 文档规则摘要

最终规则是“多候选 outcome 收敛式路径规划”。

- ranking/青花值: 过渡期保留，但只能做候选排序、fallback 和审计，不得直接决定最终公开结果。
- route: 某个候选 outcome 的可达证据路径；一个 outcome 可以由多条 route 到达。
- routeGroup: 同一入口场景下打开多个候选 outcome，例如黄叶分流，而不是黄叶直接作为最终处理方向。
- outcome: 用户可理解的处理方向、问题簇、非问题判断或不确定方向；运行时允许多个候选并存。
- gate: 决定增强、削弱、阻断、展示、闭合、追问、不确定和行动建议安全。
- outcome 允许从多 outcome 通过路径推进逐步收窄，最终前端可见 1-3 个；行动建议冲突时必须优先问分流题，不能问时输出不确定。

旧逻辑或废弃/降级概念：

- top1/finalScore/scoreGap 不能再做终局裁判。
- problemKey Phase 1 只作为 outcomeKey 兼容字段。
- routePrimaryAction 只是流程提示，不等价于 route planner。
- topProblem 只做旧字段兼容；不确定或 route 模式公开层不得泄漏内部最高排名。

## 4. 代码定位结果

当前代码仍是 ranking 主导。

- cloudfunctions/diagnose-http/domain/diagnosis-engine.js:4969: candidateProblemKeys 仍是候选入口。
- cloudfunctions/diagnose-http/domain/diagnosis-engine.js:5080: visualScores、questionScores、penalties 进入评分。
- cloudfunctions/diagnose-http/domain/diagnosis-engine.js:5097: rankings = candidateProblemKeys.map(...) 构造排名。
- cloudfunctions/diagnose-http/domain/diagnosis-engine.js:5257: shouldAskFollowUpByRanking 仍按 top score、score gap 决定是否追问。
- cloudfunctions/diagnose-http/domain/diagnosis-engine.js:5421: buildFollowUps(...) 仍由旧追问候选池生成。
- cloudfunctions/diagnose-http/domain/result-formatter.js:321: pickPrimaryRanking() 仍选择公开主问题。
- cloudfunctions/diagnose-http/domain/result-formatter.js:465: 响应仍公开 rankings。
- cloudfunctions/diagnose-http/constants/tables.js:3: 表常量尚无 outcome_routes/outcome_route_gates/outcome_action_profiles。
- src/utils/diagnose-flow.js:664: 前端归一化仍未消费 primaryOutcome/secondaryOutcomes/visibleOutcomes/actionAdvice。

## 5. 文档-代码差距表

| 文档要求 | 当前实现 | 差距 |
  |---|---|---|
| ranking 只做候选排序/审计 | ranking 决定追问、输出排序、公开结果 | 终局权尚未降级 |
| candidateOutcomeStates 多候选集合 | 仍是 candidateProblemKeys + rankings | 缺少 route runtime 状态 |
| routeDecision.requiresFollowUp 优先 | shouldAskFollowUpByRanking 优先 | 问诊仍按分数和分差 |
| visibleOutcomeKeys/primaryOutcomeKey/secondaryOutcomeKeys | topProblem/finalResult/outcomeType | 前端契约未切换 |
| display/closure/action safety gate | 旧 output guard + stop reason | gate 未成为统一判定层 |
| route/gate/action profile 表 | 当前仅旧 problems/question_strategy/diagnosis_result_explanations | 数据层未落地 |
| prompt 输出路径判别特征 | 当前主要是 symptom_candidates/route_hints | 缺 visual_discriminators/missing_info_for_path |
| 用户侧不展示内部 route/ranking | 当前仍返回 rankings | 后续需区分 debug 与用户态 |

## 6. 架构审查结论

architect_reviewer 结论：建议进入实现，但必须分阶段。第一步只能“双轨观测”：在 ranking 后、shouldAskFollowUpByRanking 前生成 routeDecision，放入 metrics/debug，不改变输出。

关键边界：

- 不直接删除 ranking。
- 不全局硬改 problemKey。
- 不让 LLM 输出 outcome 或治疗建议。
- 不让视觉原始结果直接闭合 outcome。
- 不把黄叶、孔洞、宽泛斑块守卫删掉；只能迁移为 route gate。
- 不把 debug trace 展示给用户。

## 7. 实现边界

可新增/修改：

- 新增 constants/outcome-route.js
- 新增 repositories/outcome-route-repository.js
- 新增 domain/outcome-route-planner.js
- 新增 domain/outcome-gate-evaluator.js
- 新增 domain/outcome-action-resolver.js
- 修改 diagnosis-engine.js 做薄接入
- 修改 result-formatter.js 支持 route outcome 输出
- 修改 stop-state/* 支持 route stop reason / output eligibility
- 修改 prompt/parser/adapter/visual aggregate 透传路径判别字段
- 修改 src/utils/diagnose-flow.js 做前端兼容归一化

暂不做：

- 删除旧 ranking。
- 删除旧 topProblem/finalResult/rankings 兼容字段。
- 生产默认启用 route output。
- 全量 UI 重做。
- 部署或 DB 迁移执行。

## 8. 风险与阻塞项

- route 数据不完整会导致大量不确定，需要最小高质量数据集先跑。
- 行动建议冲突是最高风险，必须有 action_conflict_group 或等价检查。
- 当前持久化主要是 diagnosis_problem_rankings，缺 route/outcome trace 审计落点。
- 前端若继续消费 topProblem，后端新契约会被 UI 旧逻辑吞掉。
- prompt/schema/parser 未同步时，新 route planner 拿不到路径判别特征。
- 需要测试：黄金样例、单元测试、H5 构建、诊断 replay wrapper。当前只读审计未运行测试。

## 9. 下一步建议

建议进入实现，但必须先由你确认“可执行实现计划”和“涉及文件清单”后，再派 implementer_deep。
