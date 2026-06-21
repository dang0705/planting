# role_context_packets Template

```text
role_context_packets:
- brv_recall_packet:
  - status:
  - evidence_ref:
- code_explorer:
  - thread_reuse:
  - subagent_memory_context:
  - template_ref: assets/templates/code-explorer-result.md
  - search_goal:
  - keywords:
  - directories:
  - questions_to_answer:
- implementer:
  - thread_reuse:
  - subagent_memory_context:
  - template_ref: assets/templates/implementer-result.md
  - required_skill:
  - Implementation Contract:
  - Contract-Locked Handoff:
    - contract_id:
    - contract_lock_level:
    - contract_ref:
    - contract_digest:
    - architecture_decisions_locked:
    - implementation_strategy_locked:
    - dependency_policy_locked:
    - target_anchors:
    - pseudocode_by_anchor:
    - stop_conditions:
    - output_requirements:
  - Implementation Packet:
  - allowed_paths:
  - read_only_reference_paths:
  - forbidden_paths:
  - Figma Drilldown Request:
  - implementer_ui_self_check:
- QA:
  - thread_reuse:
  - subagent_memory_context:
  - template_ref: assets/templates/qa-evidence.md
  - required_skill:
  - Test Contract:
  - QA Acceptance Slice:
  - QA Visual Baseline Slice:
  - evidence_plan:
- docs:
  - thread_reuse:
  - subagent_memory_context:
  - template_ref: assets/templates/docs-result.md
  - 文档同步触发依据:
  - 目标文档:
  - 索引同步点:
```

## role-context-packets-01

Source: `references/role-context-packets.md`  
Context: 定位

```text
../assets/templates/role-context-packets.md
```

## role-context-packets-02

Source: `references/role-context-packets.md`  
Context: UI skill 显式触发

```text
required_skill: $implementer-ui-execution-policy
```

## role-context-packets-03

Source: `references/role-context-packets.md`  
Context: UI skill 显式触发

```text
required_skill: $qa-ui-visual-baseline-policy
```

## role-context-packets-04

Source: `references/role-context-packets.md`  
Context: 自动化职责切片

```text
automation_owner:
- formal_qa_owner: qa_reviewer
- implementer_self_check_required: yes / no
- duplicate_automation_forbidden: true
```

## role-context-packets-05

Source: `references/role-context-packets.md`  
Context: 线程复用字段

```text
thread_reuse:
- existing_thread_checked:
- reuse_existing_thread:
- existing_thread_ref:
- replacement_reason_if_new:
```

## role-context-packets-06

Source: `references/role-context-packets.md`  
Context: implementer_deep Contract Packet 硬字段

```text
implementer_deep_contract_packet:
- contract_id:
- contract_lock_level: strict
- contract_ref:
- contract_digest:
- allowed_paths:
- read_only_reference_paths:
- forbidden_paths:
- architecture_decisions_locked:
- implementation_strategy_locked:
- dependency_policy_locked:
- target_anchors:
- pseudocode_by_anchor:
- stop_conditions:
- output_requirements:
  - contract_compliance_matrix: required
```

## role-context-packets-07

Source: `references/role-context-packets.md`  
Context: docs_keeper packet 必填字段

```text
docs_sync_scope:
- changed_contracts:
- active_docs_candidates:
- source_index_candidates:
- brv_sync_required: yes / no
- source_refs:
- forbidden_doc_claims:
- validation_commands:
```

## role-context-packets-08

Source: `references/role-context-packets.md`  
Context: BRV recall packet 分发

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
