# ByteRover memory review corrections for planting

Date: 2026-07-12

This note supersedes the inaccurate portions of
`2026-07-12T00-00-00Z-byterover-memory-cleanup-consolidation.md`.

1) Scope of the V4 boundary check
- `npm run check:brv-v4-boundary` is the active repo governance guard, but it
  is not a ByteRover topic-content or retrieval validator.
- Its verified scope is read-only scanning of active README, docs, package,
  CI, and scripts for retired V3 lifecycle-validator references, while
  confirming that the V4 command exists.
- Therefore a historical note about updates to
  `.brv/context-tree/tooling/wechat_devtools_mcp_usage.md` must not claim that
  `brv search` plus `npm run check:brv-v4-boundary` confirms the old topic was
  updated correctly. Keep the original V3 validation only as dated historical
  evidence; use current source verification plus the appropriate V4 topic
  retrieval/read path for any new content change.

2) Required reconciliation of direct registry edits
- The direct edits currently present in `MEMORY.md` were made outside the
  approved update-note flow. Do not extend that editing pattern.
- A memory curator must reconcile those edits from this correction note. In
  particular, replace the WeChat DevTools path-governance statement that names
  `npm run check:brv-v4-boundary` as confirmation of legacy `.brv` content.

3) Unverified consolidation proposal withdrawn
- The prior suggestion to consolidate timeline semantics into a single
  canonical reusable fact was not supported by a duplicate-topic audit in
  that review. Treat it as no-op until an explicit duplicate analysis finds
  redundant active topics.

Evidence reviewed:
- `package.json`: active script `check:brv-v4-boundary`.
- `rollout_summaries/2026-07-10T09-35-07-AHBK-byterover_v4_boundary_retirement_and_light_health_contract_a.md`:
  defines the boundary checker as an active-reference scan, not content
  verification.
- ByteRover cloud query was unavailable during review with
  `cloud-capability-expired`; no cloud retrieval conclusion was made.
