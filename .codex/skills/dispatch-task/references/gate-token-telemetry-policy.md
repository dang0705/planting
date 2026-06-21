# Gate Token Telemetry Policy

## 定位

本规则用于让 dispatch-flow 在运行时可观察 token 消耗。

每个 gate 完成后、进入下一个 gate 前，main agent 必须在对话中输出一次短 token 消耗回执。该回执不替代 gate receipt，也不改变任何 phase / gate 的执行顺序。

## 强制触发点

以下节点完成后必须输出 token 消耗回执：

1. Phase 0 Gate。
2. Phase 1 Task Facts / ClickUp / prompt facts gate。
3. Phase 1.5 BRV Recall Gate。
4. Phase 2 Agent Assignment / Subagent Reuse / Spawn Gate。
5. Phase 3 role_context_packets gate。
6. Phase 4 Solution Discovery / Technical Direction / Contract gate。
7. Phase 4.45 Pre-Implementation Budget Fuse。
8. Phase 4.5 Main Agent Quality Gates。
9. Phase 5 implementer handoff / main code review gate。
10. Phase 6 QA evidence gate。
11. Phase 7 ClickUp / Git / Completion gate。
12. 任意恢复 gate、阻塞 gate、返工 gate。

## 输出位置

输出位置必须满足：

1. 当前 gate receipt 之后。
2. 下一 gate 执行之前。
3. 必须出现在对话中，不能只写入文件。
4. 不得合并到最终总结后补写。

## 计数来源优先级

main agent 按以下优先级获取 token 信息：

1. Codex runtime / UI / event 暴露的当前 token usage。
2. 当前 session JSONL 中可读取的 usage / token snapshot。
3. 当前 gate 读取文件、工具返回、subagent receipt 的估算区间。
4. 如果以上都不可用，明确标记 unavailable。

不得编造精确数字。没有精确计数时，只允许输出估算区间或 `unavailable`。

## 回执内容

输出模板引用：

`../assets/templates/gate-token-telemetry.md`

必须包含：

1. gate_name。
2. counter_status。
3. gate_delta_tokens。
4. main_cumulative_tokens。
5. heaviest_sources。
6. budget_status。
7. compression_action。
8. next_gate。

## 预算状态

budget_status 的语义：

1. green：当前 gate 消耗符合预期。
2. yellow：当前 gate 偏高，下个 gate 必须压缩读取。
3. red：当前 gate 明显失控，下个 gate 前必须执行压缩或停止说明。
4. unavailable：当前环境无法读取或估算。

## 压缩动作

如果 budget_status 为 yellow / red，下一个 gate 前必须选择至少一个动作：

1. 只读 receipt，不读全文。
2. 延迟读取模板全文。
3. 延迟 Figma Drilldown。
4. 延迟完整 checklist 明细。
5. 只传 evidence_ref / packet_ref。
6. 拆分 subagent slice。
7. 停止并报告 token blocker。

## 限制

token 消耗回执本身必须短，默认不超过 120 tokens。

禁止：

1. 展开完整 session 日志。
2. 展开完整 usage JSON。
3. 展开完整 checklist。
4. 展开完整 subagent 输出。
5. 生成长篇成本分析。
6. 用 token 回执替代 gate 结果。
