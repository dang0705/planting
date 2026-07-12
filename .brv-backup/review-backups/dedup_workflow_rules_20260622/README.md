# Dedup backup: workflow rules moved out of active BRV search

Date: 2026-06-22

These files were moved out of `.brv/context-tree` because they duplicated `dispatch-task` hard rules or legacy WeChat MCP recovery memory.

Authoritative owners now:

- dispatch workflow gates: `.codex/skills/dispatch-task/**`
- WeChat mini-program QA default: `miniprogram-automator / @dcloudio/uni-automator` via `dist/dev/mp-weixin -> 9420`
- source-verified runtime/tool facts: keep in `.brv/context-tree/tooling/miniprogram_runtime_automator_usage.md`

Do not move these files back into active BRV unless the task explicitly asks to audit historical workflow memory.
