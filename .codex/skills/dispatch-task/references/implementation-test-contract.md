# Implementation Contract 与 Test Contract

## 定位

本文件定义 Implementation Contract 与 Test Contract 的规则。模板引用：

```text
../assets/templates/contracts.md
```

## Implementation Contract

非简单实现任务必须由 `main agent` 输出精简 Implementation Contract，再派发 implementer。

必须包含：

1. 实现目标。
2. 文件级改动计划。
3. 数据流 / 调用链。
4. 模块拆分要求。
5. 复用 / 插件 / 手搓裁决。
6. 删除 / 收敛旧逻辑。
7. 关键伪代码。
8. 给 implementer 的硬限制。

禁止输出完整 patch、完整规则长文、完整 Figma Drilldown。

文件级改动计划必须可被 Main Agent Quality Gates 直接消费：

```text
file_size_gate_files:
- path:
- expected_operation: create / update / split / delete
- current_line_count:
- projected_line_risk: under_400 / over_400_warning / over_500_blocking / unknown
- split_required: true / false
```

`projected_line_risk=over_500_blocking` 或既有文件 `current_line_count > 500` 时，Implementation Contract 不得进入普通实现；必须先把任务改成拆模块或收敛文件的实现计划。

## Test Contract

`main agent` 必须基于 prompt 验收标准或 ClickUp Acceptance Checklist Matrix / Test Case Base 生成 Test Contract。

QA 负责执行与取证，不负责设计测试契约。

## Contract 完整性

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 Implementation Contract Completeness Gate，否则不得派发 implementer。

Contract Completeness Gate 必须核对：

1. `file_size_gate_files` 已覆盖所有计划修改文件。
2. 已执行 `check-main-agent-quality-gates.mjs --files=<implementation_contract_files_csv>`。
3. gate receipt 中 `continue_allowed=true`。
