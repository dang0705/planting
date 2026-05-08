# Codex / Subagent 工作流规则

## 1. 定位

本文件是 `AGENTS.md` 中主代理调度协议的细化版本。

目标：

1. Main agent 先分类、再派发、再汇总。
2. Subagent 只读取与任务相关的最小必要规则。
3. 避免 subagent 重复读取完整 `AGENTS.md`。
4. 避免多个可写 agent 并行修改同一批文件。
5. 让复杂任务可中断、可恢复、可审计。

## 2. Dispatch Plan

```text
Dispatch Plan:
- 任务类型:
- 选择的 subagent:
- 选择原因:
- 需要读取的规则文件:
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
```

## 3. 推荐流程

复杂实现任务优先：

1. `task_planner`
2. `code_explorer`
3. `architect_reviewer`
4. `implementer_fast` 或 `implementer_deep`
5. `qa_reviewer`
6. `docs_keeper`
7. `release_ops`

## 4. 派发边界

1. 规划：`task_planner`
2. 代码探索与 `docs/code-logics/` 对照：`code_explorer`
3. 架构、模块边界、`docs/new-rules/` 一致性：`architect_reviewer`
4. 低风险局部实现：`implementer_fast`
5. 高风险、多文件、诊断流、CloudBase、数据结构实现：`implementer_deep`
6. QA、diff、模块化回归、规则一致性：`qa_reviewer`
7. 文档、术语、`docs/code-logics/`、`docs/new-rules/`：`docs_keeper`
8. 发布、部署、CloudBase、replay、回滚：`release_ops`

## 5. 并发限制

1. 允许多个只读 subagent 并行探索。
2. 不允许多个可写 subagent 同时修改同一批文件。
3. 高风险任务必须先只读分析，再进入实现。
4. 可写实现任务必须明确由 `implementer_fast` 或 `implementer_deep` 之一执行。
