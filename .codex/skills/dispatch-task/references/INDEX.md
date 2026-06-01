# Dispatch-task 外置规则索引

## 定位

本目录是 `$dispatch-task` skill 的 `references/` 目录，只存放按需读取的规则说明。输出模板不放在 references 内，统一放在 `../assets/templates/`。

## 默认读取策略

1. 先读本 `references/INDEX.md`。
2. 当前 phase 需要什么，只读对应 reference 文件。
3. 禁止一次性读取整个 `references/` 目录。
4. 禁止把全部 phase 规则放进 `role_context_packets`。
5. 需要输出格式时，只引用 `../assets/templates/` 下的对应模板，不在 references 内复制模板。

## Phase 到规则文件映射

| Phase | 场景 | 读取文件 |
|---|---|---|
| Phase 0 | 硬门禁、mode 判断、是否允许继续 | `phase-0-gates.md` |
| Phase 1 | ClickUp 模式下读取主任务、子任务、relationships、链接 | `clickup-ticket-read-policy.md` |
| Phase 1 / 7 | ClickUp 模式下 markdown checklist、验收标准、Test Case Base、markdown_description 回写 | `checklist-writeback-policy.md` |
| Phase 2 | Agent Assignment / Execution Gate | `agent-assignment-gate.md` |
| Phase 3 | role_context_packets | `role-context-packets.md` |
| Phase 4 | Solution Discovery、Implementation Contract、Test Contract、main agent 质量门禁 | `solution-discovery-gate.md` / `implementation-test-contract.md` / `main-agent-quality-gates.md` |
| Phase 4.45 | pre-implementation token 预算保险丝 | `pre-implementation-budget-fuse.md` |
| Phase 6 | QA 证据、日志、截图、失败归因 | `qa-evidence-policy.md` |
| Phase 7 | Git 工作区、very_dirty、commit | `git-completion-policy.md` |
| Review | diff-first + dependency-context-limited、QA 不审 diff | `review-scope-policy.md` |

## 模板入口

所有输出模板统一引用：

```text
../assets/templates/INDEX.md
```

按功能读取：

- Phase Gate / Gate Receipt：`../assets/templates/phase-gates.md`
- Agent Assignment：`../assets/templates/agent-assignment.md`
- role_context_packets：`../assets/templates/role-context-packets.md`
- Implementation / Test Contract：`../assets/templates/contracts.md`
- ClickUp Markdown Checklist 回写：`../assets/templates/clickup-writeback.md`
- Git Commit：`../assets/templates/git-commit.md`
- Implementer UI 自测：`../assets/templates/ui-self-check.md`
- QA 证据：`../assets/templates/qa-evidence.md`

## ClickUp 可选原则

`dispatch-task` 是通用任务入口，不是 ClickUp 专用入口。

- prompt 包含有效 ClickUp ticket id / URL 时，进入 `clickup_ticket` 模式，启用 ClickUp ticket、relationships、checklist、writeback 等专属规则。
- prompt 不包含 ClickUp ticket 时，进入 `prompt_only` 模式，跳过 ClickUp 专属规则，但仍执行通用 gate。

## Figma 与 UI 规则

Figma / UI 细则不在本目录内，仍由对应 skill 管理：

```text
.codex/skills/figma-ui-implementation-policy/SKILL.md
.codex/skills/ui-implementation-scope-policy/SKILL.md
.codex/skills/implementer-ui-execution-policy/SKILL.md
.codex/skills/qa-ui-visual-baseline-policy/SKILL.md
```
