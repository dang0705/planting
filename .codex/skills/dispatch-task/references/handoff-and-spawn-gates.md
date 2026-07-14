# Handoff and Spawn Gates

## Gate B — Handoff Contract

`standard_task`、`deep_contract`、`external_implementer` 必须生成 JSON Handoff Contract：

```text
dispatch_run_id
dispatch_tier: standard_task / deep_contract / external_implementer
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
  qa_baseline_fetch_required          # 行为标志：main QA 须独立获取视觉基准
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

仅适用于 `implementation_mode=codex_subagent` 的实现阶段。QA、docs 和 ByteRover 阶段由 main 执行，不派 subagent。

Handoff 通过 validator 即授权派发 `spawn_contract.implementer_agent_type`；不得因复杂度再次征求 spawn 许可（除非 runtime 明确要求一次最小确认）。

`target_role` 必须是 `.codex/agents/*.toml` 中 `name` 的精确值。main 按顺序：

```text
1. target_agent_config — TOML name == target_role，否则 blocked: target_agent_config_missing
2. named_selector — spawn schema 显式支持 agent_type，否则 blocked: named_agent_selector_unavailable
3. fresh_spawn_control — fork_turns=none 或 fork_context=false；否则 blocked: fresh_spawn_control_unavailable
4. runtime_identity — effective_agent_type == target_role；不可观察 → named_agent_identity_unverifiable；不一致 → named_agent_identity_mismatch
```

```text
若工具 schema 支持 fork_turns：
  spawn_agent(agent_type=<exact name>, fork_turns="none", message=<minimal handoff>)
否则若支持 fork_context：
  spawn_agent(agent_type=<exact name>, fork_context=false, message=<minimal handoff>)
否则：
  blocked: named_agent_selector_unavailable 或 fresh_spawn_control_unavailable
```

硬规则：

1. Codex implementer 必须传 `agent_type=spawn_contract.implementer_agent_type`。
2. 不传 `model`、`reasoning_effort` 或 sandbox override；由具名 agent TOML 决定。
3. 禁止 full-history fork。
4. 角色不可用、spawn 被拒绝、runtime metadata 显示未加载目标配置时，立即阻断。
5. 禁止回退到 `default`、`worker`、generic agent，也禁止让 generic agent“扮演”目标角色。
6. child 最终 JSON 必须带 `agent_identity={agent_type, dispatch_run_id}`；child 声明不一致 → `child_identity_claim_mismatch`；运行时不一致 → `named_agent_identity_mismatch`。
7. review 返工发送到原 implementer thread，不重新 spawn generic child。

## Gate B2 — External Implementer Bridge

仅适用于 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）。读取 `references/external-implementer-routing.md` 与 `assets/templates/external-implementer-prompt-template.md`；provider 为 ZCode 时再读取 `references/zcode-routing.md`、必要时读取 `references/zcode-computer-use-policy.md` 与 `assets/templates/zcode-prompt-template.md`。

该模式下 main 不 spawn Codex implementer。External prompt、send receipt、handoff manual 与 recovery result 必须分别通过对应 validator 或 provider adapter 校验。外部实现者失败不得 fallback 成 main 自己写代码。
