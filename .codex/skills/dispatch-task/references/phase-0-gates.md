# Phase 0 硬门禁

## 定位

Phase 0 是 `dispatch-task` 的第一阶段。未通过 Phase 0，不得进入实现、QA、文档同步、ClickUp 回写或 Git commit。

输出格式引用：

```text
../assets/templates/phase-gates.md
```

## 必须完成

1. 判断 `clickup_ticket / prompt_only` 模式。
2. 完成 Git Workspace Check。
3. 理解任务意图。
4. 完成 Agent Assignment。
5. 生成 role_context_packets。
6. 通过 Execution Gate。

## 停止条件

以下任一条件成立，必须停止：

1. Git 工作区为 `very_dirty` 时，必须先执行任务前 dirty snapshot commit；提交失败则停止。
2. 任务意图不清，且无法继续。
3. Agent Assignment 未输出。
4. role_context_packets 未生成。
5. `code_changes_required=yes` 但未分配 implementer。
6. Execution Gate 未通过。

## ClickUp 专属 gate

仅 `clickup_ticket` 模式启用：

1. ClickUp ticket facts 已读取。
2. relationships 已检查。
3. checklist / acceptance criteria 已检查。
4. checklist writeback plan 已准备或不适用。

## prompt_only 跳过项

prompt_only 模式跳过：

1. ClickUp ticket id 要求。
2. ClickUp ticket / relationships 读取。
3. Acceptance Checklist Matrix。
4. ClickUp checklist writeback。
5. ClickUp 状态 / 评论 / checklist 回写。

prompt_only 仍必须执行通用 gate。


## very_dirty 处理

如果 Git Workspace Check 判定为 `very_dirty`，必须先执行任务前 dirty snapshot commit，无需用户确认。

commit message 必须基于当前脏改动内容生成，精炼且不超过 50 个字符。
