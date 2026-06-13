# Completion Gate

## 定位

本文件定义任务是否可以停止 / Done / 回写完成状态的最终门禁。

## 完成条件

只有同时满足以下条件时，任务才能标记完成并停止：

1. 所有 required acceptance items 已映射到 Test Case Base。
2. 所有 required Test Case 已通过，或存在明确 blocker 并已写回 ticket / summary。
3. QA 已按 Test Contract 完成验收。
4. 如果验收要求小程序实际交互，QA 已执行 WeChat DevTools MCP 自动化或端上验证。
   - 若内置 `mcp__wechat_dev_tools` transport 失活，但底层 `miniprogram-automator` 直连已完成 Test Contract required item 的真实端上取证，则同样视为 `mini_program_automation_completed=yes`。
5. 如果任务触及 `/diagnosis/question/start`、`/diagnosis/answer`、question package、诊断小程序请求路径或 CloudBase SQL repository / schema / seed，`mini_program_automation_completed` 必须为 `yes`，或存在明确 blocker / not_verified 结论。
6. 如果本轮代码未部署到云端，QA 已通过 local functions gateway + 小程序运行时验证命中新代码。
7. 如果触及 CloudBase SQL repository / schema / seed，schema truth gate 已完成；若 live schema auth 不可用，已记录 checked-in schema spec + runtime endpoint smoke / 端上请求证据，并把 live schema 未验证列为 gap。
8. ClickUp markdown checklist 已按结果回写，或原生 checklist MCP 不可用已明确记录并写回验收评论。
9. blocking findings 为 0。
10. Git commit 已完成，或存在明确不能提交的 blocker。
11. 未验证项已明确分类并写回。
12. 如 `docs_keeper_required=yes`，docs_keeper 已完成同步或给出可审计的无需同步理由。
13. 本轮 touched code files 已通过 500 行拆分硬指标检查。

## 不允许停止的情况

以下任一情况存在时，不得把任务当成完成：

1. 仅本地后端测试 PASS，但前端 / 小程序验收未做。
2. 仅 API 验证通过，但 UI 控件验收未做。
3. checklist / acceptance criteria 未映射。
4. QA 自动化未执行，且验收要求端上交互。
   - 仅当内置 MCP 与 fallback `miniprogram-automator` 两条链路都未拿到 required item 证据时，才继续阻塞 completion。
5. 任务触及 `/diagnosis/question/start`、`/diagnosis/answer`、question package、诊断小程序请求路径或 CloudBase SQL repository / schema / seed，但 Test Contract 缺少 concrete endpoint / page / projectPath / payload / assertions / evidence_source。
6. 对端上接口只用 Node 直接 HTTP、curl、backend smoke、unit tests 或 repository tests 作为完成证据。
7. 本轮代码未部署到云端，且没有 local functions gateway + 小程序运行时验证。
8. WeChat DevTools MCP 与底层 `miniprogram-automator` 都失败，但仍把 QA 标记为 complete。
9. CloudBase SQL repository / schema / seed 改动缺少 schema truth gate，或 live auth 不可用时没有记录 checked-in schema spec + runtime endpoint smoke / 端上请求证据。
10. checklist writeback 未执行且没有 blocker / comment fallback。
11. 有未处理 request changes。
12. 有 required item 为 pending / not_verified 且用户未接受风险。
13. `docs_keeper_required=yes` 但未分配或未完成 docs_keeper。
14. touched code file 超过 500 行且没有实际拆分、没有 approved exception、没有 blocker 写回。

## 输出模板

```text
Completion Gate:
- acceptance_matrix_complete: yes / no
- required_tests_passed: yes / no
- qa_completed: yes / no
- mini_program_automation_completed: yes / no / not_applicable
- checklist_writeback_completed: yes / no / not_applicable
- docs_keeper_required: yes / no
- docs_sync_completed: yes / no / not_applicable
- docs_sync_evidence_ref:
- line_count_gate_passed: yes / no
- over_500_touched_files:
- decomposition_completed_or_blocked: yes / no / not_applicable
- endpoint_runtime_contract_complete: yes / no / not_applicable
- local_functions_gateway_verified: yes / no / not_applicable
- schema_truth_gate_passed: yes / no / not_applicable
- blockers_written_back: yes / no
- git_commit_completed: yes / no
- open_required_items:
- pass: yes / no
- stop_allowed: yes / no
```
