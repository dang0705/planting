# role_context_packets 规则

## 定位

`role_context_packets` 用于避免把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。

输出格式引用：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-01`）。

## 预算

默认预算上限：

- code_explorer：不超过 300 tokens。
- implementer_fast：不超过 900 tokens；复杂 Figma 任务可不超过 1400 tokens。
- implementer_deep：默认不超过 1600 tokens；Contract-Locked Handoff 可不超过 2400 tokens。超过时必须把完整 Contract 放入 appendix_ref / handoff 文件，并在 packet 中传 `contract_digest` + `contract_ref`。
- QA：不超过 700 tokens；Figma UI 任务可包含 QA Visual Baseline Slice，必要时不超过 1000 tokens。
- docs：不超过 400 tokens。

超过预算必须改用 evidence_ref / appendix_ref / file path / source id。

## UI skill 显式触发

UI skill 不通过 agent 固定配置挂载。必须由 `dispatch-task` 在 `role_context_packets` 中显式触发。

implementer packet：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-02`）。

QA packet：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-03`）。

非 UI 任务不得触发这两个 skill。

## Figma Drilldown 与 QA Visual Baseline

如果 Figma Drilldown 需要在开发阶段读取，implementer packet 只传 request，不传完整 Drilldown。

如果涉及 Figma UI 验收，QA packet 必须包含 QA Visual Baseline Slice 和 reference screenshot，不得包含完整 Figma Node Drilldown。


## 自动化职责切片

如果任务需要端上 `miniprogram-automator` / `9420` 验证，role_context_packets 必须写明：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-04`）。

implementer packet 只包含最小自测范围。QA packet 包含正式自动化范围。


## 线程复用字段

每个需要执行的 role_context_packet 必须包含线程复用字段：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-05`）。

如果同一 dispatch_run_id / ticket / branch / scope 下已有同角色线程且可用，必须复用，不得创建新线程。


## implementer_deep Contract Packet 硬字段

当目标角色为 `implementer_deep` 时，role_context_packet 必须携带严格 Contract 字段。不得只传一句任务描述。

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-06`）。

规则：

1. packet 只传当前实现所需最小上下文，但不能省略 Contract 锁定字段。
2. 如果完整 Contract 较长，必须用 `contract_ref` 指向 handoff 文件；`contract_digest` 必须保留硬限制摘要。
3. `allowed_paths` / `forbidden_paths` 必须在 packet 和 Agent Assignment 中一致；不一致时 Gate 阻塞。
4. 不得把完整历史、完整 ClickUp、完整 BRV、完整规则目录广播给 implementer_deep。

## 输出模板引用

每个 role_context_packet 必须传递 `template_ref`。subagent 不在自身 agent 配置中定义大段输出模板。

默认映射：

- code_explorer：`assets/templates/code-explorer-result.md`
- implementer：`assets/templates/implementer-result.md`
- QA：`assets/templates/qa-evidence.md`
- docs：`assets/templates/docs-result.md`

## docs_keeper packet 必填字段

当 `docs_keeper_required=yes` 时，必须生成 docs_keeper role_context_packet，且不得把完整 task facts、完整代码 diff 或完整 BRV 输出广播给 docs_keeper。

docs_keeper packet 必须包含：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-07`）。

规则：

1. `active_docs_candidates` 只能列最小候选文件，优先从 `docs/code-logics/INDEX.md`、`docs/new-rules/planting_ai_diagnosis_source_index.json` 和 BRV Fact Routing Packet 选择。
2. `source_refs` 必须指向当前代码入口、测试入口或 config，而不是旧蓝图。
3. 若 `brv_sync_required=yes`，packet 必须要求执行 `npm run check:brv-context-lifecycle` 或说明不可执行原因。
4. docs_keeper receipt 必须明确 `docs_changed` 或 `docs_not_changed_reason`，不能只说“无需同步”。


## BRV Fact Routing Packet 分发

如果 Phase 1.5 产生 BRV Fact Routing Packet，main agent 必须只按 role 分发最小 fact_ref / source_ref / code_ref / test_ref。

分发原则：

1. 不广播完整 BRV 输出。
2. 不把完整 fact 正文广播给 subagent；默认只传 fact_ref/source_ref。
3. 只给每个 subagent 对应的 `subagent_slices`。
4. BRV 缺失时，在 packet 中记录 `brv_status` 和 fallback。
5. 不输出 ByteRover / swarm / WeChat MCP 配置噪声。
6. 端上 QA 默认传 automator 路径，不传旧 WeChat MCP recovery。

建议字段：

外置模板/规范片段：`../assets/templates/role-context-packets.md`（template_id: `role-context-packets-08`）。


## 测试职责 packet 边界

implementer packet 可以包含 Implementer Validation Contract 中的 unit_tests / lint / typecheck / build_check。QA packet 不得包含 unit tests；只能包含 QA Validation Contract 中的 e2e、mini_program_runtime、ui_figma、runtime_api_flow、manual_if_needed。

QA packet 可以包含 `implementer_unit_evidence_ref` 作为上游证据引用，但不得要求 QA 重跑单测。
