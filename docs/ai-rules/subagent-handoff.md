# Subagent 交接与任务持久化规则

## 1. 定位

本文件用于保证多 agent 任务可中断、可恢复、可审计。

## 2. 持久化位置

非简单任务必须创建或更新：

1. 任务说明：`docs/ai-tasks/`
2. 运行交接：`docs/ai-runs/`
3. 架构决策：`docs/adr/`，仅在存在长期架构取舍时使用

## 3. Subagent 输出要求

每个 subagent 结果必须包含：

1. 结论。
2. 证据。
3. 相关文件。
4. 已读取规则。
5. 风险。
6. 验证状态。
7. 下一步建议。

## 4. 线程恢复

Main agent 接手时优先读取：

1. `AGENTS.md`
2. 对应 `docs/ai-rules/`
3. 对应 `docs/ai-tasks/`
4. 最新 `docs/ai-runs/`
5. 当前 git diff 与验证结果

Subagent 接手时默认只读取：

1. Main agent 提供的 Dispatch Plan
2. Dispatch Plan 指定的 `docs/ai-rules/`
3. 对应 `docs/ai-tasks/`
4. 最新 `docs/ai-runs/`
5. 当前 git diff 与验证结果
