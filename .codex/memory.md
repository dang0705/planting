# Codex Memory Index

Status: active  
Updated: 2026-06-06

This file is a compact AI-consumed memory pointer. It is not a source of truth.

## Read order

1. Code, tests, schema, config, package scripts.
2. Active docs listed in `.codex/context-packs.yml`.
3. `.brv/context-tree/facts-index.yml` as index only.
4. Archived docs only when explicitly requested.

## Current diagnosis package guard

- Current diagnosis-question-package口径: no follow-up questions; not one question per round; package-first question flow.
- Latest requirement pointer: `docs/tickets/86exv6fnx-diagnose-question-package.md`.
- Old claims saying “regular route follow-up asks one question per round” are superseded.
- Legacy code names such as `follow-up`, `QuestionStart`, or `FollowUpMutation` do not by themselves prove the current product口径.

## Default BRV files

Read only:

```text
.brv/context-tree/_index.md
.brv/context-tree/facts-index.yml
```
