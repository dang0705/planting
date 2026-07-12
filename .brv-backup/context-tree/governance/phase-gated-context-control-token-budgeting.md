---
confidence: 0.85
sources: [governance/_index.md, maintenance/_index.md]
synthesized_at: '2026-07-09T05:19:34.013Z'
type: synthesis
title: Phase-Gated Context Control & Token Budgeting
summary: To prevent context pollution and token bloat, knowledge retrieval is restricted by a mandatory 'Phase 1.5' recall gate and manifest-scoped filtering.
tags: [context-management, token-budget, workflow, performance]
related: []
keywords: [recall, manifest, phase-gated, token, budget, active-context, pollution]
createdAt: '2026-07-09T05:19:34.013Z'
updatedAt: '2026-07-09T05:19:34.013Z'
---

# Phase-Gated Context Control & Token Budgeting

Knowledge retrieval is not global; it is gated by Phase 1.5 checks and restricted to the active_context defined in _manifest.json to ensure session health.

## Evidence

- **governance**: Non-simple tasks must execute Phase 1.5 to produce a BRV Recall Receipt; recall restricted to active_context in the manifest.
- **maintenance**: Subagent recall is restricted to files listed in _manifest.json.active_context; files outside are excluded to prevent context bloat.
