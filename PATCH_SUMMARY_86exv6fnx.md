# Patch Summary: Ticket 86exv6fnx Diagnose Question Package

Updated: 2026-06-06

## Change

The previous knowledge pack preserved an old diagnosis fact:

```text
regular route follow-up asks one question per round
```

The new active口径 is:

```text
no follow-up questions; not one question per round; package-first question flow
```

## Files changed

- `AGENTS.md`
- `.codex/memory.md`
- `.codex/context-packs.yml`
- `.codex/agents/docs-keeper.toml`
- `docs/CURRENT.md`
- `docs/ACTIVE_CONTRACTS.md`
- `docs/_sync-map.yml`
- `docs/_doc-status.yml`
- `docs/tickets/86exv6fnx-diagnose-question-package.md`
- `.brv/context-tree/_index.md`
- `.brv/context-tree/facts-index.yml`
- `.brv/diagnosis-facts/_index.md`
- `scripts/knowledge_hygiene_check.py`

## AI consumption rule

Default context remains small:

```text
AGENTS.md
.codex/memory.md
.codex/context-packs.yml
docs/CURRENT.md
```

Only read the ticket pointer for `diagnose-question-package` tasks:

```text
docs/tickets/86exv6fnx-diagnose-question-package.md
```

## Superseded claims

- `常规 route 追问每轮 1 题`
- `黄叶 4 题 package 是题包长度/场景上限`
- `后端 pendingList/持久化/归属校验仍首题锚定` unless re-verified from current code and ticket export
