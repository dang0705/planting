## 2026-06-06 ticket update

This revision supersedes the previous diagnosis facts that said regular route follow-up asks one question per round. Current diagnosis-question-package口径 is no-follow-up and not one-question-per-round. The active requirement pointer is `docs/tickets/86exv6fnx-diagnose-question-package.md`.

# Governed Knowledge Pack

生成日期：2026-06-06

本包不是把既有文档继续同步一遍，而是把知识体系治理成：

```text
蓝图归档；
活文档极简化；
契约必须同步；
BRV 只做索引；
docs-keeper 从同步者变成清理者。
```

## 建议落位

把本包中的文件复制到仓库根目录，对应覆盖或新增：

```text
AGENTS.md
.codex/config.toml
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

## 治理后的默认 AI 读取口径

默认只读：

```text
AGENTS.md
.codex/memory.md
.codex/context-packs.yml
docs/CURRENT.md
```

只有触发具体任务域时，才读 `docs/ACTIVE_CONTRACTS.md`、`docs/RUNBOOK.md` 或命中的源码文件。既有的 `docs/code-logics/**`、`docs/new-rules/**`、`docs/route规划及outcome瘦身计划/**`、`docs/ai-runs/**` 默认不读。

## 重要边界

- 本包基于上传文件静态分析生成，未连接你的实际 Git commit。落地后应把 `verified_at_commit: unknown-from-upload` 改成当前 commit hash。
- 如果上传包与真实工作区不一致，以真实工作区代码为准。
- 既有文档不要直接删除；先按 `docs/ARCHIVE_INDEX.md` 和 `docs/_doc-status.yml` 标记为 archive-only / retrieval-only。
