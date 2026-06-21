# ClickUp Ticket Facts Templates

本文件保存 ClickUp ticket 读取、硬约束摘录、链接处理和 ticket facts 的输出模板。

## clickup-ticket-read-policy-01

Source: `references/clickup-ticket-read-policy.md`  
Context: 4. ClickUp 内容保真

```text
必须 / 不得 / 禁止 / 优先考虑 / 验收 / 对齐 / 参考 / 复用 / 不要 / 仅 / 兼容 / 非目标 / request changes / checklist / acceptance criteria
```

## clickup-ticket-read-policy-02

Source: `references/clickup-ticket-read-policy.md`  
Context: 4. ClickUp 内容保真

```text
ClickUp 硬约束摘录:
- 原文:
  - 来源: 主任务 / 子任务 / 关系任务 / 评论 / 附件 / checklist / 验收标准
  - 处理方式:
```

## clickup-ticket-read-policy-03

Source: `references/clickup-ticket-read-policy.md`  
Context: 5. 链接读取

```text
发现链接
→ 判断是否有对应 MCP
→ 优先通过 MCP 获取内容
→ MCP 不可用 / 无权限 / 非支持链接时记录失败原因
→ 仅在 MCP 不可用后才降级为普通链接或待确认项
```

## clickup-ticket-read-policy-04

Source: `references/clickup-ticket-read-policy.md`  
Context: 6. 输出给 dispatch-task 的最小摘要

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


## clickup-ticket-read-policy-05

Source: `references/task-facts-receipt-policy.md`  
Context: Task Facts Receipt

```text
Task Facts Receipt:
- mode:
- source_ref:
- title:
- goal:
- hard_constraints_count:
- must_do_count:
- must_not_do_count:
- acceptance_count:
- external_links_count:
- figma_links_count:
- relationship_count:
- blocking_gaps:
- matrix_ref:
```
