thread_id: 019f54e8-1623-7042-8d52-7f9ac2058acf
updated_at: 2026-07-14T03:43:59+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T13-58-44-019f54e8-1623-7042-8d52-7f9ac2058acf.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Dispatch-task workflow was reworked so QA, docs, and BRV are now main-owned, with new main QA receipt contracts and mini-program runtime precheck helpers.

Rollout context: The user asked to correct the project’s task-routing and acceptance workflow after the agent realized the previous “qa_reviewer/docs_keeper” split was inconsistent with the desired model. The work was done in `/Users/jay/WebstormProjects/planting` and focused on dispatch-task governance, Figma/runtime QA, and docs/BRV ownership. The rollout also validated the new rules against example handoffs/results.

## Task 1: Rehome QA/docs/BRV ownership into main-owned receipts and update dispatch gates

Outcome: success with caveat

Preference signals:
- The user’s request was about fixing the workflow contract rather than just patching one validator, implying future similar changes should update the whole rule chain end-to-end, not only a single script.
- The rollout repeatedly converged on “main-owned QA/docs/BRV” receipts, which suggests the stable default for this repo is now to keep QA and document governance in main rather than in separate subagent roles.

Key steps:
- Updated `dispatch-task` and related references so `qa_reviewer` / `docs_keeper` are no longer the active execution path for QA and docs governance.
- Changed handoff/result/completion validators to accept `main_qa` receipts and reject `spawn_contract.qa_agent_type` on new handoffs.
- Added `runtime_acceptance_mode` handling for runtime-heavy tasks, including `automator_required`, `batch_substitute_allowed`, and `batch_only`.
- Added helper scripts for runtime worktree env prep/cleanup and mini-program QA env preflight.
- Updated Figma and mini-program QA policies so main QA must acquire its own baseline and runtime evidence.
- Synchronized active docs and AI rule files to say main owns docs/BRV classification and receipt handling.
- Updated example handoffs and result files to the new main-owned format, and deleted the old QA result example files.

Failures and how to do differently:
- The first version of `runtime_acceptance_mode` was too broad and accidentally made ordinary Figma QA behave like runtime/batch QA. The fix was to make runtime-mode rules optional unless the task explicitly declares runtime validation.
- The validator files remained large; `validate-result.mjs` was already >500 lines before the rollout, while `validate-handoff.mjs` and `SKILL.md` became >500 lines after the edits. If this needs to be cleaned up later, it should be a separate refactor rather than folded into another governance change.
- Two deprecated agent TOML files still exist by design as compatibility stubs; their names remain on disk, but the active rules no longer route to them.

Reusable knowledge:
- `validate-handoff.mjs` now blocks `spawn_contract.qa_agent_type` for new handoffs and requires `main_qa`-style ownership for QA.
- `validate-result.mjs` now validates `main_qa` receipts and expects Figma baseline evidence to say `acquired_by: "main"`.
- `validate-completion-readiness.mjs` now accepts `main-qa-receipt.json`, `main-docs-receipt.json`, and `main-brv-receipt.json`.
- `prepare-runtime-worktree-env.mjs` copies `.env.local` into the planned worktree and only emits redacted key names; `check-miniprogram-qa-env.mjs` verifies projectPath, project.config.json, DevTools CLI presence, `.env.local`, and 9420 listening when `automator_required` is active.
- Example validation showed the following are correctly blocked: `qa_agent_type:"qa_reviewer"` in handoff, `figma_baseline_evidence.acquired_by:"qa_reviewer"`, `automator_required` with batch-only evidence, and `batch_substitute_allowed` without a user approval ref.

References:
- [1] `node .codex/skills/dispatch-task/scripts/validate-handoff.mjs .codex/skills/dispatch-task/examples/figma-ui-handoff.json` -> passed.
- [2] `node .codex/skills/dispatch-task/scripts/validate-result.mjs main_qa ...figma-ui-main-qa-receipt.json` -> passed.
- [3] `node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs ...web-external-miniprogram-runtime-main-qa-receipt.json` -> passed.
- [4] Negative-case smoke: `qa_agent_type` in handoff, `acquired_by:"qa_reviewer"`, automator-required batch-only evidence, and missing batch-substitute approval all produced blocked validator outputs.
- [5] `node --check` passed for the five edited scripts: `validate-handoff.mjs`, `validate-result.mjs`, `validate-completion-readiness.mjs`, `prepare-runtime-worktree-env.mjs`, `check-miniprogram-qa-env.mjs`.
- [6] Residual scan after edits: only deprecated agent TOML files still contain `qa_reviewer` / `docs_keeper` names; active rules no longer do.
