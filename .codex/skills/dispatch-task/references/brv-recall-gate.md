# BRV Recall Gate

## 定位

BRV Recall Gate 是 `dispatch-task` 在 Phase 1 事实读取之后、Phase 2 Agent Assignment 之前的轻量记忆召回层。它用于减少重复读取 `docs/` 与重复探索代码，不替代 ClickUp、docs 或源码的权威性。

核心分工：

```text
ClickUp / prompt = 当前任务事实
BRV = 相关历史知识、源码回溯 facts、规则、决策、旧坑与废弃链路
Docs = 当前设计边界和流程约束
Code = 最终运行事实
```

## 触发规则

非简单任务必须执行本 gate。以下任务强制执行：

1. 任何代码改动任务。
2. 涉及 `diagnose-http`、诊断问答、route / outcome / `visibleOutcomes`、review、replay、weather、plant catalog、CloudBase、SQL、部署、小程序端上验证、WeChat DevTools MCP、Figma/UI、agent/workflow/docs 规则的任务。
3. 任何需要派发 subagent 的任务。

允许跳过的低风险场景：纯文本回复、纯只读解释、单行 typo、用户明确要求不查记忆且不涉及代码/流程风险。

## 读取范围

优先读取：

```text
.brv/context-tree/_index.md
.brv/context-tree/_manifest.json
```

只从 `_manifest.json` 的 `active_context` 中选择相关 context。默认不得全量读取 `.brv/context-tree`。默认不得读取 `.brv/review-backups`、`.brv/dream-log`、非 manifest legacy 文件或 abstract 之外的重复层。

## ByteRover CLI 查询策略

`brv query` 是本 gate 的默认召回动作。`brv swarm query` 只是可选增强能力，不是 dispatch-task、BRV Recall Gate 或 subagent 记忆传播的必需步骤。

运行规则：

1. 必须优先执行普通 `brv query`，或在 CLI 不可用时使用 manifest-scoped fallback。
2. 默认不得执行 `brv swarm query`。
3. 只有同时满足以下条件才允许运行 `brv swarm query`：
   - `.brv/swarm/config.yaml` 存在；
   - 当前环境的 `brv` CLI 支持 `swarm query`；
   - 当前任务显式需要 ByteRover swarm 多 agent 记忆，或用户明确要求测试 / 配置 swarm。
4. 如果 `.brv/swarm/config.yaml` 不存在，记录为：

```text
brv_swarm_query: skipped_optional
swarm_reason: .brv/swarm/config.yaml not found
product_blocker: false
subagent_blocker: false
```

5. 缺少 swarm 配置不得阻塞 dispatch、不得归因为产品失败、不得要求 subagent 自行补跑 `brv swarm query`。
6. 缺少 swarm 配置时，默认不得在用户可见总结里反复报告“降级”，除非用户正在调试 BRV / swarm 本身。
7. subagent 生效依赖 Phase 3 的 `subagent_memory_context`，不依赖 ByteRover swarm。

简化判断：

```text
brv query = required default recall
brv swarm query = optional capability, only when configured and explicitly needed
missing .brv/swarm/config.yaml = skipped_optional, not blocker
```

## 召回过滤

BRV 召回必须按以下顺序过滤：

1. 保留 `status: verified` / `provisional` / `candidate` / `observation` 中与任务直接相关的条目。
2. 对 `type: fact`，只允许使用 `source_kind: code | config | package` 且带 `source.file`、`source.lines` 的条目。
3. 丢弃 `status: superseded` / `deprecated`，除非用于解释为什么不能使用旧方案。
4. `decision` 和 `rule` 可作为方向和边界，但不能替代源码验证。
5. `observation` 只作为低置信提示，不能写入 Implementation Contract 的硬事实。

## 输出：BRV Recall Receipt

使用 `assets/templates/phase-gates.md` 中的 `BRV Recall Receipt` 模板。

必须输出：

```text
BRV Recall Receipt:
- status: pass / skipped / blocked
- query_basis:
- recall_methods:
  - brv_query: pass / failed / skipped
  - brv_swarm_query: not_required / pass / skipped_optional / unavailable / failed_non_blocking
  - swarm_reason:
  - manifest_fallback: yes / no
- matched_contexts:
  - context_id:
    path:
    matched_reason:
- injected_memory:
  - fact_ids:
  - rule_ids:
  - decision_ids:
  - observation_ids:
- excluded_memory:
  - superseded_or_deprecated:
  - low_confidence:
  - not_source_verified_fact:
- docs_to_read:
- code_to_verify:
- test_entrypoints:
- subagent_memory_context:
- continue_allowed:
```

Gate 通过的最低可审计标准：不能只输出“BRV Recall 已做”。必须至少包含 `matched_contexts`、`docs_to_read`、`code_to_verify`、`test_entrypoints`、`subagent_memory_context` 和 `recall_methods`。

## 与 docs gate 的关系

BRV 只能决定“下一步应该精读哪些 docs / code”。

禁止：

1. 因为 BRV 召回了某条规则就跳过权威 docs。
2. 因为 BRV 召回了某条源码 fact 就跳过实际源码验证。
3. 把 BRV 原文全文塞进 Implementation Contract 或 role_context_packets。
4. 把 `observation` 当作 `fact` 使用。

## subagent 生效规则

`main agent` 必须把 BRV Recall Receipt 压缩为 `subagent_memory_context`，并按角色切片写入 `role_context_packets`：

- `code_explorer`：只接收相关 context path、fact/rule/decision id、需要验证的问题和目录。
- `implementer`：只接收与改动文件直接相关的 verified/provisional 记忆、禁止使用的 superseded 方案、必须验证的源码路径。
- `qa_reviewer`：只接收 Test Contract 相关的规则、WeChat DevTools MCP / 端上验证职责、证据要求、失败归因规则。
- `docs_keeper`：只接收需要同步的 docs 路由、ADR / rule / source fact id 与索引同步点。

subagent 不应自行全量读取 `.brv`，也不得自行运行 `brv swarm query`。如果 packet 中的 BRV 摘要不足，subagent 只能向 `main agent` 请求补充最小 context id 或 source path。

## WeChat DevTools MCP 记忆注入

当任务涉及小程序端上验证、微信开发者工具、`Transport closed`、`mcp__wechat_dev_tools`、automator 或 UI/Figma 小程序验收时，BRV Recall Gate 必须把以下内容注入 QA / implementer packet：

```text
wechat_mcp_policy_context:
- formal_qa_owner: qa_reviewer
- implementer_self_check_scope: minimal
- duplicate_automation_forbidden: true
- recovery_skill: .codex/skills/wechat-mcp-transport-recovery/SKILL.md
- transport_closed_is_not_product_failure: true
- fallback_automator_allowed_when_9420_works: true
```

正式端上验收仍由 `references/wechat-devtools-automation-policy.md` 和 `references/qa-evidence-policy.md` 约束。
