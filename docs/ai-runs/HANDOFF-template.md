# Handoff：<任务名>

## 任务信息

- 任务名：
- 创建时间：
- 当前阶段：
- 当前结论：

## Main Agent Dispatch Plan

```text
Dispatch Plan:
- 任务类型:
- 目标验收契约:
  - bug 发生位置:
  - 观察入口:
  - 用户可见成功标准:
  - 必须验证字段 / 证据:
  - 快捷路径 / 主链守卫一致性:
  - 非目标:
- 选择的 subagent:
- 选择原因:
- 需要读取的规则文件:
- 是否需要读取 AGENTS.md:
- 预期输出:
- 写入权限:
- 首部规划闭环:
- 架构分析闭环:
- 实现闭环:
- QA 闭环:
- 文档同步计划:
- Subagent 线程复用:
```

## Subagent 线程复用表

| role | agent_id/thread_id | 状态 | 最近任务 | 复用/重开说明 |
|---|---|---|---|---|
| task_planner |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| code_explorer |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| architect_reviewer |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| implementer_fast |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| implementer_deep |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| qa_reviewer |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| docs_keeper |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |
| release_ops |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |  |

## 非简单实现闭环

- planning：
- 架构分析：
- 实现：
- QA：
- 文档同步判断：
- 裁剪项与理由：

## 已读取规则

- ...

## 相关文件

- ...

## 相关知识库

- `docs/code-logics/`：
- `docs/new-rules/`：
- 其他：

## 结论

...

## 证据

...

## 诊断快捷路径防复发

- 是否涉及 `fast path` / `warm path` / `early return` / 缓存命中 / 性能优化路径：否 / 是
- 主链输出点：
- 快捷路径输出点：
- 共享 guard：
- 负向回归样本（应继续追问而非 final）：
- 正向闭合样本：
- 真实 HTTP smoke / DB 证据：

## 已完成

...

## 未完成

...

## 风险

...

## 验证状态

- `npm run lint`：
- `npm test`：
- `npm run build`：
- 类型检查：当前项目无独立 `typecheck` script 时不得填写为已运行

## 文档同步状态

- `docs/code-logics/`：
- `docs/new-rules/`：
- 其他文档：

## 下一步建议

...
