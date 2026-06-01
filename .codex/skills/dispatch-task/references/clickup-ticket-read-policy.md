# ClickUp Ticket 读取规则

## 1. 定位

本文件定义 `dispatch-task` 读取 ClickUp 任务事实的细则。`dispatch-task` 只在 Phase 0 / Phase 1 引用本文件，不把全文广播给所有 agent。

## 2. 必读内容

必须通过 ClickUp MCP 读取：

1. 主任务标题、状态、优先级、负责人、标签。
2. 主任务完整描述。
3. 子任务列表及每个子任务完整描述。
4. checklist、acceptance criteria、验收标准、definition of done。
5. 附件、评论、activity 中明确作为需求补充的内容。
6. Relationships / Linked tasks / Blocking / Blocked by / Related / Parent / Duplicate 等一跳关联任务。
7. 关系任务中的标题、状态、描述、子任务、checklist、验收标准、附件、评论和链接。

## 3. relationships 读取

如果任务是 bug、request changes、review feedback、follow-up、regression、hotfix 或需求变更类任务，必须读取一跳关系任务。

关系任务要求与主任务相同：

1. 关系任务中的 Figma、GitHub、ClickUp 内部链接、附件、设计稿、文档链接，必须按链接和 MCP 规则处理。
2. 关系任务中的硬约束句必须进入 `ClickUp 硬约束摘录`。
3. 关系任务读取失败必须记录为阻塞项或待确认项。
4. 默认只读取一跳；超过 3 个关系任务或需要递归时，必须说明 token 风险并自动执行任务前 dirty snapshot commit。

## 4. ClickUp 内容保真

ClickUp 内容可能已经被人工压缩，AI 不得二次压缩到丢失约束。

出现以下词或同义表达时，必须原样摘录：

```text
必须 / 不得 / 禁止 / 优先考虑 / 验收 / 对齐 / 参考 / 复用 / 不要 / 仅 / 兼容 / 非目标 / request changes / checklist / acceptance criteria
```

输出：

```text
ClickUp 硬约束摘录:
- 原文:
  - 来源: 主任务 / 子任务 / 关系任务 / 评论 / 附件 / checklist / 验收标准
  - 处理方式:
```

## 5. 链接读取

ClickUp 任务、子任务、关系任务或评论中若包含链接，必须先判断是否可由 MCP 获取内容。

处理顺序：

```text
发现链接
→ 判断是否有对应 MCP
→ 优先通过 MCP 获取内容
→ MCP 不可用 / 无权限 / 非支持链接时记录失败原因
→ 仅在 MCP 不可用后才降级为普通链接或待确认项
```

不得直接把链接当成普通文本跳过。

## 6. 输出给 dispatch-task 的最小摘要

```text
ClickUp Ticket Facts:
- ticket_id:
- title:
- status:
- hard_constraints:
- relationships_read:
- external_links:
- checklist_detected:
- blocking_gaps:
```


## 默认上下文压缩

默认上下文不得包含完整 ClickUp 描述、完整评论、完整关系任务正文。

默认只保留：

1. 硬约束句。
2. 非目标。
3. checklist matrix。
4. relationship link summary。
5. blocking gaps。
6. 外部链接读取状态。

完整原文只作为 source_ref / audit appendix，需要时回查。
