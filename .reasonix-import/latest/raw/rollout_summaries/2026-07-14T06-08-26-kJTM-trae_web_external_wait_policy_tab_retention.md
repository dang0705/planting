thread_id: 019f5f3d-b1f4-7723-9087-169b9360bf06
updated_at: 2026-07-14T07:09:50+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T14-08-26-019f5f3d-b1f4-7723-9087-169b9360bf06.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Web external implementer waiting/retention rules were tightened after the user flagged that 60s short waits were being treated like a normal web-agent check.

Rollout context: the user was reviewing Codex/Trae external-implementer behavior in the `planting` repo and objected that the observed 60-second wait looked like a formal default for web-agent completion, which would violate the intended external-implementer minimum wait / low-frequency check design.

## Task 1: Reopen Trae via in-app browser, verify identity behavior, and update the dispatch-task rules

Outcome: success

Preference signals:
- The user said: “我刚刚看到你对于web agent的标准等待时间是60秒…如果没有设计，就按main进程保持每5分钟低频检查内置浏览器 web agent状态。” -> future external-implementer work should not treat 60s as a completion wait; main should default to 5-minute low-frequency checks for real web-agent completion monitoring.
- After the user questioned whether the in-app browser had been manually closed, they asked to “将这点纳入规则，然后用新的规则再次打开内置浏览器，发送给trae” -> future browser/provider flows should make the browser/tab-retention behavior an explicit contract, not a hidden lifecycle assumption.
- The user’s wording about “内置浏览器 web agent状态” indicates they care about the provider being observed through the Codex in-app browser path, not through ambient Chrome or ad-hoc UI state.

Key steps:
- Reopened Trae through the Codex in-app browser and sent an identity probe.
- Updated the dispatch-task rules to require explicit Trae tab retention after successful send, using `browser.tabs.finalize({ keep: [{ tab, status: "handoff" }] })` and recording `tab_retention` in send receipts.
- Added validator enforcement so a Codex Desktop web-external send receipt must include `tab_retention` and the new `external_wait_policy` fields.
- Added `external_wait_policy` to distinguish short probe waits from formal completion monitoring.
- Verified the new rules by running the validator against a positive example and a blocked negative example.

Failures and how to do differently:
- The rollout showed that a short wait can be appropriate for a one-off probe or for confirming that a session started, but not for deciding that a web external implementer is done.
- Browser Use’s default lifecycle can clean up tabs in a way that looks like the session disappeared; the new rule is to explicitly preserve the provider tab as a handoff artifact instead of relying on default cleanup behavior.
- The user’s concern implies that future agents should treat any 60s/90s completion timeout in web-external flows as suspicious unless it is explicitly limited to a non-completion probe.

Reusable knowledge:
- For `implementation_mode=external_implementer` on Codex Desktop web/provider flows, the send receipt now needs two extra contracts: `tab_retention` and `external_wait_policy`.
- `tab_retention` is the durable indicator that the TRAE tab should survive as a handoff artifact; `tab_retention.status` should be `handoff`, and the retention method should be `browser.tabs.finalize.keep`.
- `external_wait_policy` should encode the formal monitoring cadence for real completion checks: `mode=child_run_lock`, `initial_check_min_minutes>=5`, `poll_interval_min_minutes>=5`, and `short_timeout_completion_forbidden=true`.
- Short waits are acceptable only for immediate UI/sending probes, not for completion or failure judgments.

References:
- [1] Updated rule file: `.codex/skills/dispatch-task/SKILL.md` — added explicit 5-minute child-run-lock web-external checking and tab retention requirement.
- [2] Updated routing reference: `.codex/skills/dispatch-task/references/external-implementer-routing.md` — added TRAE tab handoff retention and web-agent wait-policy language.
- [3] Updated validator: `.codex/skills/dispatch-task/scripts/validate-result.mjs` — now requires `tab_retention` and `external_wait_policy` for Codex Desktop web external send receipts.
- [4] Updated example contract: `.codex/skills/dispatch-task/examples/web-external-miniprogram-runtime-external-result.json` — includes both `tab_retention` and `external_wait_policy` examples.
- [5] Verification evidence: the negative result with `external_wait_policy.mode=short_probe` and 1-minute checks was blocked, while the positive example passed.
- [6] Trae session used for the probe was `https://work.enterprise.trae.cn/session/6a55de8f88f786f1f88d3db4`, and the browser tab was explicitly retained as `handoff` during the final verification pass.
