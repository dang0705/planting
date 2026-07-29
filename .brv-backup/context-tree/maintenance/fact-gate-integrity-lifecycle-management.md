---
confidence: 0.9
sources: [maintenance/_index.md, testing/_index.md, governance/_index.md]
synthesized_at: '2026-06-07T02:55:04.750Z'
type: synthesis
title: Fact-Condition Integrity & Lifecycle Management
summary: All project domains are restricted by a unified fact-condition that enforces source authority and prevents session memory pollution.
tags: [governance, fact-management, compliance, integrity]
related: []
keywords: [fact, condition, lifecycle, governance, integrity, validation, brv]
createdAt: '2026-06-07T02:55:04.750Z'
updatedAt: '2026-06-07T02:55:04.750Z'
---

# Fact-Condition Integrity & Lifecycle Management

Knowledge fidelity across the project is governed by a cross-domain fact-condition mechanism that validates source authority (code/config/package) and enforces lifecycle status for all facts.

## Evidence

- **maintenance**: Fact Quality Condition mandates status: verified, owner, and source references for all fact entries.
- **testing**: scripts/validate-brv-context-lifecycle.mjs enforces manifest-scoped context integrity and fact source validation.
- **governance**: Dispatch rules incorporate the BRV Recall Condition for subagent memory propagation.
