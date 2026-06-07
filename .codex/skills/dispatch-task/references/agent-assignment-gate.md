# Agent Assignment Gate

## 定位

本文件定义 `dispatch-task` 的 Agent Assignment / Execution Gate / Subagent Reuse Gate。未通过本门禁，不得进入实现。

输出格式引用：

```text
../assets/templates/agent-assignment.md
```

## 可分配 agent

| agent | 用途 |
|---|---|
| `code_explorer` | 可选低成本代码定位；只在入口、调用链、依赖来源或影响范围不清时使用 |
| `implementer_fast` | 低风险局部契约执行 |
| `implementer_deep` | 高风险 / 多文件 / 复杂逻辑契约执行 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma、小程序自动化、失败归因 |
| `docs_keeper` | 知识卫生、活文档维护、索引同步、术语一致性、旧文档归档；不维护旧蓝图为当前事实 |

## docs_keeper 分配硬门禁

main agent 必须在 Agent Assignment 中显式输出：

```text
docs_keeper_required: yes / no
docs_keeper_reason:
docs_keeper_assigned: yes / no / not_applicable
docs_sync_scope:
```

以下任一条件成立，`docs_keeper_required` 必须为 `yes`：

1. 修改诊断契约、问诊题包、route / outcome 公开契约、停止 / 输出资格、API 响应结构、schema、配置或 workflow 规则。
2. BRV Recall Packet、task facts、ClickUp checklist、代码注释或活文档明确要求同步 docs / new-rules / source index / BRV source verification。
3. 本轮代码删除、替换或降级旧概念，且该旧概念存在于 active docs、`docs/new-rules/`、`.brv/source-verification.json` 或 active `.brv/context-tree/` 中。
4. 任务结果需要记录“当前入口在哪里、删除了哪些旧逻辑、扩展点如何预留”等长期可复用事实。

如果 `docs_keeper_required=yes` 但未分配 `docs_keeper`，Agent Assignment Gate 不通过，必须停止或补派 `docs_keeper`。

如果判断为 `no`，必须给出简短理由；不得仅因任务 facts 未显式写“更新文档”而判定不需要。

## 实现闸门

只要任务需要新增、修改或删除代码文件，包括业务代码、测试代码、配置代码、云函数代码、页面组件代码，必须分配 `implementer_fast` 或 `implementer_deep`。

如果 `code_changes_required=yes` 且未分配 implementer，必须停止。

如果 runtime / 工具暂时无法创建或进入 implementer subagent，必须停止并输出 blocker；不得由 main agent、default 线程或 fallback 线程代替 implementer 写代码。

## main agent 写入硬边界

main agent 负责读取、计划、技术方向、Implementation Contract、Test Contract、agent 分配、code review、协调、ClickUp 回写和 Git commit。

main agent 绝对不得亲自修改以下文件：

1. 业务代码。
2. 测试代码。
3. 配置代码。
4. 云函数代码。
5. 页面组件代码。
6. 会影响运行时行为的脚本或 schema。

没有“低风险小改”“用户要求 main 直接改”“subagent 不可用时 fallback/default 线程代替”的例外。

若 main agent 已越界改动代码，必须立即停止实现流程，并输出：

```text
Main Agent Boundary Violation:
- files_touched:
- violation_type:
- required_recovery:
  - revert_or_handoff_to_implementer:
  - review_required:
```

## 不分配 implementer 的合法例外

只有以下情况允许不分配 implementer：

1. 纯只读分析。
2. 纯规划，不改文件。
3. 纯 QA 验证，不改文件。
4. 纯文档判断但最终不落文档。
5. 只做 ClickUp checklist 回写、状态说明、Git commit 或最终汇总，不改代码。

上述例外不得包含任何代码文件写入。

## Subagent Reuse Gate

分配任何 subagent 前，main agent 必须先检查同一 `dispatch_run_id` / ClickUp ticket / branch / scope 下是否已经存在同角色可用线程。

复用优先级：

1. 同一 ticket + 同一 role + 同一 branch + 同一 scope 的现成线程。
2. 同一 ticket + 同一 role + 同一 branch 的现成线程。
3. 同一 dispatch_run_id + 同一 role 的现成线程。
4. 以上均无可用线程时，才允许创建新 subagent。

必须复用的场景：

1. code review blocking findings 回修：必须回到同一 implementer 线程。
2. QA failed 后的产品代码修复：必须回到同一 implementer 线程。
3. 同一验收目标的正式 QA：优先复用已承担该验收目标的 QA 线程。
4. docs_keeper 已经接收 Sync Packet 且未完成时：不得再新开 docs_keeper。
5. code_explorer 已定位同一入口链路时：不得重复新开 code_explorer 查同一问题。

允许新开同角色 subagent 的情况仅限：

1. 原线程明确 blocked。
2. 原线程已完成且任务范围发生实质变化。
3. 原线程 role 不匹配。
4. 原线程上下文污染严重，继续复用会扩大风险。
5. 用户明确要求替换该线程。

新开同角色 subagent 时必须记录：

```text
replacement_reason:
- existing_thread:
- why_not_reused:
- risk:
```

缺少 `existing_subagents_checked` 与 `reuse_decision` 时，Agent Assignment Gate 不通过。
