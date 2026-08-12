thread_id: 019ec192-a7cd-7c93-8cab-7ed7b8d051eb
updated_at: 2026-06-13T17:58:32+00:00
rollout_path: /Users/jay/.codex/sessions/2026/06/13/rollout-2026-06-13T23-21-14-019ec192-a7cd-7c93-8cab-7ed7b8d051eb.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Standardized the project’s WeChat mini-program runtime QA path away from WeChat DevTools MCP and onto a single `miniprogram-automator / 9420` default.

Rollout context: The user’s active goal was to stabilize the dispatch-task workflow for mini-program end-side automation and remove the wrong/default paths that were causing QA to drift into unstable recovery behavior. The work focused on repo governance, agent configs, QA contracts, and BRV/doc hygiene rather than product code.

## Task 1: Replace MCP-priority automation with automator-priority runtime QA

Outcome: success

Preference signals:
- The user’s objective repeatedly emphasized finding the correct workflow and “连根拔出错误的方式” for qa_reviewer; that aligns with a durable preference for removing old workflow paths rather than just patching around them.
- The user wanted the workflow to support “不同的 端上 自动化测试”, which implies the next agent should default to a stable runtime QA path, not a fragile tool-specific abstraction.

Key steps:
- Audited the active repo rules, QA policies, implementation/test contracts, completion gate, BRV context, and local skill files.
- Identified that multiple active docs still treated WeChat DevTools MCP / `open(cdp_enabled=true)` / `pkill` / full restart / `cache_clean(all)` as normal or fallback behavior.
- Added a new active runtime skill: `.codex/skills/miniprogram-automator-runtime/` with a recovery checklist and direct `9420` / WebSocket / `miniprogram-automator` evidence model.
- Deleted the old `.codex/skills/wechat-mcp-transport-recovery/` active skill and its recovery checklist.
- Rewrote active dispatch, QA, implementer, and QA evidence docs to make `miniprogram-automator / 9420` the default end-side validation path, with `dist/dev/mp-weixin` as the fixed projectPath.
- Updated docs and BRV records so active search/recall surfaces point to the new runtime automator path instead of the deleted MCP transport-recovery path.
- Verified with `npm run check:brv-context-lifecycle`, `git diff --check`, and a targeted `rg` sweep; then committed the changes as `e152065 standardize automator qa`.

Failures and how to do differently:
- A docs_keeper follow-up thread never returned before timeout; the main thread finished the hygiene work and commit without spawning another same-role thread, which avoided a reuse violation.
- The first `git diff --check` found one trailing whitespace issue in `.codex/skills/dispatch-task/SKILL.md`; it was fixed and rechecked successfully.
- `.brv/` remains git-ignored, so BRV sync must be validated with `brv`/lifecycle checks rather than Git status alone.

Reusable knowledge:
- The stable runtime QA path is now treated as `dist/dev/mp-weixin -> 9420 -> miniprogram-automator -> page / wx.request evidence`.
- `status`, `9222`/CDP, and screenshots are tool-state only; they do not prove end-side QA.
- For diagnosis flows, the stable selector map in `docs/ai-rules/frontend-automation-id-policy.md` remains the required entrypoint for selectors and assertions.
- The repo’s active QA contract now requires `projectPath=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`; `dist/build/mp-weixin` is only for build/CI/upload paths.

References:
- [1] Commit: `e152065 standardize automator qa`
- [2] Validation: `npm run check:brv-context-lifecycle` → `PASSED (15 files, 74 entries, 43 facts)`
- [3] Validation: `git diff --check` clean after fixing one trailing whitespace issue
- [4] Deleted active recovery skill: `.codex/skills/wechat-mcp-transport-recovery/SKILL.md`
- [5] Added active runtime skill: `.codex/skills/miniprogram-automator-runtime/SKILL.md`
- [6] Rewritten active QA policy: `.codex/skills/dispatch-task/references/wechat-devtools-automation-policy.md`

