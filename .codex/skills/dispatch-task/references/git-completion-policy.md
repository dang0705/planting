# Git 工作区与最终提交规则

## 定位

本文件定义 Git 工作区检查、very_dirty 自动任务前快照提交，以及任务完成后的最终提交。

如需输出字段模板，读取：

```text
../assets/templates/git-commit.md
```

## 任务开始前

任何可能修改文件的任务开始前，main agent 必须检查：

```bash
git status --short
git branch --show-current
```

必须记录：

```text
Git Workspace Check:
- branch:
- status_summary:
- pre_task_dirty_files:
- staged_files:
- untracked_files:
- dirty_level: clean / manageable / very_dirty
- task_allowed_paths:
- excluded_dirty_files:
- pre_task_snapshot_commit_required:
- pre_task_snapshot_commit_hash:
```

## very_dirty 自动任务前快照提交

如果任务开始前工作区判断为 `very_dirty`，main agent 必须先执行一次 **pre-task dirty snapshot commit**。

目的：

1. 固定任务前基线。
2. 防止本轮改动与历史脏改动混在一起。
3. 让后续 review、QA、最终 commit 能以 snapshot commit 作为 `base_ref`。

硬规则：

1. 自动快照提交必须发生在任何实现、QA、文档写入、ClickUp 回写或任务变更之前。
2. 快照提交应包含当前工作区中所有非 ignored、可提交的改动。
3. 提交前必须检查是否存在明显不应入库内容，例如密钥、`.env`、证书、私钥、大体积二进制、构建产物或临时文件。
4. 发现不应入库内容时必须停止并报告安全 blocker，不得自动提交。
5. 快照提交成功后，必须再次执行 `git status --short` 和 `git rev-parse HEAD`。
6. 快照提交失败时必须停止，不得继续实现。
7. 后续任务以该快照 commit 作为 `base_ref`。
8. 任务完成后的最终 commit 仍只允许提交本轮任务范围内变更。

推荐命令顺序：

```bash
git status --short
git branch --show-current
git add -A
git commit -m "<pre_task_snapshot_message>"
git status --short
git rev-parse HEAD
```

说明：

- `git add -A` 只允许用于任务前 dirty snapshot commit。
- 任务完成后的最终 commit 禁止 `git add .`，也禁止无范围 `git add -A`。

## very_dirty 判定

满足任一条件视为 `very_dirty`：

1. 未提交文件明显超过本轮任务范围。
2. 大量 untracked 文件。
3. staged 文件来源不明。
4. 存在与本轮任务无关的脏文件。
5. 存在冲突、删除、重命名或难以归因的改动。
6. 无法区分本轮改动和历史脏改动。

## commit message 规则

所有由 workflow 自动创建的 commit message 都必须满足：

1. 根据实际改动内容生成。
2. 文案精炼。
3. 不超过 50 个字符。
4. 不使用空泛文案。
5. 不把长 ticket 标题整段塞进 message。
6. 有 ClickUp ticket id 时可放入末尾，但不得导致超过 50 个字符。
7. 中文或英文均可，优先清楚表达改动范围。

示例：

```text
chore: snapshot dirty workspace
fix: align care timeline UI
docs: update dispatch gates
test: add diagnosis route cases
```

不推荐：

```text
chore: snapshot dirty workspace before dispatch-task
fix: complete all frontend and backend changes for the ClickUp task
```

## 任务前快照 commit message

任务前 very_dirty 快照提交的 message 也必须基于当前脏改动内容，且不超过 50 个字符。

推荐格式：

```text
chore: snapshot <summary>
```

示例：

```text
chore: snapshot ui edits
chore: snapshot local changes
chore: snapshot docs updates
```

如果无法判断具体改动内容，可使用：

```text
chore: snapshot local changes
```

## 任务完成后 commit

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
4. 不得混入任务前 snapshot commit 之前的历史脏改动。
5. 无法隔离本轮变更时必须停止并报告 blocker。

## 输出

任务前如果触发 dirty snapshot commit，必须输出：

```text
Pre-task Dirty Snapshot Commit:
- branch:
- dirty_level:
- committed: yes / no
- commit_hash:
- commit_message:
- staged_files:
- blocked_reason:
```

任务完成后必须输出：

```text
Git Commit:
- branch:
- committed: yes / no
- commit_hash:
- commit_message:
- staged_files:
- excluded_dirty_files:
- 未提交原因:
```
