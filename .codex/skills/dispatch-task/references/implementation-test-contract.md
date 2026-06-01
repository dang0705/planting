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

禁止输出完整 patch、完整规则长文、完整 Figma Drilldown。

## Test Contract

main agent 必须基于 prompt 验收标准或 ClickUp Acceptance Checklist Matrix / Test Case Base 生成 Test Contract。

QA 负责执行与取证，不负责设计测试契约。

## Contract 完整性

Implementation Contract 输出后，必须通过 `main-agent-quality-gates.md` 中的 Implementation Contract Completeness Gate，否则不得派发 implementer。
