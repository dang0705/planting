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

1. 不复述完整 ClickUp / task facts。
2. 不复述完整 Figma / Drilldown。
3. 不复述完整实现细节。
4. 不复述完整 QA 证据。
5. 不粘贴完整日志、DevTools dump、截图 OCR。
6. 不进行二次实现。
7. 不进行二次 QA。
8. 不做长篇完成后复盘。
9. 不逐条展开 checklist 全量对账；默认只输出聚合统计和 blocker refs。

## Receipt-only 默认模式

main agent 默认只处理 receipt：

```text
status
blocking
evidence_ref
next_action
```

subagent 详情必须留在 subagent 线程、证据文件、日志路径或 audit appendix 中。

## 阶段预算

建议目标：

| 阶段 | main agent 输出目标 |
|---|---:|
| Phase 0 / git baseline | <= 300 tokens |
| Agent Assignment / packets | <= 600 tokens |
| Contract / Test Contract | <= 1200 tokens |
| implementer 归并 | <= 500 tokens |
| QA 归并 | <= 500 tokens |
| Completion Gate | <= 600 tokens |
| final summary | <= 300 tokens |

超过预算时必须改用 evidence_ref / appendix_ref / file path。

## Completion 对账

Completion Gate 默认只输出聚合统计：

```text
Completion Receipt:
- required_total:
- passed:
- failed:
- blocked:
- not_verified:
- writeback_status:
- stop_allowed:
- blocker_refs:
```

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
6. main agent 只消费 BRV Recall Packet 和 evidence_ref。
