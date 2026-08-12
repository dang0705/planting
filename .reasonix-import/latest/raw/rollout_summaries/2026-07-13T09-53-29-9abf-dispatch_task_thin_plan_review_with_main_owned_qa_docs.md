thread_id: 019f5ae5-5e1a-7e42-91ed-ef24c3a77179
updated_at: 2026-07-14T05:25:07+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/13/rollout-2026-07-13T17-53-29-019f5ae5-5e1a-7e42-91ed-ef24c3a77179.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Reviewed a plan to thin `dispatch-task` gates, then re-evaluated it after the user clarified that `qa-reviewer` and `docs-keeper` had already been moved back to main.

Rollout context: the user asked for a review of `/Users/jay/.cursor/plans/Thin dispatch-task gates-7ea5d932.plan.md` and wanted an assessment of its benefits and risks. The review was done against the live `dispatch-task` implementation and validators in `/Users/jay/WebstormProjects/planting`, with extra focus on the new Web/TRAE remote-sync/worktree contract and the mini-program automator projectPath contract.

## Task 1: Review the dispatch-task thinning plan

Outcome: partial

Preference signals:
- The user first asked for a review of the plan, then corrected the evaluation context with: “`qa-reviewer` 和 `docs-keeper`已经回收到main 侧.基于这两点你再评估” -> future evaluations should incorporate updated operational context before judging whether cleanup of QA/docs roles is safe.
- The user’s correction implies they want the review to distinguish between “role receipts” that are now redundant and the remaining machine-checkable evidence needed for runtime QA.

Key steps:
- Read the plan file directly and compared it to current `dispatch-task` rules in `SKILL.md`, `validate-completion-readiness.mjs`, `validate-result.mjs`, `mini-program-runtime-qa.md`, and the `qa-reviewer.toml` / `docs-keeper.toml` agent files.
- Checked that current completion logic still requires main-owned QA evidence when `qa_required=true`, including runtime context fields such as `projectPath`, `pagePath`, and automator port.
- Re-read the plan after the user clarified that QA/docs roles had already been repatriated to main, which lowered the risk of deleting the deprecated agent files but did not remove the need for machine-checkable runtime evidence.

Failures and how to do differently:
- The plan’s most aggressive step is to make QA evidence too thin: it replaces role receipts with a minimal `runtime-evidence.json` that only carries paths and a few selectors. That would weaken the current ability to prove a Web/worktree run used the correct `dist/dev/mp-weixin` path and would make it easier to pass with only an artifact path instead of meaningful status/failed/not-verified signals.
- The plan also proposes deleting `qa-reviewer.toml` and `docs-keeper.toml`; after the user clarified those roles are already recovered to main, deleting them is less risky, but only if their remaining behavior rules are first migrated into `SKILL.md` / references / validators.
- The plan should not be executed as-is because it mixes a valid simplification goal with a too-radical reduction of runtime QA evidence.

Reusable knowledge:
- Current completion validation still treats `qa_required=true` as requiring `main-qa-receipt.json` and checks runtime context against the contract’s `projectPath` / automator requirements.
- For Web/cloud external-implementer work, the runtime QA contract is intentionally tied to `external_contract.remote_sync.planned_worktree_path`, so any thinning plan must preserve the ability to verify the worktree-specific `dist/dev/mp-weixin` path.
- A safer thinning direction is to collapse role-style receipts and merge redundant postflight reports, while keeping compact but machine-checkable QA evidence fields (`status`, `checks`, `failures`, `not_verified`, `runtime_context.projectPath`, `pagePath`, `automator_port/wsEndpoint`, `evidence_paths`).

References:
- [1] Plan highlights: lines 31-36 define “产物必要性”, but line 36 says main QA/docs/BRV should “执行即可，不写 receipt”.
- [2] Plan risk points: lines 68-72 remove `validate-result main_qa` and change Completion Gate to only accept a compact runtime evidence file.
- [3] Live validator: `validate-completion-readiness.mjs` still requires `main-qa-receipt.json` when `qa_required=true` and checks `runtime_context.channel=miniprogram_automator` plus `projectPath/pagePath/automator_port`.
- [4] Live runtime QA contract: `mini-program-runtime-qa.md` line 22 requires Web/cloud external-implementer runs to use `external_contract.remote_sync.planned_worktree_path/dist/dev/mp-weixin`.
- [5] Deprecated agent files still present but marked deprecated: `.codex/agents/qa-reviewer.toml` and `.codex/agents/docs-keeper.toml`.

## Task 2: Re-evaluate after the user clarified QA/docs are back on main

Outcome: success

Preference signals:
- After the user clarified that QA/docs are already on main, the user implicitly signaled they want the review to be calibrated to the current operating model rather than the older “spawn QA/docs subagents” model.
- The follow-up shows the user values receiving a revised judgment instead of a fixed answer when the workflow baseline changes.

Key steps:
- Reframed the recommendation: deleting `qa-reviewer.toml` / `docs-keeper.toml` is now reasonable, but only after their remaining behavior rules are migrated.
- Distinguished between role-style receipts and the evidence that still needs to survive in a thinner design.
- Recommended a safer replacement: keep a compact, machine-checkable runtime QA evidence shape instead of a path-only `runtime-evidence.json`.

Failures and how to do differently:
- The plan’s original wording still needs one correction: `runtime-evidence.json` should not be reduced to path-only evidence; it needs to preserve status and failure/blocked semantics.
- The right review posture is to treat docs/BRV receipts as more aggressively removable than runtime automator evidence.

Reusable knowledge:
- Once QA/docs are main-owned, the meaningful simplification target becomes “remove role receipts and duplicate gate machinery,” not “remove the ability to machine-verify runtime behavior.”
- Postflight consolidation is a good low-risk simplification candidate if it preserves the three underlying gate statuses and error payloads.

References:
- [6] User clarification: “`qa-reviewer` 和 `docs-keeper`已经回收到main 侧.基于这两点你再评估`”.
- [7] Revised recommendation given: delete deprecated QA/docs agent files only after migrating rules, but keep a compact runtime QA evidence schema with status/failure/projectPath fields.

