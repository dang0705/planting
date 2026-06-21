# Main Agent Gate Templates

本文件保存 main agent 质量门禁、架构裁决、合规 review 与越界处理模板。

## main-agent-quality-gates-01

Source: `references/main-agent-quality-gates.md`  
Context: Gate Receipt 输出模式

```text
../assets/templates/phase-gates.md
```

## main-agent-quality-gates-02

Source: `references/main-agent-quality-gates.md`  
Context: Architecture Direction Record Gate

```text
Architecture Direction Record:
- decision_id:
- based_on_solution_discovery: yes / no
- problem_statement:
- current_system_facts:
- selected_architecture:
- rejected_options:
  - option:
  - rejection_reason:
- reuse_native_plugin_manual_decision:
  - existing_reuse:
  - native_capability:
  - third_party_plugin:
  - manual_implementation:
  - final_choice:
  - hard_rule_for_implementer:
- module_boundaries:
- data_flow:
- API_or_schema_contract:
- state_management_contract:
- error_and_rollback_strategy:
- target_files_and_symbols:
- pseudocode_outline:
- line_count_gate_ref:
- test_strategy_ref:
- audit_evidence_ref:
```

## main-agent-quality-gates-03

Source: `references/main-agent-quality-gates.md`  
Context: Contract-Locked Handoff Gate

```text
Contract-Locked Handoff:
- contract_id:
- target_role: implementer_deep
- contract_lock_level: strict
- architecture_record_ref:
- objective:
- allowed_paths:
- read_only_reference_paths:
- forbidden_paths:
- architecture_decisions_locked:
- implementation_strategy_locked:
- dependency_policy_locked:
- target_anchors:
- pseudocode_by_anchor:
- data_contracts:
- state_transition_contract:
- API_or_schema_contract:
- error_and_rollback_contract:
- test_contract_ref:
- stop_conditions:
- output_requirements:
  - contract_compliance_matrix: required
  - deviations: forbidden_without_blocker
```

## main-agent-quality-gates-04

Source: `references/main-agent-quality-gates.md`  
Context: 可执行审计脚本

```bash
node skills/dispatch-task/scripts/check-main-agent-quality-gates.mjs --files=src/a.ts,src/b.ts
node skills/dispatch-task/scripts/check-main-agent-quality-gates.mjs --contract=runs/<runId>/handoff/implementation-contract.md --target-role=implementer_deep
node skills/dispatch-task/scripts/check-main-agent-quality-gates.mjs --changed --contract=runs/<runId>/handoff/implementation-contract.md --target-role=implementer_deep
```

## main-agent-quality-gates-05

Source: `references/main-agent-quality-gates.md`  
Context: Main Agent Code Review Gate

```text
contract_compliance_review:
- contract_id:
- contract_lock_level:
- matrix_received: yes / no
- unauthorized_file_changes:
- unauthorized_dependency_changes:
- locked_architecture_changed: yes / no
- pseudocode_items_implemented:
- deviations:
- missing_contract_items:
- review_result: pass / blocking
```

## main-agent-quality-gates-06

Source: `references/main-agent-quality-gates.md`  
Context: Main Agent Code Review Gate

```text
line_count_review:
- checked: yes / no
- command_ref:
- over_500_touched_files:
- decomposition_completed: yes / no / not_required
- approved_exception: yes / no / not_applicable
- blocking_findings:
```

## review-scope-policy-01

Source: `references/review-scope-policy.md`  
Context: main agent code review

```text
diff-first + dependency-context-limited
```
