# Dispatch-task and Docs Reading Rules

Status: active  
Owner: workflow  
Verified: 2026-06-06  
Review after: 90d

## Rules

- id: R-DISPATCH-REFERENCE-READING-001
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 22-32
      symbol: 规则读取策略
    - file: .codex/skills/dispatch-task/references/INDEX.md
      lines: 7-13
      symbol: 默认读取策略
  statement: `dispatch-task` should read `references/INDEX.md` first, then only phase-specific reference files; it must not read the entire references directory or inject all phase rules into every `role_context_packet`.

- id: R-DISPATCH-PHASE-FLOW-002
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 40-56
      symbol: Phase 流程
    - file: docs/ai-rules/codex-ai-workflow.md
      lines: 13-27
      symbol: Phase Condition 模型
  statement: `dispatch-task` is a phase-gated workflow; any phase not passed blocks the next phase, and the flow now includes `Phase 1.5: BRV Recall Condition` between fact reading and Agent Assignment.

- id: R-DISPATCH-CONTEXT-PACKETS-003
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 154-162
      symbol: role_context_packets
    - file: docs/ai-rules/codex-ai-workflow.md
      lines: 56-63
      symbol: token 预算
  statement: `role_context_packets` must avoid broadcasting full ClickUp, Figma, logs, complete rule documents, or complete BRV source. Downstream roles should receive scoped facts, task slices, and minimal BRV memory slices.

- id: R-DISPATCH-BUDGET-FUSE-004
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 184-193
      symbol: Pre-Implementation Budget Fuse
    - file: .codex/skills/dispatch-task/references/pre-implementation-budget-fuse.md
      lines: 1-120
      symbol: token budget policy
  statement: Before implementation, high/extreme pre-implementation token risk requires fact compression, fewer candidates, delayed full drilldown, and use of BRV Recall Receipt to route the minimum docs/code set.

- id: R-DOCS-CODELOGICS-INDEX-005
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: docs/code-logics/INDEX.md
      lines: 5-16
      symbol: 定位 / 读取原则
    - file: docs/code-logics/INDEX.md
      lines: 20-33
      symbol: 快速路由
    - file: docs/code-logics/INDEX.md
      lines: 52-77
      symbol: 与 subagent 的配合
  statement: `docs/code-logics/` is not default context. Agents should read the index first, choose at most 1-2 relevant logic documents by default, and downstream agents should prefer upstream summaries over repeated source-doc reads.

- id: R-DISPATCH-BRV-RECALL-006
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 106-130
      symbol: Phase 1.5：BRV Recall Condition
    - file: .codex/skills/dispatch-task/references/INDEX.md
      lines: 72-80
      symbol: BRV Recall Condition 路由
  statement: Non-simple dispatch tasks must run BRV Recall Condition after Phase 1 facts and before Phase 2 Agent Assignment, producing a BRV Recall Receipt and downstream `subagent_memory_context`.

- id: R-DISPATCH-BRV-MANIFEST-007
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 26-45
      symbol: 读取范围 / 召回过滤
  statement: BRV Recall Condition must read `_index.md` and `_manifest.json`, select only manifest `active_context`, and reject superseded/deprecated entries; facts must be source-verified code/config/package entries with `source.file` and `source.lines`.

- id: R-DISPATCH-BRV-SUBAGENT-008
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 216-228
      symbol: Subagent 执行
    - file: .codex/skills/dispatch-task/references/role-context-packets.md
      lines: 75-106
      symbol: BRV 记忆切片
    - file: .codex/skills/dispatch-task/references/agent-assignment-condition.md
      lines: 23-25
      symbol: BRV 前置门禁
  statement: Subagents must receive the minimal `subagent_memory_context` from Phase 1.5 and must not full-read `.brv`; if memory is insufficient, they request only the missing context id or source path from main agent.

- id: R-DISPATCH-BRV-WECHAT-009
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 95-109
      symbol: 端上 automator 记忆注入
    - file: .codex/skills/dispatch-task/references/role-context-packets.md
      lines: 94-106
      symbol: runtime_automator_policy_context
  statement: When a task touches mini-program端上验证, `9420`, `miniprogram-automator`, runtime `wx.request`, or UI/Figma mini-program acceptance, dispatch must inject the stable runtime automator policy context into implementer and QA packets.

- id: R-DISPATCH-WECHAT-AUTOMATOR-011
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/references/wechat-devtools-automation-policy.md
      lines: 81-123
      symbol: miniprogram-automator 直连验收
    - file: .codex/skills/dispatch-task/references/qa-evidence-policy.md
      lines: 32-63
      symbol: QA automator evidence fields
  statement: Dispatch tasks that require mini-program端上 evidence must use direct `miniprogram-automator` / `9420` automation by default, and API acceptance must use WeChat runtime `wx.request` rather than Node direct HTTP.

- id: R-DISPATCH-WECHAT-RUNTIME-SUCCESS-MODE-012
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: docs/ai-rules/codex-ai-workflow.md
      lines: 111-126
      symbol: Stable automation and QA budget
    - file: .codex/context-packs.yml
      lines: 34-43
      symbol: wechat-runtime-qa
    - file: .brv/context-tree/tooling/miniprogram_runtime_automator_usage.md
      lines: 149-161
      symbol: R-WECHAT-RUNTIME-QA-SUCCESS-MODE-009
  statement: Dispatch packets for `qa_reviewer`, `9420`, `miniprogram-automator`, runtime `wx.request`, or 端上自动化 must include the stable runtime QA success mode. QA should keep `dist/dev/mp-weixin` as projectPath, use 9420/WebSocket/automator for real evidence, and classify clickable-entry-without-popup failures as product/fixture blockers unless tooling/session evidence proves otherwise.

- id: R-DISPATCH-BRV-SWARM-OPTIONAL-010
  type: rule
  status: verified
  confidence: high
  source_kind: docs
  source:
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 26-78
      symbol: ByteRover swarm 策略
  statement: `brv query` and manifest-scoped BRV index recall are the default BRV Recall methods. `brv swarm query` is optional and off by default. It may run only when the task explicitly needs swarm, `.brv/swarm/config.yaml` exists, and the CLI supports it. Missing swarm config is `not_configured_optional` and must not be written into `brv_status`, `blockers`, `risk_flags`, `role_context_packets`, or `subagent_memory_context`.

## Decisions

- id: D-BRV-RECALL-CONDITION-001
  type: decision
  status: verified
  confidence: high
  source_kind: workflow
  source:
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 40-56
      symbol: Phase 流程
    - file: .codex/skills/dispatch-task/SKILL.md
      lines: 106-130
      symbol: Phase 1.5：BRV Recall Condition
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 1-14
      symbol: 定位 / 分工
  statement: `Phase 1.5 BRV Recall Condition` is implemented as a workflow decision: BRV routes relevant memory, docs, and code before Agent Assignment, while ClickUp/prompt remains the task fact source, docs remain design/process authority, and code remains runtime authority.
