# Subagent 线程复用规则

## 1. 定位

本文件约束同一会话内 subagent 的线程复用，防止同角色重复开线程导致上下文分叉、结论冲突和 token 浪费。

## 2. 硬规则

1. 同一会话中，同一角色只能保留一个活跃 subagent 线程。
2. 继续同一角色任务时，必须优先复用已有线程，通过 `send_input` 追加任务或补充上下文。
3. 不允许并行启动同一角色的多个线程。
4. 若旧线程失效、职责边界改变、模型能力不匹配或必须更换写入边界，才允许重开同角色线程。
5. 重开同角色线程前，main agent 必须关闭或明确废弃旧线程，并在 handoff / 最终汇总中记录原因。
6. 线程复用的主键是 `logical_role`，不是 `actual_agent_type`。当专用角色不可用而使用 `default` 替代时，`default` 线程必须绑定到一个明确的 `logical_role`，不得混用为其他角色。
7. `.codex/agents/*.toml` 是角色规范，不是 runtime 注册成功证明。专用角色是否可用，以本轮 `spawn_agent` 的实际结果为准。

## 3. 当前标准角色名

1. `task_planner`
2. `code_explorer`
3. `architect_reviewer`
4. `implementer_fast`
5. `implementer_deep`
6. `qa_reviewer`
7. `docs_keeper`
8. `release_ops`

旧角色名如 `new-rules-keeper`、`modulize-keeper`、`dent-guard`、`review` 只作为历史记录，不再作为当前调度角色名使用。

若 `spawn_agent(agent_type=<标准角色名>)` 返回不可用，允许在 main agent 裁决后开启 `default` 替代线程，但 handoff 和最终汇总必须继续使用上面的标准角色名作为 `logical_role`。

## 4. Handoff 记录要求

多 agent 或可恢复任务的 handoff 必须记录 `Subagent 线程复用表`：

```text
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
```

如果本轮未开启 subagent，handoff 或最终汇总应写明“未开启 subagent，无需线程复用”。如果 `actual_agent_type=default`，必须额外记录 `requested_agent_type`、专用角色失败原因、是否按 `.codex/agents/<role>.toml` 设置了模型与 reasoning。
