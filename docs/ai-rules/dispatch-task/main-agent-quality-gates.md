# Main Agent Quality Gates

## 1. 定位

本文件定义 main agent 在无独立架构角色的工作流中必须执行的质量门禁。

main agent 负责：

1. 技术方向裁决。
2. Implementation Contract。
3. Test Contract。
4. 实现后代码 review。

但 main agent 不能靠“自认为已完成”进入下一阶段。必须通过以下硬门禁，且默认使用 Gate Receipt 短输出：

```text
Solution Discovery Gate
Technical Direction Gate
Implementation Contract Completeness Gate
Main Agent Code Review Gate
```

---

## 2. Solution Discovery Gate

进入 Technical Direction Gate 前，main agent 必须先完成 `Solution Discovery Gate`。

读取规则见：

```text
docs/ai-rules/dispatch-task/solution-discovery-gate.md
```

硬规则：

1. 没有完成需求复杂度评估，不得进入 Technical Direction Gate。
2. 没有评估项目已有实现 / 复用可能性，不得直接手搓。
3. 明确需要成熟方案时，没有评估 uni-app 生态、微信小程序原生能力或稳定第三方方案，不得直接手搓。
4. Discovery 输出必须遵守预算限制，不得生成长篇调研报告。
5. `Solution Discovery Gate.pass=no` 时，不得派发 implementer。

## 3. Technical Direction Gate

进入 implementer 执行前，main agent 必须输出并通过 `Technical Direction Gate`。

```text
Technical Direction Gate:
- based_on_solution_discovery: yes / no
- alternatives_considered:
  - reuse_existing:
  - wrapper_or_adapter:
  - uniapp_plugin:
  - mini_program_native:
  - hand_code:
  - delete_or_simplify:
- selected_direction:
- decision_reason:
- reuse_or_existing_solution_checked: yes / no
- plugin_or_native_solution_checked: yes / no
- handcode_allowed: yes / no
- handcode_reason:
- module_boundary:
- data_api_state_boundary:
- risk_and_rollback:
- line_count_risk:
- deletion_or_simplification_opportunity:
- pass: yes / no
```

硬规则：

1. `based_on_solution_discovery=no` 时，不得通过。
2. 未评估复用、wrapper/adapter、插件/原生能力，不得允许手搓复杂实现。
2. 未说明模块边界，不得进入 implementer。
3. 未说明风险与回滚，不得进入高风险实现。
4. 单文件可能超过 400 行必须预警；超过 500 行必须要求拆模块。
5. 如果 `pass=no`，必须停在 main agent 阶段补齐，不得派发 implementer。

---

## 4. Implementation Contract Completeness Gate

派发 implementer 前，main agent 必须检查 Implementation Contract 完整性。

```text
Implementation Contract Completeness Gate:
- files_defined: yes / no
- target_functions_components_defined: yes / no
- data_flow_defined: yes / no
- forbidden_changes_defined: yes / no
- module_split_defined: yes / no
- reuse_plugin_handcode_decision_defined: yes / no
- test_contract_defined: yes / no
- acceptance_mapping_defined: yes / no
- role_context_packet_ready: yes / no
- pass: yes / no
```

硬规则：

1. 文件级改动计划缺失，不得派发 implementer。
2. 禁止修改范围缺失，不得派发 implementer。
3. Test Contract 缺失，不得派发 implementer。
4. role_context_packet 缺失，不得派发 implementer。
5. 如果 Contract 无法明确到文件/函数/模块级，应先补 code_explorer 定位或补充上下文。

---

## 5. Main Agent Code Review Gate

implementer 完成后，QA 之前，main agent 必须执行代码 review 并通过 `Main Agent Code Review Gate`。

```text
Main Agent Code Review Gate:
- review_scope:
  - base_ref:
  - diff_files:
  - dependency_context_files:
  - excluded_dirty_files:
- diff_reviewed: yes / no
- dependency_context_reviewed: yes / no
- contract_compliance: pass / fail / partial
- test_contract_impact_checked: yes / no
- unauthorized_changes_found: yes / no
- line_count_risk_checked: yes / no
- reuse_or_handcode_compliance_checked: yes / no
- deletion_or_simplification_checked: yes / no
- blocking_findings:
- non_blocking_findings:
- pass: yes / no
```

硬规则：

1. 未完成 main agent code review，不得进入 QA。
2. code review 必须以本轮 diff 为主轴，但允许读取最小依赖上下文。
3. 每个扩展读取的依赖上下文必须说明原因。
4. 不得默认 review 整个 dirty workspace。
5. 发现 blocking findings 时，main agent 不得亲自修复，必须把 findings 转回同一 implementer 线程。
6. QA 只能消费 code review 摘要做测试与验收，不得替代 code review。

---

## 6. 失败处理

任何 gate 失败时：

```text
Gate Failure:
- failed_gate:
- missing_fields:
- blocking_reason:
- required_next_action:
- target_role:
```

可选 next action：

1. main agent 自行补齐技术方向 / Contract / Test Contract。
2. 请求 code_explorer 补最小定位。
3. 转回 implementer 修复。
4. 请求用户确认缺失需求或风险。
5. 停止任务。

---

## 7. 输出预算

1. Gate 输出必须短，不得复制完整 ClickUp、完整 Figma、完整日志或完整代码。
2. Gate 只记录判断字段、结论和阻塞原因。
3. 详细审计证据放入 handoff audit appendix，默认不广播。


## Quality Gate 输出预算

1. Solution Discovery Gate、Technical Direction Gate、Implementation Contract Completeness Gate、Main Agent Code Review Gate 都必须短输出。
2. 不得粘贴完整搜索结果、完整插件文档、完整代码、完整日志、完整 Figma Drilldown。
3. 每个 gate 只输出必要字段、结论、阻塞原因和最小证据。
4. 长证据放 handoff audit appendix，默认不传给 subagent。


## Gate Receipt 输出模式

所有 gate 默认输出 receipt，不输出长篇解释。

```text
Gate Receipt:
- gate:
- status: pass / fail
- missing_fields:
- blocking_reason:
- next_action:
- evidence_ref:
```

若 gate 失败，只输出缺失字段、阻塞原因和下一步动作。详细证据放 handoff audit appendix。


## Pre-Implementation Budget Fuse

进入 implementer 前必须执行预算检查。细则见：

```text
docs/ai-rules/dispatch-task/pre-implementation-budget-fuse.md
```

当估算为 high / extreme 时，必须启用压缩动作，避免 pre-implementation 阶段过载。
