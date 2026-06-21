# Main Post-Implementation Review Gate

本文件只在 implementer 完成后、QA 之前读取。它保留 main agent 的 diff-first + dependency-context-limited code review 职责。

receipt-only 不等于免审。main agent 必须 review 本轮 diff、必要依赖上下文、Implementation Contract compliance、forbidden scope 和 line count gate，但输出只保留 review receipt 与 evidence_ref。

## Gate Receipt 输出模式

所有 gate 默认输出 receipt，不输出长篇解释。

模板见：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-01`）。

若 gate 失败，只输出缺失字段、阻塞原因和下一步动作。详细证据放 handoff audit appendix。


## Main Agent Code Review Gate

implementer 完成后，QA 之前，main agent 必须执行代码 review 并通过 Main Agent Code Review Gate。

硬规则：

1. 未完成 main agent code review，不得进入 QA。
2. code review 必须以本轮 diff 为主轴，但允许读取最小依赖上下文。
3. 发现 blocking findings 时，main agent 不得亲自修复，必须把 findings 转回同一 implementer 线程。不得新开同角色 implementer，除非记录 replacement_reason。
4. QA 只能消费 code review 摘要做测试与验收，不得替代 code review。
5. 若 main agent 在 code review 后直接改代码，本 gate 失败并必须停止。
6. main agent 必须对本轮 touched code files 执行行数检查，输出 `line_count_review`。
7. 任一 touched code file 修改后超过 500 行，且本轮没有实际拆分或明确 `approved_exception`，Main Agent Code Review Gate 失败，findings 必须转回同一 implementer 线程。
8. 如果本轮在超过 500 行文件中只做删除，仍必须记录删除后行数；若删除后仍超过 500 行但未拆分，必须给出 `approved_exception` 或作为 blocker 进入 completion。


对 `implementer_deep` 的 code review 还必须执行 Contract Compliance Review：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-05`）。

任一情况成立，Main Agent Code Review Gate 必须失败并把 findings 转回同一 implementer 线程：

1. implementer 未输出 `contract_compliance_matrix`。
2. 出现 allowed_paths 外的代码改动。
3. 出现未授权依赖、lockfile、schema、API contract 改动。
4. 实现偏离 locked architecture / locked strategy / pseudocode_by_anchor。
5. status=done 但存在未解释的 deviation、partial 或 blocked item。
6. 测试执行未覆盖 Test Contract 的 blocking 项。

`line_count_review` 输出形态：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-06`）。
