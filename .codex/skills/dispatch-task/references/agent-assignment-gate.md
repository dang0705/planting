# Agent Assignment Gate

## 定位

本文件定义 `dispatch-task` 的 Agent Assignment / Execution Gate。未通过本门禁，不得进入实现。

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
| `docs_keeper` | 文档落地、索引同步、术语一致性、完整文档交付 |

## 实现闸门

只要任务需要新增、修改或删除代码文件，包括业务代码、测试代码、配置代码、云函数代码、页面组件代码，必须分配 `implementer_fast` 或 `implementer_deep`。

如果 `code_changes_required=yes` 且未分配 implementer，必须停止。

## `main agent` 写入边界

`main agent` 负责读取、计划、技术方向、Implementation Contract、Test Contract、agent 分配、code review、协调、ClickUp 回写和 Git commit。

`main agent` 默认不得亲自修改业务代码、测试代码、配置代码、云函数代码、页面组件代码或文档。

## 不分配 implementer 的合法例外

只有以下情况允许不分配 implementer：

1. 纯只读分析。
2. 纯规划，不改文件。
3. 纯 QA 验证，不改文件。
4. 纯文档判断但最终不落文档。
5. 用户明确要求 `main agent` 直接修改，且任务为低风险极小改动。
6. 当前 runtime / 工具不支持 subagent，且用户确认允许 fallback/default 线程。
7. 只做 ClickUp checklist 回写、状态说明或最终汇总，不改代码。
