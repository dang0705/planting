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

如果 Figma Drilldown / Implementation Slice 中存在 icon / image / vector asset、`imgIcon` / `img*` 或 asset URL，implementer packet 必须包含：

```text
Figma Drilldown Request.asset_nodes:
- node_id:
- name:
- asset_source:
- asset_type:
- exact_source_required: yes / no
- key_props_to_verify:
- forbidden_substitutes:
```

如果涉及 Figma UI 验收，QA packet 必须包含 QA Visual Baseline Slice 和 reference screenshot，不得包含完整 Figma Node Drilldown。

如果涉及 Figma asset / icon / image 对齐，QA packet 必须包含：

```text
QA Visual Baseline Slice.asset_fidelity_checks:
- asset_source:
- asset_type:
- expected_visual:
- expected_key_props:
- forbidden_substitutes:
- actual_evidence_required:
```



## BRV 记忆切片

Phase 1.5 的 `BRV Recall Receipt` 必须被压缩进 role_context_packets。不得把完整 BRV 原文广播给 subagent。

每个 packet 如适用必须包含：

```text
subagent_memory_context:
- brv_recall_receipt_ref:
- relevant_fact_ids:
- relevant_rule_ids:
- relevant_decision_ids:
- relevant_observation_ids:
- excluded_superseded_ids:
- docs_to_read:
- code_to_verify:
- authority_note: BRV routes memory; docs define design boundary; code verifies runtime facts.
```

如果任务涉及 WeChat DevTools MCP / 小程序端上验证，implementer 与 QA packet 必须包含：

```text
wechat_mcp_policy_context:
- formal_qa_owner: qa_reviewer
- implementer_self_check_scope: minimal
- duplicate_automation_forbidden: true
- recovery_skill: $wechat-mcp-transport-recovery
- transport_closed_is_not_product_failure: true
- fallback_automator_allowed_when_9420_works: true
```

subagent 只能使用 packet 中的最小记忆切片。若不足，必须请求 `main agent` 补充最小 context id / source path，不得自行全量读取 `.brv`。

## 自动化职责切片

如果任务需要 WeChat DevTools MCP 或端上验证，role_context_packets 必须写明：

```text
automation_owner:
- formal_qa_owner: qa_reviewer
- implementer_self_check_required: yes / no
- duplicate_automation_forbidden: true
- wechat_recovery_skill: $wechat-mcp-transport-recovery
- wechat_recovery_required: yes / no
```

implementer packet 只包含最小自测范围。QA packet 包含正式自动化范围。


## 输出模板引用

每个 role_context_packet 必须传递 `template_ref`。subagent 不在自身 agent 配置中定义大段输出模板。

默认映射：

- code_explorer：`assets/templates/code-explorer-result.md`
- implementer：`assets/templates/implementer-result.md`
- QA：`assets/templates/qa-evidence.md`
- docs：`assets/templates/docs-result.md`
