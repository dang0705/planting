---
confidence: 0.9
sources: [tooling/_index.md, testing/_index.md]
synthesized_at: '2026-06-06T01:24:05.721Z'
type: synthesis
title: WeChat Runtime Automator Lifecycle Integration
summary: WeChat development tooling is integrated into the project's task dispatch and testing workflows through runtime automator recovery and CI deployment rules.
tags: [wechat, automator, ci-cd, tooling, testing]
related: []
keywords: [wechat, automator, miniprogram, ci, dispatch, recovery, deployment]
createdAt: '2026-06-06T01:24:05.721Z'
updatedAt: '2026-06-06T01:24:05.721Z'
---

# WeChat Runtime Automator Lifecycle Integration

The tooling and testing domains share a dependency on `miniprogram-automator`, `9420`, and `miniprogram-ci`, which are managed through centralized dispatch and recovery policies that impact how subagents interact with the environment.

## Evidence

- **tooling**: Runtime automator usage includes dispatch/recovery rules for main, implementer, and QA subagents.
- **testing**: Package scripts status covers local functions, mp-weixin, and miniprogram-ci deployment, which rely on the tooling facts.
