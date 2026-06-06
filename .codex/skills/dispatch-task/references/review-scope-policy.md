# Review Scope 与 QA 边界

## main agent code review

main agent 做实现后 code review，采用：

```text
diff-first + dependency-context-limited
```

不是 diff-only。

允许读取最小依赖上下文，但每个扩展读取的文件都必须说明原因。不得默认 review 整个 dirty workspace。

## Main Agent Code Review Gate

实现后 code review 必须输出并通过 Main Agent Code Review Gate。未通过前不得进入 QA。

如果发现 blocking findings，main agent 不得亲自修复，必须把 findings 转回同一 implementer 线程；不得新开同角色 implementer，除非原线程明确 blocked / unavailable 并记录 replacement_reason。

## QA 边界

QA 不审代码 diff，不做 code review。

`changed_files_as_test_scope_hint` 只作为测试影响范围提示，不作为代码审查对象。

## Dirty Workspace

测试失败和 review findings 必须分类：

1. 本轮阻塞。
2. 本轮非阻塞。
3. 既有问题。
4. 无关脏改动干扰。
5. 环境问题。
6. 无法判断。


## main agent 越界处理

如果 review 阶段发现 main agent 已经亲自改代码：

1. 立即停止进入 QA。
2. 标记 `Main Agent Boundary Violation`。
3. 将相关 diff 交回同一 implementer 线程确认、修复或重做。
4. 重新执行 Main Agent Code Review Gate。
