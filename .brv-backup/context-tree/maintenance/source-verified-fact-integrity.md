---
confidence: 0.95
sources: [maintenance/_index.md, testing/_index.md, validation/_index.md]
synthesized_at: '2026-06-07T15:26:11.717Z'
type: synthesis
title: Source-Verified Fact Integrity
summary: The BRV Fact Quality Condition enforces strict source-kind validation (code/config/package) across maintenance, testing, and validation domains.
tags: [fact-condition, integrity, source-of-truth, maintenance]
related: []
keywords: [fact, validation, source, integrity, session, manifest]
createdAt: '2026-06-07T15:26:11.717Z'
updatedAt: '2026-06-07T15:26:11.717Z'
---

# Source-Verified Fact Integrity

Knowledge fidelity is maintained by a centralized fact-condition mechanism that restricts source-verified facts to specific code, configuration, or package files, ignoring session memory.

## Evidence

- **maintenance**: Fact Quality Condition restricts valid source kinds to code, config, and package; runtime behavior must be verified against source files, not session memory.
- **testing**: Scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity and validates fact sources against code/config/package.
- **validation**: Downgraded session memory serves as a repository for superseded claims, preventing session contamination of current verified facts.
