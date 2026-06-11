# Agent Assignment Gate

## 定位

本文件定义 `dispatch-task` 的 Agent Assignment / Execution Gate / Subagent Reuse Gate / Subagent Spawn Contract Gate。未通过本门禁，不得进入实现。

输出格式引用：`../assets/templates/agent-assignment.md`

## 核心硬规则

1. `assigned=yes` 只代表计划分配，不代表 subagent 已创建；必须通过 Reuse Gate 或 Spawn Contract Gate。
2. named subagent 必须真实复用或真实 spawn；不得由 main agent 在文本中声明分配后自行接管。
3. 所有 named subagent 必须使用 `fork_turns="none"`，最小上下文，不得 full-history fork，不得省略 `fork_turns`。
4. spawn / 复用失败必须停止；不得由 main agent、default 线程或 fallback 线程代替执行。
5. main agent 只负责读取、计划、契约、分配、协调、review、ClickUp 回写、Git commit；不得写代码类文件。

## 可分配 agent

| agent              | 用途                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `code_explorer`    | 低成本代码定位；入口、调用链、依赖来源或影响范围不清时使用。一旦 required，必须真实复用或 spawn。 |
| `implementer_fast` | 低风险、局部、契约清晰的代码执行。                                                                |
| `implementer_deep` | 高风险 / 多文件 / 多模块 / 状态机 / API / schema / 路由 / 诊断链路 / 历史逻辑替换。               |
| `qa_reviewer`      | 测试执行、smoke、e2e、UI/Figma、小程序自动化、失败归因。                                          |
| `docs_keeper`      | 知识卫生、活文档维护、索引同步、术语一致性、旧文档归档；不维护旧蓝图为当前事实。                  |

## Agent Assignment 最低输出

进入实现前，main agent 必须输出完整 Agent Assignment；缺任一关键字段则 Gate 不通过。

```text
Agent Assignment:
- dispatch_run_id:
- clickup_ticket:
- branch:
- scope:
- code_changes_required: yes / no
- code_explorer_required: yes / no
- implementer_required: yes / no
- qa_reviewer_required: yes / no
- docs_keeper_required: yes / no
- existing_subagents_checked: yes / no
- reuse_decision:
- spawn_contracts_validated: yes / no
- gate_result: pass / blocked
- blocker:
```

每个被分配或判断为不需要的 subagent，必须输出：

```text
Subagent Assignment:
- role:
- required: yes / no
- reason:
- assigned: yes / no / not_applicable
- reuse_decision: reused / create_new / not_required / blocked
- existing_thread:
- replacement_reason:
- spawn_required: yes / no
- spawn_attempted: yes / no / not_applicable
- spawn_succeeded: yes / no / not_applicable
- agent_type:
- task_name:
- fork_turns: none
- context_policy: minimal_context_only
- context_packet_summary:
- spawn_failure_raw:
```

## docs_keeper 分配硬门禁

main agent 必须显式输出：`docs_keeper_required`、`docs_keeper_reason`、`docs_keeper_assigned`、`docs_sync_scope`。

以下任一条件成立，`docs_keeper_required` 必须为 `yes`：

1. 修改诊断契约、问诊题包、route / outcome 公开契约、停止 / 输出资格、API 响应结构、schema、配置或 workflow 规则。
2. BRV Recall Packet、task facts、ClickUp checklist、代码注释或活文档明确要求同步 docs / new-rules / source index / BRV source verification。
3. 删除、替换或降级旧概念，且旧概念存在于 active docs、`docs/new-rules/`、`.brv/source-verification.json` 或 active `.brv/context-tree/`。
4. 任务结果需要记录“当前入口在哪里、删除了哪些旧逻辑、扩展点如何预留”等长期可复用事实。

`docs_keeper_required=yes` 但未分配 `docs_keeper` 时，Gate 不通过，必须停止或补派。若判断为 `no`，必须给出理由；不得仅因 task facts 未显式写“更新文档”而判定不需要。

## code_explorer 分配硬门禁

以下任一条件成立，`code_explorer_required` 必须为 `yes`：入口文件不清；调用链 / 状态链 / 数据来源 / 依赖来源不清；影响范围不清；涉及历史逻辑替换、旧概念删除或跨模块边界；main agent 无法在不打开大量文件的情况下形成可靠 Implementation Contract。

`code_explorer_required=yes` 时必须真实复用或 spawn `code_explorer`，不得因 main agent “顺手查一下”而跳过。

## 实现闸门

只要任务需要新增、修改或删除代码文件，包括业务、测试、配置、云函数、页面组件、运行时脚本或 schema，必须分配 `implementer_fast` 或 `implementer_deep`。

`code_changes_required=yes` 但未分配 implementer 时，必须停止。runtime / 工具无法创建或进入 implementer subagent 时，必须输出 blocker 并停止；不得由 main agent、default 或 fallback 线程写代码。

选择规则：低风险、少量局部、契约清晰用 `implementer_fast`；多文件、多模块、状态机、API、schema、路由、诊断链路、历史逻辑替换或高风险改动用 `implementer_deep`；无法判断时默认 `implementer_deep`。

## main agent 写入硬边界

main agent 绝对不得亲自修改：业务代码、测试代码、配置代码、云函数代码、页面组件代码、会影响运行时行为的脚本或 schema。没有“低风险小改”“用户要求 main 直接改”“subagent 不可用时 fallback/default 线程代替”的例外。

若 main agent 已越界改动代码，必须立即停止并输出：

```text
Main Agent Boundary Violation:
- files_touched:
- violation_type:
- required_recovery:
  - revert_or_handoff_to_implementer:
  - review_required:
```

## 不分配 implementer 的合法例外

