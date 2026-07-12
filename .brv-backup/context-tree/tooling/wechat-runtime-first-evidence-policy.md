---
confidence: 1
sources: [tooling/_index.md, governance/_index.md, testing/_index.md]
synthesized_at: '2026-07-08T07:17:47.567Z'
type: synthesis
title: WeChat Runtime-First Evidence Policy
summary: Task closure and API acceptance require real-device/simulator evidence via Port 9420, prioritizing runtime logs over backend smoke tests.
tags: [testing, automation, wechat-mini-program]
related: []
keywords: [automator, '9420', runtime, evidence, truth-gate, wechat, validation]
createdAt: '2026-07-08T07:17:47.567Z'
updatedAt: '2026-07-08T07:17:47.567Z'
---

# WeChat Runtime-First Evidence Policy

All frontend and API tasks must be validated using miniprogram-automator on port 9420, establishing a 'Truth Gate' that spans governance, tooling, and testing domains.

## Evidence

- **tooling**: The 'Truth Gate' for task closure is derived from miniprogram-automator logs via port 9420; direct automation evidence takes precedence.
- **governance**: Tasks involving 9420 or miniprogram-automator must use direct automation evidence; API acceptance must use wx.request logs.
- **testing**: Testing infrastructure includes wechat-runtime-first automation policy and deploy-miniprogram-ci scripts for automated preview/upload.
