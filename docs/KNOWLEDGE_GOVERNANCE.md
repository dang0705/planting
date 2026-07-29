---
doc_id: knowledge-governance
status: current
doc_type: policy
owner: main
sync_policy: active
last_verified_date: 2026-06-06
last_verified_commit: unknown-from-upload
source_of_truth:
  - AGENTS.md
  - .codex/context-packs.yml
  - .codex/skills/dispatch-task/references/knowledge-hygiene-policy.md
  - .brvspace
  - docs/_doc-status.yml
  - docs/_sync-map.yml
stale_if_changed:
  - AGENTS.md
  - .codex/**
  - .brvspace
  - .brv/context-tree/**
  - docs/_doc-status.yml
  - docs/_sync-map.yml
---

# Knowledge Governance

本文是仓库知识治理规则。它替代“所有文档持续同步”的既有策略。

## 1. 核心原则

```text
蓝图归档；
活文档极简化；
契约必须同步；
BRV 只做索引；
main 负责最小 active docs 与 ByteRover 影响处理。
```

事实优先级：

| 优先级 | 对象 | 规则 |
|---:|---|---|
| 1 | 代码、测试、schema、配置、package scripts | 当前事实源。 |
| 2 | active docs | 只解释当前契约、导航和运行方式。 |
| 3 | ByteRover V4 memory | 当前以 `.brvspace` 绑定的 space 为准；只能作为定位线索，不能单独当事实。 |
| 4 | retrieval-only docs | 只能作为定位线索。 |
| 5 | archived/superseded blueprints | 历史材料，不能作为当前事实。 |

## 2. 文档状态模型

| status | 含义 | AI 默认读取 |
|---|---|---|
| `current` | 当前有效，需随契约同步。 | 可读。 |
| `retrieval-only` | 大型参考材料，只在精确任务触发时检索。 | 默认不读。 |
| `archived` | 历史材料，不再维护为当前事实。 | 默认不读。 |
| `superseded` | 已被其他文件或代码替代。 | 默认不读。 |
| `stale` | 已发现可能过时。 | 只读 stale 标记，不读全文。 |
| `draft` | 草稿，不作为事实源。 | 默认不读。 |

状态写入：

```text
docs/_doc-status.yml
```

## 3. 活文档范围

只有以下文件是 active docs：

```text
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
docs/RUNBOOK.md
docs/KNOWLEDGE_GOVERNANCE.md
docs/ARCHIVE_INDEX.md
docs/_doc-status.yml
docs/_sync-map.yml
```

`docs/code-logics/**`、`docs/new-rules/**`、`docs/route规划及outcome瘦身计划/**`、`docs/ai-runs/**` 不再被维护成当前事实。

## 4. Main docs / BRV 工作流

### 4.1 classify 模式

输入只允许：

```text
git diff --name-only
git diff --stat
Sync Packet
docs/_sync-map.yml
docs/_doc-status.yml
```

输出：

```yaml
status: no-op | patch-required | audit-required | blocked
affected_areas: []
active_docs_to_patch: []
brv_keys_to_update: []
archive_or_stale_actions: []
reason: ""
```

### 4.2 patch 模式

只读取：

```text
命中源码
命中活文档
命中 ByteRover V4 topics 或 legacy BRV archive
相关 diff hunk
```

禁止读取整仓、整个 docs、整套 ByteRover/BRV 材料。

### 4.3 audit 模式

只有 main agent 明确要求，且原因属于下列之一时启用：

```text
大规模架构重写
公共契约大改
既有文档与代码大面积冲突
ByteRover topics 或 legacy BRV archive 污染严重
迁移/发布事故复盘
```

## 5. Sync Packet

主代理在实现任务结束后提供：

```markdown
# Sync Packet

## Change summary
- Changed:
- User-visible behavior changed: yes/no
- Public API changed: yes/no
- Config/schema changed: yes/no
- Architecture/workflow changed: yes/no
- Deployment/runbook changed: yes/no
- ByteRover/source-verified memory affected: yes/no

## Changed files
- ...

## Relevant diff
Only relevant hunks.

## Verification
- Commands:
- Result:
- Known uncertainty:

## Candidate active docs
- ...

## Candidate ByteRover recall keys
- ...

## Forbidden context
- ...
```

## 6. 触发矩阵

| 变更类型 | 文档动作 | ByteRover 动作 |
|---|---|---|
| 纯内部重构，无行为变化 | 通常 no-op | no-op |
| HTTP 路由、请求/响应字段、前端可见字段变化 | 更新 `ACTIVE_CONTRACTS.md` | 更新相关 ByteRover V4 topic / recall key |
| env/schema/CloudBase 路由变化 | 更新 `ACTIVE_CONTRACTS.md` 和 `RUNBOOK.md` | 更新相关 ByteRover V4 topic / recall key |
| package script、CI、部署、本地调试变化 | 更新 `RUNBOOK.md` | 视情况更新 |
| agent 分工、dispatch、context pack、MCP 策略变化 | 更新 `AGENTS.md`、`.codex/context-packs.yml`、本文 | 更新相关 ByteRover V4 topic / recall key |
| 既有文档与代码冲突 | 标记 stale/superseded | 禁止引用既有文档为事实 |
| 新增稳定源码事实 | 如影响契约则更新活文档 | 添加对应的 ByteRover V4 recall 记录 |

## 7. ByteRover V4 只做记忆索引

当前默认 memory source 是 `.brvspace` 绑定的 ByteRover V4 `planting` space。legacy `.brv/context-tree/**` 只作为归档材料处理，不再作为当前默认 memory source。

ByteRover 条目必须短，并且具备来源与失效条件：

```yaml
id: F-DIAG-ROUTES-002
claim_summary: "diagnose-http owns diagnosis start/question/answer/result/history/review/out-of-pool routes."
source:
  files:
    - cloudfunctions/diagnose-http/app/http-router.js
invalidated_by:
  paths:
    - cloudfunctions/diagnose-http/app/http-router.js
status: verified
confidence: high
```

禁止：

```text
无来源的经验性长文
把既有蓝图当当前事实
把 AI handoff 当运行事实
把 ByteRover/BRV 写成第二套文档
```

## 8. 归档策略

不急着物理删除既有文档。先做状态治理：

1. `docs/_doc-status.yml` 标记状态。
2. `docs/ARCHIVE_INDEX.md` 说明可读条件。
3. active docs 中只保留必要当前事实。
4. 确认无引用后再移动到 `docs/archive/YYYY-MM-DD/`。

## 9. AI 消费策略

默认 AI 只读：

```text
AGENTS.md
.codex/memory.md
.codex/context-packs.yml
docs/CURRENT.md
```

任务分类后按 `.codex/context-packs.yml` 读取最小包。CloudBase MCP 不常驻，只在部署、实时日志、SQL 或线上 smoke 时启用。
