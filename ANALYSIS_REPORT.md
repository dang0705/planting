# Ticket 86exv6fnx Delta

The previous governance pass contained a source-verified memory entry that preserved the old route/follow-up wording. User update on 2026-06-06 changes the active product口径: diagnosis currently has no follow-up questions and is no longer one-question-per-round. This revision marks that old claim superseded and adds a minimal task pointer for question-package work.

# Knowledge Governance Analysis Report

生成日期：2026-06-06

## 1. 输入包

| 输入 | 用途 |
|---|---|
| `code-base.zip` | 当前代码事实源。 |
| `docs.zip` | 旧文档、蓝图、代码逻辑文档、runbook、handoff。 |
| `ai_and_memories.zip` | Codex 配置、agent、skill、BRV 记忆。 |

## 2. 主要判断

### 2.1 代码当前状态

当前代码不是单一诊断函数，而是多 HTTP 云函数组合：

```text
diagnose-http
storage-http
identify-http
weather-http
plant-catalog-http
plant-user-http
auth-user-http
wechat-identity
wechat-phone
diagnosis-history-http deprecated
layer
```

因此，任何旧记忆若说当前包缺少这些函数，均已过时。

### 2.2 文档当前状态

| 文档区域 | 治理结果 |
|---|---|
| `docs/code-logics/**` | retrieval-only，不再默认读，不再整体同步。 |
| `docs/new-rules/**` | archived，大型历史规则包。 |
| `docs/route规划及outcome瘦身计划/**` | superseded，由代码中的 route/outcome 实现替代。 |
| `docs/ai-runs/**`, `docs/ai-tasks/**` | archived，作为任务历史，不作为当前事实。 |
| `docs/deploy-pipeline.md`, `docs/local-cloudbase-functions-debugging.md`, `docs/cautions/**` | 提炼进 `RUNBOOK.md`，原文 retrieval-only。 |
| `docs/data-base/**` | 数据库任务按需读取，必须用 SQL 和代码二次验证。 |

### 2.3 AI/记忆当前状态

原配置偏重：

```text
gpt-5.5
xhigh
CloudBase MCP 常驻
danger-full-access
```

治理后默认改为低消耗配置：

```text
gpt-5.4-mini
medium
workspace-write
network_access=false
CloudBase MCP 拆到可选配置
```

BRV 改为 index-only：默认只读 `_index.md` 与 `facts-index.yml`。

## 3. 交付文件

```text
AGENTS.md
.codex/config.toml
.codex/config.cloudbase-mcp.toml
.codex/context-packs.yml
.codex/memory.md
.codex/agents/docs-keeper.toml
.codex/skills/dispatch-task/SKILL.md
.codex/skills/dispatch-task/references/knowledge-hygiene-policy.md
.brv/context-tree/_manifest.json
.brv/context-tree/_index.md
.brv/context-tree/facts-index.yml
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
docs/RUNBOOK.md
docs/KNOWLEDGE_GOVERNANCE.md
docs/ARCHIVE_INDEX.md
docs/_doc-status.yml
docs/_sync-map.yml
scripts/knowledge_hygiene_check.py
```

## 4. 落地顺序

1. 先合入 `AGENTS.md`、`.codex/context-packs.yml`、`.codex/memory.md`、`.codex/config.toml`。
2. 合入 active docs 与 `_doc-status.yml`、`_sync-map.yml`。
3. 合入 BRV index-only manifest 和 facts-index。
4. 合入 `docs_keeper` 新配置和 dispatch-task hygiene policy。
5. 运行 `scripts/knowledge_hygiene_check.py` 对最近 diff 做一次分类。
6. 真实 Git 落地后，把所有 `unknown-from-upload` 替换为当前 commit hash。

## 5. 未做的事

- 未物理移动旧文档到 `docs/archive/`；本包先做状态治理，避免破坏现有引用。
- 未运行真实仓库测试；上传包不等同于可执行工作区。
- 未连接 CloudBase、MCP、Git 或线上环境。