仅以下情况允许不分配 implementer：纯只读分析；纯规划且不改文件；纯 QA 验证且不改文件；纯文档判断但最终不落文档；只做 ClickUp checklist 回写、状态说明、Git commit 或最终汇总且不改代码。上述例外不得包含任何代码文件写入。

## Subagent Reuse Gate

分配任何 subagent 前，main agent 必须检查同一 `dispatch_run_id` / ClickUp ticket / branch / scope 下是否已有同角色可用线程，并输出 `existing_subagents_checked`、`existing_subagents`、`reuse_decision`。

复用优先级：同一 ticket + role + branch + scope；同一 ticket + role + branch；同一 dispatch_run_id + role；均无可用线程时才允许新建。

必须复用的场景：code review blocking findings 回修必须回到同一 implementer；QA failed 后产品代码修复必须回到同一 implementer；同一验收目标正式 QA 优先复用原 QA；docs_keeper 已接收 Sync Packet 且未完成不得新开；code_explorer 已定位同一入口链路不得重复新开。

允许新开同角色 subagent 仅限：原线程明确 blocked；原线程已完成且任务范围实质变化；原线程 role 不匹配；原线程上下文污染严重；用户明确要求替换。

新开同角色 subagent 时必须记录：`replacement_reason`、`existing_thread`、`why_not_reused`、`risk`。缺少 `existing_subagents_checked` 与 `reuse_decision` 时，Gate 不通过。

## Subagent Spawn Contract Gate

分配 named subagent 且无可复用线程时，必须生成并执行可验证 Spawn Contract。`spawn_required=yes` 但 `spawn_attempted!=yes` 或 `spawn_succeeded!=yes` 时，Gate 不通过。

```text
Spawn Contract:
- spawn_required: yes / no
- spawn_attempted: yes / no / not_applicable
- spawn_succeeded: yes / no / not_applicable
- agent_type:
- task_name:
- fork_turns: none
- context_policy: minimal_context_only
- context_packet:
  - dispatch_run_id:
  - clickup_ticket:
  - branch:
  - scope:
  - role_boundary:
  - task_objective:
  - allowed_files:
  - forbidden_files:
  - must_read:
  - must_not_read:
  - acceptance_criteria:
  - stop_conditions:
  - return_format:
- spawn_failure_raw:
```

适用 named agents：`code_explorer`、`implementer_fast`、`implementer_deep`、`qa_reviewer`、`docs_keeper`。必须使用 `fork_turns="none"`，不得 full-history fork，不得省略；省略可能导致 `agent_type` / `model` / `reasoning_effort` 覆盖失败、spawn 失败或退回默认线程。

spawn message 只能传递最小任务上下文：任务目标、允许 / 禁止文件、角色边界、验收标准、停止条件、回传格式。禁止传递完整历史对话、无关旧任务事实、未经筛选的完整文档目录、未经压缩的 BRV / ClickUp / MCP 大段输出、与当前角色无关的实现细节。

spawn 失败时必须停止并输出：

```text
Subagent Spawn Blocker:
- agent_type:
- task_name:
- fork_turns:
- context_policy:
- raw_error:
- suspected_reason:
  - agent_type_unavailable:
  - fork_turns_rejected:
  - agent_limit_reached:
  - mcp_startup_failed:
  - model_or_backend_unsupported:
  - unknown:
```

若 raw error 不可见，也必须输出 `raw_error: unavailable` 与 `failure_visibility: no_raw_error_returned_by_runtime`；不得伪造成功。

## Subagent 启动探针

当连续出现 subagent 未按要求创建、agent_type 漂移、fallback default 线程、MCP 子线程异常或 `fork_turns` 行为不确定时，必须先执行最小探针，不得直接进入实现。探针通过后才允许正式 Agent Assignment；探针失败时必须停止并输出 Subagent Spawn Blocker。

```text
必须 spawn code_explorer subagent。
要求：agent_type="code_explorer"；task_name="probe_code_explorer_spawn"；fork_turns="none"；context_policy="minimal_context_only"；message="只回复 STARTED，不读取项目文件，不修改任何文件。"
如果 spawn_agent 失败，输出原始错误；不要换成 main agent 自己回答。
```

## 执行顺序

`dispatch-task` 必须按顺序执行：读取 task facts / ClickUp Contract / BRV Recall Packet / 最小规则上下文；判断 `code_explorer_required`、`code_changes_required`、implementer 类型、`qa_reviewer_required`、`docs_keeper_required`；输出 Agent Assignment；执行 Reuse Gate；对无可复用线程的 required subagent 执行 Spawn Contract Gate；只有复用或 spawn 成功才允许进入实现 / 验证；implementer 完成后按需进入 QA / review / docs sync；main agent 最终 review、ClickUp 回写、Git commit 或总结。

任何 required subagent 未通过 Reuse Gate 或 Spawn Contract Gate，流程必须停止。

## 禁止行为

一律禁止：只声明 `assigned=yes` 但不真实复用 / spawn；省略 `fork_turns`；对 named agent 使用 full-history fork；spawn 失败后 main/default/fallback 线程代替执行；implementer 不可用时 main agent 写代码；QA failed 或 code review blocking findings 后 main agent 直接修代码；docs_keeper required 时跳过文档同步判断；伪造 spawn、测试、文档同步或 ClickUp 回写成功。

## Gate 通过条件

Gate 通过必须全部满足：完整 Agent Assignment；明确 `code_changes_required`、`code_explorer_required`、implementer required / not required、`qa_reviewer_required`、`docs_keeper_required`；已执行 Reuse Gate；required subagent 已复用或 spawn 成功；所有 named subagent 使用 `fork_turns="none"`；spawn context 为 minimal context packet；没有 main agent 写代码越界；没有 default / fallback 线程代替 named subagent。

任一条件不满足，必须输出 blocker 并停止进入实现。
