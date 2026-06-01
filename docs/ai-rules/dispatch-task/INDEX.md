# Dispatch-task 外置规则索引

## 定位

本目录只存放 `dispatch-task` 的外置规则。`dispatch-task/SKILL.md` 是阶段门禁入口，本目录是按 phase 拆分的细则库。

## 默认读取策略

1. 先读本 `INDEX.md`。
2. 当前 phase 需要什么，只读对应规则文件。
3. 禁止一次性读取整个 `docs/ai-rules/dispatch-task/` 目录。
4. 禁止把全部 phase 规则放进 `role_context_packets`。
5. 已读过的规则必须转成当前角色需要的最小摘要。

## Phase 到规则文件映射

| Phase | 场景 | 读取文件 |
|---|---|---|
| Phase 0 | 硬门禁、mode 判断、Git Workspace Check、very_dirty 确认、是否允许继续 | `phase-0-gates.md` |
| Phase 1 | ClickUp 模式下读取主任务、子任务、relationships、链接 | `clickup-ticket-read-policy.md` |
| Phase 1 / 7 | ClickUp 模式下 checklist、验收标准、Test Case Base、ClickUp 回写 | `checklist-writeback-policy.md` |
| Phase 2 | Agent Assignment / Execution Gate | `agent-assignment-gate.md` |
| Phase 3 | role_context_packets | `role-context-packets.md` |
| Phase 4 | Implementation Contract / Test Contract | `implementation-test-contract.md` |
| Phase 4 | 需求复杂度、复用、插件、成熟方案、手搓前置评估 | `solution-discovery-gate.md` |
| Phase 4.45 | 进入 implementer 前的 token 预算保险丝 | `pre-implementation-budget-fuse.md` |
| Phase 4 / 5 | main agent 技术方向、Contract 完整性、代码 review 门禁 | `main-agent-quality-gates.md` |
| Phase 6 | QA 证据、日志、截图、失败归因 | `qa-evidence-policy.md` |
| Phase 7 | Git 工作区、very_dirty、commit | `git-completion-policy.md` |
| Review | diff-first + dependency-context-limited、QA 不审 diff | `review-scope-policy.md` |

## ClickUp 可选原则

`dispatch-task` 是通用任务入口，不是 ClickUp 专用入口。

- prompt 包含有效 ClickUp ticket id / URL 时，进入 `clickup_ticket` 模式，启用 ClickUp ticket、relationships、checklist、writeback 等专属规则。
- prompt 不包含 ClickUp ticket 时，进入 `prompt_only` 模式，跳过 ClickUp 专属规则，但仍执行通用 gate。
- `prompt_only` 模式仍必须执行：Git Workspace Check、Agent Assignment、role_context_packets、Execution Gate、Implementation Contract、Test Contract、QA、docs、Git commit。
- 不得因为缺少 ClickUp ticket 就终止 `dispatch-task`，除非用户明确要求“必须基于 ClickUp ticket 执行”。

## Figma 与 UI 规则

Figma / UI 细则不在本目录内，仍由对应 skill 管理：

```text
.codex/skills/figma-ui-implementation-policy/SKILL.md
.codex/skills/ui-implementation-scope-policy/SKILL.md
```

只有在当前任务明确涉及 Figma UI 开发、UI 还原或 UI QA 时，才读取这些 skill。



## Main agent 质量门禁

无独立架构角色时，main agent 必须执行：

1. `Technical Direction Gate`
2. `Implementation Contract Completeness Gate`
3. `Main Agent Code Review Gate`

这些门禁细则见 `main-agent-quality-gates.md`。


## Solution Discovery Gate

`Technical Direction Gate` 之前必须先完成 `Solution Discovery Gate`。它负责以短输出证明 main agent 已评估需求复杂度、现有代码复用、成熟方案、uni-app 生态、微信小程序原生能力和手搓必要性。

## 预算规则入口

pre-implementation 阶段 token 预算、Gate Receipt、Solution Discovery Lite / Expanded、role_context_packet 预算、Figma Drilldown 延迟和 ClickUp 默认上下文压缩规则，见：

```text
docs/ai-rules/dispatch-task/pre-implementation-budget-fuse.md
```
