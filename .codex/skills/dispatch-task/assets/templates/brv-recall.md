# BRV Recall Template

```text
BRV Fact Routing Packet:
- cache_key:
- cache_hit: yes / no
- packet_ref:
- status: hit / miss / blocked / skipped / retry_non_swarm
- routing_domains:
- queries:
- fact_refs:
  - id:
    claim:
    source_ref:
- authority_doc_refs:
- code_entry_refs:
- test_entry_refs:
- forbidden_assumptions:
- automation_policy:
- subagent_slices:
  - code_explorer:
  - implementer:
  - QA:
  - docs:
- omitted_context_refs:
- blockers:
- fallback:
- suppressed_noise:
  - optional; main internal only, never subagent packet
```

Rules:

- This packet is a routing receipt, not a memory essay.
- Prefer `fact_ref/source_ref/doc_ref/test_ref` over prose.
- `swarm config missing` and WeChat MCP unavailable are not blockers for ordinary product/code tasks.
- Do not place optional swarm or WeChat MCP status in `risk_flags`, `blockers`, or `subagent_slices`.
- If a swarm warning appears during default recall, use `status: retry_non_swarm` and fallback to manifest-scoped BRV index or `brv query`.

## brv-recall-gate-01

Source: `references/brv-recall-gate.md`  
Context: 执行时机

```text
Phase 1: Task facts / ClickUp / prompt facts
Phase 1.5: BRV Minimal Fact Routing Gate
Phase 2: Agent Assignment
```

## brv-recall-gate-02

Source: `references/brv-recall-gate.md`  
Context: 默认召回路径

```text
1. 读取 .brv/context-tree/_manifest.json
2. 读取 .brv/context-tree/_index.md
3. 只选择 manifest active_context 中与任务相关的 context_ref / fact_ref
4. 必要时使用 brv query；只取 id/source_ref/short claim
5. 只有 contract/test 需要事实正文时才展开具体 context 文件
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
swarm_status: not_applicable_by_default
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
Context: BRV Fact Routing Packet

```text
../assets/templates/brv-recall.md
```

## brv-recall-gate-09

Source: `references/brv-recall-gate.md`  
Context: status 语义

```text
hit / miss / blocked / skipped / retry_non_swarm
```

## brv-recall-gate-10

Source: `references/brv-recall-gate.md`  
Context: 不可用与降级

```text
1. manifest-scoped BRV index
2. .codex/memory.md or Codex memory summary only for user/tool preference, not source-verified facts
3. docs/CURRENT.md / docs/ACTIVE_CONTRACTS.md / relevant docs index
4. 相关源码 / tests / package.json / schema
```

## brv-recall-gate-11

Source: `references/brv-recall-gate.md`  
Context: subagent_memory_context

```text
subagent_slices:
- relevant_fact_refs:
- code_entry_refs:
- test_entry_refs:
- forbidden_assumptions:
- evidence_ref:
```

## brv-recall-gate-12

Source: `references/brv-recall-gate.md`  
Context: subagent_memory_context

```text
- swarm config missing
- brv swarm query status
- WeChat MCP transport/config status unless task explicitly asks to debug MCP
- ByteRover CLI banner / warning
- optional swarm capability status
- unrelated BRV history
- complete BRV context file content
```

## brv-recall-gate-13

Source: `references/brv-recall-gate.md`  
Context: WeChat / 端上自动化降噪

```text
automation_policy:
- default_route: dist/dev/mp-weixin -> 9420 -> miniprogram-automator / @dcloudio/uni-automator
- evidence_required: page_stack / page_data / evaluate(wx.request) / selector / screenshot as contracted
- wechat_mcp: optional_explicit_only
- suppress_noise: MCP unavailable, transport closed, swarm config missing
```


## brv-recall-gate-14

Source: `references/brv-recall-gate.md`  
Context: BRV Recall Cache

```text
task_id_or_prompt_hash + hard_constraints_hash + affected_domains + branch
```
