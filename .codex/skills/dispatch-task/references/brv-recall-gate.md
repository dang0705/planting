# BRV Recall Gate：最精简事实路由层

## 定位

BRV Recall Gate 是 `$dispatch-task` 在读取任务事实后、Agent Assignment 前执行的**最精简事实路由层**。

它不负责把 BRV 记忆正文注入上下文，而只负责回答四个问题：

1. 本任务最可能涉及哪些仓库事实 / 规则 / 决策。
2. 哪些源码、配置、测试入口应优先读取。
3. 哪些旧方案、过期记忆或错误假设必须禁止。
4. 每个 subagent 只需要继承哪一小片记忆。

BRV 不是 task facts，也不是 docs/code 的替代物：

- task facts 负责描述“本次任务要做什么”。
- BRV 负责给出“去哪里验证、哪些事实可能相关”。
- docs 负责权威设计边界。
- code / package / config 负责最终运行事实。

## 执行时机

执行顺序：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-01`）。

必须先完成 Task Facts Receipt，再生成 BRV query。不得在读取任务事实前预读完整 BRV。

## 默认召回路径

默认召回只允许走非 swarm 路径：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-02`）。

不得默认执行：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-03`）。

不得默认检查：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-04`）。

## 两阶段读取策略

BRV Recall 必须分两阶段，禁止直接把 active context 全量展开。

### Stage A：路由扫描

只读取轻量索引：

1. `.brv/context-tree/_manifest.json`。
2. `.brv/context-tree/_index.md`。
3. task facts 中显式指向的 BRV 条目。

Stage A 只产出候选 `context_ref / fact_ref / source_ref`，不粘贴长正文。

### Stage B：按需取证

只有满足任一条件时，才允许读取具体 BRV context 文件：

1. task facts 与候选 fact 高相关。
2. 需要判断 `active / superseded / deprecated`。
3. 需要把一个事实写入 Implementation Contract / Test Contract。
4. 需要给 subagent 一个明确禁止项。

Stage B 默认最多展开 3 个 BRV context 文件；复杂任务最多 5 个。超过必须记录 `omitted_context_refs`，不得继续扩张。

## 查询输入

BRV query 只基于以下最小信息生成：

1. task title / prompt intent。
2. hard constraints。
3. affected domains。
4. candidate files / modules。
5. 明显关键词：diagnosis / route / outcome / weather / frontend / UI / CloudBase / automator / ClickUp / dispatch。
6. main agent 当前缺失的仓库事实。

不得把完整 ClickUp 描述、完整 Figma、完整 QA 证据、完整日志或完整 docs 内容传入 BRV query。

## 输出形态：BRV Fact Routing Packet

输出模板见：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-08`）。

BRV 输出必须是短 routing packet，而不是知识摘要文章。

默认上限：

- 普通任务：不超过 350 tokens。
- 跨域/高风险任务：不超过 650 tokens。
- 只有涉及架构迁移、诊断主链、结果出口或 QA 阻塞恢复时，才允许到 900 tokens。

硬上限：1000 tokens。超过时必须只保留 `fact_ref / source_ref / doc_ref / test_ref`，删掉自然语言解释。

## 字段预算

Packet 字段必须按以下预算裁剪：

1. `fact_refs`：最多 6 条，每条只保留 `id + 一句话 claim + source_ref`。
2. `authority_doc_refs`：最多 3 条。
3. `code_entry_refs`：最多 5 条。
4. `test_entry_refs`：最多 3 条。
5. `forbidden_assumptions`：最多 3 条。
6. `subagent_slices`：每个 role 最多 3 条 ref，不粘贴完整事实正文。

禁止输出完整历史对话、完整日志、大段旧规则、ByteRover / swarm 配置噪声、与本任务无关的项目记忆。

## WeChat / 端上自动化降噪

普通微信小程序端上 QA 默认使用 `miniprogram-automator` / `@dcloudio/uni-automator`，不是 WeChat DevTools MCP。

如果任务涉及小程序端上验证，BRV packet 只需输出：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-13`）。

不得输出 WeChat MCP recovery 旧路径，除非 task facts 明确要求调试 MCP 本身。

## ByteRover swarm 策略

ByteRover swarm 是可选能力，不是 `$dispatch-task` 的默认依赖。

只有同时满足以下条件时，才允许尝试 swarm：

1. 用户任务或上游 task facts 明确要求 swarm / ByteRover swarm。
2. `.brv/swarm/config.yaml` 确实存在。
3. 当前 BRV CLI 明确支持 `brv swarm query`。
4. 任务需要 swarm 的多代理记忆能力，而不是普通 `subagent_memory_context`。

如果 `.brv/swarm/config.yaml` 不存在，默认记为内部噪声，不进入普通 packet：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-05`）。

该状态不得写入：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-06`）。

如果默认 BRV recall 过程中工具输出 `swarm config missing`，应判断为错误调用了 swarm 路径或工具噪声：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-07`）。

该噪声不得传播给 subagent。

## status 语义

`status` 只描述最小事实路由是否成功：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-09`）。

不得把 `swarm config missing`、WeChat MCP unavailable、旧 MCP recovery 不可用写成 `blocked`。

## 不可用与降级

如果 BRV 不可用、命令失败、权限不足或召回为空：

1. 不得伪造召回结果。
2. 必须记录 status。
3. 必须说明 fallback。
4. 可以继续执行，但 Agent Assignment 必须说明 BRV 缺口是否影响任务。

降级优先级：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-10`）。

如果只是 swarm config 缺失或 WeChat MCP 不可用，默认不进入降级分支；按工具噪声处理。

## subagent_memory_context

main agent 必须把 BRV 结果压缩成 subagent 可消费的最小记忆切片：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-11`）。

不同 subagent 只接收与自己相关的 ref，不接收完整 BRV 输出。

禁止把以下内容放入 subagent packet：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-12`）。

## BRV Recall Cache

同一任务恢复、重跑或阶段续跑时，优先复用 BRV Fact Routing Packet。

缓存键格式引用：

外置模板/规范片段：`../assets/templates/brv-recall.md`（template_id: `brv-recall-gate-14`）。

规则：

1. cache hit 时，main agent 只读取 `packet_ref`、status、route_refs 和 risk_flags，不重新展开 repo_facts。
2. cache miss 时，执行正常 BRV query。
3. hard_constraints、affected_domains 或 branch 改变时，缓存失效。
4. BRV Cache 不能代替 task facts；只缓存仓库事实路由结果。
5. packet_ref 必须可回查，不能只写自然语言总结。
