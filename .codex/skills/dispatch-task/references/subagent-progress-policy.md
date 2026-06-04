# Subagent 进度观察策略

## 定位

本文件定义 `main agent` 等待 subagent 时的低成本、低侵入进度观察方式，避免频繁中断 subagent 导致上下文膨胀和任务漂移。

## 默认原则

1. `main agent` 不得频繁打断 subagent。
2. `main agent` 不得为了“看看进度”反复向 subagent 发送长提示。
3. 如果有非侵入式状态来源，优先读取状态来源。
4. 只有超过等待阈值且没有任何输出或证据变化时，才允许请求简短 progress receipt。
5. progress receipt 必须短，不得让 subagent 复述完整上下文。

## 低成本观察顺序

1. 查看当前已有 subagent 输出或最近 handoff。
2. 查看工作区文件变更摘要，例如 `git status --short`。
3. 查看已产生的测试日志 / 证据文件路径。
4. 查看进程 / 命令是否仍在运行（如果当前环境可见）。
5. 继续等待。
6. 超过阈值后，请求简短 progress receipt。

## 等待阈值

| agent | soft wait | hard wait |
|---|---:|---:|
| code_explorer | 3 min | 6 min |
| implementer_fast | 5 min | 10 min |
| implementer_deep | 10 min | 20 min |
| qa_reviewer | 8 min | 15 min |
| docs_keeper | 5 min | 10 min |

soft wait 前不得催促。hard wait 后可请求 progress receipt。

## Progress Receipt

```text
Progress Receipt:
- status: running / blocked / done
- current_step:
- files_touched:
- blockers:
- next_action:
```

限制：

1. 不超过 150 tokens。
2. 不复述完整任务。
3. 不重新发送完整 Contract。
4. 不改变任务范围。
5. 不要求 subagent 中断当前命令，除非它已阻塞。

## 中断条件

只有以下情况允许中断 subagent：

1. 用户明确要求停止。
2. 发现危险操作。
3. 触及 forbidden_paths。
4. 运行时间超过 hard wait 且没有任何可观察进展。
5. 依赖外部确认或权限。
6. 同一文件产生冲突风险。

中断后必须记录原因。
