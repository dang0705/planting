# BRV Recall Gate

## 定位

BRV Recall Gate 是 `$dispatch-task` 在读取任务事实后、Agent Assignment 前执行的项目记忆召回层。

它用于召回当前仓库的稳定事实、历史踩坑、关键入口、测试入口、MCP 使用注意事项和 subagent 所需的最小记忆上下文。

BRV 不是 task facts，也不是 ClickUp 的替代物：

- task facts 负责描述“本次任务要做什么”。
- BRV 负责补充“当前仓库里相关事实是什么”。

## 执行时机

执行顺序：

```text
Phase 1: Task facts / ClickUp / prompt facts
Phase 1.5: BRV Recall Gate
Phase 2: Agent Assignment
```

必须先知道任务事实，再生成 BRV query。

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

必须包含 status、queries、repo_facts、risk_flags、test_entry_refs、mcp_usage_notes、subagent_memory_context、blockers。

## 不可用与降级

如果 BRV 不可用、命令失败、权限不足、swarm 配置缺失或召回为空：

1. 不得伪造召回结果。
2. 必须记录 status。
3. 必须说明 fallback。
4. 不得把 swarm config 缺失当作产品问题，除非本任务依赖 swarm。
5. 可以继续执行，但必须在 Agent Assignment 中说明 BRV recall 缺口是否影响任务。

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
