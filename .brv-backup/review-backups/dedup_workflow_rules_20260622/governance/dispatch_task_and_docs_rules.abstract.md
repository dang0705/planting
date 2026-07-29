# Abstract — Dispatch-task and Docs Reading Rules

Dispatch-task includes Phase 1.5 BRV Recall Condition. Use this context for workflow token control, manifest-scoped BRV recall, subagent memory slicing, and WeChat MCP policy propagation. BRV routes docs/code; it does not replace docs or source verification.

Swarm query policy: `brv swarm query` is optional and off by default. Missing `.brv/swarm/config.yaml` is `not_configured_optional`, must not be propagated to subagents, and must not be treated as a product/subagent blocker. Subagent memory propagation uses `subagent_memory_context`, not ByteRover swarm.
