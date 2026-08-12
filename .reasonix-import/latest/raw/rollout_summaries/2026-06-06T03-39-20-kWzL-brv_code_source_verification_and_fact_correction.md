thread_id: 019e9b03-886d-7142-89f0-93a72fdb7e51
updated_at: 2026-06-06T03:47:48+00:00
rollout_path: /Users/jay/.codex/sessions/2026/06/06/rollout-2026-06-06T11-39-20-019e9b03-886d-7142-89f0-93a72fdb7e51.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Strict BRV fact verification against current code, with code as the source of truth

Rollout context: The user asked (in Chinese) to strictly verify whether BRV-recorded memories matched the current code logic, and to correct any mismatch using the code as the factual source rather than documentation or memory. The work was done in `/Users/jay/WebstormProjects/planting`.

## Task 1: Verify BRV facts against current code and correct mismatches

Outcome: success

Preference signals:
- The user explicitly said: "严格校验 `brv` 记录的记忆与当前代码逻辑的事实是否相符?如遇到记忆与文档,代码逻辑不符,以代码逻辑为事实源矫正." -> future runs should treat code as the authoritative source when BRV/doc memory conflicts arise.
- The user’s instruction implied a strong preference for correction over explanation: if a fact is stale, update the memory/artifact rather than only reporting the mismatch.

Key steps:
- The agent first located BRV-related files and the active manifest/scoped context tree, then read the main BRV governance files and source-verified fact files.
- The agent inspected the real code paths in `cloudfunctions/diagnose-http`, `cloudfunctions/storage-http`, `cloudfunctions/layer/utils/http.js`, `scripts/validate-brv-context-lifecycle.mjs`, and the test scripts to compare against the BRV statements.
- The validation script `node scripts/validate-brv-context-lifecycle.mjs` initially failed because many fact entries were missing `source_kind` and `source.lines`; the agent corrected the BRV files to satisfy the validator.
- A concrete stale fact was found and fixed: the frontend package submit guard fact pointed to `src/pages/diagnose/follow-up/payload.js`, but the real `buildFollowUpPayload` implementation lives in `src/utils/diagnose-follow-up-payload.js`.
- The agent also corrected the stale budget wording that said the system had a global “two rounds” limit; current code shows `routeSelection.maxQuestionsPerRound = 1`, `maxRounds = 4`, `maxFollowUpRounds = 0`, and `canOpenNextFollowUpRound()` returns `true`.
- The validation result was re-run successfully after fixes.

Failures and how to do differently:
- A first attempt to treat some facts as source-verified failed because `source_kind` and `source.lines` were absent; future BRV edits should always include these fields for `type: fact` entries.
- Some source ranges were initially wrong or incomplete; future runs should verify line ranges directly from `nl -ba` or equivalent before writing them into BRV facts.
- One stale source reference pointed at a file that no longer contains the claimed function. Future similar work should always confirm the implementation file before keeping the existing source pointer.

Reusable knowledge:
- `scripts/validate-brv-context-lifecycle.mjs` enforces that facts have `status: verified`, `source_kind`, `source.file`, and `source.lines`, and it defaults to manifest-scoped active contexts.
- Current diagnosis routing facts in code are:
  - `routeSelection.maxQuestionsPerRound: 1`
  - `routeSelection.maxRounds: 4`
  - `routeSelection.maxFollowUpRounds: 0`
  - `canOpenNextFollowUpRound()` currently returns `true`
- The public result contract is still route-backed: `visibleOutcomes` / `visibleOutcomeKeys` are the authoritative visible exits, and `buildPublicRouteFinalResult` strips legacy `primaryOutcome` / `secondaryOutcomes` from the public result while merging visible entries.
- Storage upload validation in `cloudfunctions/storage-http/app.js` requires `data:image/...;base64` input and an allowed suffix set; it also checks user identity via `resolveHttpUserInfo` before write/read operations.
- The BRV validation script’s output is a good source of truth for whether the current BRV context tree is internally consistent.

References:
- [1] Validation command and results: `node scripts/validate-brv-context-lifecycle.mjs` -> `PASSED (12 files, 106 entries, 55 facts)`; `--include-non-manifest` -> `PASSED (58 files, 161 entries, 74 facts)`.
- [2] Fixed source reference: `.brv/context-tree/architecture/frontend/source_verified_frontend_facts.md` now points `F-FRONTEND-PACKAGE-SUBMIT-GUARD-007` to `src/utils/diagnose-follow-up-payload.js` lines `27-80`.
- [3] Correct budget facts are backed by `cloudfunctions/diagnose-http/constants/scoring.js` lines `23-27` and `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` lines `1056-1058`.
- [4] `cloudfunctions/storage-http/app.js` identity + upload validation path: `resolveHttpUserInfo` guard at lines `295-299`, upload validation at lines `40-87`, `105-142`, `255-267`.
- [5] The BRV source verification snapshot was updated to reflect the new validation outcome and current source root.
