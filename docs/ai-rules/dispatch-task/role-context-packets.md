# role_context_packets 规则

`role_context_packets` 用于避免把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。

必须输出：

```text
role_context_packets:
- code_explorer:
- implementer:
- QA:
- docs:
```

## code_explorer

```text
code_explorer_packet:
- 是否需要:
- search_goal:
- keywords:
- directories:
- candidate_files:
- questions_to_answer:
- forbidden_scope:
```

## implementer

```text
implementer_packet:
- Implementation Contract:
- Implementation Packet:
- allowed_paths:
- forbidden_paths:
- local_drilldown:
- Test Contract 中需补测试代码的部分:
```

## QA

```text
qa_packet:
- Test Contract:
- QA Acceptance Slice:
- changed_files_as_test_scope_hint:
- evidence_plan:
- checklist items mapped to test cases:
```

QA 不读完整 Implementation Packet，不审代码 diff。

## docs

```text
docs_packet:
- 文档同步触发依据:
- 目标文档:
- 术语 / 规则 / 索引同步点:
- 不需要同步的理由:
```


## role_context_packet_budget

默认预算上限：

```text
role_context_packet_budget:
- code_explorer: <= 300 tokens
- implementer: <= 900 tokens
- implementer_with_complex_figma: <= 1400 tokens
- QA: <= 700 tokens
- docs: <= 400 tokens
```

超过预算必须改用：

```text
evidence_ref / appendix_ref / file path / source id
```

禁止把完整 ClickUp、完整 Figma、完整日志、完整规则、完整搜索结果放进任何 packet。

## v50 Figma Drilldown 与 QA Visual Baseline 分发

### implementer packet

如果 Figma Drilldown 需要在开发阶段读取，implementer packet 只传 request，不传完整 Drilldown：

```text
implementer_figma_packet:
- Figma Design Facts Lite:
- Implementation Packet:
- Figma Drilldown Request:
  - drilldown_required:
  - target_node_id:
  - reason:
  - max_depth:
  - sample_limit:
```

### QA packet

如果涉及 Figma UI 验收，QA packet 必须包含：

```text
qa_figma_packet:
- Figma Design Facts Lite:
- QA Acceptance Slice:
- QA Visual Baseline Slice:
- reference_screenshot:
- actual_evidence_required:
- local_drilldown_allowed:
```

QA packet 不得包含完整 `Figma Node Drilldown`。


## v53 role-specific skill references

### implementer packet 必须引用专用 skill

```text
implementer_packet:
- required_skill: $implementer-ui-execution-policy
- Implementation Packet:
- Figma Drilldown Request:
- allowed_paths:
- forbidden_paths:
```

如果 `drilldown_required=yes`，implementer 必须显式调用 Figma MCP；不可用则停止。

### QA packet 必须引用专用 skill

```text
qa_packet:
- required_skill: $qa-ui-visual-baseline-policy
- QA Visual Baseline Slice:
- reference_screenshot:
- actual_evidence_required:
```

QA 不读取完整 Implementation Packet 或完整 Drilldown。


## v54 显式 UI skill 触发

UI skill 不再通过 agent 固定 `skills.config` 挂载。必须由 `dispatch-task` 在 `role_context_packets` 中显式触发。

```text
implementer_packet:
- required_skill: $implementer-ui-execution-policy
- trigger_condition:
  - UI implementation required
  - Figma Drilldown Request exists
- Figma Drilldown Request:
```

```text
qa_packet:
- required_skill: $qa-ui-visual-baseline-policy
- trigger_condition:
  - QA Visual Baseline Slice exists
  - Figma/UI QA required
- QA Visual Baseline Slice:
```

非 UI 任务不得触发这两个 skill。
