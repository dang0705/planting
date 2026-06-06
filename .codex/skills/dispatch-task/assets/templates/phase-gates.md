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
Main Agent Quality Gate Receipt:
- gate_name: solution_discovery / technical_direction / implementation_contract_completeness / main_agent_code_review
- status: pass / fail
- continue_allowed: true / false
- command:
- command_output_ref:
- checked_files:
- warning_findings:
- blocking_findings:
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
BRV Recall Receipt:
- status: pass / skipped / blocked
- query_basis:
- recall_methods:
  - brv_query: pass / failed / skipped
  - brv_swarm_query: not_required / pass / skipped_optional / unavailable / failed_non_blocking
  - swarm_reason:
  - manifest_fallback: yes / no
- matched_contexts:
  - context_id:
    path:
    matched_reason:
- injected_memory:
  - fact_ids:
  - rule_ids:
  - decision_ids:
  - observation_ids:
- excluded_memory:
  - superseded_or_deprecated:
  - low_confidence:
  - not_source_verified_fact:
- docs_to_read:
- code_to_verify:
- test_entrypoints:
- subagent_memory_context:
- continue_allowed: true / false
```
