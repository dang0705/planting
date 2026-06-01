# Phase 0 硬门禁

Phase 0 是 `dispatch-task` 的第一阶段。未通过 Phase 0，不得进入实现、QA、文档同步、ClickUp 回写或 Git commit。

## 1. 模式判断

`dispatch-task` 必须先判断：

```text
Dispatch Mode:
- mode: clickup_ticket / prompt_only
- clickup_ticket_id:
- clickup_required: yes / no
- clickup_reason:
```

如果 prompt 包含有效 ClickUp ticket id / URL，则进入 `clickup_ticket` 模式。  
如果 prompt 不包含 ClickUp ticket，则进入 `prompt_only` 模式，不得强行终止。



## 2. 通用 gate

所有模式都必须完成：

```text
Common Phase 0 Gate:
- Git Workspace Check completed: yes / no
- task intent understood: yes / no
- Agent Assignment completed: yes / no
- role_context_packets completed: yes / no
- Execution Gate passed: yes / no
```

停止条件：

1. Git 工作区 `very_dirty`，但用户未确认是否继续。
2. 任务意图不清，且无法继续。
3. Agent Assignment 未输出。
4. role_context_packets 未生成。
5. `code_changes_required=yes` 但未分配 implementer。
6. Execution Gate 未通过。

## 3. ClickUp 专属 gate

仅 `clickup_ticket` 模式启用：

```text
ClickUp Phase 0 Gate:
- ClickUp ticket facts read: yes / no
- relationships checked: yes / no
- checklist / acceptance criteria checked: yes / no
- checklist writeback plan ready: yes / no / not_applicable
```

ClickUp 专属停止条件：

1. ClickUp MCP 不可用且无法读取 ticket。
2. relationships 未检查。
3. checklist / acceptance criteria 存在但未逐项映射。
4. checklist 需要回写但没有 writeback plan。
5. Figma / GitHub / 关系任务链接读取失败且影响验收。

## 4. prompt_only 模式跳过项

prompt_only 模式跳过：

1. ClickUp ticket id 要求。
2. ClickUp ticket / relationships 读取。
3. Acceptance Checklist Matrix。
4. ClickUp checklist writeback。
5. ClickUp 状态 / 评论 / checklist 回写。

prompt_only 模式仍执行通用 gate。

但仍必须生成：

```text
Prompt Task Facts:
- 原始需求:
- 硬约束:
- 非目标:
- 验收标准:
- 外部链接:
- 需要确认的问题:
```
