# Implementation Contract 与 Test Contract

## Implementation Contract

非简单实现任务必须由 main agent 输出精简 Implementation Contract，再派发 implementer。

```text
Implementation Contract:
- 实现目标:
- 文件级改动计划:
- 数据流 / 调用链:
- 模块拆分要求:
- 复用 / 插件 / 手搓裁决:
- 删除 / 收敛旧逻辑:
- 关键伪代码:
- 给 implementer 的硬限制:
```

禁止输出完整 patch、完整规则长文、完整 Figma Drilldown。

## Test Contract

main agent 必须基于 Acceptance Checklist Matrix 和 Test Case Base 生成 Test Contract。

```text
Test Contract:
- source:
  - acceptance_items:
  - checklist_items:
  - bug/request changes:
- unit-test:
- smoke-test:
- e2e-test:
- UI / Figma:
- API / DB / runtime:
- manual:
- failure blocking rules:
```

QA 负责执行与取证，不负责设计测试契约。


## Implementation Contract Completeness Gate

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 `Implementation Contract Completeness Gate`，否则不得派发 implementer。
