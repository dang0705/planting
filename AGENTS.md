# Repository Agent Rules

## Source of truth

1. Current code, tests, schemas, config, and package scripts are authoritative.
2. Active docs explain current contracts and operations; they are not a second source of truth.
3. BRV memory is only an index. It may point to source files, but it must not override source code.
4. Archived blueprints, AI handoffs, route plans, and old all-in-one rule packs are historical material only.

## Default context budget

Default AI context is limited to:

```text
AGENTS.md
.codex/memory.md
.codex/context-packs.yml
docs/CURRENT.md
```

Do not read entire `docs/`, `.brv/`, `.codex/skills/dispatch-task/references/`, `docs/code-logics/`, `docs/new-rules/`, `docs/ai-runs/`, or `docs/route规划及outcome瘦身计划/` by default.

Use `.codex/context-packs.yml` to select the smallest task-specific file pack.

## Current diagnosis question-package override

For diagnosis-question-package tasks, current product口径 is:

```text
no follow-up questions; not one question per round; package-first question flow
```

Read `docs/tickets/86exv6fnx-diagnose-question-package.md` only when the task touches diagnosis question packages. Do not infer the active product contract from old `follow-up` names, old route-planning docs, or old BRV claims.

## Documentation policy

Active docs are limited to:

```text
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
docs/RUNBOOK.md
docs/KNOWLEDGE_GOVERNANCE.md
docs/ARCHIVE_INDEX.md
docs/_sync-map.yml
docs/_doc-status.yml
```

When code changes affect public API, frontend-visible response fields, environment/schema routing, deployment workflow, AI workflow, or source-verified memory indexes, update the active docs or mark the affected claim stale.

Do not keep old blueprints synchronized. Archive or supersede them.

## docs-keeper role

`docs_keeper` is a knowledge hygiene agent, not a full documentation writer.

It must:

1. classify whether a change affects active contracts or AI memory indexes;
2. update only active docs or status manifests;
3. archive, supersede, or mark stale old docs instead of rewriting them;
4. prevent BRV from citing archived blueprints as current facts;
5. avoid full-repo and full-doc scans unless audit mode is explicitly requested.

## Implementation workflow

Use `$dispatch-task` for implementation work. Main agent must produce role context packets and minimal Sync Packets. Subagents receive only the files listed in the relevant context pack plus task diff.

Code modifications require implementer assignment unless a legal exception is recorded. QA validates behavior and evidence; QA does not replace main-agent code review.

## Hard stops

- Do not invent validation results.
- Do not treat old docs, AI run notes, or BRV claims as runtime facts without source verification.
- Do not use production CloudBase/SQL credentials unless the task explicitly requires production verification.
- Do not commit secrets or private keys.
