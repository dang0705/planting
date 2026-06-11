# Codex / AI Workflow

## 1. 当前入口

统一使用：

```text
.codex/skills/dispatch-task/SKILL.md
```

`dispatch-task` 是阶段门禁入口，不是普通实现入口。

## 2. Phase Condition 模型

```text
Phase 0: 硬门禁
Phase 1: ClickUp / MCP 事实读取
Phase 2: Agent Assignment
Phase 3: role_context_packets
Phase 4: Implementation Contract + Test Contract
Phase 5: Subagent 执行
Phase 6: QA 与证据
Phase 7: ClickUp markdown checklist 回写 + Git commit
```

任何 phase 未完成，不得进入下一 phase。

## 3. 当前可用 subagent

| agent | 用途 |
|---|---|
| `code_explorer` | 可选低成本代码定位 |
| `implementer_fast` | 低风险局部契约执行 |
| `implementer_deep` | 高风险 / 多文件契约执行 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma、失败归因 |
| `docs_keeper` | 文档落地、索引同步、术语一致性 |

## 4. `main agent` 主导职责

`main agent` 负责技术方向、Implementation Contract、Test Contract、Agent Assignment、code review、ClickUp 回写和 Git commit。

`main agent` 默认不得亲自写代码。

## 5. 外置规则

| 规则 | 文件 |
|---|---|
| ClickUp 读取 | `.codex/skills/dispatch-task/references/clickup-ticket-read-policy.md` |
| checklist / writeback | `.codex/skills/dispatch-task/references/checklist-writeback-policy.md` |
| Agent Assignment Condition | `.codex/skills/dispatch-task/references/agent-assignment-condition.md` |
| Git commit | `.codex/skills/dispatch-task/references/git-completion-policy.md` |
| Review Scope / QA 边界 | `.codex/skills/dispatch-task/references/review-scope-policy.md` |
| handoff | `docs/ai-rules/subagent-handoff.md` |
| thread reuse | `docs/ai-rules/subagent-thread-reuse.md` |

## 6. token 预算

1. `dispatch-task` 只保留阶段门禁。
2. 细节规则按需读取。
3. role_context_packets 必须生成。
4. 不得广播完整 ClickUp、完整 Figma、完整日志、完整规则。
5. handoff 默认只读轻量恢复摘要。

6. `docs_keeper` 触发规则：
   - 涉及业务逻辑、流程约束、接口契约、规则语义变更时，默认需要同步 `docs/code-logics` 或 `docs/new-rules`。
   - 仅在纯文档判读/无逻辑语义变化的场景才可不派发 `docs_keeper`。


## Dispatch-task 外置规则目录

`dispatch-task` 的配套细则位于：

```text
.codex/skills/dispatch-task/references/
```

默认先读 `INDEX.md`，再按 Phase 读取对应规则。不得一次性读取整个目录。











## Stable workflow constraints

1. `$dispatch-task` is phase-gated.
2. Main agent owns technical direction, Implementation Contract, Test Contract, code review, checklist writeback, and Git commit.
3. Code changes require implementer assignment unless a legal exception is recorded.
4. QA does not review code diff.
5. ClickUp markdown checklist writeback updates `markdown_description`.
6. Skill and reference files must not contain version-number patch sections.


## Git dirty workspace snapshot

任务开始前如果 Git 工作区为 very_dirty，必须先自动创建任务前 dirty snapshot commit，无需用户确认。

commit message 必须根据改动内容生成，精炼且不超过 50 个字符。最终任务 commit message 同样不超过 50 个字符。


## Completion Condition

任务不得因为部分测试通过而停止。所有 required acceptance items 必须完成验收，或存在明确 blocker 并已写回。小程序实际交互要求必须由 QA 执行自动化或端上验证。


## Stable automation and QA budget

WeChat DevTools 自动化采用单一责任原则：`main agent` 默认不直接执行，implementer 只做最小自测，QA 负责正式验收。`main agent` 等待 subagent 时优先低成本观察，不频繁中断。QA 输出使用 QA Result。
