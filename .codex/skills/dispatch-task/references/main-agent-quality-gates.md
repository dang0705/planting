# Main Agent Quality Gates

## 定位

本文件定义 `main agent` 在无独立架构角色的工作流中必须执行的质量门禁。

`main agent` 必须通过以下硬门禁：

1. Solution Discovery Gate。
2. Technical Direction Gate。
3. Implementation Contract Completeness Gate。
4. Main Agent Code Review Gate。

## Gate Receipt 输出模式

所有 gate 必须输出 receipt，不输出长篇解释。

模板见：

```text
../assets/templates/phase-gates.md
```

硬门禁语义：

1. 缺少 receipt 等同 gate fail。
2. receipt.status != pass 等同 gate fail。
3. receipt.continue_allowed / continueAllowed != true 时不得进入下一 phase。
4. gate fail 不允许“先继续、最后补验”；必须先修复阻塞项并重新输出 receipt。
5. 详细证据放 handoff audit appendix，但 receipt 中必须保留 evidence_ref 或 command_output_ref。

若 gate 失败，只输出缺失字段、阻塞原因和下一步动作。

## Deterministic File Size Gate

Technical Direction Gate 和 Main Agent Code Review Gate 必须执行文件大小硬检查：

```text
node .codex/skills/dispatch-task/scripts/check-main-agent-quality-gates.mjs --files=<implementation_contract_files_csv>
```

实现后 code review 阶段必须对本轮 changed files 再执行：

```text
node .codex/skills/dispatch-task/scripts/check-main-agent-quality-gates.mjs --changed
```

执行结果必须作为 Main Agent Quality Gate receipt 的 `command_output_ref` 或内联摘要。脚本返回非 0 时 gate 必须 fail。

## Technical Direction Gate

进入 implementer 执行前，`main agent` 必须输出并通过 Technical Direction Gate。

硬规则：

1. based_on_solution_discovery=no 时不得通过。
2. 未评估复用、wrapper/adapter、插件/原生能力，不得允许手搓复杂实现。
3. 未说明模块边界，不得进入 implementer。
4. 未说明风险与回滚，不得进入高风险实现。
5. 未执行 Deterministic File Size Gate，不得进入 implementer。
6. 单文件超过 400 行必须在 receipt 中标记 warning，并说明拆分或维持原因。
7. 单文件超过 500 行必须 fail，必须先拆模块或把任务改为拆模块任务；不得派发普通实现。

## Implementation Contract Completeness Gate

派发 implementer 前，`main agent` 必须检查 Implementation Contract 完整性。

硬规则：

1. 文件级改动计划缺失，不得派发 implementer。
2. 禁止修改范围缺失，不得派发 implementer。
3. Test Contract 缺失，不得派发 implementer。
4. role_context_packet 缺失，不得派发 implementer。
5. 文件级改动计划未列入 Deterministic File Size Gate 的 `--files` 范围，不得派发 implementer。

## Main Agent Code Review Gate

implementer 完成后，QA 之前，`main agent` 必须执行代码 review 并通过 Main Agent Code Review Gate。

硬规则：

1. 未完成 `main agent` code review，不得进入 QA。
2. code review 必须以本轮 diff 为主轴，但允许读取最小依赖上下文。
3. 发现 blocking findings 时，`main agent` 不得亲自修复，必须把 findings 转回同一 implementer 线程。
4. QA 只能消费 code review 摘要做测试与验收，不得替代 code review。
5. 未对本轮 changed files 执行 Deterministic File Size Gate，不得进入 QA。
6. changed files 中任一文件超过 500 行，Main Agent Code Review Gate 必须 fail；必须转回 implementer 拆模块或收敛文件。
