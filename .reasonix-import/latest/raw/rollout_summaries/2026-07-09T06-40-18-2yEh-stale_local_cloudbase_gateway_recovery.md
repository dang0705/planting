thread_id: 019f459b-1317-7fd3-9ea3-2f22907a3879
updated_at: 2026-07-09T06:54:13+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/09/rollout-2026-07-09T14-40-18-019f459b-1317-7fd3-9ea3-2f22907a3879.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Fixed stale local CloudBase gateway recovery for mp-weixin LAN dev flow

Rollout context: In `/Users/jay/WebstormProjects/planting`, the user reported `npm run dev:mp-weixin:local-functions:lan` failing during local CloudBase function readiness with a timeout after `plant-user-http: 502` (`LOCAL_FUNCTION_PROXY_FAILED` / `connect ECONNREFUSED 127.0.0.1:9002`) and asked to “修复”. The work happened in a dirty repo with many unrelated changes already present, so the agent repeatedly constrained edits to the local dev gateway scripts and preserved pre-existing modifications.

## Task 1: Fix local-functions LAN startup when a worker dies behind an apparently healthy gateway

Outcome: success

Preference signals:
- The user’s failure report was the concrete target: `dev:mp-weixin:local-functions:lan` timed out after `plant-user-http: 502` and the user asked only “修复” -> future similar reports should be treated as a request to fix the dev/runtime path, not frontend code.
- The user implicitly cared about the end-side `mp-weixin` LAN flow, not a scoped health check -> future debugging should prioritize the full `npm run dev:mp-weixin:local-functions:lan` readiness gate and the mini-program local gateway behavior.
- During review, the agent found and fixed a second issue in the same area after the user-facing bug: `SIGINT`/`SIGTERM` shutdown handling in the gateway -> future runs should expect small signal-handling edge cases to matter in this script family.

Key steps:
- Reproduced the failure path locally and confirmed `3010` gateway health was green while `plant-user-http` on `9002` refused connections, proving the issue was a stale worker behind a live gateway rather than a frontend routing problem.
- Verified `plant-user-http` could start cleanly when launched in isolation, which narrowed the bug to stale gateway/worker recovery rather than the CloudBase function itself.
- Captured a worktree baseline because the repo was already dirty and the fix had to avoid unrelated edits.
- Built a Handoff Contract and dispatched a bounded `implementer_fast` task limited to `scripts/dev/run-local-api-env.mjs` and `scripts/dev/local-functions-gateway.mjs`.
- The implementer added gateway identity + worker liveness to `/__local_functions__/health`, made the gateway exit when a worker exits, and taught `run-local-api-env.mjs` to detect stale repo-owned gateways, kill the listener pid, and restart the full local gateway automatically.
- After review found the signal-handler bug, the same implementer thread was reused for a narrow返工 so `SIGINT`/`SIGTERM` now call `shutdown(0)` via closure instead of passing the signal string into `process.exit()`.
- Ran completion gates and real runtime checks: syntax check, lint, format check, worktree scope, no-new-deps, style stack, completion readiness, a normal LAN readiness run, and a mocked stale-gateway recovery run.

Failures and how to do differently:
- A first draft of the implementer result used validator-invalid statuses like `not_run` / `passed_with_warnings`; the main thread had to normalize the JSON before Gate C passed. Future similar threads should keep result enums aligned with the validator contract from the start.
- The review surfaced a real shutdown edge case in `local-functions-gateway.mjs`; future work in this file should always verify Node signal listener semantics before trusting a direct `process.on('SIGINT', shutdown)` pattern.
- The repo had many unrelated dirty files; future agents should keep the fix narrowly scoped and never assume `git status` noise is part of the current task.

Reusable knowledge:
- `scripts/dev/run-local-api-env.mjs` is the gatekeeper for `npm run dev:mp-weixin:local-functions:lan`; it now detects a repo-owned stale gateway when health is green but a required route returns `LOCAL_FUNCTION_PROXY_FAILED` / `ECONNREFUSED`, kills the old listener, and restarts the gateway.
- `scripts/dev/local-functions-gateway.mjs` now exposes gateway metadata and per-function liveness in `/__local_functions__/health`, and it exits when a worker exits so the gateway can’t remain falsely green.
- The worker port map used by the local functions gateway is `diagnose-http=9000`, `plant-catalog-http=9001`, `plant-user-http=9002`, `identify-http=9003`, `diagnosis-history-http=9004`, `auth-user-http=9005`, `weather-http=9006`, `storage-http=9007`.
- A normal LAN readiness check that should now work is `node scripts/dev/run-local-api-env.mjs --mode=lan -- node -e "console.log('lan-ready')"`; in this rollout it successfully started the full function set and printed `lan-ready`.
- The stale-gateway recovery path was separately verified with a mocked legacy 3010 gateway that returned healthy root health but `plant-user-http` 502; the script detected stale state, recovered, and ran the child command successfully.

References:
- [1] User failure report: `npm run dev:mp-weixin:local-functions:lan` → `本地 CloudBase 函数 health route 尚未全部就绪。 - plant-user-http: 502` with stack pointing to `scripts/dev/run-local-api-env.mjs`.
- [2] Final changed files: `scripts/dev/run-local-api-env.mjs`, `scripts/dev/local-functions-gateway.mjs`.
- [3] Validation evidence: `node --check scripts/dev/run-local-api-env.mjs` and `node --check scripts/dev/local-functions-gateway.mjs` passed; `npm run lint -- scripts/dev/run-local-api-env.mjs scripts/dev/local-functions-gateway.mjs` exited 0 with only pre-existing `no-magic-numbers` warnings; `npm run fmt:check -- ...` passed.
- [4] Runtime verification: `node scripts/dev/run-local-api-env.mjs --mode=lan -- node -e "console.log('lan-ready')"` printed `本地 CloudBase 函数 gateway 未运行，正在自动启动...`, started all eight functions, passed the weather probe, and ended with `lan-ready`.
- [5] Stale gateway simulation: a mock 3010 gateway with `/__local_functions__/health` ok and `/plant-user-http/user-plants/health` returning `502 LOCAL_FUNCTION_PROXY_FAILED` was detected as stale, recovered, and allowed the child command to run.
- [6] Review-fix evidence: Node signal listeners pass arguments (`["SIGINT",2]` in the local probe), so the final gateway shutdown path uses `shutdown(0)` closures for SIGINT/SIGTERM and retains `shutdown(1)` for worker failure.
- [7] Final completion gate: `node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs ...` returned `{"status":"passed","gate":"completion_readiness","dispatch_run_id":"dispatch-local-functions-stale-gateway-20260709"}`.
