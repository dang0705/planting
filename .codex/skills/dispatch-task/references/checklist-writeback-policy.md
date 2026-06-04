# ClickUp Checklist 与验收回写规则

## 定位

本文件定义 ClickUp checklist / 验收标准从读取、映射、测试到回写的完整链路。

任何 ClickUp 任务只要存在 checklist、验收标准、acceptance criteria、definition of done、request changes、评论中的验收要求，都必须进入验收映射流程。不得因为 ClickUp MCP 没有原生 checklist item 读写工具而跳过。

模板引用：

```text
../assets/templates/clickup-writeback.md
```

## 识别顺序

按以下顺序识别验收项：

1. `markdown_description` 中的 Markdown checklist。
2. 描述区 / 评论 / 子任务 / 关系任务中的 acceptance criteria、验收标准、definition of done。
3. request changes / bug report 中的可验证要求。
4. ClickUp 原生 checklist item（仅当 MCP 暴露原生 checklist 读写能力时使用）。

## Markdown checklist 回写

ClickUp 描述区中的 slash / Markdown checklist 可以通过整体更新 task 的 `markdown_description` 来改变勾选状态。

例如：

```markdown
- [x] 用户在 `D-10 ~ D-1` 中选择多天浇水后，前端能生成正确的最近 10 天浇水行为数据。
```

回写方式：

1. 读取当前 task 的最新 `markdown_description`。
2. 定位原始 checklist 行。
3. 对已通过项仅将同一行的 `[ ]` 改为 `[x]`。
4. 不改 checklist 文案。
5. 不改未通过、未验证、阻塞、不适用项。
6. 整体提交更新后的 `markdown_description`。
7. 更新后重新读取任务，确认目标行已变为 `[x]`。

## Markdown checklist 顺序号

Markdown checklist 没有 ClickUp 原生 item id。不得假设存在真实 `item_id`。

必须生成内部引用：

```text
checklist_ref = md-checklist:<source_ticket_id>:NO<checklist_order_no>
```

其中 `checklist_order_no` 表示该 ticket 描述区内第几个 markdown checklist 项，按出现顺序从 1 开始编号。

## 原生 checklist MCP 能力缺失

如果任务中存在 ClickUp 原生 checklist item，但当前暴露的 ClickUp MCP 没有原生 checklist item 读写工具：

1. 不得跳过 checklist / 验收映射。
2. 必须记录 `native_checklist_mcp_unavailable=true`。
3. 如果能从描述、评论、子任务或验收标准重建验收项，必须生成 Acceptance Checklist Matrix 和 Test Case Base。
4. 原生 checklist item 无法真实勾选时，必须写明 blocker 或通过任务评论写回验收矩阵与结果。
5. 不得声称原生 checklist 已勾选。
6. 不得使用非 MCP 回写方式。

## 验收标准 fallback

如果没有 Markdown checklist，但有验收标准 / request changes / 子任务要求，则必须重建：

```text
Acceptance Checklist Matrix
Test Case Base
Test Contract
```

完成验收后，通过 ClickUp MCP 写回结构化评论：

```text
Acceptance Verification Comment
```

该评论不是 checklist 勾选，不能伪称为 checklist writeback，但它是当前 MCP 能力不足时的最低合规回写。

## checklist 逐项映射

如果 ClickUp 主任务、子任务或关系任务中存在 checklist 或验收要求，必须逐项读取、逐项编号、逐项映射。

每一项至少记录：

1. `source_ticket_id`。
2. `checklist_ref` 或 `acceptance_ref`。
3. `checklist_order_no`，仅 markdown checklist 需要。
4. `source_type`：markdown_checklist / acceptance_criteria / request_changes / comment / subtask / relationship / native_checklist_unavailable。
5. `original_line` 或 `original_text`。
6. `checklist_text` 或 `acceptance_text`。
7. 当前状态。
8. 对应 Test Case Base。
9. 验证类型。
10. 证据要求。
11. 回写策略。

## checklist → Test Contract

Test Case Base 是 Test Contract 的基础。不得漏项，不得把后端接口通过误认为前端控件验收通过。

每个验收项必须明确验证类型。若 item 是前端控件 / UI / Figma / 小程序路径，后端 API 通过只能算部分证据，不能直接判定该 item 通过。

## 禁止事项

1. 禁止使用非 MCP 回写方式作为 checklist 回写备选。
2. 禁止用 emoji、图标、评论、描述补充文字替代 `[x]`。
3. 禁止新增一份“已完成 checklist”来代替修改原始 checklist 行。
4. 禁止改写 checklist 文案。
5. 禁止把未通过、未验证、阻塞、不适用项改为 `[x]`。
6. 禁止在未重新读取确认前声称回写成功。
7. 禁止直接覆盖用户在任务描述中的其他并发修改。
8. 禁止因为 MCP 缺少原生 checklist 工具而跳过 Test Case Base。

## 可勾选条件

只有同时满足以下条件才允许把 `[ ]` 改为 `[x]`：

1. checklist item 已映射到 Test Case Base。
2. 对应测试 / 验收已通过，或用户明确接受该项未验证风险。
3. QA 或 `main agent` 已给出证据。
4. 该项不是 blocked / not_applicable / pending。
5. 已确认该行来自原始 `markdown_description` checklist。
