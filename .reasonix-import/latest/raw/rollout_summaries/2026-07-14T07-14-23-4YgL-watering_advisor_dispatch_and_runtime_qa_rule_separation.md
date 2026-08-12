thread_id: 019f5f7a-1409-7c43-b234-9e869951afbf
updated_at: 2026-07-17T00:16:48+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T15-14-23-019f5f7a-1409-7c43-b234-9e869951afbf.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Dispatch-task bug investigation followed by deep runtime-QA rule separation

Rollout context: `/Users/jay/WebstormProjects/planting`; user first requested a Trae-dispatched fix for the independent watering advice navigation bug, then shifted to a governance/documentation task asking for a line-by-line separation of mini-program runtime implementation details, business rules, and dispatch acceptance contracts.

## Task 1: Diagnose and dispatch the watering-advisor navigation bug

Outcome: partial

Preference signals:
- The user specified that clicking “从我的植物选” must show the “我的植物” list, “不是返回” -> future agents should treat this as forward navigation into the existing plant-list/profile route, not as a back-navigation flow.
- When offered handling options for a dirty workspace, the user replied `2` to include all current changes in the Trae baseline -> when explicitly selected, proceed with a full baseline commit rather than asking again.

Key steps:
- Located the direct bug in `src/pages/watering-advisor/watering-advisor.vue`: `goToMyPlants()` called `uni.navigateBack()` at the time of inspection.
- Confirmed the existing profile list route is `/pages/profile/profile`, configured as a tab page in `src/pages.json`; the intended implementation contract was to navigate there without altering the independent watering-advice flow.
- Initial Web/Trae dispatch was blocked because the workspace contained many unrelated staged/untracked changes. After user approval (`2`), committed and pushed the complete baseline to branch `trae/20260714-watering-advisor-my-plants` (`062ec92` after removing the accidental `--help` artifact).
- Created and validated an external handoff and prompt. `validate-handoff.mjs` passed; the prompt initially failed missing provider/role/manual wording, was corrected, and `validate-external-prompt.mjs` then passed.
- Opened the controlled in-app TRAE page at `https://work.enterprise.trae.cn/`, verified host, Code tab selected (`aria-selected=true`, `tabActive-` class), contenteditable input, and enabled send button. The prompt was pasted and the sentinel was visible before sending.

Failures and how to do differently:
- The actual Trae implementation, recovery, PR/worktree review, and mini-program runtime QA were not shown to complete in this rollout. Do not claim the business bug is fixed based on the provider send alone.
- A probe command accidentally created a file named `--help`; it was removed in a follow-up commit. Avoid commands that pass `--help` as a positional script argument.
- The first prompt failed validation because it did not explicitly identify the Web/cloud external implementer, include the exact handoff manual path, or require `status=working`; include all validator-required role/manual language before sending.
- External Web completion still requires PR/worktree evidence, diff review, postflight, and runtime QA; provider chat completion is not authoritative.

Reusable knowledge:
- Relevant files/routes: `src/pages/watering-advisor/watering-advisor.vue`, `src/pages/index/index.vue`, `src/pages.json`, and `src/pages/profile/profile.vue`.
- Web external runs require a pushed baseline, explicit remote branch/worktree, `validation.allow_head_change=true`, `head_change_reason=web_external_remote_sync`, and worktree-scoped runtime evidence.
- For TRAE Web, validate `work.enterprise.trae.cn`, Code tab selected through both `aria-selected="true"` and `tabActive-`, the real contenteditable input `.chat-input-v2-input-box-editable`, and enabled `.chat-input-v2-send-button` before sending.

References:
- [1] Bug location: `src/pages/watering-advisor/watering-advisor.vue`, `goToMyPlants()` contained `uni.navigateBack()`.
- [2] Baseline branch: `trae/20260714-watering-advisor-my-plants`; pushed baseline commit `062ec92`.
- [3] Validator results: `validate-handoff.mjs` passed; corrected prompt validation passed with `chars: 3359`.
- [4] TRAE send readiness: host `work.enterprise.trae.cn`, Code tab selected, input count `1`, send enabled `true`, handoff sentinel visible.

