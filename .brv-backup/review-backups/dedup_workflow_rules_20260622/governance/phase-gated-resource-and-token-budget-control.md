---
confidence: 0.85
sources: [governance/_index.md, maintenance/_index.md, docs/_index.md]
synthesized_at: '2026-06-20T04:40:04.004Z'
type: synthesis
title: Phase-Gated Resource and Token Budget Control
summary: Aggressive context compression and 'budget fuses' designed to prevent context bloat during subagent dispatch and knowledge retrieval.
tags: [token-budget, resource-management, optimization]
related: []
keywords: [token, budget, compression, phase-gated, dispatch, recall, limit]
createdAt: '2026-06-20T04:40:04.004Z'
updatedAt: '2026-06-20T04:40:04.004Z'
---

# Phase-Gated Resource and Token Budget Control

The system employs a phase-gated dispatch model (Phase 1.5) that uses index-first reading and mandatory fact compression to operate within strict token limits.

## Evidence

- **governance**: High-risk tasks trigger a 'budget fuse' requiring fact compression and delayed drill-downs to stay within limits (phase-gated-dispatch-and-budget-governance.md).
- **maintenance**: Recall is restricted to files listed in _manifest.json.active_context to prevent session memory contamination (source-verified-fact-integrity.md).
- **docs**: Documentation roadmap distinguishes between confirmed facts and unverified observations to prevent unverified suggestions from entering the fact layer.
