# Replay 回放模拟答复策略（持久化记忆）

更新时间：2026-04-22

## 规则

1. `scripts/terminal-e2e/replay-saved-diagnosis-sessions.mjs` 中所有 replay（含 `visual_origin` 模式）不得读取历史答案进行复现。
2. 每轮回放都必须从当前 `followUps` 对应题目的可选项中随机选择答案（`simulated` 来源），并将答案写入 `simulated` 状态。
3. 即便题目第一次在会话中出现，也要优先补齐题目元数据与选项映射后再答题，不允许因为“历史答案缺失”提前中止。
4. 回放结果里的每轮 `answers` 必须包含 `status: simulated`、`answerSource: simulated`（或等价字段）以便审计。
5. 同一轮如果 followup 存在，必须在该轮生成对应数量的模拟答案，不能留空。

## 检查项

- 回放目标：`diag_1776524906841_9gzq2dil` 等历史样本
- 观察字段：
  - `replay.simulationRounds[].answers`
  - `replay.simulationRounds[].questionAnswerPairs[].answer.status`
  - `replay.simulationRounds[].questionAnswerPairs[].answer.answerSource`
- 规则判定：
  - 若出现空答案、全为历史答案映射、或出现 `simulated` 缺失，判定不合规
