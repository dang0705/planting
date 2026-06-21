# Agent Assignment Template

```text
Agent Assignment:
- Execution Gate:
  - code_changes_required:
  - implementer_required:
  - implementer_selected:
  - implementation_contract_id:
  - implementation_contract_lock_level:
  - implementer_deep_contract_locked:
  - implementer_missing_is_blocking: true
  - main_agent_write_code_allowed: false
  - fallback_default_thread_allowed: false
  - legal_exception_if_no_implementer:
- Subagent Reuse Gate:
  - existing_subagents_checked:
  - dispatch_run_id:
  - ticket_id:
  - branch:
  - scope:
  - reuse_decision:
  - existing_thread_ref:
  - replacement_reason_if_new:
- main_agent:
  - technical_direction:
  - Implementation Contract:
  - Test Contract:
  - code review:
  - Git commit:
- code_explorer:
  - assigned:
  - reuse_existing_thread:
  - existing_thread_ref:
  - reason:
  - packet:
- implementer:
  - selected:
  - reuse_existing_thread:
  - existing_thread_ref:
  - replacement_reason_if_new:
  - implementation_contract_attached:
  - implementation_contract_id:
  - contract_lock_level:
  - reason:
  - packet:
- qa_reviewer:
  - assigned:
  - reuse_existing_thread:
  - existing_thread_ref:
  - replacement_reason_if_new:
  - reason:
  - packet:
- docs_keeper:
  - assigned:
  - reuse_existing_thread:
  - existing_thread_ref:
  - replacement_reason_if_new:
  - reason:
  - packet:
```

## agent-assignment-gate-01

Source: `references/agent-assignment-gate.md`  
Context: Agent Assignment 最低输出

```text
Agent Assignment:
- dispatch_run_id:
- clickup_ticket:
- branch:
- scope:
- code_changes_required: yes / no
- code_explorer_required: yes / no
- implementer_required: yes / no
- qa_reviewer_required: yes / no
- docs_keeper_required: yes / no
- existing_subagents_checked: yes / no
- reuse_decision:
- spawn_contracts_validated: yes / no
- implementation_contract_id:
- implementation_contract_lock_level: none / standard / strict
- implementer_deep_contract_locked: yes / no / not_applicable
- gate_result: pass / blocked
- blocker:
```

## agent-assignment-gate-02

Source: `references/agent-assignment-gate.md`  
Context: Agent Assignment 最低输出

```text
Subagent Assignment:
- role:
- required: yes / no
- reason:
- assigned: yes / no / not_applicable
- reuse_decision: reused / create_new / not_required / blocked
- existing_thread:
- replacement_reason:
- spawn_required: yes / no
- spawn_attempted: yes / no / not_applicable
- spawn_succeeded: yes / no / not_applicable
- agent_type:
- task_name:
- fork_turns: none
- context_policy: minimal_context_only
- implementation_contract_attached: yes / no / not_applicable
- implementation_contract_id:
- contract_lock_level: none / standard / strict
- context_packet_summary:
- spawn_failure_raw:
```

## agent-assignment-gate-03

Source: `references/agent-assignment-gate.md`  
Context: implementer_deep Contract-Locked Engineer Gate

```text
implementer_deep_contract_lock:
- required: yes
- model_assumption: glm-5.2
- contract_lock_level: strict
- implementation_contract_id:
- architecture_decisions_locked: yes
- implementation_strategy_locked: yes
- dependency_policy_locked: yes
- pseudocode_by_anchor_present: yes
- target_anchors_present: yes
- allowed_paths_complete: yes
- read_only_reference_paths_complete: yes
- forbidden_paths_complete: yes
- stop_conditions_complete: yes
- contract_compliance_matrix_required: yes
- gate_result: pass / blocked
```

## agent-assignment-gate-04

Source: `references/agent-assignment-gate.md`  
Context: main agent 写入硬边界

```text
Main Agent Boundary Violation:
- files_touched:
- violation_type:
- required_recovery:
  - revert_or_handoff_to_implementer:
  - review_required:
```

## agent-assignment-gate-05

Source: `references/agent-assignment-gate.md`  
Context: Subagent Spawn Contract Gate

```text
Spawn Contract:
- spawn_required: yes / no
- spawn_attempted: yes / no / not_applicable
- spawn_succeeded: yes / no / not_applicable
- agent_type:
- task_name:
- fork_turns: none
- context_policy: minimal_context_only
- context_packet:
  - dispatch_run_id:
  - clickup_ticket:
  - branch:
  - scope:
  - role_boundary:
  - task_objective:
  - allowed_files:
  - forbidden_files:
  - must_read:
  - must_not_read:
  - acceptance_criteria:
  - implementation_contract_id:
  - contract_lock_level: none / standard / strict
  - architecture_decisions_locked:
  - implementation_strategy_locked:
  - dependency_policy_locked:
  - target_anchors:
  - pseudocode_by_anchor:
  - stop_conditions:
  - return_format:
- spawn_failure_raw:
```

## agent-assignment-gate-06

Source: `references/agent-assignment-gate.md`  
Context: Subagent Spawn Contract Gate

```text
Subagent Spawn Blocker:
- agent_type:
- task_name:
- fork_turns:
- context_policy:
- raw_error:
- suspected_reason:
  - agent_type_unavailable:
  - fork_turns_rejected:
  - agent_limit_reached:
  - mcp_startup_failed:
  - model_or_backend_unsupported:
  - unknown:
```

## agent-assignment-gate-07

Source: `references/agent-assignment-gate.md`  
Context: Subagent 启动探针

```text
必须 spawn code_explorer subagent。
要求：agent_type="code_explorer"；task_name="probe_code_explorer_spawn"；fork_turns="none"；context_policy="minimal_context_only"；message="只回复 STARTED，不读取项目文件，不修改任何文件。"
如果 spawn_agent 失败，输出原始错误；不要换成 main agent 自己回答。
```
