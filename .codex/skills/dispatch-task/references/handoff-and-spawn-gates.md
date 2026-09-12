# Handoff and External Bridge Gates

## Gate B — Handoff Contract

`standard_task`、`deep_contract`、`external_implementer` 必须生成 JSON Handoff Contract：

```text
dispatch_run_id
dispatch_tier: standard_task / deep_contract / external_implementer
implementation_mode: main_direct / external_implementer
task: {objective, code_changes_required, ui_task, risk, qa_required}
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

## Gate B1 — Main Implementation

`main_direct` 不需要 spawn、target_role 或 spawn_contract。main 在当前任务中完成代码、测试、自检、diff review 和 Completion Gate；复杂度只改变 decision lock、QA 和 evidence 要求。

## Gate B2 — External Implementer Bridge

仅适用于 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）。读取 `references/external-implementer-routing.md` 与 `assets/templates/external-implementer-prompt-template.md`；provider 为 ZCode 时再读取 `references/zcode-routing.md`、必要时读取 `references/zcode-computer-use-policy.md` 与 `assets/templates/zcode-prompt-template.md`。

该模式下 main 不 spawn 任何内部子代理。External prompt、send receipt、handoff manual 与 recovery result 必须分别通过对应 validator 或 provider adapter 校验。外部实现者失败不得自动改派子代理或改变合同。
