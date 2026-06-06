# BRV Recall Template

```text
BRV Recall Packet:
- status: hit / miss / blocked / skipped / retry_non_swarm
- queries:
- repo_facts:
  - fact:
  - source_ref:
- risk_flags:
- test_entry_refs:
- mcp_usage_notes:
- subagent_memory_context:
  - code_explorer:
  - implementer:
  - QA:
  - docs:
- blockers:
- fallback:
- suppressed_noise:
  - optional; use only in main receipt, not in subagent packets
```

Rules:

- `swarm config missing` is not a blocker.
- Do not place optional swarm status in `risk_flags`, `blockers`, or `subagent_memory_context`.
- If a swarm warning appears during default recall, use `status: retry_non_swarm` and fallback to manifest-scoped BRV index or `brv query`.
