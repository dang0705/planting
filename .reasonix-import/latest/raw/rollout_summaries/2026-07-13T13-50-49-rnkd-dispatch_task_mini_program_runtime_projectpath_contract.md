thread_id: 019f5bbe-a9ad-7212-b297-537f20f9e8b9
updated_at: 2026-07-13T14:39:45+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/13/rollout-2026-07-13T21-50-49-019f5bbe-a9ad-7212-b297-537f20f9e8b9.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# The repo’s dispatch-task and mini-program QA contracts were hardened so Web/external implementer runs with mini-program automator testing must carry an explicit `validation.miniprogram_automator_required` flag, and the validator/completion gate must enforce the correct `projectPath` for the current worktree.

Rollout context: the user wanted to eliminate the old ambiguity around QA/runtime verification for mini-program automation, especially when the implementation comes from a Web/云端 external implementer and the runtime evidence must come from the correct worktree rather than the main workspace.

## Task 1: Reconcile mini-program runtime QA with worktree-based external implementer runs

Outcome: success

Preference signals:

- The user repeatedly drove the agent from “先做定点验证” to “两个一起做掉”, then accepted the follow-up approach; this suggests they want contract changes plus verification to be completed as a pair, not left as a doc-only suggestion.
- The user’s repeated focus on `projectPath` for `miniprogram-automator` indicates they care about the exact runtime evidence source, not just generic “QA passed” output.

Key steps:

- The agent inspected the dispatch-task and mini-program automator skills, plus the QA/runtime validator scripts, to find where the current contract was expressed.
- The agent changed `miniprogram-automator-runtime` so `projectPath` is no longer a hard-coded main-workspace path for all cases; it now distinguishes normal local tasks from Web/云端 external implementer runs that must use `<planned_worktree_path>/dist/dev/mp-weixin`.
- The agent updated the external implementer routing rules so if a mini-program automator check is required, the worktree path must be consistent across LAN local-functions, DevTools, `9420`, automator, screenshots, and `wx.request` evidence.

Failures and how to do differently:

- The first attempt to update the QA reference doc missed the exact context; the agent recovered by re-reading the files and applying smaller patches.
- A temporary negative-path check initially hit a file-creation race (`ENOENT`) instead of the intended rule failure; rerunning sequentially produced the desired `projectPath` block and showed the validator was enforcing the rule correctly.

Reusable knowledge:

- In this repo, `miniprogram-automator` QA cannot be treated as a generic “端上通过” signal; the project path must be explicitly tied to the current contract/worktree.
- For Web/external implementer runs, the runtime evidence and the worktree source of truth need to match end-to-end; otherwise the validator should treat it as a configuration blocker.

References:

- [1] `.codex/skills/miniprogram-automator-runtime/SKILL.md` now defines a `projectPath` contract with a special case for Web/云端 external implementer worktrees.
- [2] `.codex/skills/miniprogram-automator-runtime/references/recovery-checklist.md` now asks for `<projectPath>` rather than a fixed main-workspace path.
- [3] `.codex/skills/dispatch-task/references/external-implementer-routing.md` now requires mini-program automator evidence to stay within a single worktree and marks cross-worktree evidence as `devtools_configuration_blocker`.
- [4] Validation proof: `validate-result.mjs` passed for a QA fixture with `runtime_context.projectPath=/tmp/planting-pr-runtime-001/dist/dev/mp-weixin` and blocked when the path was changed back to `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`.

## Task 2: Make the runtime requirement explicit in handoff, QA, and completion gates

Outcome: success

Preference signals:

- The user explicitly approved the plan to “两个一起做掉”, indicating they wanted both the formal example artifacts and the completion-gate enforcement, not just one layer of protection.
- The sequence “好，允许” after the proposed contract hardening suggests the user was comfortable with a stronger schema-level change, not merely a script tweak.

Key steps:

- The agent added `validation.miniprogram_automator_required` to the handoff schema and made `validate-handoff.mjs` fail if the field is missing when acceptance mentions mini-program runtime concepts.
- The agent updated `validate-result.mjs` so QA/runtime checks must carry `runtime_context` when `validation.miniprogram_automator_required=true`, and the runtime `projectPath` is checked against the expected worktree path.
- The agent updated `qa-reviewer.toml` so QA output explicitly includes `checks_and_evidence` entries with `runtime_context` for mini-program automator runs.
- The agent added example handoff/result/QA JSON files for a Web external implementer runtime flow, plus companion worktree/no-new-deps/style-stack reports, so the contract can be validated as a complete chain.
- The agent also hardened `validate-completion-readiness.mjs` so Completion Gate independently rechecks the runtime `projectPath` constraint instead of trusting only the lower-level QA validator.

Failures and how to do differently:

- One patch attempt failed because the target doc context didn’t match; the agent recovered by narrowing the edit to the scripts first, then adding the docs/example files separately.
- The first new external-result example failed `validate-result external` because it was missing preexisting schema fields; the agent fixed the example by adding the expected generic recovery fields (`source`, `external_handoff_manual`, diff-recovery flags, etc.) before rerunning.

Reusable knowledge:

- `validation.miniprogram_automator_required` is now the stable switch for mini-program runtime QA; this is better than inferring the requirement from acceptance text alone.
- `validate-completion-readiness.mjs` now enforces the same runtime-path rule as `validate-result.mjs`, so a bad `projectPath` can be blocked even if a lower layer is bypassed.
- When the runtime requirement is enabled, `qa-result.json` must carry a `checks_and_evidence` item with `runtime_context.channel="miniprogram_automator"`, a `projectPath`, and a page path.

References:

- [1] `.codex/skills/dispatch-task/scripts/validate-handoff.mjs` now requires `validation.miniprogram_automator_required` and checks it against acceptance text.
- [2] `.codex/skills/dispatch-task/scripts/validate-result.mjs` now validates QA runtime context and expected worktree-based `projectPath`.
- [3] `.codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs` now revalidates runtime `projectPath` at completion time.
- [4] `.codex/agents/qa-reviewer.toml` now requires runtime context in QA output for mini-program automator checks.
- [5] Example artifacts added under `.codex/skills/dispatch-task/examples/`:
  - `web-external-miniprogram-runtime-handoff.json`
  - `web-external-miniprogram-runtime-external-result.json`
  - `web-external-miniprogram-runtime-qa-result.json`
  - `web-external-miniprogram-runtime-worktree-scope-report.json`
  - `web-external-miniprogram-runtime-no-new-deps-report.json`
  - `web-external-miniprogram-runtime-style-stack-report.json`
- [6] Validation proof: the positive chain passed for handoff/result/QA/completion; the negative chain with a main-workspace `projectPath` was blocked with `Completion Gate QA automator check #1 runtime_context.projectPath must match expected projectPath: /tmp/planting-pr-example-web-runtime-001/dist/dev/mp-weixin`.

