# Knowledge Hygiene Templates

本文件保存知识卫生、Sync Packet、active docs、BRV index record 等模板。

## knowledge-hygiene-policy-01

Source: `references/knowledge-hygiene-policy.md`  
Context: Purpose

```text
Code is source of truth.
Active docs are minimal contracts and navigation.
BRV is an index only.
Blueprints are archived.
docs_keeper is a cleaner, not a synchronizer.
```

## knowledge-hygiene-policy-02

Source: `references/knowledge-hygiene-policy.md`  
Context: Sync Packet

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

## knowledge-hygiene-policy-03

Source: `references/knowledge-hygiene-policy.md`  
Context: Active docs

```text
docs/CURRENT.md
docs/ACTIVE_CONTRACTS.md
docs/RUNBOOK.md
docs/KNOWLEDGE_GOVERNANCE.md
docs/ARCHIVE_INDEX.md
docs/_doc-status.yml
docs/_sync-map.yml
```

## knowledge-hygiene-policy-04

Source: `references/knowledge-hygiene-policy.md`  
Context: Archive-only docs

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

## knowledge-hygiene-policy-05

Source: `references/knowledge-hygiene-policy.md`  
Context: BRV rule

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
