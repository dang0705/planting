# ClickUp Checklist 与验收回写规则

## 定位

本文件定义 ClickUp 描述区 slash / Markdown checklist 的读取、映射、测试和回写规则。

当前已验证结论：

```text
ClickUp 描述区中的 slash / Markdown checklist 可以通过整体更新 task 的 markdown_description 来改变勾选状态。
```

例如：

```markdown
- [x] 用户在 `D-10 ~ D-1` 中选择多天浇水后，前端能生成正确的最近 10 天浇水行为数据。
```

该写法能在 ClickUp 任务描述中表现为已勾选。

## checklist 类型

当前 workflow 默认处理的是 **描述区 markdown checklist**，包括：

```markdown
- [ ] ...
- [x] ...
```

Markdown checklist 没有 ClickUp 原生 item id。不得假设存在真实 `checklist_ref`。

因此必须生成内部引用：

```text
checklist_ref = md-checklist:<source_ticket_id>:NO<checklist_order_no>
```

其中：

- `checklist_order_no` 表示该 ticket 描述区内第几个 markdown checklist 项，按出现顺序从 1 开始编号。
- 这是 checklist 顺序号，不是 ClickUp 原生 item id。
- 如需辅助定位，可额外记录 `line_number`、`original_line` 和 `text_hash`。

如果发现 ClickUp 原生 checklist item，而不是 markdown_description 中的 checklist，必须先确认 ClickUp MCP 是否提供原生 checklist item 更新能力；不得退回到非 MCP 回写方式。

## checklist 逐项映射

如果 ClickUp 主任务、子任务或关系任务的 `markdown_description` 中存在 checklist、验收标准、acceptance criteria、definition of done，必须逐项读取、逐项编号、逐项映射。

映射字段引用：

```text
../assets/templates/clickup-writeback.md
```

每一项至少记录：

1. `source_ticket_id`。
2. `checklist_order_no`：该 ticket 描述区内第几个 markdown checklist 项，从 1 开始。
3. `checklist_ref`：内部生成引用，例如 `md-checklist:86xxx:NO3`。
4. `line_number`：该 item 在 markdown_description 中的当前行号，仅作为辅助定位。
5. `original_line`：完整原始 markdown 行。
6. `checklist_text`：去掉 `- [ ]` / `- [x]` 后的文案。
7. `current_checked`：当前是否已勾选。
8. 对应 Test Case Base。
9. 验证类型。
10. 证据要求。
11. 回写状态。

不得把 `checklist_ref` 或 `checklist_order_no` 误认为 ClickUp 原生 item id。

## checklist → Test Contract

Test Case Base 是 Test Contract 的基础。不得漏项，不得把后端接口通过误认为前端控件验收通过。

每个 checklist item 必须明确验证类型。若 item 是前端控件 / UI / Figma / 小程序路径，后端 API 通过只能算部分证据，不能直接判定该 item 通过。

## 通过项回写方式

通过项回写必须使用 ClickUp MCP 更新任务的 `markdown_description`。

操作方式：

1. 读取当前 task 的最新 `markdown_description`。
2. 定位原始 checklist 行。
3. 对已通过项仅将同一行的 `[ ]` 改为 `[x]`。
4. 不改 checklist 文案。
5. 不改未通过、未验证、阻塞、不适用项。
6. 整体提交更新后的 `markdown_description`。
7. 更新后重新读取任务，确认目标行已变为 `[x]`。

## 定位策略

回写时必须按以下优先级定位 markdown checklist 行：

1. `source_ticket_id + original_line` 精确匹配。
2. `source_ticket_id + checklist_order_no + original_line` 校验匹配。
3. `source_ticket_id + checklist_order_no + checklist_text` 校验匹配。
4. 如果存在重复文案，必须使用 checklist_order_no + line_number + 前后文定位。
5. 如果行已变化、重复无法消解或上下文冲突，停止并请求用户确认。

不得只凭 checklist_text 盲目改第一个匹配项。

## 禁止事项

1. 禁止使用非 MCP 回写方式作为 checklist 回写备选。
2. 禁止用 emoji、图标、评论、描述补充文字替代 `[x]`。
3. 禁止新增一份“已完成 checklist”来代替修改原始 checklist 行。
4. 禁止改写 checklist 文案。
5. 禁止把未通过、未验证、阻塞、不适用项改为 `[x]`。
6. 禁止在未重新读取确认前声称回写成功。
7. 禁止直接覆盖用户在任务描述中的其他并发修改；如 markdown_description 读取后发生变化，必须重新合并或请求用户确认。

## 可勾选条件

只有同时满足以下条件才允许把 `[ ]` 改为 `[x]`：

1. checklist item 已映射到 Test Case Base。
2. 对应测试 / 验收已通过，或用户明确接受该项未验证风险。
3. QA 或 main agent 已给出证据。
4. 该项不是 blocked / not_applicable / pending。
5. 已确认该行来自原始 `markdown_description` checklist。

## 并发与安全

整体更新 `markdown_description` 前必须尽量避免覆盖其他内容：

1. 更新前读取最新 `markdown_description`。
2. 只对目标 checklist 行做 `[ ]` → `[x]` 的最小修改。
3. 如果目标行不存在、文案变化、重复出现或状态已改变，停止并请求确认。
4. 如果存在多个相同 checklist 文案，必须基于 checklist_order_no、line_number 和前后文定位；无法定位时不得回写。

## 输出

最终汇总必须包含：

```text
ClickUp Markdown Checklist Writeback:
- source_ticket_id:
- markdown_description_updated: yes / no
- checked_items:
  - checklist_ref:
  - checklist_order_no:
  - original_line:
  - updated_line:
  - verification_evidence:
  - writeback_method: ClickUp MCP markdown_description update
  - verify_after_update: success / failed
- unchecked_items:
  - checklist_ref:
  - checklist_order_no:
  - original_line:
  - reason: failed / blocked / not_verified / not_applicable / no_permission / conflict
- skipped_items:
- writeback_blockers:
- forbidden_substitution_used: false
```

若 `forbidden_substitution_used=true`，任务不得标记完成。
