# ByteRover memory cleanup consolidation note for planting

Date: 2026-07-12

Context: User requested direct cleanup guidance for ByteRover memory consolidation opportunities.

1) Current governance canonicalization
- Treat this as the active ByteRover governance contract:
  - `npm run check:brv-v4-boundary`
  - `scripts/check-brv-v4-boundary.mjs`
  - `.brvspace` + `node .codex/skills/byterover/scripts/space.mjs current`
  - `node .codex/skills/byterover/scripts/space.mjs list`
- Do not use `scripts/validate-brv-context-lifecycle.mjs` or `check:brv-context-lifecycle` as active validation commands after 2026-07-10 retirement.

2) Consolidation rules (high priority)
- Add explicit “历史引用/已废弃” tags for all mentions of:
  - `validate-brv-context-lifecycle`
  - `check:brv-context-lifecycle`
  - legacy `.brv/context-tree` lifecycle workflow details
- Keep legacy details in historical-only blocks only; remove from reusable/live governance guidance.

3) Memory structure cleanup targets
- Move/mark stale mentions in task-memory sections:
  - `Task Group: planting BRV retrieval diagnosis for watering-reminder knowledge` block currently uses old `.brv/context-tree` path and old validation command.
  - `Task Group: planting watering reminder` reuse knowledge mentions `npm run check:brv-context-lifecycle` as post-sync evidence.
  - `Task Group: planting BRV context-tree maintenance` should remain clearly historical and not reused as current contract source.
  - Any `docs_keeper`/path-governance notes using legacy BRV lifecycle check should explicitly be moved under historical/retired notes.

4) Single source consolidation
- Keep one canonical reusable fact for timeline semantics:
  - `CareBehaviorTimeline` selectable upper bound includes `d0` (today),
  - `DEFAULT_SELECTABLE_END_OFFSET = 0`,
  - 10-day event windows in `watering_events_10d`/`fertilizing_events_10d`/`light_change_events_10d` may include today,
  - avoid duplicating this in multiple reusable entries without reference.

5) Suggested post-change evidence
- New candidate references should point to V4 transition rollout + binding check outputs.
- Useful anchors:
  - `rollout_summaries/2026-07-10T09-35-07-AHBK-byterover_v4_boundary_retirement_and_light_health_contract_a.md`
  - `rollout_summaries/2026-07-10T08-54-06-JTlv-byterover_space_binding_attempt_planting.md`
  - `rollout_summaries/2026-07-05T13-42-12-SNa4-watering_timeline_docs_and_brv_sync.md`
