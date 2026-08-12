v1

## User Profile
The user works mainly in `/Users/jay/WebstormProjects/planting` and repeatedly cares about diagnosis-flow contracts, weather/runtime behavior, WeChat mini-program end-side QA, workflow governance, and durable memory/docs/config fixes. Chinese is a normal working language for task contracts, QA evidence, and repo rules.

They prefer runtime truth over proxy reasoning: real subagent runs when requested, real mini-program evidence when QA is claimed, exact file/path/contract references, and concrete policy/config updates when a lesson should become durable. They regularly push work away from “just explain how” and toward actually unblocking the target flow, especially for local-functions and end-side validation.

They also care about semantic correctness in product/data contracts, not just passing tests. Recent weather work shows they will correct subtle boundary violations like forecast data leaking into historical `daily/` storage, and they expect the fix plus the verification shape to reflect that distinction.

For API debugging they prefer repo-traced truth over generic docs: verify the actual execution path, show directly runnable requests, and leave reusable artifacts in the project when that will save follow-up effort.

## User preferences
- Use the exact requested tool, transport, or thread shape; if that exact path is unavailable, stop and say so instead of improvising a fallback.
- When asked to spawn a subagent and ask it something, do the real spawn/query in that subagent thread; if the user specifies the exact role, count, or `fork_context=false`/`fork_turns="none"` shape, treat that as a hard contract, and if spawn fails, surface the raw failure and do not silently fallback.
- Keep `qa_reviewer` on QA-only work, usually with minimal context (`agent_type=qa_reviewer`, `fork_context=false`), and require raw result/error output rather than proxy interpretation.
- For diagnosis/runtime questions, prefer real WeChat mini-program evidence, endpoint replays, and generated artifacts over code-path guesses or terminal-only conclusions.
- If the user says `不用那么细,大致的框架就可以了`, compress to a ClickUp-ready framework/checklist instead of expanding implementation detail.
- When the user-facing path is critical, prefer non-blocking degrade-first behavior over synchronous repair work that can stall the response.
- Treat `D-10 到 D-1` as a hard history boundary in weather-cache work; forecast data inside historical `daily/` is a bug, not an acceptable detail.
- If a behavior should be `规定死`, encode it in checked-in config/docs/policy, not just in chat or transient notes.
- For API/request debugging, start by tracing the repo’s real execution path and env source; when they ask for `完整的curl` or say they want to `直接方便的查看` the response, give copy-paste-ready raw-response commands, and if parsing fails, inspect headers/body before `jq`.
- When they ask for a Postman config and then say `你来给我建好落在项目里`, create the importable files in-repo and spell out the exact path/import handoff instead of pasting an ambiguous object.
- For local end-side QA without cloud deploy, first make `npm run dev:mp-weixin:local-functions:lan` pass end to end; scoped gateway checks or backend-only probes are not acceptance [ad-hoc note].


## Current override: WeChat end-side QA defaults

- Current `planting` WeChat mini-program end-side QA should default to `@dcloudio/uni-automator` / `miniprogram-automator` through the generated `dist/dev/mp-weixin` target and port `9420`.
- WeChat DevTools MCP is not the default QA route anymore. Treat MCP transport recovery, `.codex/skills/wechat-mcp-transport-recovery`, and MCP-first recovery memories as legacy/superseded unless the user explicitly asks to debug MCP itself.
- Missing WeChat MCP config, missing ByteRover swarm config, or MCP transport errors are tool/config noise by default; do not report them as product blockers, subagent blockers, or QA failures.
- For subagent work, pass only the automator QA contract and evidence requirements; do not ask subagents to run or summarize WeChat MCP recovery unless the task explicitly requires it.

## General Tips
- `package.json` is the authority for repo commands; do not invent scripts.
- The active `planting` end-side QA path is `dist/dev/mp-weixin -> 9420 -> miniprogram-automator / @dcloudio/uni-automator -> page_stack/page_data/evaluate(wx.request)`; WeChat DevTools MCP is legacy/optional, not the default QA route.
- In `planting` `dispatch-task`, Phase 0 is a hard gate: if `git status --short` is dirty, the required snapshot commit must succeed before any ClickUp read, implementation, or QA.
- In `planting` CloudBase MySQL work, do not stop at `$runSQLRaw` / `models.$runSQL` returning `InvalidParameter`; for DDL, continue to CLI or management-plane paths such as `run-with-cloudbase-env.mjs` + `tcb db instance list` + `tcb db execute` + `npm run ensure:cloudbase-sql-schema:verify` [ad-hoc note].
- In diagnosis weather runtime, `/weather/environment-context` should degrade on miss/error/timeout and should not synchronously rebuild recent weather by default.
- Weather D0 archive now lives in a single `days/{date}.json` state machine: keep full key `/v7/weather/now` fields in `samples[]`, derive `latestSample` from the final sample set by sample time, let `/weather/current` read that first, and keep D0 out of `recent-10d.json` [ad-hoc note].
- In `planting` QWeather tracing, `QWEATHER_API_KEY` is a static env var passed as query param `key`; `weather-http` can return `local_dev_missing_qweather_api_key` mock data in development, and `/weather/current` is cache-first so it may return `weatherEvidenceInsufficient` without calling QWeather.
- For weather-cache verification, strong proof is LAN startup + ingestion + diagnosis-context replay + checks that `forecastDailyArchives: 0` and historical `daily/` contains only the expected object.
- Default to `python3` for helper scripts and MCP-side probes; missing `python` can masquerade as a WeChat MCP failure [ad-hoc note].
- For WeChat diagnosis automation, read `docs/ai-rules/frontend-automation-id-policy.md` first and use stable ids like `diagnose-entry-button-{plant.id}` [ad-hoc note].
- `open(cdp_enabled=true)` on current `wechat-devtools-mcp v0.9.8` can trigger auth/session churn; treat it as destructive unless explicitly needed [ad-hoc note].

