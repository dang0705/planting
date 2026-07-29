---
doc_id: archive-index
status: current
doc_type: archive-index
owner: main
sync_policy: active
last_verified_date: 2026-06-06
last_verified_commit: unknown-from-upload
source_of_truth:
  - docs/_doc-status.yml
  - docs/**
stale_if_changed:
  - docs/_doc-status.yml
  - docs/**
---

# Archive / Retrieval Index

本文说明既有文档如何处理。目标不是删除知识，而是阻止既有蓝图和大型材料污染默认 AI 上下文。

## 1. 当前活文档

| 文件 | 状态 | 用途 |
|---|---|---|
| `docs/CURRENT.md` | current | 当前系统导航。 |
| `docs/ACTIVE_CONTRACTS.md` | current | 当前外部契约。 |
| `docs/RUNBOOK.md` | current | 当前运行/验证/发布手册。 |
| `docs/KNOWLEDGE_GOVERNANCE.md` | current | 知识治理规则。 |
| `docs/ARCHIVE_INDEX.md` | current | 归档索引。 |
| `docs/_sync-map.yml` | current | 代码到文档/BRV 影响映射。 |
| `docs/_doc-status.yml` | current | 文档状态清单。 |

## 2. 大型代码逻辑文档

```text
docs/code-logics/**
```

状态：`retrieval-only`

处理：

- 不再作为默认上下文。
- 不再整体同步。
- 只在任务明确命中某个模块，并且 active docs + 源码不足时，按文件名/索引精准读取。
- 如果内容与代码冲突，直接标记该条 stale，不修整整篇。

## 3. new-rules / all-in-one 规则包

```text
docs/new-rules/planting_ai_diagnosis_all_in_one.md
docs/new-rules/planting_ai_diagnosis_source_index.json
docs/planting_ai_diagnosis_all_in_one_package/**
```

状态：`archived`

处理：

- 这是历史知识包，不是当前运行契约。
- 不允许默认塞入 AI 上下文。
- 需要规则知识时，先读索引，再读最小片段。
- 若要改业务运行规则，必须回到 `cloudfunctions/diagnose-http/**` 和 active contracts。

## 4. route 规划与 outcome 瘦身计划

```text
docs/route规划及outcome瘦身计划/**
```

状态：`superseded`

替代事实源：

```text
cloudfunctions/diagnose-http/constants/outcome-route.js
cloudfunctions/diagnose-http/constants/scoring.js
cloudfunctions/diagnose-http/domain/outcome-route-planner.js
cloudfunctions/diagnose-http/app/frontend-response.js
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
```

处理：

- 保留为历史设计背景。
- 不继续同步成当前现实。
- 不得引用其中的轮次、ranking、outcome 字段作为当前契约，除非已被源码重新验证。

## 5. AI run / handoff / task 文档

```text
docs/ai-runs/**
docs/ai-tasks/**
```

状态：`archived`

处理：

- 只能作为历史证据或排查线索。
- 不得作为当前代码事实。
- 如果 handoff 记录的结论仍有用，应转写成 ByteRover V4 topic 或 recall key，且必须指向源码。

## 6. 数据库与发布规格

```text
docs/data-base/**
docs/deploy-pipeline.md
docs/local-cloudbase-functions-debugging.md
docs/cautions/**
```

状态：`retrieval-only`

处理：

- 运行/发布常用口径已压缩进 `docs/RUNBOOK.md`。
- 数据库任务可读取 `docs/data-base/**`，但必须用 SQL 文件和代码常量二次验证。
- 发布/调试事故可按需读取既有 runbook 片段。

## 7. 既有设计蓝图

匹配示例：

```text
docs/*架构设计*.md
docs/*设计*.md
docs/*规划*.md
docs/*蓝图*.md
docs/*v6*.md
docs/*v7*.md
```

状态：默认 `archived` 或 `superseded`

处理：

- 如果描述“计划如何实现”，归档。
- 如果解释“为什么这么做”，可改造成 ADR。
- 如果仍描述当前外部契约，应迁移精简到 `ACTIVE_CONTRACTS.md` 后归档原文。

## 8. BRV 既有材料

```text
.brv/context-tree/**
.brv/review-backups/**
.brv/dream-log/**
.brv/**/snapshot*
```

状态：`archived`

处理：

- 默认不读。
- 当前默认 memory source 是 `.brvspace` 绑定的 ByteRover V4 `planting` space；topics 通过 ByteRover V4 工具读取，不再把仓库内 `.brv/context-tree/**` 当默认上下文。
- 既有 BRV 中若有与当前代码冲突的观察，必须标记 `superseded`。

## 9. 物理迁移建议

不要一次性移动全部既有文档。建议分三步：

```text
1. 先合入本包，让默认 AI 消费路径变窄。
2. 用 scripts/knowledge_hygiene_check.py 在 PR 中提示命中文档区域。
3. 稳定后再把 archived/superseded 文档移动到 docs/archive/2026-06-06/。
```
