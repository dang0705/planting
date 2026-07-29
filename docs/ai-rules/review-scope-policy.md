# Review Scope 与 QA 边界

## 1. `main agent` code review

`main agent` 做实现后 code review，采用：

```text
diff-first + dependency-context-limited
```

不是 diff-only。

允许读取最小依赖上下文：

1. 直接调用方。
2. 直接被调用方。
3. 契约文件。
4. 类型 / schema。
5. mapper / formatter。
6. store / service / composable。
7. 相关测试入口。
8. 必要规则摘要。

每个扩展读取的文件都必须说明原因。

不得默认 review 整个 dirty workspace。

## 2. QA 边界

QA 不审代码 diff，不做 code review。

QA 输入：

1. 目标验收契约。
2. Test Contract。
3. `main agent` code review 摘要。
4. implementer 变更摘要。
5. changed_files_as_test_scope_hint。
6. QA Acceptance Slice。
7. 证据计划。

`changed_files_as_test_scope_hint` 只作为测试影响范围提示，不作为代码审查对象。

## 3. Dirty Workspace

测试失败和 review findings 必须分类：

1. 本轮阻塞。
2. 本轮非阻塞。
3. 既有问题。
4. 无关脏改动干扰。
5. 环境问题。
6. 无法判断。

无关脏文件不得直接作为本轮阻塞。
