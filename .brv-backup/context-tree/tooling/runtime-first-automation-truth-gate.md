---
confidence: 0.95
sources: [tooling/_index.md, governance/_index.md, maintenance/_index.md]
synthesized_at: '2026-07-09T05:19:34.012Z'
type: synthesis
title: Runtime-First Automation & Truth Gate
summary: A strict 'Truth Gate' policy mandates that task closure and API validation must use real-device or simulator runtime evidence via port 9420.
tags: [qa, automation, wechat, testing]
related: []
keywords: [automator, '9420', runtime, evidence, verification, truth-gate, wx.request]
createdAt: '2026-07-09T05:19:34.012Z'
updatedAt: '2026-07-09T05:19:34.012Z'
---

# Runtime-First Automation & Truth Gate

Backend smoke tests are insufficient for task closure; all frontend and API behavior must be verified using miniprogram-automator and wx.request logs.

## Evidence

- **tooling**: Enforces a Runtime-First Automation Policy where truth is derived exclusively from miniprogram-automator logs on port 9420.
- **governance**: Tasks involving miniprogram-automator must use direct automation evidence; API acceptance must utilize wx.request rather than Node.js direct calls.
- **maintenance**: Runtime behavior must be verified against .js, .vue, or .json project files; claims not traceable to code/config are downgraded.
