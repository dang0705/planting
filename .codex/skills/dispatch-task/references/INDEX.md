# Dispatch-task 外置规则索引

## 定位

本目录是 `$dispatch-task` skill 的 `references/` 目录，只存放按需读取的规则说明。输出模板不放在 references 内，统一放在 `../assets/templates/`。

## 默认读取策略

1. 先读本 `references/INDEX.md`。
2. 当前 phase 需要什么，只读对应 reference 文件。
3. 禁止一次性读取整个 `references/` 目录。
4. 按需文件不得因为同属一个 phase 而全部读取；必须满足触发条件后再读。
5. 禁止把全部 phase 规则放进 `role_context_packets`。
6. 需要输出格式时，只引用 `../assets/templates/` 下的对应模板，不在 references 内复制模板。
7. `references/` 禁止出现 fenced code block 形式的模板、回执、packet、命令片段或路径片段；所有精确格式必须外置到 `../assets/templates/` 并用 `template_id` 引用。

## Phase 到规则文件映射

| Phase | 场景 | 读取文件 |
|---|---|---|
| Main thread | main agent receipt-only 与预算边界 | `main-thread-budget-policy.md` |
| Phase 0 | 硬门禁、mode 判断、Git baseline | `phase-0-gates.md` |
| Phase 1 | ClickUp 模式下读取主任务、子任务、relationships、链接 | `clickup-ticket-read-policy.md` |
| Phase 1 | task facts / prompt facts receipt 化 | `task-facts-receipt-policy.md` |
| Phase 1.5 | BRV / ByteRover 最精简事实路由 | `brv-recall-gate.md` |
| Phase 1 / 7 | ClickUp 模式下 markdown checklist、验收标准、Test Case Base、markdown_description 回写 | `checklist-writeback-policy.md` |
| Phase 2 | Agent Assignment 读取路由 | `agent-assignment-gate.md` |
| Phase 2 | Agent Assignment 最小核心 | `agent-assignment-core.md` |
| Phase 2 | implementer / code_explorer 路由 | `implementer-routing-policy.md` |
| Phase 2 | QA / docs_keeper 路由 | `qa-docs-routing-policy.md` |
| Phase 2 | Subagent Reuse / Spawn Gate | `subagent-spawn-gate.md` |
| Phase 3 | role_context_packets | `role-context-packets.md` |
| Phase 4 | Solution Discovery、Implementation Contract、Test Contract、pre-implementation 质量门禁 | `solution-discovery-gate.md` / `implementation-test-contract.md` / `main-pre-implementation-gates.md` |
| Phase 4 / 6 | 测试职责边界：单测归 implementer，QA 只做 e2e / 端上 | `test-ownership-policy.md` |
| Phase 4.45 | pre-implementation token 预算保险丝 | `pre-implementation-budget-fuse.md` |
| Phase 6 | QA 证据、日志、截图、失败归因 | `qa-evidence-policy.md` |
| Phase 6 | 端上 automator 自动化职责分配 | `wechat-devtools-automation-policy.md` |
| Phase 6 / Recovery | `9420` / automator 恢复、端上运行时取证 | `.codex/skills/miniprogram-automator-runtime/SKILL.md` |
| Phase 7 | Git 工作区、very_dirty、commit | `git-completion-policy.md` |
| Completion | 最终完成 / Done / 停止门禁 | `completion-gate.md` |
| Review | diff-first + dependency-context-limited、QA 不审 diff | `main-post-implementation-review-gate.md` / `review-scope-policy.md` |

## 模板入口

所有输出模板统一引用：

外置模板/规范片段：`../assets/templates/reference-snippets.md`（template_id: `index-01`）。

按功能读取：

- Phase Gate / Gate Receipt：`../assets/templates/phase-gates.md`
- Agent Assignment：`../assets/templates/agent-assignment.md`
- role_context_packets：`../assets/templates/role-context-packets.md`
- Implementation / Test Contract：`../assets/templates/contracts.md`
- ClickUp Markdown Checklist 回写：`../assets/templates/clickup-writeback.md`
- Git Commit：`../assets/templates/git-commit.md`
- Implementer UI 自测：`../assets/templates/ui-self-check.md`
- QA 证据：`../assets/templates/qa-evidence.md`
- Task Facts / Acceptance Matrix Receipt：`../assets/templates/task-facts-receipts.md`

## ClickUp 可选原则

`dispatch-task` 是通用任务入口，不是 ClickUp 专用入口。

- prompt 包含有效 ClickUp ticket id / URL 时，进入 `clickup_ticket` 模式，启用 ClickUp ticket、relationships、checklist、writeback 等专属规则。
- prompt 不包含 ClickUp ticket 时，进入 `prompt_only` 模式，跳过 ClickUp 专属规则，但仍执行通用 gate。

## Figma 与 UI 规则

Figma / UI 细则不在本目录内，仍由对应 skill 管理：

外置模板/规范片段：`../assets/templates/reference-snippets.md`（template_id: `index-02`）。

## 端上 automator 恢复路由

当 `dispatch-task` 任一阶段出现小程序端上自动化问题时，优先路由到 automator 运行时恢复技能：

外置模板/规范片段：`../assets/templates/reference-snippets.md`（template_id: `index-03`）。

触发信号：

1. `9420` 未监听或原始 WebSocket 无法握手。
2. main / QA 线程对同一 `projectPath` 的 automator 连接能力不一致。
3. 需要判断是 automator 未启动、登录态失效、项目路径错误，还是产品页面问题。
4. 需要在不更换线程的前提下继续完成小程序端上验收。
5. WeChat MCP 不作为默认恢复路径；只有用户明确要求调试 MCP 本身时才读取旧 MCP 经验。

## Subagent 进度观察

main agent 等待 subagent 时读取 `subagent-progress-policy.md`。默认低成本观察，不得频繁中断。
