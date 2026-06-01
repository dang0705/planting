# Git 工作区与最终提交规则

## 1. 任务开始前

任何会修改文件的任务开始前，main agent 必须检查：

```bash
git status --short
git branch --show-current
```

记录：

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
```

## 2. very_dirty

满足任一条件视为 `very_dirty`：

1. 未提交文件明显超过本轮任务范围。
2. 大量 untracked 文件。
3. staged 文件来源不明。
4. 存在与本轮无关脏文件。
5. 存在冲突、删除、重命名或难以归因的改动。
6. 无法区分本轮改动和历史脏改动。

very_dirty 时必须询问用户是否继续；未确认前不得进入实现。

## 3. 任务完成后 commit

任务确认完成后必须 commit，除非：

1. 用户禁止提交。
2. 无文件变更。
3. 无法隔离本轮变更。
4. 存在阻塞验证。
5. Git 状态异常。

commit 只能包含本轮任务范围内变更。禁止：

```bash
git add .
```

必须只 stage 本轮相关文件。

## 4. 输出

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
