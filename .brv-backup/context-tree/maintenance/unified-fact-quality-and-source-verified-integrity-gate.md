---
confidence: 0.95
sources: [maintenance/_index.md, governance/_index.md, testing/_index.md]
synthesized_at: '2026-06-20T04:40:04.003Z'
type: synthesis
title: Unified Fact Quality and Source-Verified Integrity Gate
summary: A cross-domain enforcement mechanism that restricts active knowledge to source-verified 'facts' from code/config, while downgrading unverified session memories.
tags: [knowledge-fidelity, governance, ci-cd]
related: []
keywords: [fact, integrity, verification, recall, manifest, lifecycle, gate]
createdAt: '2026-06-20T04:40:04.003Z'
updatedAt: '2026-06-20T04:40:04.003Z'
---

# Unified Fact Quality and Source-Verified Integrity Gate

Knowledge fidelity is maintained by a centralized 'Fact Quality Gate' that filters subagent memory context, validates CI/CD pipelines, and strictly categorizes claims based on their source authority.

## Evidence

- **maintenance**: Mandates that all entries of type: fact must be explicitly verified against code, config, or package sources (brv_fact_quality_gate.md).
- **governance**: BRV Recall Condition generates subagent_memory_context by filtering active_context from _manifest.json to prevent context bloat (dispatch_task_and_docs_rules.md).
- **testing**: scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity in both local development and CI/CD pipelines.
