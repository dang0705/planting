# Agent Assignment Core

本文件是 Agent Assignment 的最小必读核心。它只定义全局硬规则、可分配 agent 和最低输出。

代码路由、QA / docs 路由、subagent reuse / spawn 细则按需读取拆分文件；不得一次性读取所有 assignment 规则。

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

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-01`）。

每个被分配或判断为不需要的 subagent，必须输出：

外置模板/规范片段：`../assets/templates/agent-assignment.md`（template_id: `agent-assignment-gate-02`）。


## 执行顺序

`dispatch-task` 必须按顺序执行：读取 task facts / ClickUp Contract / BRV Fact Routing Packet / 最小规则上下文；判断 `code_explorer_required`、`code_changes_required`、implementer 类型、`qa_reviewer_required`、`docs_keeper_required`；输出 Agent Assignment；执行 Reuse Gate；对无可复用线程的 required subagent 执行 Spawn Contract Gate；只有复用或 spawn 成功才允许进入实现 / 验证；implementer 完成后按需进入 QA / review / docs sync；main agent 最终 review、ClickUp 回写、Git commit 或总结。

任何 required subagent 未通过 Reuse Gate 或 Spawn Contract Gate，流程必须停止。


## 禁止行为

一律禁止：只声明 `assigned=yes` 但不真实复用 / spawn；省略 `fork_turns`；对 named agent 使用 full-history fork；spawn 失败后 main/default/fallback 线程代替执行；implementer 不可用时 main agent 写代码；QA failed 或 code review blocking findings 后 main agent 直接修代码；docs_keeper required 时跳过文档同步判断；伪造 spawn、测试、文档同步或 ClickUp 回写成功。


## Gate 通过条件

Gate 通过必须全部满足：完整 Agent Assignment；明确 `code_changes_required`、`code_explorer_required`、implementer required / not required、`qa_reviewer_required`、`docs_keeper_required`；已执行 Reuse Gate；required subagent 已复用或 spawn 成功；所有 named subagent 使用 `fork_turns="none"`；spawn context 为 minimal context packet；没有 main agent 写代码越界；没有 default / fallback 线程代替 named subagent。

任一条件不满足，必须输出 blocker 并停止进入实现。

对 `implementer_deep`，还必须满足 Contract-Locked Engineer Gate：`contract_lock_level=strict`、Implementation Contract 已附加、架构 / 实现 / 依赖 / 伪代码 / 停止条件均已锁定、回传格式要求 `contract_compliance_matrix`。缺任一项时，即使 subagent spawn 成功，Agent Assignment Gate 仍失败。
