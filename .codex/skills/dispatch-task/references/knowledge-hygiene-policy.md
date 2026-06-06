# Knowledge Hygiene Policy

## Purpose

This policy replaces blanket documentation synchronization.

The repository now follows:

```text
Code is source of truth.
Active docs are minimal contracts and navigation.
BRV is an index only.
Blueprints are archived.
docs_keeper is a cleaner, not a synchronizer.
```

## Phase integration

After implementation and main-agent code review, main agent must create a Sync Packet before deciding whether to call `docs_keeper`.

### Sync Packet

```markdown
# Sync Packet

## Change summary
- Changed:
- User-visible behavior changed: yes/no
- Public API changed: yes/no
- Config/schema changed: yes/no
- Architecture/workflow changed: yes/no
- Deployment/runbook changed: yes/no
- BRV/source-verified memory affected: yes/no

## Changed files
- ...

## Relevant diff
Only include relevant hunks.

## Verification
- Commands:
- Result:
- Known uncertainty:

## Candidate active docs
- ...

## Candidate BRV index keys
- ...

## Forbidden context
- ...
```

## Trigger matrix

| Change type | docs_keeper action |
|---|---|
| Pure internal refactor, no public behavior/contract change | usually no-op |
| Public API / frontend-visible response fields | patch `docs/ACTIVE_CONTRACTS.md` |
| Schema/env routing / CloudBase environment / SQL table contract | patch active contracts and BRV index |
| Deploy/local-debug/runbook behavior | patch `docs/RUNBOOK.md` |
| AI workflow / dispatch / agent roles / context packs | patch `AGENTS.md`, `.codex/context-packs.yml`, `docs/KNOWLEDGE_GOVERNANCE.md` |
| Old doc contradicts code | mark stale/superseded; do not rewrite old blueprint |
| New source-verified reusable fact | add/update `.brv/context-tree/facts-index.yml` with source and invalidation |
| Large architecture rewrite | require explicit audit mode |

## Active docs

Only these are synchronized as current docs:

```text
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
docs/RUNBOOK.md
docs/KNOWLEDGE_GOVERNANCE.md
docs/ARCHIVE_INDEX.md
docs/_doc-status.yml
docs/_sync-map.yml
```

## Archive-only docs

The following are not synchronized as current facts:

```text
docs/new-rules/**
docs/route规划及outcome瘦身计划/**
docs/ai-runs/**
docs/ai-tasks/**
docs/code-logics/** except when explicitly retrieved by index
docs/planting_ai_diagnosis_all_in_one_package/**
.brv/review-backups/**
.brv/dream-log/**
```

## BRV rule

BRV entries must be compact index records:

```yaml
id:
claim_summary:
source:
  files: []
invalidated_by:
  paths: []
status: verified | stale | superseded | observation
confidence: high | medium | low
```

No BRV entry may cite archived blueprints as current facts.
