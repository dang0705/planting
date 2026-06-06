# role_context_packets 规则

## 定位

`role_context_packets` 用于避免把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。

输出格式引用：

```text
../assets/templates/role-context-packets.md
```

## 预算

默认预算上限：

- code_explorer：不超过 300 tokens。
- implementer：不超过 900 tokens；复杂 Figma 任务可不超过 1400 tokens。
- QA：不超过 700 tokens；Figma UI 任务可包含 QA Visual Baseline Slice，必要时不超过 1000 tokens。
- docs：不超过 400 tokens。

超过预算必须改用 evidence_ref / appendix_ref / file path / source id。

## UI skill 显式触发

UI skill 不通过 agent 固定配置挂载。必须由 `dispatch-task` 在 `role_context_packets` 中显式触发。

implementer packet：

```text
required_skill: $implementer-ui-execution-policy
```

QA packet：

```text
required_skill: $qa-ui-visual-baseline-policy
```

非 UI 任务不得触发这两个 skill。

## Figma Drilldown 与 QA Visual Baseline

如果 Figma Drilldown 需要在开发阶段读取，implementer packet 只传 request，不传完整 Drilldown。

如果涉及 Figma UI 验收，QA packet 必须包含 QA Visual Baseline Slice 和 reference screenshot，不得包含完整 Figma Node Drilldown。


## 自动化职责切片

如果任务需要 WeChat DevTools MCP 或端上验证，role_context_packets 必须写明：

```text
automation_owner:
- formal_qa_owner: qa_reviewer
- implementer_self_check_required: yes / no
- duplicate_automation_forbidden: true
```

implementer packet 只包含最小自测范围。QA packet 包含正式自动化范围。


## 线程复用字段

每个需要执行的 role_context_packet 必须包含线程复用字段：

```text
thread_reuse:
- existing_thread_checked:
- reuse_existing_thread:
- existing_thread_ref:
- replacement_reason_if_new:
```

如果同一 dispatch_run_id / ticket / branch / scope 下已有同角色线程且可用，必须复用，不得创建新线程。

## 输出模板引用

每个 role_context_packet 必须传递 `template_ref`。subagent 不在自身 agent 配置中定义大段输出模板。

默认映射：

- code_explorer：`assets/templates/code-explorer-result.md`
- implementer：`assets/templates/implementer-result.md`
- QA：`assets/templates/qa-evidence.md`
- docs：`assets/templates/docs-result.md`


## BRV recall packet 分发

如果 Phase 1.5 产生 BRV Recall Packet，main agent 必须将其压缩后分发到 role_context_packets。

分发原则：

1. 不广播完整 BRV 输出。
2. 只给每个 subagent 对应的 `subagent_memory_context`。
3. BRV 缺失时，在 packet 中记录 `brv_status` 和 fallback。
4. 不输出 ByteRover / swarm 配置噪声。

建议字段：

```text
brv_recall_packet:
- status:
- evidence_ref:
- relevant_repo_facts:
- risk_flags:
- test_entry_refs:
- mcp_usage_notes:

subagent_memory_context:
- relevant_repo_facts:
- known_test_entries:
- mcp_usage_notes:
- forbidden_assumptions:
- evidence_ref:
```
