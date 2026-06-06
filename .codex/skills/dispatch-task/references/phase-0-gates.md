# Phase 0 硬门禁

## 定位

Phase 0 是 `dispatch-task` 的第一阶段。未通过 Phase 0，不得进入实现、QA、文档同步、ClickUp 回写或 Git commit。

输出格式引用：

```text
../assets/templates/phase-gates.md
```

## 必须完成

1. 判断 `clickup_ticket / prompt_only` 模式。
2. 执行 Git Workspace Check。
3. 如果工作区非 clean，立即执行任务前 snapshot commit。
4. 理解任务意图。
5. 完成 Agent Assignment。
6. 生成 role_context_packets。
7. 通过 Execution Gate。

## Phase 0 Git baseline

Phase 0 只使用 `git status --short` 判断工作区是否 dirty，不做 `git diff`，不做 diff 内容分析。

如果 `git status --short` 有任何输出，必须立即执行任务前 snapshot commit：

```bash
git status --short
git branch --show-current
git add -A
git commit -m "<message>"
git rev-parse HEAD
git status --short
```

规则：

1. 该 snapshot commit 是 Phase 0 基线固定动作，不询问用户。
2. commit message 必须根据 status 摘要生成，精炼且不超过 50 个字符。
3. Phase 0 禁止用 `git diff` 作为提交前分析步骤。
4. snapshot commit 成功后，以该 commit 作为本轮任务 `base_ref`。
5. snapshot commit 失败时停止，不得继续实现。
6. 工作区 clean 时不创建 snapshot commit。

## 停止条件

以下任一条件成立，必须停止：

1. snapshot commit 失败。
2. Git 状态异常。
3. 任务意图不清，且无法继续。
4. Agent Assignment 未输出。
5. role_context_packets 未生成。
6. `code_changes_required=yes` 但未分配 implementer。
7. Execution Gate 未通过。

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
