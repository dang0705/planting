# Git 工作区与最终提交规则

## 定位

本文件定义 Phase 0 任务前 snapshot commit 和任务完成后的最终 commit。

模板引用：

外置模板/规范片段：`../assets/templates/git-commit.md`（template_id: `git-completion-policy-01`）。

## Phase 0 Git baseline

任何 dispatch-task 启动后，在进入实现、QA、文档写入、ClickUp 回写之前，必须执行：

外置模板/规范片段：`../assets/templates/git-commit.md`（template_id: `git-completion-policy-02`）。

如果 `git status --short` 有任何输出，立即执行任务前 snapshot commit：

外置模板/规范片段：`../assets/templates/git-commit.md`（template_id: `git-completion-policy-03`）。

硬规则：

1. Phase 0 不做 `git diff`。
2. Phase 0 不分析 diff 内容。
3. Phase 0 不等待用户确认。
4. Phase 0 直接 snapshot 当前 dirty workspace。
5. snapshot commit 成功后，该 commit 是本轮任务 `base_ref`。
6. snapshot commit 失败时停止。
7. 工作区 clean 时跳过 snapshot commit。

说明：

- `git add -A` 只允许用于 Phase 0 snapshot commit。
- 任务完成后的最终 commit 禁止无范围 `git add -A` 和 `git add .`。

## commit message 规则

所有自动创建的 commit message 都必须满足：

1. 根据改动内容或 status 摘要生成。
2. 文案精炼。
3. 不超过 50 个字符。
4. 不使用空泛文案。
5. 不把长 ticket 标题整段塞进 message。
6. 有 ClickUp ticket id 时可放末尾，但不得超过 50 个字符。

示例：

外置模板/规范片段：`../assets/templates/git-commit.md`（template_id: `git-completion-policy-04`）。

## 最终 commit

任务确认完成后必须 commit，除非：

1. 用户明确禁止提交。
2. 无文件变更。
3. 无法隔离本轮变更。
4. 存在阻塞验证。
5. Git 状态异常。

最终 commit 只能包含本轮任务范围内变更。

要求：

1. 只 stage `task_allowed_paths` 或本轮明确产生的文件。
2. 禁止 `git add .`。
3. 禁止无范围 `git add -A`。
4. 不得混入 Phase 0 snapshot commit 之前的历史脏改动。
5. 无法隔离本轮变更时停止并报告 blocker。

## 输出

输出模板见：

外置模板/规范片段：`../assets/templates/git-commit.md`（template_id: `git-completion-policy-05`）。