## Task 2: Separate dispatch QA contracts from mini-program automator implementation and business rules

Outcome: success

Preference signals:
- The user repeatedly challenged the initial cleanup as insufficient: “不够吧，你认真分析 mini-program-runtime-qa.md 规则，我觉得还是有较多的实施细节被定义在了这里” and later “继续深度，逐行分析。规则里还有很多业务” -> future agents should perform a literal line-by-line ownership audit, not only move the most obvious rules.
- The user wants a strict source-of-truth split: dispatch documents define what must be accepted and evidenced; the runtime skill defines how automator/DevTools actions are performed; domain/business rules belong elsewhere.
- The user accepted direct edits (“那你来改吧”) and expected actual file changes plus validation, not merely recommendations.

Key steps:
- Read both `.codex/skills/dispatch-task/references/mini-program-runtime-qa.md` and `.codex/skills/miniprogram-automator-runtime/SKILL.md`, plus skill-creator guidance and ByteRover memory.
- Moved/retained runtime implementation details in `miniprogram-automator-runtime/SKILL.md`: DevTools reuse and PID/project checks, 9420 setup, automator connection, real-entry navigation, scrolling, screenshot behavior, selector/scoped-ID handling, and runtime failure classification.
- Compressed `mini-program-runtime-qa.md` to dispatch-level contract concerns: explicit runtime mode, worktree/projectPath integrity, evidence fields, status/failure semantics, batch substitution approval, fixture provenance at a generic level, main-owned QA, and screenshot evidence requirements. Removed business-specific references such as user-vs-catalog plants, PotCanvas, pot dimensions, diagnosis endpoints, plant IDs, project-specific endpoint/port examples, and named feature pages.
- Replaced business-specific examples in the runtime skill with generic `feature-action-button-{entityId}`, `feature-action-{entityId}`, and `feature-panel` examples.
- Verified referenced runtime/local-smoke files exist and ran `git diff --check` successfully.

Failures and how to do differently:
- The official `quick_validate.py` could not run in either system Python or Codex’s bundled Python because `yaml`/PyYAML was unavailable (`ModuleNotFoundError: No module named 'yaml'`). A dependency-free frontmatter check was used instead; future validation should install/use the expected YAML dependency only if authorized.
- The first documentation pass left substantial business and operational details in the dispatch reference; future audits should classify every rule as contract/evidence, runtime procedure, or domain-specific policy before editing.
- The runtime skill still contains the repository’s default absolute `projectPath` (`/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`), which was intentionally retained as environment configuration rather than business logic.

Reusable knowledge:
- Canonical split: `mini-program-runtime-qa.md` answers “when/what evidence/what gate”; `miniprogram-automator-runtime/SKILL.md` answers “how to connect, interact, scroll, locate, screenshot, and classify runtime failures.”
- Runtime QA remains machine-checkable: preserve `status`, `failures`, `not_verified`, `runtime_acceptance_mode`, `channel`, `projectPath`, `pagePath`, automator endpoint, and `evidence_paths`; do not reduce it to path-only evidence.
- Web external implementer runtime evidence must use `<planned_worktree_path>/dist/dev/mp-weixin`, not the main workspace.
- The runtime skill references `references/local-smoke-test-and-lan-direct-connection-policy.md` for local HTTP/gateway troubleshooting instead of embedding those project-specific details in the main skill.

References:
- [5] Dispatch contract edited: `.codex/skills/dispatch-task/references/mini-program-runtime-qa.md`.
- [6] Runtime implementation source edited: `.codex/skills/miniprogram-automator-runtime/SKILL.md`.
- [7] Validation: `git diff --check` passed; frontmatter checks reported `frontmatter=True name=True description=True` for both skills.
- [8] Official validator failure: `ModuleNotFoundError: No module named 'yaml'` from `quick_validate.py`.
- [9] ByteRover retrieval reinforced the rule that runtime implementation details should live in a dedicated authoritative runtime policy/skill while dispatch retains machine-checkable evidence and worktree contracts.
