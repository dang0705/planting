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
