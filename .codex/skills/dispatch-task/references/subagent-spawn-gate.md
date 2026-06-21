# Subagent Spawn Gate

本文件只在存在 required named subagent，且需要复用或创建 subagent 时读取。

它保留 Reuse Gate、Spawn Contract Gate 和启动探针。逻辑分配成功不等于真实 spawn 成功；required subagent 未复用或 spawn 成功时不得进入实现或验证。

## Subagent Reuse Gate

分配任何 subagent 前，main agent 必须检查同一 `dispatch_run_id` / ClickUp ticket / branch / scope 下是否已有同角色可用线程，并输出 `existing_subagents_checked`、`existing_subagents`、`reuse_decision`。

复用优先级：同一 ticket + role + branch + scope；同一 ticket + role + branch；同一 dispatch_run_id + role；均无可用线程时才允许新建。

必须复用的场景：code review blocking findings 回修必须回到同一 implementer；QA failed 后产品代码修复必须回到同一 implementer；同一验收目标正式 QA 优先复用原 QA；docs_keeper 已接收 Sync Packet 且未完成不得新开；code_explorer 已定位同一入口链路不得重复新开。

允许新开同角色 subagent 仅限：原线程明确 blocked；原线程已完成且任务范围实质变化；原线程 role 不匹配；原线程上下文污染严重；用户明确要求替换。

新开同角色 subagent 时必须记录：`replacement_reason`、`existing_thread`、`why_not_reused`、`risk`。缺少 `existing_subagents_checked` 与 `reuse_decision` 时，Gate 不通过。


## Subagent Spawn Contract Gate

分配 named subagent 且无可复用线程时，必须生成并执行可验证 Spawn Contract。`spawn_required=yes` 但 `spawn_attempted!=yes` 或 `spawn_succeeded!=yes` 时，Gate 不通过。

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-05`）。

适用 named agents：`code_explorer`、`implementer_fast`、`implementer_deep`、`qa_reviewer`、`docs_keeper`。必须使用 `fork_turns="none"`，不得 full-history fork，不得省略；省略可能导致 `agent_type` / `model` / `reasoning_effort` 覆盖失败、spawn 失败或退回默认线程。

spawn message 只能传递最小任务上下文：任务目标、允许 / 禁止文件、角色边界、验收标准、停止条件、回传格式。禁止传递完整历史对话、无关旧任务事实、未经筛选的完整文档目录、未经压缩的 BRV / ClickUp / MCP 大段输出、与当前角色无关的实现细节。

spawn 失败时必须停止并输出：

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-06`）。

若 raw error 不可见，也必须输出 `raw_error: unavailable` 与 `failure_visibility: no_raw_error_returned_by_runtime`；不得伪造成功。


## Subagent 启动探针

当连续出现 subagent 未按要求创建、agent_type 漂移、fallback default 线程、MCP 子线程异常或 `fork_turns` 行为不确定时，必须先执行最小探针，不得直接进入实现。探针通过后才允许正式 Agent Assignment；探针失败时必须停止并输出 Subagent Spawn Blocker。

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-07`）。
