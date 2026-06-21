# Dispatch-task Templates Index

本目录保存 `$dispatch-task` 的可复用输出模板。按功能读取对应模板，不得一次性复制全部模板。

| 场景 | 模板 |
|---|---|
| Phase Gate / Gate Receipt | `phase-gates.md` |
| Agent Assignment | `agent-assignment.md` |
| role_context_packets | `role-context-packets.md` |
| Implementation / Test Contract | `contracts.md` |
| ClickUp checklist 回写 | `clickup-writeback.md` |
| Git commit | `git-commit.md` |
| Implementer UI 自测 | `ui-self-check.md` |
| QA 证据与失败归因 | `qa-evidence.md` |

| Implementer 结果 | `implementer-result.md` |
| Code Explorer 结果 | `code-explorer-result.md` |
| Docs Keeper 结果 | `docs-result.md` |

| Main thread receipts | `main-thread-receipts.md` |

| BRV Recall | `brv-recall.md` |
| ClickUp ticket facts | `clickup-ticket-facts.md` |
| Knowledge hygiene | `knowledge-hygiene.md` |
| Main agent gates | `main-agent-gates.md` |
| Subagent progress | `subagent-progress.md` |
| WeChat automator | `wechat-automation.md` |
| Reference snippets | `reference-snippets.md` |
| Task Facts receipts | `task-facts-receipts.md` |

## References 外置规则

`references/` 目录不得内联 fenced template / receipt / packet / command snippet。需要精确格式时，只能引用本目录模板文件中的 `template_id`。

| Test Ownership | `contracts.md` / `implementer-result.md` / `qa-evidence.md` |

| Gate Token Telemetry | `gate-token-telemetry.md` |
