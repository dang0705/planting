---
name: figma-implement-design
description: "兼容入口；仅允许 implementer 显式调用，实际流程委托给 implementer-ui-execution-policy。"
---

# Compatibility Wrapper

本 skill 不得由 main agent 或 QA 使用，也不得因出现 Figma URL 自动触发。

代码实现任务请显式读取 `$implementer-ui-execution-policy`；QA 请读取 `$qa-ui-visual-baseline-policy`；main 只读取 `$figma-ui-implementation-policy` 的 Lite metadata。

本 wrapper 不定义第二套 Figma 工作流，避免重复规则和角色所有权冲突。
