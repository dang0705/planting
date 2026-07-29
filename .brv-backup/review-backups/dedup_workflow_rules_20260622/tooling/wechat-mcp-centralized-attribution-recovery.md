---
confidence: 0.85
sources: [tooling/_index.md, governance/_index.md]
synthesized_at: '2026-06-07T02:55:04.752Z'
type: synthesis
title: WeChat MCP Centralized Attribution & Recovery
summary: WeChat development tooling is governed by a centralized recovery policy that standardizes error attribution across subagent roles.
tags: [wechat, mcp, tooling, recovery]
related: []
keywords: [wechat, mcp, recovery, attribution, policy, devtools]
createdAt: '2026-06-07T02:55:04.752Z'
updatedAt: '2026-06-07T02:55:04.752Z'
---

# WeChat MCP Centralized Attribution & Recovery

WeChat infrastructure and recovery are decoupled from product logic, requiring subagents to inject policy context for standardized error attribution and transport-level recovery.

## Evidence

- **tooling**: Standardized diagnostics mandate inspection of port 9420 and DevTools status before attributing product-level failures.
- **governance**: Dispatch rules mandate WeChat MCP policy injection into role packets to ensure consistent attribution and conservative rules.
