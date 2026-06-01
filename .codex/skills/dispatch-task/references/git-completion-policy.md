# Git 工作区与最终提交规则

## 定位

本文件定义 Git 工作区检查、very_dirty 处理和最终 commit 规则。

模板引用：

```text
../assets/templates/git-commit.md
```

## 任务开始前

任何会修改文件的任务开始前，main agent 必须检查：

```bash
git status --short
git branch --show-current
```

## very_dirty

工作区非常脏时必须询问用户是否继续；未确认前不得进入实现。

## 任务完成后 commit

任务确认完成后必须 commit，除非：

1. 用户禁止提交。
2. 无文件变更。
3. 无法隔离本轮变更。
4. 存在阻塞验证。
5. Git 状态异常。

commit 只能包含本轮任务范围内变更。禁止 `git add .`。

## 输出

输出模板见：

```text
../assets/templates/git-commit.md
```
