---
name: figma-layered-ui-contract
description: "已废弃兼容入口；不得作为 dispatch-task 的当前 Figma 工作流来源。"
---

# Deprecated Figma Layered Contract

本 skill 只为旧引用保留一版。当前 Figma UI 任务以以下角色边界为准：

- main：`$figma-ui-implementation-policy`，只做 Lite 路由。
- implementer：`$implementer-ui-execution-policy`，独立读取实现所需 Figma 证据。
- QA：`$qa-ui-visual-baseline-policy`，独立读取视觉基准和实际运行截图。
- 调度入口：`$dispatch-task`。

不得把本文件当作新的 Figma 分层合同来源，不得据此让 main 读取完整 Figma、生成实现切片或替代 QA baseline。
