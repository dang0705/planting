# Main Thread Budget Policy

## 定位

本文件定义 main agent 在 dispatch-task 中的低成本调度边界。目标是让 main agent 只做调度、裁决和 completion，不做二次实现、不做二次 QA、不做长日志对账。

## main agent 允许做

1. 读取最小 task facts。
2. 输出 gate receipt。
3. 生成 Agent Assignment。
4. 生成 role_context_packets。
5. 生成 Implementation Contract / Test Contract。
6. 做 main agent code review receipt。
7. 消费 implementer / QA / docs 的 receipt。
8. 判断 Completion Gate。
9. 执行 ClickUp 回写和 Git commit 闭环。

## main agent 禁止做

0. 不亲自写代码、修代码、改测试代码或改配置代码；没有 fallback/default 线程例外。
1. 不复述完整 ClickUp / task facts。
2. 不复述完整 Figma / Drilldown。
3. 不复述完整实现细节。
4. 不复述完整 QA 证据。
5. 不粘贴完整日志、DevTools dump、截图 OCR。
6. 不进行二次实现；code review findings 必须转回同一 implementer 线程。
7. 不进行二次 QA。
8. 不做长篇完成后复盘。
9. 不逐条展开 checklist 全量对账；默认只输出聚合统计和 blocker refs。


## implementer_deep 等待预算

main agent 在 `implementer_deep` 执行期间默认等待更久，不主动催促、不重复追问、不把完整 Contract 反复发送给 subagent。

规则：

1. 遵守 `subagent-progress-policy.md` 的 GLM-5.2 / implementer_deep 等待阈值。
2. 不得在 subagent 正在改代码或跑测试时打断用户确认是否等待。
3. 不得为了降低 main agent 自身不确定性而打断 implementer。
4. 只有危险操作、forbidden_paths 触碰、权限 / 费用 / 外部发布确认、用户明确中止、hard wait 后无任何可观察进展时，才允许中断或询问。

## Subagent 复用预算

main agent 不得通过重复创建 subagent 来解决上下文不清问题。默认必须复用同一 dispatch_run_id / ticket / branch / scope 下的现成同角色线程。

如果需要新开同角色 subagent，必须在 receipt 中记录 `replacement_reason`，并说明为什么不能复用。

## Receipt-only 默认模式

main agent 默认只处理 receipt：

外置模板/规范片段：`../assets/templates/main-thread-receipts.md`（template_id: `main-thread-budget-policy-01`）。

subagent 详情必须留在 subagent 线程、证据文件、日志路径或 audit appendix 中。

## 阶段预算

建议目标：

| 阶段 | main agent 输出目标 |
|---|---:|
| Phase 0 / git baseline | <= 300 tokens |
| Agent Assignment / packets | <= 600 tokens |
| Contract / Test Contract | <= 1200 tokens；`implementer_deep` Contract-Locked Handoff 可 <= 2400 tokens 或写入 handoff 文件后引用 |
| implementer 归并 | <= 500 tokens |
| QA 归并 | <= 500 tokens |
| Completion Gate | <= 600 tokens |
| final summary | <= 300 tokens |

超过预算时必须改用 evidence_ref / appendix_ref / file path。

## Completion 对账

Completion Gate 默认只输出聚合统计：

外置模板/规范片段：`../assets/templates/main-thread-receipts.md`（template_id: `main-thread-budget-policy-02`）。

需要逐项细节时，必须引用 evidence_ref，不在 main 默认上下文展开。

## 追问处理

任务完成后的用户追问不得继续让同一个 main 线程读取完整历史。优先：

1. 引用已有 receipt。
2. 按 evidence_ref 精准回查。
3. 不重新读完整 subagent 输出。
4. 不重新对账完整 checklist。


## BRV recall 预算

BRV Recall Gate 只允许输出 receipt / packet。

规则：

1. 默认不超过 600 tokens。
2. 复杂任务不超过 1000 tokens。
3. 不展开完整历史。
4. 不展开 ByteRover / swarm 配置噪声。
5. 不把完整 BRV 输出广播给所有 subagent。
6. main agent 只消费 BRV Fact Routing Packet 和 evidence_ref。


## Pre-implementation 模板读取预算

pre-implementation 阶段默认不读取 `assets/templates/` 下的具体模板全文。

规则：

1. main agent 只写 `template_ref` / `template_id`。
2. subagent 根据自己的 `template_ref` 读取对应模板。
3. main agent 只有在需要输出本阶段最终 receipt 时，才读取对应的最小模板。
4. 不得为了“格式完整”提前读取全部模板。
5. 不得把模板正文复制到 role_context_packets。

## Task facts 与 checklist 预算

完整 task facts、ClickUp 原文、checklist 明细和 Acceptance Matrix 逐项内容默认只保留 `source_ref` / `matrix_ref`。

main agent 后续 phase 默认只携带 Task Facts Receipt 与 Acceptance Matrix Receipt。


## Gate Token Telemetry 预算

每个 gate 后必须输出 token 消耗回执，但该回执本身必须保持短小。

规则：

1. 默认不超过 120 tokens。
2. 只输出计数状态、delta、累计、重来源、预算状态、压缩动作和 next gate。
3. 精确计数不可用时必须写 `unavailable`，不得编造数字。
4. budget_status 为 yellow / red 时，下一个 gate 前必须执行压缩动作。
5. 不得把 token 回执扩展成成本长分析。
6. 不得因为输出 token 回执而读取完整 session JSONL 或完整日志。


## Gate Token Telemetry 有效性

Gate Token Telemetry 必须体现 token 消耗，而不是 gate 进度。

必填：

1. pre_gate_tokens。
2. post_gate_tokens。
3. gate_delta_tokens。
4. main_cumulative_tokens。
5. counter_source。
6. delta_basis。

只输出 completed / in_progress 的阶段清单不是 token 回执，必须重写。

如果当前环境无法读取精确 token，必须写 `counter_status: unavailable` 或 `estimated`，并说明 `counter_source` 与 `delta_basis`。
