---
confidence: 0.95
sources: [maintenance/_index.md, testing/_index.md, governance/_index.md]
synthesized_at: '2026-07-08T07:17:47.568Z'
type: synthesis
title: Source-Verified Fact Quality Gate
summary: Strict metadata and source-kind requirements prevent session memory contamination by anchoring 'facts' only in code, config, or package files.
tags: [governance, knowledge-fidelity, ci-cd]
related: []
keywords: [fact-gate, source-verified, lifecycle, manifest, integrity, context-pollution]
createdAt: '2026-07-08T07:17:47.568Z'
updatedAt: '2026-07-08T07:17:47.568Z'
---

# Source-Verified Fact Quality Gate

A cross-domain 'Fact Quality Gate' enforces that only knowledge traceable to authoritative source files (code/config) can be categorized as a 'fact' in the BRV context tree.

## Evidence

- **maintenance**: Valid source kinds are restricted to code, config, and package; claims from docs or conversations are downgraded to observations/rules.
- **testing**: scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity and validates fact sources (code/config/package).
- **governance**: Non-simple tasks must execute Phase 1.5 to produce a BRV Recall Receipt, filtering active context to prevent context pollution.
