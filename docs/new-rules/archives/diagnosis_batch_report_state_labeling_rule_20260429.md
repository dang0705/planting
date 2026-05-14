# 诊断 batch / report 状态字段标注规则 2026-04-29

## 1. 目标

本规则用于约束诊断 replay、batch、report、conclusion 等离线审计产物中的状态字段，避免把仍在问诊中的中间态误写成最终结论。

核心原则：

```text
await_follow_up 是中间态，不是 final outcome。
```

## 2. `await_follow_up` 字段语义

当某条诊断结果仍处于 `await_follow_up`、`followup_required`、`question_pending` 或等价状态时：

- 可以记录当前 ranking 的最高候选；
- 可以记录当前 UI 应展示的候选方向；
- 可以记录下一题和继续追问原因；
- 不得把当前候选写入 `finalTitle`、`finalResult.displayName` 或任何表达“最终结论已形成”的字段。

## 3. 字段命名边界

### 允许字段

中间态允许使用：

- `pendingTopLabel`
- `currentTopLabel`
- `currentTopProblemKey`
- `pendingTopProblemKey`
- `currentRankingTopLabel`
- `awaitingFollowUpReason`
- `nextQuestionKey`

这些字段只表达“当前最高候选 / 待追问方向”，不是最终结论。

### 禁止字段

中间态不得写：

- `finalTitle`
- `finalProblemKey`
- `finalOutcomeType`
- `finalResult`
- `finalDisplayName`

除非该条记录已经满足最终输出资格，并且状态已经进入 `final`、`closed` 或等价的终局状态。

## 4. 正式规则

```text
只有 final-ready / final / closed 状态才能写 finalTitle。
await_follow_up 只能写 pendingTopLabel 或 currentTopLabel。
```

如果 batch/report 需要同时展示“当前 top1”和“最终结论”，必须拆成两个字段：

- `currentTopLabel`：当前 ranking top1，可出现在中间态；
- `finalTitle`：最终结论标题，只能出现在终局态。

## 5. 审计要求

本地 replay / batch / report 生成逻辑至少应保证：

1. `await_follow_up` 记录中 `finalTitle` 为空、缺省或明确标注为未形成；
2. `await_follow_up` 的当前候选写入 `pendingTopLabel` 或 `currentTopLabel`；
3. conclusion 汇总不得把 `await_follow_up` 的当前 top1 统计为最终命中；
4. UI 或人工审计页面展示中间态时，文案必须区分“待追问方向”和“最终结论”。
