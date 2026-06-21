# BRV Recall Template

```text
BRV Recall Packet:
- cache_key:
- cache_hit: yes / no
- packet_ref:
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

## brv-recall-gate-01

Source: `references/brv-recall-gate.md`  
Context: 执行时机

```text
Phase 1: Task facts / ClickUp / prompt facts
Phase 1.5: BRV Recall Gate
Phase 2: Agent Assignment
```

## brv-recall-gate-02

Source: `references/brv-recall-gate.md`  
Context: 默认召回路径

```text
1. 读取 .brv/context-tree/_index.md
2. 读取 .brv/context-tree/_manifest.json
3. 只选择 manifest active_context 中与任务相关的条目
4. 必要时使用 brv query / source-verified BRV index
```

## brv-recall-gate-03

Source: `references/brv-recall-gate.md`  
Context: 默认召回路径

```text
brv swarm query
```

## brv-recall-gate-04

Source: `references/brv-recall-gate.md`  
Context: 默认召回路径

```text
.brv/swarm/config.yaml
```

## brv-recall-gate-05

Source: `references/brv-recall-gate.md`  
Context: ByteRover swarm 策略

```text
swarm_status: not_configured_optional
```

## brv-recall-gate-06

Source: `references/brv-recall-gate.md`  
Context: ByteRover swarm 策略

```text
brv_status
blockers
risk_flags
role_context_packets
subagent_memory_context
```

## brv-recall-gate-07

Source: `references/brv-recall-gate.md`  
Context: ByteRover swarm 策略

```text
brv_status: retry_non_swarm
noise_suppressed: swarm_config_missing
fallback: manifest-scoped BRV index / brv query
```

## brv-recall-gate-08

Source: `references/brv-recall-gate.md`  
Context: BRV Recall Packet

```text
../assets/templates/brv-recall.md
```

## brv-recall-gate-09

Source: `references/brv-recall-gate.md`  
Context: BRV Recall Packet

```text
hit / miss / blocked / skipped / retry_non_swarm
```

## brv-recall-gate-10

Source: `references/brv-recall-gate.md`  
Context: 不可用与降级

```text
1. manifest-scoped BRV index
2. .codex/memory.md
3. docs/CURRENT.md / docs/ACTIVE_CONTRACTS.md
4. 相关源码 / tests / schema
```

## brv-recall-gate-11

Source: `references/brv-recall-gate.md`  
Context: subagent_memory_context

```text
subagent_memory_context:
- relevant_repo_facts:
- known_test_entries:
- mcp_usage_notes:
- forbidden_assumptions:
- evidence_ref:
```

## brv-recall-gate-12

Source: `references/brv-recall-gate.md`  
Context: subagent_memory_context

```text
- swarm config missing
- ByteRover CLI banner / warning
- optional swarm capability status
- unrelated BRV history
```
