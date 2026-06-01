# Subagent Handoff 规则

## 1. 定位

handoff 用于跨 subagent、跨回合、跨线程恢复任务状态。为控制 token，本文件采用“双层结构”：

1. **轻量恢复摘要**：默认传给后续 agent，用于恢复上下文。
2. **审计附录**：仅在排查、复盘、争议、失败归因或用户要求时读取。

默认只读取轻量恢复摘要，不读取审计附录。

---

## 2. 轻量恢复摘要

轻量恢复摘要是默认 handoff。目标是让后续 agent 能继续工作，而不是复述所有过程。

```text
Handoff Resume Summary:
- task_id / ticket_id:
- logical_role:
- current_status: pending / in_progress / blocked / done
- 本轮目标:
- 已完成:
- 未完成:
- 当前阻塞:
- 下一步动作:
- 涉及文件:
- 允许修改范围:
- 禁止修改范围:
- 关键决策:
- role_context_packet:
  - main agent:
  - implementer:
  - QA:
  - docs:
- 需要复用的结论:
- 不需要重复读取:
- 需要回查的审计附录: 否 / 是，条目：
- ClickUp Checklist Writeback:
  - checked_items:
  - unchecked_items:
  - writeback_method:
  - writeback_status:
- Git Workspace / Commit:
  - branch:
  - dirty_level:
  - pre_task_dirty_files:
  - task_changed_files:
  - commit_required: yes / no
  - commit_hash:
```

### 2.1 轻量摘要写法要求

1. 控制在最小可恢复范围。
2. 不粘贴完整日志、完整测试输出、完整 Figma Drilldown、完整 ClickUp 描述。
3. 只保留后续 agent 必须知道的决定、边界、文件、状态。
4. 已在 role_context_packet 中提供的信息，不重复写长段解释。
5. 若需要长证据，用“证据路径 / 附录编号”引用，不直接展开。

---

## 3. 审计附录

审计附录仅在需要时读取。它用于追溯，不用于默认上下文广播。

```text
Handoff Audit Appendix:
- audit_id:
- 触发原因:
- 原始命令:
- 完整命令输出路径:
- 完整日志路径:
- 截图 / 录屏 / DevTools 证据路径:
- Figma MCP 原始读取记录:
- ClickUp 原始硬约束摘录:
- ClickUp Checklist Writeback 记录:
  - checked_items:
  - unchecked_items:
  - failed_items:
  - forbidden_substitution_used:
- Git Commit 记录:
  - branch:
  - staged_files:
  - commit_hash:
  - commit_message:
  - excluded_dirty_files:
- Dirty Workspace 记录:
  - base_ref:
  - pre_task_dirty_files:
  - implementer_changed_files:
  - excluded_dirty_files:
- 失败归因详情:
- 回滚 / 恢复建议:
```

### 3.1 审计附录读取条件

只有以下情况才读取审计附录：

1. 任务失败，需要排查原因。
2. main agent、QA、implementer 结论冲突。
3. 用户要求复盘。
4. 需要证明某条验证证据。
5. 需要恢复长任务，但轻量摘要不足。
6. 需要区分本轮改动和历史脏改动。

---

## 4. 角色 handoff 要求

### 4.1 main agent

必须输出：

- Implementation Contract 摘要。
- Test Contract 摘要。
- Review Scope 摘要。
- 技术方向裁决。
- 给 implementer 的最小执行契约。
- 给 QA 的测试契约摘要。

不得默认输出完整代码 review 长文；长 findings 放审计附录。

### 4.2 implementer_fast / implementer_deep

必须输出：

- Contract 执行情况。
- 修改文件清单。
- 偏离契约之处。
- 已补测试代码。
- 未完成项。
- 给 main agent / QA 的最小复核摘要。

不得粘贴完整 diff。

### 4.3 qa_reviewer

必须输出：

- Test Contract 覆盖情况。
- 测试执行矩阵。
- 失败归因分类。
- 证据路径。
- 是否需要 implementer 返工。
- 是否需要发布 / CloudBase 证据复核流程。

不得粘贴完整日志、完整 DevTools dump 或完整截图 OCR。

### 4.4 docs_keeper

必须输出：

- 是否需要文档同步。
- 已更新文档。
- 未更新原因。
- 是否同步索引。
- 是否需要 main agent 复核。

不得把完整文档正文放入 handoff；完整文档以文件路径引用。

---

## 5. 禁止事项

1. 禁止把审计附录当默认 handoff 发送给所有 agent。
2. 禁止在 handoff 中粘贴完整 ClickUp 描述。
3. 禁止在 handoff 中粘贴完整 Figma Drilldown。
4. 禁止在 handoff 中粘贴完整测试日志。
5. 禁止重复写入已存在于 role_context_packets 的长内容。
6. 禁止引用已删除角色。
