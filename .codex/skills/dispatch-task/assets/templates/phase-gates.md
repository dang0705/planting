# Phase Gate Templates

```text
Phase 0 Gate Receipt:
- mode:
- status: pass / fail
- missing_fields:
- blocking_reason:
- next_action:
- evidence_ref:
```

```text
Pre-Implementation Budget Check:
- estimated_pre_impl_tokens: low / medium / high / extreme
- risk_reason:
- heaviest_sources:
- compression_actions:
- continue_allowed:
```

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
- blockers_written_back: yes / no
- git_commit_completed: yes / no
- open_required_items:
- pass: yes / no
- stop_allowed: yes / no
```

## completion-gate-01

Source: `references/completion-gate.md`  
Context: 输出模板

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
- local_functions_lan_flow_verified: yes / no / not_applicable
- schema_truth_gate_passed: yes / no / not_applicable
- blockers_written_back: yes / no
- git_commit_completed: yes / no
- open_required_items:
- pass: yes / no
- stop_allowed: yes / no
```

## phase-0-gates-01

Source: `references/phase-0-gates.md`  
Context: 定位

```text
../assets/templates/phase-gates.md
```

## phase-0-gates-02

Source: `references/phase-0-gates.md`  
Context: Phase 0 Git baseline

```bash
git status --short
git branch --show-current
git add -A
git commit -m "<message>"
git rev-parse HEAD
git status --short
```

## pre-implementation-budget-fuse-01

Source: `references/pre-implementation-budget-fuse.md`  
Context: 预算估算

```text
../assets/templates/phase-gates.md
```
