# Implementer Routing Policy

本文件只在任务可能新增、修改或删除代码文件，或需要 code_explorer 定位时读取。

它保留 implementer_fast / implementer_deep 选择、code_explorer 必选条件、Contract-Locked Engineer Gate 和 main agent 写代码禁令。

## code_explorer 分配硬门禁

以下任一条件成立，`code_explorer_required` 必须为 `yes`：入口文件不清；调用链 / 状态链 / 数据来源 / 依赖来源不清；影响范围不清；涉及历史逻辑替换、旧概念删除或跨模块边界；main agent 无法在不打开大量文件的情况下形成可靠 Implementation Contract。

`code_explorer_required=yes` 时必须真实复用或 spawn `code_explorer`，不得因 main agent “顺手查一下”而跳过。


## 实现闸门

只要任务需要新增、修改或删除代码文件，包括业务、测试、配置、云函数、页面组件、运行时脚本或 schema，必须分配 `implementer_fast` 或 `implementer_deep`。

`code_changes_required=yes` 但未分配 implementer 时，必须停止。runtime / 工具无法创建或进入 implementer subagent 时，必须输出 blocker 并停止；不得由 main agent、default 或 fallback 线程写代码。

选择规则：低风险、少量局部、契约清晰用 `implementer_fast`；多文件、多模块、状态机、API、schema、路由、诊断链路、历史逻辑替换或高风险改动用 `implementer_deep`；无法判断时默认 `implementer_deep`。



## implementer_deep Contract-Locked Engineer Gate

当选择 `implementer_deep` 时，默认假设其由 GLM-5.2 承担深度实现。main agent 必须把它当作“受限工程兵”，不得把架构裁决、技术选型、插件选择、状态机设计、API contract 设计、schema 设计或测试策略设计交给它自由发挥。

`implementer_deep` 分配前必须满足：

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-03`）。

缺少以下任一字段时，不得 spawn / 复用 `implementer_deep` 进入实现：

1. `contract_id`：本轮 Implementation Contract 的稳定 id。
2. `objective`：一句话目标，不能把需求重新解释权交给 implementer。
3. `allowed_paths`：唯一可写文件 / 目录。
4. `read_only_reference_paths`：只读参考文件 / 目录。
5. `forbidden_paths`：禁止修改范围。
6. `technical_decisions_locked`：main agent 已写死的架构方向。
7. `implementation_strategy_locked`：main agent 已写死的实现方式。
8. `dependency_policy_locked`：第三方插件 / 原生能力 / 手搓选择的硬规定。
9. `target_anchors`：文件路径 + symbol / 函数 / 组件 + 近似行号 + 邻近代码关键词。
10. `pseudocode_by_anchor`：按锚点组织的伪代码或步骤。
11. `data_contracts`：输入、输出、状态、API、schema、错误处理契约。
12. `test_contract`：必须执行的测试与不可替代证据。
13. `stop_conditions`：何时必须停止，不得猜测。
14. `output_requirements`：必须回传 `contract_compliance_matrix`。

硬规则：

- `contract_lock_level=strict` 时，implementer 只能把 Contract 落成代码，不得提出替代架构后直接执行。
- Contract 与现有代码冲突时，implementer 必须返回 blocker；main agent 修改 Contract 后再派发。
- main agent code review 必须逐项核对 `contract_compliance_matrix`；缺失或存在未授权 deviation 时，不得进入 QA。
- 如果 `implementer_deep` 修改了 allowed_paths 之外的文件、引入未授权依赖、重写未授权模块或改变 locked decision，本轮 review 必须失败并转回同一 implementer 线程返工。


## main agent 写入硬边界

main agent 绝对不得亲自修改：业务代码、测试代码、配置代码、云函数代码、页面组件代码、会影响运行时行为的脚本或 schema。没有“低风险小改”“用户要求 main 直接改”“subagent 不可用时 fallback/default 线程代替”的例外。

若 main agent 已越界改动代码，必须立即停止并输出：

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-04`）。


## 不分配 implementer 的合法例外

仅以下情况允许不分配 implementer：纯只读分析；纯规划且不改文件；纯 QA 验证且不改文件；纯文档判断但最终不落文档；只做 ClickUp checklist 回写、状态说明、Git commit 或最终汇总且不改代码。上述例外不得包含任何代码文件写入。
