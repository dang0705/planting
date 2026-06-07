# Implementation Contract 与 Test Contract

## 定位

本文件定义 Implementation Contract 与 Test Contract 的规则。模板引用：

```text
../assets/templates/contracts.md
```

## Implementation Contract

非简单实现任务必须由 main agent 输出精简 Implementation Contract，再派发 implementer。

必须包含：

1. 实现目标。
2. 文件级改动计划。
3. 数据流 / 调用链。
4. 模块拆分要求。
5. 复用 / 插件 / 手搓裁决。
6. 删除 / 收敛旧逻辑。
7. 关键伪代码。
8. 给 implementer 的硬限制。

## 500 行拆分硬指标

Implementation Contract 必须包含以下字段：

```text
line_count_gate:
- touched_code_file_line_counts_before:
- expected_line_counts_after:
- over_400_line_touched_files:
- over_500_line_touched_files:
- decomposition_required: yes / no
- decomposition_plan:
- approved_exception: yes / no
- exception_reason:
```

规则：

1. main agent 必须在派发 implementer 前对候选 `task_allowed_paths` / 文件级改动计划中的代码文件执行行数检查，可用 `wc -l` 或等价命令。
2. 修改后的单个业务代码、云函数代码、页面组件代码、配置代码或测试代码预计超过 400 行，必须在 Technical Direction Gate 中预警。
3. 修改后的单个上述代码文件预计超过 500 行，`decomposition_required` 必须为 `yes`，并给出拆分模块计划。
4. 如果本轮修改的是既有超过 500 行文件，不能用“历史遗留”跳过；只要本轮 touch，就必须要求拆分，除非存在明确 `approved_exception`。
5. `approved_exception` 只能用于只读分析、纯删除且删除后仍无法合理拆分、或用户明确限定禁止拆分的场景；必须记录风险和后续 blocker。
6. 缺少 `line_count_gate` 或超过 500 行但无拆分计划时，Implementation Contract Completeness Gate 不通过，不得派发 implementer。

禁止输出完整 patch、完整规则长文、完整 Figma Drilldown。

## Test Contract

main agent 必须基于 prompt 验收标准或 ClickUp Acceptance Checklist Matrix / Test Case Base 生成 Test Contract。

QA 负责执行与取证，不负责设计测试契约。

## Contract 完整性

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 Implementation Contract Completeness Gate，否则不得派发 implementer。
