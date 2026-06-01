# ClickUp Checklist 与验收回写规则

## 1. 定位

本文件定义 checklist / acceptance criteria 从读取、映射、测试到 ClickUp 回写的完整链路。

## 2. checklist 逐项映射

如果 ClickUp 主任务、子任务或关系任务中存在 checklist、验收标准、acceptance criteria、definition of done，必须逐项读取、逐项编号、逐项映射。

必须输出：

```text
Acceptance Checklist Matrix:
- item_id:
- clickup_checklist_item_id:
- source_ticket_id:
- source: 主任务 / 子任务 / 关系任务 / 评论 / 附件
- original_text:
- required: true / false
- mapped_test_case_id:
- verification_type: unit / smoke / e2e / UI / Figma / API / DB / runtime / manual
- owner: implementer / QA / main agent / docs
- status: pending / covered / blocked / not_applicable
- evidence_required:
- writeback_required: true / false
- writeback_status: not_started / checked / failed / skipped
```

并生成：

```text
Test Case Base:
- test_case_id:
- based_on_acceptance_item:
- scenario:
- precondition:
- steps:
- expected_result:
- verification_method:
- required_evidence:
- blocking_if_failed: true / false
```

## 3. checklist → Test Contract

`Test Case Base` 是 `Test Contract` 的基础。不得漏项，不得把后端接口通过误认为前端控件验收通过。

每个 checklist item 必须明确验证类型。若 item 是前端控件 / UI / Figma / 小程序路径，后端 API 通过只能算部分证据，不能直接判定该 item 通过。

## 4. 通过项回写

ClickUp 任务、子任务或关系任务中存在 checklist item 时，main agent 必须在任务确认完成后对已通过项进行真实勾选回写。

首选：

```text
ClickUp MCP
```

备选：

```text
computer use / 浏览器 UI
```

严禁用以下方式替代真实 checklist 勾选：

```text
emoji / 图标 / ✅ / [x] / 评论 / 描述 / 文字“已完成”
```

## 5. 可勾选条件

只有同时满足以下条件才允许勾选：

1. checklist item 已映射到 Test Case Base。
2. 对应测试 / 验收已通过，或用户明确接受该项未验证风险。
3. QA 或 main agent 已给出证据。
4. 该项不是 blocked / not_applicable / pending。
5. 已确认是原始 ClickUp checklist item。

## 6. 输出

```text
ClickUp Checklist Writeback:
- total_items:
- checked_items:
  - item_id:
  - original_text:
  - source_ticket:
  - verification_evidence:
  - writeback_method: ClickUp MCP / computer use
  - writeback_status: success / failed
- unchecked_items:
  - item_id:
  - original_text:
  - reason: failed / blocked / not_verified / not_applicable / no_permission / no_mcp_support
- forbidden_substitution_used: false
```

若 `forbidden_substitution_used=true`，任务不得标记完成。
