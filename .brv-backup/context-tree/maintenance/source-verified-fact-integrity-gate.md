---
confidence: 0.95
sources: [maintenance/_index.md, testing/_index.md, governance/_index.md]
synthesized_at: '2026-06-19T07:56:24.879Z'
type: synthesis
title: Source-Verified Fact Integrity Gate
summary: Strict enforcement of code/config/package as the only valid sources for knowledge, preventing session memory pollution through manifest-scoped validation scripts.
tags: [fact-integrity, ci-cd, knowledge-management]
related: []
keywords: [manifest, source-verified, lifecycle, validation, memory-pollution]
createdAt: '2026-06-19T07:56:24.879Z'
updatedAt: '2026-06-19T07:56:24.879Z'
---

# Source-Verified Fact Integrity Gate

Knowledge fidelity is maintained by a cross-domain quality gate that invalidates any claim not traceable to source files, integrated into both CI and local dev flows.

## Evidence

- **maintenance**: Valid sources are strictly limited to code, config, and package; runtime behavior must be verified against source files, not conversation history.
- **testing**: scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity, restricting statuses and owners while validating fact sources.
- **governance**: The system must utilize _index.md and _manifest.json to filter for active_context, rejecting deprecated entries.
