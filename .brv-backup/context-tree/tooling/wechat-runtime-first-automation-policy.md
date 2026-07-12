---
confidence: 0.9
sources: [architecture/_index.md, governance/_index.md, tooling/_index.md]
synthesized_at: '2026-07-01T13:06:40.543Z'
type: synthesis
title: WeChat Runtime-First Automation Policy
summary: Mini-Program task validation requires real-device evidence via port 9420 and miniprogram-automator, prioritizing runtime logs over backend smoke tests.
tags: [wechat, automation, qa]
related: []
keywords: [automator, '9420', miniprogram, runtime, evidence, wechat, qa]
createdAt: '2026-07-01T13:06:40.543Z'
updatedAt: '2026-07-01T13:06:40.543Z'
---

# WeChat Runtime-First Automation Policy

Truth for task closure is exclusively derived from miniprogram-automator logs, mandating the use of WeChat runtime wx.request for all API acceptance tests.

## Evidence

- **architecture**: The 'Truth Gate' for completion is exclusively miniprogram-automator logs (port 9420). Backend-only smoke tests are insufficient for task closure.
- **governance**: Tasks involving 9420 or miniprogram-automator must use direct automation evidence; API acceptance must utilize the WeChat runtime wx.request.
- **tooling**: Planting 小程序端上 QA 默认使用: dist/dev/mp-weixin -> 9420 -> miniprogram-automator.
