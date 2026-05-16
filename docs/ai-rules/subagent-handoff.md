# Subagent 交接与任务持久化规则

## 1. 定位

本文件用于保证多 agent 任务可中断、可恢复、可审计，同时减少下游重复读取源文档。

## 2. 持久化位置

非简单任务必须创建或更新：

1. 任务说明：`docs/ai-tasks/`
2. 运行交接：`docs/ai-runs/`
3. 架构决策：`docs/adr/`，仅在存在长期架构取舍时使用

## 3. Handoff 必须包含

1. 结论。
2. 证据。
3. 相关文件。
4. 已读取规则。
5. main agent 提供的规则摘要。
6. 仍需读取的原文规则 / 章节。
7. 风险。
8. 验证状态。
9. 下一步建议。
10. 目标验收契约：bug 发生位置、观察入口、用户可见成功标准、必须验证字段 / 证据、非目标。
11. 若涉及客户端运行时或最终展示，必须记录前端消费面是否已检查，例如 result/read、normalize、follow-up、diagnose 页面。

## 4. 线程恢复

Main agent 接手时优先读取：

1. `AGENTS.md`
2. 最新 `docs/ai-runs/` handoff
3. 对应 `docs/ai-tasks/`
4. 必要 `docs/ai-rules/`
5. 当前 git diff 与验证结果

Subagent 接手时默认只读取：

1. Dispatch Plan
2. main agent 规则摘要
3. 最新 handoff 中与自身角色相关的部分
4. 当前 diff 或指定文件
5. Dispatch Plan 指定的少量规则文件 / 章节

Subagent 不应因为 handoff 提到某个长文档路径就自行全量读取该文档。


## 大目录索引命中记录

涉及 `docs/code-logics/` 或 `docs/new-rules/` 时，handoff 必须记录：

1. 已读取的 INDEX 文件。
2. 命中的具体文档。
3. 只读了哪些小节或摘要。
4. 下游是否需要重复读取源文档，默认不需要。
5. 如果索引无法定位，记录请求 main agent 补充摘要的原因。
