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
