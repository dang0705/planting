# Completion Gate

## 定位

本文件定义任务是否可以停止 / Done / 回写完成状态的最终门禁。

## 完成条件

只有同时满足以下条件时，任务才能标记完成并停止：

1. 所有 required acceptance items 已映射到 Test Case Base。
2. 所有 required Test Case 已通过，或存在明确 blocker 并已写回 ticket / summary。
3. QA 已按 Test Contract 完成验收。
4. 如果验收要求小程序实际交互，QA 已执行 WeChat DevTools MCP 自动化或端上验证。
5. ClickUp markdown checklist 已按结果回写，或原生 checklist MCP 不可用已明确记录并写回验收评论。
6. blocking findings 为 0。
7. Git commit 已完成，或存在明确不能提交的 blocker。
8. 未验证项已明确分类并写回。

## 不允许停止的情况

以下任一情况存在时，不得把任务当成完成：

1. 仅本地后端测试 PASS，但前端 / 小程序验收未做。
2. 仅 API 验证通过，但 UI 控件验收未做。
3. checklist / acceptance criteria 未映射。
4. QA 自动化未执行，且验收要求端上交互。
5. checklist writeback 未执行且没有 blocker / comment fallback。
6. 有未处理 request changes。
7. 有 required item 为 pending / not_verified 且用户未接受风险。

## 输出模板

```text
Completion Gate:
- acceptance_matrix_complete: yes / no
- required_tests_passed: yes / no
- qa_completed: yes / no
- mini_program_automation_completed: yes / no / not_applicable
- checklist_writeback_completed: yes / no / not_applicable
- blockers_written_back: yes / no
- git_commit_completed: yes / no
- open_required_items:
- pass: yes / no
- stop_allowed: yes / no
```
