# Main Pre-Implementation Gates

本文件只在正式进入 implementation 前读取。它保留 main agent 的技术方向、可审计方向记录、Contract-Locked Handoff 和 Implementation Contract 完整性门禁。

不得因为节省 token 跳过这些门禁。节省方式是只读 pre-implementation 所需门禁，不提前读取 post-implementation code review 细则。

## Gate Receipt 输出模式

所有 gate 默认输出 receipt，不输出长篇解释。

模板见：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-01`）。

若 gate 失败，只输出缺失字段、阻塞原因和下一步动作。详细证据放 handoff audit appendix。


## Technical Direction Gate

进入 implementer 执行前，main agent 必须输出并通过 Technical Direction Gate。

硬规则：

1. based_on_solution_discovery=no 时不得通过。
2. 未评估复用、wrapper/adapter、插件/原生能力，不得允许手搓复杂实现。
3. 未说明模块边界，不得进入 implementer。
4. 未说明风险与回滚，不得进入高风险实现。
5. 单文件可能超过 400 行必须预警；超过 500 行必须要求拆模块。
6. 未输出 `line_count_gate` 或未检查候选改动文件行数，不得进入 implementer。



## Architecture Direction Record Gate

进入 implementer 执行前，main agent 必须输出可审计的 Architecture Direction Record。该记录可以放在 gate receipt 的 `appendix_ref` / handoff 文件中，但不得缺失。

Architecture Direction Record 必须包含：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-02`）。

硬规则：

1. 技术选型必须写成 `final_choice`，不得留给 implementer 自行判断。
2. 第三方插件选择必须写明：使用现有依赖 / 使用原生能力 / 禁止新增依赖 / 允许新增某依赖。未写明时默认禁止新增依赖。
3. 实现方式必须写成硬规定：wrapper / adapter / composable / store action / repository / cloud function / component split / direct patch 等，不得只写“按需实现”。
4. 伪代码必须覆盖关键状态变化、错误分支和回滚逻辑；只有 UI 文案、样式微调或纯删除任务可写 `not_required` 并说明原因。
5. 目标锚点必须包含文件路径、symbol / 组件 / 函数、近似行号或邻近代码关键词；不得只写“相关文件”。
6. `rejected_options` 至少列 1 个被拒方案；高风险任务至少列 2 个。否则说明“无实际备选”的理由。
7. 未给出可审计 evidence_ref / appendix_ref 时，不得通过本 Gate。


## Contract-Locked Handoff Gate

当派发 `implementer_deep` 时，main agent 必须把 Architecture Direction Record 转成严格 Implementation Contract。该 Contract 是 implementer 的唯一实现依据。

必须输出：

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-03`）。

硬规则：

1. `contract_lock_level=strict` 缺失时，不得派发 `implementer_deep`。
2. `architecture_decisions_locked` 不能是原则性空话，必须是可执行约束，例如“必须复用 X composable，不得新增 Y store”。
3. `implementation_strategy_locked` 必须写明具体落点与实现步骤，不能只写“实现功能”。
4. `dependency_policy_locked` 必须写明第三方插件选择；未授权新增依赖时，implementer 不得安装或修改 lockfile。
5. `pseudocode_by_anchor` 必须按 target anchor 分组，避免 implementer 自由重排架构。
6. `stop_conditions` 必须包含：锚点不存在、Contract 与现有代码冲突、需要越权改文件、需要新增未授权依赖、测试命令不可执行、无法保持兼容。
7. Contract 缺字段时，Main Agent Quality Gate 失败；不得用口头说明代替。


## Implementation Contract Completeness Gate

派发 implementer 前，main agent 必须检查 Implementation Contract 完整性。

硬规则：

1. 文件级改动计划缺失，不得派发 implementer。
2. 禁止修改范围缺失，不得派发 implementer。
3. Test Contract 缺失，不得派发 implementer。
4. role_context_packet 缺失，不得派发 implementer。
5. `line_count_gate` 缺失，不得派发 implementer。
6. `over_500_line_touched_files` 非空且无 `decomposition_plan` / `approved_exception`，不得派发 implementer。
7. `implementer_deep` 缺少 `contract_lock_level=strict`，不得派发。
8. 缺少 `architecture_decisions_locked`、`implementation_strategy_locked`、`dependency_policy_locked`、`target_anchors` 或 `pseudocode_by_anchor`，不得派发 `implementer_deep`。
9. 第三方插件 / 原生能力 / 手搓实现没有被 main agent 写死裁决时，不得派发 `implementer_deep`。
10. Contract 没有要求 implementer 回传 `contract_compliance_matrix`，不得派发 `implementer_deep`。



## 可执行审计脚本

main agent 可使用以下脚本输出可审计 JSON receipt。脚本不能替代人工架构判断，但可阻断缺字段 Contract 和超过 500 行文件。

外置模板/规范片段：`../assets/templates/main-agent-gates.md`（template_id: `main-agent-quality-gates-04`）。

`target-role=implementer_deep` 时，脚本至少检查 `contract_id`、`contract_lock_level`、`strict`、`allowed_paths`、`read_only_reference_paths`、`forbidden_paths`、`architecture_decisions_locked`、`implementation_strategy_locked`、`dependency_policy_locked`、`target_anchors`、`pseudocode_by_anchor`、`stop_conditions`、`contract_compliance_matrix` 等 marker。脚本通过不代表 Contract 质量充分；main agent 仍必须完成 Architecture Direction Record Gate 和 Code Review Gate。
