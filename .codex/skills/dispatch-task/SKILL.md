---
name: dispatch-task
description: '低上下文任务调度：按任务复杂度分级，把 main 的架构/合同/审计职责与 implementer、ZCode、QA、docs_keeper 分离。'
---

# Dispatch Task

本 skill 只做复杂任务的薄调度入口。门禁、约束、模板和校验不在主文件展开；必须按下列索引读取对应 reference / script。不得省略任何 gate。

## 0. 不变量

1. 本 skill 负责“进入后怎么分级、交接、验收和阻断”。
2. main 保留架构、路径边界、合同、派发、diff review、返工协调和 Completion Gate；`standard_task` / `deep_contract` / `external_zcode` 中 main 不直接写代码。
3. 所有实现、QA、ZCode 回收结果必须先通过对应 validator。自然语言自述、聊天完成状态或 receipt 不能替代真实 diff、运行证据和脚本校验。
4. reference 不是独立 skill，只在本 skill 命中条件后按需读取；禁止默认全量读取 `.codex/skills/**/references/`。

## 1. 最小调度顺序

1. 读取 `references/role-ownership.md`，确认 main / implementer / ZCode / QA / docs_keeper 所有权。
2. 读取 `references/tier-routing.md`，由 main 根据用户意图和任务配置确定 `dispatch_tier` 与内部路由字段 `implementation_mode`；除非用户想强制指定，否则不要求用户手动输入该字段。
3. 读取 `references/intake-and-project-constraints.md`，形成 Brief 与 `project_constraints`。
4. `standard_task` / `deep_contract` / `external_zcode` 读取 `references/handoff-and-spawn-gates.md`，生成并校验 Handoff Contract。
5. 命中 Figma 时读取 `references/figma-task-boundaries.md`；实现者使用 `$implementer-ui-execution-policy`，QA 使用 `$qa-ui-visual-baseline-policy`。
6. 当内部路由判定为 `implementation_mode=zcode_external` 时读取 `references/zcode-routing.md`、`references/zcode-computer-use-policy.md` 和 `assets/templates/zcode-prompt-template.md`。
7. 实现返回后读取 `references/review-qa-completion-gates.md`，执行 result validation、diff-first review、必要 QA 和 Completion Gate。
8. 全程适用 `references/hard-stops.md`；命中任一 hard stop 必须 blocked，不得 silent fallback。

## 2. 条件引用索引

| 条件                                            | 必读                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 任意 dispatch 任务                              | `role-ownership.md`, `tier-routing.md`, `intake-and-project-constraints.md`                     |
| 需要 Handoff Contract / subagent / ZCode        | `handoff-and-spawn-gates.md`                                                                    |
| Figma link / UI 还原                            | `figma-task-boundaries.md`, `figma-main-lite-policy.md`                                         |
| `dispatch_tier=deep_contract`                   | `high-risk-workflow.md`                                                                         |
| 内部路由为 `implementation_mode=zcode_external` | `zcode-routing.md`, `zcode-computer-use-policy.md`, `assets/templates/zcode-prompt-template.md` |
| 输入含有效 ClickUp ticket                       | `clickup-workflow.md`                                                                           |
| 小程序端上验收                                  | `mini-program-runtime-qa.md`, `$miniprogram-automator-runtime`                                  |
| 完成前                                          | `review-qa-completion-gates.md`, `hard-stops.md`                                                |

## 3. 必跑校验入口

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs qa <handoff.json> <qa-result.json>
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> [qa-result.json]
```

按任务条件补充：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-prompt.mjs <handoff.json> <zcode-prompt.md>
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
node .codex/skills/dispatch-task/scripts/validate-worktree-scope.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-no-new-deps.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-style-stack.mjs <handoff.json>
```

## 4. 完成输出

只输出一份 Completion Receipt：目标、实际 changed files、验证命令、QA 状态、未验证项、blocker、风险和 next step。不得输出逐 gate telemetry。
