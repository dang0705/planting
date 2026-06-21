# Subagent 进度观察策略

## 定位

本文件定义 main agent 等待 subagent 时的低成本、低侵入进度观察方式，避免频繁中断 subagent 导致上下文膨胀和任务漂移。

## 默认原则

1. main agent 不得频繁打断 subagent。
2. main agent 不得为了“看看进度”反复向 subagent 发送长提示。
3. 如果有非侵入式状态来源，优先读取状态来源。
4. 只有超过等待阈值且没有任何输出或证据变化时，才允许请求简短 progress receipt。
5. progress receipt 必须短，不得让 subagent 复述完整上下文。

## 低成本观察顺序

1. 查看当前已有 subagent 输出或最近 handoff，并优先复用现成同角色线程。
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
| implementer_deep | 20 min | 40 min |
| qa_reviewer | 8 min | 15 min |
| docs_keeper | 5 min | 10 min |

soft wait 前不得催促。hard wait 后可请求 progress receipt。


`implementer_deep` 若由 GLM-5.2 / Volcengine Coding Plan 承担，默认使用更长等待策略：

1. soft wait 前不得发送任何“进度如何 / 是否继续 / 你还在吗”之类提示。
2. soft wait 到达后，如果 `git status --short`、`git diff --stat`、测试日志、构建日志或进程状态在最近 10 分钟内有变化，必须继续等待，不得打断。
3. hard wait 到达后，只有在没有任何可观察进展时，才允许请求一次简短 Progress Receipt。
4. 请求 Progress Receipt 时不得重发完整 Contract，不得改变任务范围，不得要求 implementer 立刻总结全部上下文。
5. 不得因为 main agent 自身不确定而主动询问用户“是否继续等待”；只有危险操作、权限确认、费用/外部服务确认或用户明确要求停止时，才询问用户。
6. 如果 implementer 已经开始 apply_patch / 测试命令，main agent 必须等待该命令自然完成或进入明确 blocked 状态。

## Progress Receipt

外置模板/规范片段：`../assets/templates/subagent-progress.md`（template_id: `subagent-progress-policy-01`）。

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


## 复用同一现成 subagent

main agent 需要继续推进同一任务时，必须优先复用现成同角色 subagent 线程。不得为了“重新说清楚”或“换个干净线程”重复创建同角色 subagent。

必须复用的继续动作：

1. implementer 修复 code review findings。
2. implementer 修复 QA failed 的产品代码问题。
3. QA 复测同一 Test Contract。
4. docs_keeper 继续处理同一 Sync Packet。

只有原线程明确 blocked / unavailable / wrong-role / context-poisoned，才允许替换，并必须记录 `replacement_reason`。
