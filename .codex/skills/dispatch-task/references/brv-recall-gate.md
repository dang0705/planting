# BRV Recall Gate

## 定位

BRV Recall Gate 是 `$dispatch-task` 在读取任务事实后、Agent Assignment 前执行的项目记忆召回层。

它用于召回当前仓库的稳定事实、历史踩坑、关键入口、测试入口、MCP 使用注意事项和 subagent 所需的最小记忆上下文。

BRV 不是 task facts，也不是 ClickUp 的替代物：

- task facts 负责描述“本次任务要做什么”。
- BRV 负责补充“当前仓库里相关事实是什么”。
- BRV 只做索引和召回，不是第二套文档。

## 执行时机

执行顺序：

```text
Phase 1: Task facts / ClickUp / prompt facts
Phase 1.5: BRV Recall Gate
Phase 2: Agent Assignment
```

必须先知道任务事实，再生成 BRV query。

## 默认召回路径

默认召回路径只允许使用非 swarm 路径：

```text
1. 读取 .brv/context-tree/_index.md
2. 读取 .brv/context-tree/_manifest.json
3. 只选择 manifest active_context 中与任务相关的条目
4. 必要时使用 brv query / source-verified BRV index
```

不得默认执行：

```text
brv swarm query
```

不得默认检查：

```text
.brv/swarm/config.yaml
```

## ByteRover swarm 策略

ByteRover swarm 是可选能力，不是 `$dispatch-task` 的默认依赖。

只有同时满足以下条件时，才允许尝试 swarm：

1. 用户任务或上游 task facts 明确要求 swarm / ByteRover swarm。
2. `.brv/swarm/config.yaml` 确实存在。
3. 当前 BRV CLI 明确支持 `brv swarm query`。
4. 任务需要 swarm 的多代理记忆能力，而不是普通 `subagent_memory_context`。

如果 `.brv/swarm/config.yaml` 不存在：

```text
swarm_status: not_configured_optional
```

该状态只能留在 main agent 内部诊断或最终技术备注中；默认不得写入：

```text
brv_status
blockers
risk_flags
role_context_packets
subagent_memory_context
```

缺少 swarm config 不是产品问题，不是 subagent 问题，也不是正常 BRV recall 失败。

如果默认 BRV recall 过程中工具输出 `swarm config missing`，应判断为错误调用了 swarm 路径或工具噪声：

```text
brv_status: retry_non_swarm
noise_suppressed: swarm_config_missing
fallback: manifest-scoped BRV index / brv query
```

该噪声不得传播给 subagent。

## 查询输入

BRV query 只基于以下最小信息生成：

1. task title / prompt intent。
2. hard constraints。
3. affected domains。
4. candidate files / modules。
5. Figma / WeChat DevTools / CloudBase / diagnosis / UI 等明显关键词。
6. main agent 当前缺失的仓库事实。

不得把完整 ClickUp 描述、完整 Figma、完整 QA 证据或完整日志传入 BRV query。

## 查询目标

BRV 召回目标包括：

1. 当前仓库关键入口。
2. 诊断主链、结果出口、runtime / route / outcome 相关事实。
3. 已知测试入口、smoke 入口、replay 入口。
4. WeChat DevTools MCP 的项目内正确使用方式。
5. CloudBase / 部署 / DB 相关稳定事实。
6. 已知避坑和历史约束。
7. 与当前 task facts 直接相关的模块事实。

## 输出限制

BRV 输出只能是短 packet，不得展开历史。

默认不超过 600 tokens；复杂任务不超过 1000 tokens。

禁止输出完整历史对话、完整日志、大段旧规则、ByteRover / swarm 配置噪声、与本任务无关的项目记忆。

## BRV Recall Packet

输出模板见：

```text
../assets/templates/brv-recall.md
```

必须包含 status、queries、repo_facts、risk_flags、test_entry_refs、mcp_usage_notes、subagent_memory_context、blockers、fallback。

`status` 只描述 BRV recall 本身：

```text
hit / miss / blocked / skipped / retry_non_swarm
```

不得把 `swarm config missing` 写成 `blocked`。

## 不可用与降级

如果 BRV 不可用、命令失败、权限不足或召回为空：

1. 不得伪造召回结果。
2. 必须记录 status。
3. 必须说明 fallback。
4. 可以继续执行，但必须在 Agent Assignment 中说明 BRV recall 缺口是否影响任务。

降级优先级：

```text
1. manifest-scoped BRV index
2. .codex/memory.md
3. docs/CURRENT.md / docs/ACTIVE_CONTRACTS.md
4. 相关源码 / tests / schema
```

如果只是 swarm config 缺失，默认不进入此降级分支；按“ByteRover swarm 策略”处理为 optional/noise。

## subagent_memory_context

main agent 必须把 BRV 结果压缩成 subagent 可消费的最小记忆上下文：

```text
subagent_memory_context:
- relevant_repo_facts:
- known_test_entries:
- mcp_usage_notes:
- forbidden_assumptions:
- evidence_ref:
```

不同 subagent 只接收与自己相关的切片。不得把完整 BRV 输出广播给所有角色。

禁止把以下内容放入 subagent packet：

```text
- swarm config missing
- ByteRover CLI banner / warning
- optional swarm capability status
- unrelated BRV history
```
