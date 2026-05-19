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
- Subagent runtime 可用性:
  - `.codex/agents/*.toml` 是否已由 runtime 注册为 `agent_type`: 未确认 / 是 / 否
  - 本轮需预检的 `agent_type`:
  - 专用角色 spawn 结果:
  - fallback 策略:
- 预期输出:
- 写入权限:
- 首部规划闭环: task_planner 已派发 / 已复用 / 合法裁剪
- 实现前架构闭环: architect_reviewer 已派发 / 已复用 / 合法裁剪
- 实现闭环:
- 实现后代码 review 闭环: architect_reviewer 已复用 / 无代码 review
- QA 闭环:
- Handoff 闭环:
- 文档同步计划:
- Subagent 线程复用:
```

## Subagent 线程复用表

| logical_role | requested_agent_type | actual_agent_type | agent_id/thread_id | 状态 | fallback_reason / 复用说明 |
|---|---|---|---|---|---|
| task_planner | task_planner |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| code_explorer | code_explorer |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| architect_reviewer | architect_reviewer |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| implementer_fast | implementer_fast |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| implementer_deep | implementer_deep |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| qa_reviewer | qa_reviewer |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| docs_keeper | docs_keeper |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |
| release_ops | release_ops |  |  | 未开启 / 活跃 / 已关闭 / 已废弃 |  |

## 专用角色可用性与 fallback

| logical_role | requested_agent_type | spawn_result | actual_agent_type | expected_model/reasoning/profile/sandbox | observed_or_requested_model/reasoning/profile/sandbox | config_match |
|---|---|---|---|---|---|---|
| task_planner | task_planner | 未尝试 / 成功 / 不可用 |  |  |  |  |
| code_explorer | code_explorer | 未尝试 / 成功 / 不可用 |  |  |  |  |
| architect_reviewer | architect_reviewer | 未尝试 / 成功 / 不可用 |  |  |  |  |
| implementer_fast | implementer_fast | 未尝试 / 成功 / 不可用 |  |  |  |  |
| implementer_deep | implementer_deep | 未尝试 / 成功 / 不可用 |  |  |  |  |
| qa_reviewer | qa_reviewer | 未尝试 / 成功 / 不可用 |  |  |  |  |
| docs_keeper | docs_keeper | 未尝试 / 成功 / 不可用 |  |  |  |  |
| release_ops | release_ops | 未尝试 / 成功 / 不可用 |  |  |  |  |

## 非简单实现闭环

- task_planner planning：
- 实现前 architect 架构分析：
- 实现：
- 实现后 architect 代码 review：
- QA：
- handoff：
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
