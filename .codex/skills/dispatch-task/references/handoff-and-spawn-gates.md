# Handoff and Spawn Gates

## Gate B — Handoff Contract

`standard_task`、`deep_contract`、`external_implementer` 必须生成 JSON Handoff Contract：

```text
dispatch_run_id
dispatch_tier: standard_task / deep_contract / external_implementer / qa_only / docs_only
implementation_mode: codex_subagent / external_implementer
task: {objective, code_changes_required, ui_task, risk, qa_required}
target_role
spawn_contract
external_contract                   # implementation_mode=external_implementer 时必填；旧 zcode_contract 兼容
handoff_manual                      # implementation_mode=external_implementer 时必填
allowed_paths / forbidden_paths
acceptance
project_constraints
decision_lock:
  level: standard / strict
  architecture_invariants
  local_decisions_allowed
figma:
  link / node_id
  lite_status
  main_access: lite_only
  main_tools_used
  lite_receipt                       # 可选，仅身份/尺寸/顶层分区
  implementer_fetch_required
  qa_baseline_fetch_required
required_skills / required_prompt_sections
validation
output_evidence_required
```

派发前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
```

失败不得进入实现阶段。

## Gate B1 — Codex Named Spawn

仅适用于 `implementation_mode=codex_subagent` 和需要 QA 的阶段。

`target_role` 必须是 `.codex/agents/*.toml` 中 `name` 的精确值。main 必须显式使用该值调用 `spawn_agent`，不得让运行时自行挑选角色。

```text
若工具 schema 支持 fork_turns：
  spawn_agent(agent_type=<exact name>, fork_turns="none", message=<minimal handoff>)
否则若支持 fork_context：
  spawn_agent(agent_type=<exact name>, fork_context=false, message=<minimal handoff>)
否则：
  blocked: named_agent_selector_unavailable
```

硬规则：

1. Codex implementer 必须传 `agent_type=spawn_contract.implementer_agent_type`；QA 必须传 `agent_type=spawn_contract.qa_agent_type`。
2. 不传 `model`、`reasoning_effort` 或 sandbox override；由具名 agent TOML 决定。
3. 禁止 full-history fork。
4. 角色不可用、spawn 被拒绝、runtime metadata 显示未加载目标配置时，立即阻断。
5. 禁止回退到 `default`、`worker`、generic agent，也禁止让 generic agent“扮演”目标角色。
6. child 最终 JSON 必须带 `agent_identity={agent_type, dispatch_run_id}`；不一致时 validator 阻断。
7. review/QA 返工发送到原 agent thread，不重新 spawn generic child。

## Gate B2 — External Implementer Bridge

仅适用于 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）。读取 `references/external-implementer-routing.md`；provider 为 ZCode 时再读取 `references/zcode-routing.md`、必要时读取 `references/zcode-computer-use-policy.md` 与 `assets/templates/zcode-prompt-template.md`。

该模式下 main 不 spawn Codex implementer。External prompt、send receipt、handoff manual 与 recovery result 必须分别通过对应 validator 或 provider adapter 校验。外部实现者失败不得 fallback 成 main 自己写代码。