## What's in Memory
### /Users/jay/WebstormProjects/planting

#### 2026-06-20

- QWeather request tracing, raw curl inspection, and repo Postman handoff: `QWEATHER_API_KEY`, `QWEATHER_API_BASE_URL`, `weather-http`, `weather-ingestion-scheduler`, `curl -i -sS`, `qweather.postman_collection.json`
  - desc: Search this first when `planting` weather work asks whether the app can really hit QWeather, where the key/token comes from, why `/weather/current` did not directly call QWeather, or when the user wants ready-to-import Postman assets in `cwd=/Users/jay/WebstormProjects/planting`.
  - learnings: the current path uses a static env key passed as query param `key`, local development can fall back to `local_dev_missing_qweather_api_key`, the repo default host hit DNS failure in this environment, and the durable handoff is raw `curl -i` plus the repo-root `postman/` files.

- Weather D0 day-file state machine, full now-sample retention, and `/weather/current` fallback: `days/{date}.json`, `samples[]`, `latestSample`, `/v7/weather/now`, `dailyRollup`, `state=working`, `state=finalized`, `weatherEvidenceInsufficient`
  - desc: Search this first when `planting` weather work touches D0 sampling shape, same-day current-weather reads, or the archive contract replacing the old `working/{date}.json` + `daily/{date}.json` split in `cwd=/Users/jay/WebstormProjects/planting`.
  - learnings: D0 now stays in one day file until finalize, `samples[]` should preserve full key observed-now fields, `latestSample` must be recomputed from the final sample-time ordering, `/weather/current` stays evidence-first, and `recent-10d.json` only rolls up finalized D-1..D-10 days [ad-hoc note].

#### 2026-06-19

- Exact delegated subagent probe with `implementer_deep`: `implementer_deep`, `multi_agent_v1.spawn_agent`, `fork_context:false`, `GLM_SUBAGENT_PROBE_OK`, `UUID`
  - desc: Search this first when the user requires one real delegated probe with no main-thread shell fallback in `cwd=/Users/jay/WebstormProjects/planting`.
  - learnings: the proven shape was one `implementer_deep` spawn with minimal context plus structured evidence `exit_code/stdout/stderr/UUID`; missing exec evidence is a fail, not a retry.

- CloudBase MySQL DDL path for ClickUp `86exzqc3c`: `86exzqc3c`, `$runSQLRaw`, `InvalidParameter`, `tcb db instance list`, `tcb db execute`, `ensure:cloudbase-sql-schema:verify`
  - desc: Search this first for `planting` CloudBase schema/DDL work when `$runSQLRaw` looks blocked or when the task is about creating/verifying MySQL tables.
  - learnings: `$runSQLRaw` rejecting DDL is not a final blocker; the durable path is env injection via `run-with-cloudbase-env.mjs`, CLI instance lookup, `tcb db execute`, then schema verification [ad-hoc note].

#### 2026-06-18

- `dispatch-task` Phase 0 git baseline and ByteRover blocker: `dispatch-task`, `ClickUp`, `Phase 0`, `git add -A`, `index.lock`, `.brv/swarm/config.yaml`
  - desc: Search this first when a `planting` ClickUp dispatch stops before implementation, especially if the workspace is dirty or ByteRover recall is part of the gate path in `cwd=/Users/jay/WebstormProjects/planting`.
  - learnings: `git status --short` is the only dirty/clean check for Phase 0, blocked snapshot commit is a hard stop, and swarm recall is optional/noise without local `.brv/swarm/config.yaml`; ordinary dispatch must use non-swarm BRV recall packet and should not surface swarm config missing.

### Older Memory Topics

#### /Users/jay/WebstormProjects/planting

- Weather diagnosis degrade-first, D0-vs-history boundary, and archive semantics: `recent-weather-current`, `recent-weather-diagnosis-reader`, `allowArchiveRebuild`, `D-10`, `D-1`, `forecast archive pollution`
  - desc: Use for `planting` weather runtime/cache work when the question is about diagnosis-mode read behavior, the D0 day-file vs historical boundary, or keeping forecast data out of historical storage in `cwd=/Users/jay/WebstormProjects/planting`.

