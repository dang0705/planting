# Task Facts Receipt Policy

## 定位

本文件定义 task facts / ClickUp facts / prompt facts 的 receipt 化规则。目标是在不丢失约束的前提下，避免 main agent 在后续 phase 反复携带完整任务正文。

## 规则

1. 完整 task facts 只作为 `source_ref` / `evidence_ref` 保留。
2. main agent 后续 phase 默认只消费 Task Facts Receipt。
3. hard constraints、scopeMustDo、scopeMustNotDo、acceptance criteria 必须保真进入 receipt 或 matrix_ref。
4. checklist / acceptance criteria 不在 main 默认上下文逐条复述；进入 Acceptance Matrix Receipt 后以 `matrix_ref` 回查。
5. 外部链接、Figma 链接、附件、关系任务只保留数量、读取状态和 blocker，完整内容放 source_ref。
6. 需要生成 Implementation Contract 或 Test Contract 时，只精准回查相关 source_ref。

## 模板

```text
../assets/templates/task-facts-receipts.md
```
