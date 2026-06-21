# Contract Templates

```text
Implementation Contract:
- contract_id:
- target_role: implementer_fast / implementer_deep
- contract_lock_level: none / standard / strict
- 实现目标:
- 文件级改动计划:
- 数据流 / 调用链:
- 模块拆分要求:
- architecture_decisions_locked:
- implementation_strategy_locked:
- dependency_policy_locked:
- 复用 / 插件 / 手搓裁决:
- 删除 / 收敛旧逻辑:
- target_anchors:
- pseudocode_by_anchor:
- data_contracts:
- state_transition_contract:
- API_or_schema_contract:
- error_and_rollback_contract:
- line_count_gate:
- 给 implementer 的硬限制:
- stop_conditions:
- output_requirements:
  - contract_compliance_matrix:
  - deviations_policy:

```

```text
Architecture Direction Record:
- decision_id:
- based_on_solution_discovery:
- problem_statement:
- current_system_facts:
- selected_architecture:
- rejected_options:
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
- audit_evidence_ref:
```

```text
Test Contract:
- source:
- unit-test:
- smoke-test:
- e2e-test:
- UI / Figma:
- API / DB / runtime:
- manual:
- failure blocking rules:
```

## implementation-test-contract-01

Source: `references/implementation-test-contract.md`  
Context: 定位

```text
../assets/templates/contracts.md
```

## implementation-test-contract-02

Source: `references/implementation-test-contract.md`  
Context: Implementation Contract

```text
Contract-Locked Implementation Contract:
- contract_id:
- target_role: implementer_deep
- contract_lock_level: strict
- objective:
- allowed_paths:
- read_only_reference_paths:
- forbidden_paths:
- architecture_decisions_locked:
- implementation_strategy_locked:
- dependency_policy_locked:
- target_anchors:
  - file:
  - symbol_or_component:
  - approx_lines:
  - nearby_code_keywords:
  - required_change:
- pseudocode_by_anchor:
- data_contracts:
- state_transition_contract:
- API_or_schema_contract:
- error_and_rollback_contract:
- line_count_gate:
- test_contract_ref:
- stop_conditions:
- output_requirements:
  - contract_compliance_matrix: required
  - deviations: forbidden_without_blocker
```

## implementation-test-contract-03

Source: `references/implementation-test-contract.md`  
Context: 500 行拆分硬指标

```text
line_count_gate:
- touched_code_file_line_counts_before:
- expected_line_counts_after:
- over_400_line_touched_files:
- over_500_line_touched_files:
- decomposition_required: yes / no
- decomposition_plan:
- approved_exception: yes / no
- exception_reason:
```

## implementation-test-contract-04

Source: `references/implementation-test-contract.md`  
Context: 端上接口与题包自动化硬门禁

```text
Mini Program Runtime QA:
- automation_required: yes
- endpoint:
- page:
- projectPath: /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
- payload:
- assertions:
- evidence_source: miniprogram_automator_wx_request / miniprogram_automator_ui / real_device_interaction
- local_functions_gateway_required: yes / no
- cloud_deploy_status: deployed / not_deployed / unknown
- blocker_rule: if automator cannot cover required item, mark blocker/not_verified, not complete
```

## implementation-test-contract-05

Source: `references/implementation-test-contract.md`  
Context: 端上接口与题包自动化硬门禁

```text
projectPath 校验 -> 9420 automator 监听 -> 原始 WebSocket -> miniprogram-automator currentPage / page_data / selector 或 evaluate(wx.request) -> 真实交互 / 运行时接口断言
```

## implementation-test-contract-06

Source: `references/implementation-test-contract.md`  
Context: SQL schema truth gate

```text
Schema Truth Gate:
- touched_sql_area:
- live_schema_check: INFORMATION_SCHEMA / CloudBase MCP / unavailable
- checked_in_schema_spec:
- runtime_endpoint_smoke:
- mini_program_runtime_request:
- unknown_column_guard:
- live_schema_gap:
```