- LAN local-functions QA hard gate before end-side acceptance: `dev:mp-weixin:local-functions:lan`, `3010`, `3013`, `9006`, `LOCAL_FUNCTION_PROXY_FAILED`, `weather-http`
  - desc: Use for `planting` end-side QA that stays on local functions instead of cloud deploy, especially when gateway checks pass but runtime behavior still fails in `cwd=/Users/jay/WebstormProjects/planting`.

- Yellowing light-health routing and dual Figma state planning: `86exy62h7`, `q_observed_probe__leaf_yellowing__light_change_context`, `figma_link`, `figma_link2`, `128:584`, `126:221`
  - desc: Use when the user asks whether yellowing light logic is explicit mapping vs UV-driven, or needs the ClickUp/Figma planning facts for the light questionnaire flow in `cwd=/Users/jay/WebstormProjects/planting`.

- Real subagent spawn contracts, QA scope, and blocker handling: `qa_reviewer`, `implementer_deep`, `multi_agent_v1.spawn_agent`, `fork_context:false`, `agent thread limit reached`
  - desc: Use for real subagent spawning in `planting`, exact role/count/fork constraints, raw blocker reporting, QA-only `qa_reviewer` rules, and no-fallback delegated probe expectations in `cwd=/Users/jay/WebstormProjects/planting`.

- WeChat DevTools automation recovery and yellowing runtime evidence: `wechat-devtools-mcp`, `miniprogram-automator`, `9420`, `wx.request`, `diagnose-entry-button`, `缺少植物ID，无法开始问诊`
  - desc: Use for non-destructive WeChat runtime recovery, stable selector policy, yellowing diagnose replays, and plant-id / entry-precondition failures in `cwd=/Users/jay/WebstormProjects/planting`.

- Diagnosis question-package contract and static package routing: `getQuestionPackageByMode`, `yellow_leaf`, `wilting_droop`, `static-question-package-start`, `visibleOutcomes`
  - desc: Use for `diagnose-http` package-first contract changes, yellowing/wilting package behavior, and result-page contract regressions in `cwd=/Users/jay/WebstormProjects/planting`.

- CareBehaviorTimeline loading and diagnosis weather-window handling: `CareBehaviorTimeline`, `showLoadingSkeleton`, `environment-context`, `mode=diagnosis`, `Tailwind first`
  - desc: Use for timeline loading regressions, diagnosis-only weather-window handling, and CSS organization expectations in `cwd=/Users/jay/WebstormProjects/planting`.

- BRV/source-of-truth hygiene and workflow governance: `BRV`, `code-vs-memory`, `dispatch-task`, `docs_keeper_required`, `phase-gates`, `.brv/swarm/config.yaml`
  - desc: Use for repo workflow-governance work, dispatch phase gates, ByteRover config prerequisites, source verification, and durable agent-role boundary rules in `cwd=/Users/jay/WebstormProjects/planting`.

- `diagnose-http` CARE env sync and local CloudBase/LAN workflows: `CARE_*`, `cloudbaserc.json`, `check:cloudbase-http`, `dev:mp-weixin:local-functions`, `LOCAL_FUNCTION_PROXY_FAILED`
  - desc: Use for repo-vs-live CloudBase env alignment, deploy-path splits, local gateway debugging, and PR-only verification boundaries in `cwd=/Users/jay/WebstormProjects/planting`.

- Figma inspect-first reads: `11:766`, `r5afPtZu8fRMRenk8TJVjO`, `_get_design_context`, `_get_metadata`
  - desc: Use when the user provides a concrete Figma file/node and wants direct retrieval or verification rather than implementation in `cwd=/Users/jay/WebstormProjects/planting`.

#### /Users/jay/WebstormProjects/codex-thin-pipeline

- Local ClickUp fetch scripts, MCP/DNS boundaries, and runtime audits: `scripts/clickup-fetch-task.sh`, `CODEX_TASK_CONTRACT.md`, `CLICKUP_API_TOKEN`, `clickup_get_task`, `api.clickup.com`, `AGENT_RESULT_JSON`
  - desc: Use for repo-script-based ClickUp fetches, `.env` token loading, MCP-vs-network boundary checks, and agent-ready task extraction in `cwd=/Users/jay/WebstormProjects/codex-thin-pipeline`.

#### workflow / ClickUp / Codex

- ClickUp access boundaries and direct MCP use: `clickup_create_task_comment`, `least privilege`, `mcp-remote`, `No active time tracking`
  - desc: Use for current ClickUp identity/auth boundaries, direct MCP comment-write proof, and task-shaping questions across workflows.

#### Hermes / Jayflow board workflows

- Hermes/Jayflow smoke completion and readonly scope-preflight: `hermes kanban complete`, `scope-preflight`, `jayflow-flow-wrapper`, `result-collector`
  - desc: Use for local Jayflow/Hermes smoke completion, readonly verification, result-collector failures, and board-first scope-preflight handoffs.
