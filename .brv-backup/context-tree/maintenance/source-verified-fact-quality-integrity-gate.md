---
confidence: 0.9
sources: [maintenance/_index.md, docs/_index.md, testing/_index.md]
synthesized_at: '2026-07-09T05:19:34.012Z'
type: synthesis
title: Source-Verified Fact Quality & Integrity Gate
summary: Durable knowledge is strictly gated, requiring direct traceability to code, config, or package files to be classified as a 'fact'.
tags: [knowledge-base, governance, documentation, ci-cd]
related: []
keywords: [fidelity, validation, fact, source-verified, integrity, gate, manifest]
createdAt: '2026-07-09T05:19:34.012Z'
updatedAt: '2026-07-09T05:19:34.012Z'
---

# Source-Verified Fact Quality & Integrity Gate

The project implements a strict hierarchy of evidence where documentation or observations are downgraded if not explicitly backed by project source files.

## Evidence

- **maintenance**: Only claims traceable to code, config, or package files are categorized as 'facts' (R-BRV-FACT-SOURCE-001).
- **docs**: Governance principle: distinguish between confirmed facts and unverified observations; prohibit unverified suggestions from entering the fact layer.
- **testing**: scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity and validates fact sources.
