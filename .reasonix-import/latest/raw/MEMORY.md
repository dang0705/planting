# Task Group: planting ZCode visible-clipboard delivery and dispatch implementer boundaries

scope: use this block when changing or auditing formal ZCode external-implementer delivery, visible send receipts, clipboard integrity, or dispatch-versus-implementer ownership.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the live bridge, schema, validator, routing reference, and repository dispatch rules before relying on exact behavior; the main-versus-implementer boundary and multi-layer send-evidence requirement are safe for similar work in this checkout.

## Task 1: Migrate formal ZCode delivery from headless transport to auditable visible clipboard delivery, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-29T15-36-34-A4uV-air_exchange_analysis_and_zcode_visible_clipboard_transport.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/29/rollout-2026-07-29T23-36-34-019fae85-3b6f-75a3-b2c6-b4490164a67d.jsonl, updated_at=2026-07-30T13:47:12+00:00, thread_id=019fae85-3b6f-75a3-b2c6-b4490164a67d, real visible delivery and receipt validation passed; Completion Gate remained blocked by concurrent `AGENTS.md` overlap)

### keywords

- ZCode, zcode-clipboard-bridge.mjs, clipboard_paste, NSPasteboard, pbcopy, SHA-256, current_open_chat, Cmd+V, Edit > Paste, validate-zcode-send-receipt.mjs, prompt_transport, Completion Gate, AGENTS.md, external-implementer

## User preferences

- when dispatching an external implementer, keep dispatch, contracts, review, QA, BRV, and Completion Gate with main; implementers execute the handoff only and must not recursively run `$dispatch-task`, create episodes/handoffs, or spawn agents [Task 1]
- visible input, visible send, and visible post-send state are required for auditable external delivery; provider/process success alone is insufficient [Task 1]

## Reusable knowledge

- The formal transport contract is `target_session=current_open_chat` and `prompt_transport=clipboard_paste`: no headless fallback, manual typing, or direct input injection. The bridge must validate before writing, then read back and compare SHA-256, UTF-8 byte count, and line count; do not persist prompt bodies, credentials, old clipboard contents, element indices, or raw UI dumps [Task 1]
- A `sent` receipt needs every layer: clipboard readback, latest-state input focus, exact pasted prompt identity, send click/input submission or conversation-state change, and current-chat delivery evidence. The verified live probe used `NSPasteboard` readback, dynamic input discovery/focus, and `Cmd+V`; controlled `Edit > Paste` is the fallback [Task 1]
- Verified policy evidence was clipboard bridge `7/7`, send-receipt policy `9/9`, retired-headless isolation `2/2`, plus a successfully validated real receipt. Headless behavior remains isolated compatibility behavior, not the formal delivery path [Task 1]

## Failures and how to do differently

- Symptom: external delivery succeeds but the task is reported complete. Cause: implementation/QA evidence is conflated with dispatch completion. Fix: keep Completion Gate separate; this episode remained blocked because `validate-completion-readiness` reported `preexisting dirty overlap touches forbidden or non-allowed paths: AGENTS.md` [Task 1]
- Symptom: receipt validation blocks after a visually plausible send. Cause: provider-versus-dispatch status wording or `status=working` is missing. Fix: satisfy the explicit receipt schema before delivery rather than amending claims after the fact [Task 1]

# Task Group: planting AirExchangeEvidence v1 design contract and generic SelectableCard layout

scope: use this block when planning or implementing the standalone air-exchange assessment, its Figma state, or reusable option-card UI in `planting`.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the current page, Figma selection, and workspace build configuration before relying on exact components or build status; the v1 product boundary and generic-card design rule are safe for similar work in this checkout.

## Task 1: Refactor air-exchange option shells into content-sized generic `SelectableCard`, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-29T13-13-35-Antk-air_exchange_selectable_card_generic_layout.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/29/rollout-2026-07-29T21-13-35-019fae02-5148-7c83-90eb-19cd48bcc076.jsonl, updated_at=2026-08-02T11:00:33+00:00, thread_id=019fae02-5148-7c83-90eb-19cd48bcc076, focused unit/data-contract checks passed; full mini-program build remained blocked by workspace CSS/Tailwind error)

### keywords

- SelectableCard.vue, AirExchangeAssessment.vue, Figma `450:1537`, `bg-[#e8f5e9]`, `border-brand`, default slot, `h-[108px]`, AirflowScene, automation-id, `Unknown word var`, `build:mp-weixin:ci`

## Task 2: Define independent AirExchangeEvidence v1 after Figma/code/product gap analysis, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-29T15-36-34-A4uV-air_exchange_analysis_and_zcode_visible_clipboard_transport.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/29/rollout-2026-07-29T23-36-34-019fae85-3b6f-75a3-b2c6-b4490164a67d.jsonl, updated_at=2026-07-30T13:47:12+00:00, thread_id=019fae85-3b6f-75a3-b2c6-b4490164a67d, compared Figma, prior logic, and code before defining the v1 evidence boundary)

### keywords

- AirExchangeEvidence, airExchange, `/pages/airflow/airflow`, windowDirectionCount, windowOpenFrequency, `source=window|fresh_air|none`, Figma `450:3445`, `450:1509`, `463:1508`, yellow-leaf boundary

## User preferences

- when planning a new feature, the user asked to “先仔细分析并比对两者是否有 gap” and “先不改代码” -> begin with a Figma, chat-logic, and live-code/data-contract gap analysis before implementation [Task 2]
- when the user asked “开窗和新风的外壳为什么不封装一下选项卡？” and “我希望是更通用的card” -> extract a business-agnostic card shell; pages supply content and state rather than copying option UI [Task 1]
- when the user said “card不应该写死高度，而是应该有内容撑出高度” -> do not encode business height such as `h-[108px]` in a reusable container [Task 1]
- for v1, the user kept air exchange separate from local airflow, fan, AC draft, outlet proximity, and yellow-leaf diagnosis -> preserve that boundary instead of exposing internal fields or a single ventilation score [Task 2]

## Reusable knowledge

- `src/components/SelectableCard.vue` has the stable generic responsibility: `id`, `selected`, `disabled`, click/select interaction, and default slot; `AirExchangeAssessment.vue` composes the window, fresh-air, and unknown options through slots, with SVG/content determining height [Task 1]
- Figma `450:1537` confirms the required card states: unselected is white; selected is `#e8f5e9` with `border-brand`; the legend's pale surface is separate [Task 1]
- The focused checks passed: `SelectableCard.mjs`, `AirExchangeAssessment.mjs`, `AirflowScene.mjs`, `air-exchange-evidence.mjs`, and `git diff --check` [Task 1]
- The planned standalone route is `/pages/airflow/airflow`; raw input is only `{ source, windowDirectionCount, windowOpenFrequency }`, with no score, confidence, evidence array, `directDraft`, outlet, or other internal fields. It must not connect to the yellow-leaf package, diagnosis payload, CloudBase, or database in v1 [Task 2]
- Planned mapping: two directions + daily = `high`; one direction + daily or any direction + every other day = `medium`; weekly 1–2 times = `low`; `fresh_air` = `medium`; `closed_or_none` = `low`; incomplete window input = `null`; explicit unknown = `unknown` [Task 2]

## Failures and how to do differently

- Do not infer card states from a verbal description or remove all backgrounds. Read the exact Figma node and inspect both selected and unselected states before changing visual treatment [Task 1]
- A successful unit/format suite is not a successful mini-program build. `npm run build:mp-weixin:ci` failed with `[vite:css-post] <css input>:1611:32: Unknown word var`; inspect the workspace `tailwind.config.js`/Tailwind CSS pipeline, repair the configuration, then rerun the build before claiming it passes [Task 1]
- Do not accept a ByteRover hit from another project space as a repository fact; source-check against this checkout before using it for product decisions [Task 2]

# Task Group: planting Automator/DevTools runtime hardening and shared local QA data source

scope: use this block for formal mini-program Automator acceptance, DevTools project identity, screenshots, runtime recovery, and isolating DevTools state while retaining current local development data.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe for the current `dist/dev/mp-weixin` LAN workflow after confirming scripts, catalog, port, and project path still match; do not assume the proposed dedicated 9421 setup exists.

## Task 1: Harden Automator/DevTools runtime identity, screenshot handling, and formal QA, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-26T12-04-58-bs6B-automator_runtime_hardening_and_isolated_qa_data_source.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/26/rollout-2026-07-26T20-04-58-019f9e50-6dba-7162-a3d5-e33019b44081.jsonl, updated_at=2026-07-27T09:26:54+00:00, thread_id=019f9e50-6dba-7162-a3d5-e33019b44081, catalog-backed r7 QA and Completion Gate passed)

### keywords

- miniprogram-automator, DevTools, 9420, projectpath, URLSearchParams, `%252F`, runtime lease, project identity, screenshot-worker, PNG, qa-run, wx.request, `pest-mode-and-retake`

## Task 2: Isolate DevTools state while reusing latest dist, LAN functions, and CloudBase development data, outcome uncertain

### rollout_summary_files

- rollout_summaries/2026-07-26T12-04-58-bs6B-automator_runtime_hardening_and_isolated_qa_data_source.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/26/rollout-2026-07-26T20-04-58-019f9e50-6dba-7162-a3d5-e33019b44081.jsonl, updated_at=2026-07-27T09:26:54+00:00, thread_id=019f9e50-6dba-7162-a3d5-e33019b44081, 9421 proposal was not user-confirmed or implemented)

### keywords

- `npm run dev:mp-weixin:local-functions:lan`, `dist/dev/mp-weixin`, LAN gateway 3010, `tcb-ff -w`, cloud1_dev, VITE_API_BASE_URL, VITE_DEV_OPENID, x-wx-openid, x-openid, 9421

## User preferences

- for recurring QA infrastructure, the user asked for an “绝对安全的测试环境” and did not want to “天天耗费 token 在修一个固定的工作流上面” -> favor isolation, leases, fixed deadlines, explicit terminal states, and evidence contracts over manual retries [Task 1]
- after excluding external failures, the user still required no hangs, wrong projects, or infinite retries -> fail fast and classify product, contract, and environment failures [Task 1]
- when isolating Automator, the user still required “测试最新代码的真实数据” and reuse of “主进程的同一套数据源” -> isolate DevTools cache/login/page state, not the built dist, LAN gateway, or CloudBase development database [Task 2]

## Reusable knowledge

- Pass `projectpath` directly to `URLSearchParams`; pre-encoding produces `%252F`, which can return HTTP 200 while DevTools opens the wrong project [Task 1]
- Reuse the `dist/dev/mp-weixin` watcher through the local runtime lease; do not unconditionally launch, kill, or reclaim other projects [Task 1]
- Formal Automator acceptance requires target path, DevTools PID/control port, 9420 listener, WebSocket, page data, valid PNG screenshots, and mini-program-runtime `wx.request`, then catalog-backed `qa-run`. A bare script, HTTP 200, or standalone `wx.request` smoke is below the acceptance bar [Task 1]
- Capture screenshots in an independent worker with a bounded timeout and PNG validation. The formal leaf captures exactly three strategy-defined screenshots; extra captures can trip the watchdog [Task 1]
- The current shared local chain is `npm run dev:mp-weixin:local-functions:lan -> dist/dev/mp-weixin -> LAN gateway 3010 -> tcb-ff -w -> CloudBase development/cloud1_dev`; local requests use `VITE_API_BASE_URL`, `VITE_DEV_OPENID`, and `x-wx-openid`/`x-openid` [Task 2]
- Related skill: skills/planting-automator-qa/SKILL.md [Task 1][Task 2]

## Failures and how to do differently

- Do not infer project identity from a reachable 9420, HTTP 200, or CLI `auto`. If screenshot RPC fails, prove the unique target project, main process, listener, and control port before one target-only recovery [Task 1]
- Do not hide an Automator hang with infinite retries or short polling. Give each stage and full capture a deadline, then record a terminal failure category [Task 1]
- Do not present the proposed dedicated Automator port 9421 as deployed; it remained an unconfirmed design idea at rollout end [Task 2]

# Task Group: planting diagnosis routing investigation and local LAN user-plants identity repair

scope: use this block when interpreting visual `mode_candidates`/runtime image IDs or fixing local user-plant list records without mutating CloudBase data.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=trace current diagnosis routing and SQL predicates before applying; the verified LAN output was specific to the then-current development data.

## Task 1: Explain a single high-confidence aphid candidate and `visimg1_*`, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-27T09-39-53-PIRW-diagnosis_routing_and_user_plants_null_record_repair.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/27/rollout-2026-07-27T17-39-53-019fa2f1-f587-7922-b807-44e7b1c35db8.jsonl, updated_at=2026-07-27T12:42:04+00:00, thread_id=019fa2f1-f587-7922-b807-44e7b1c35db8, routing traced but no causal proof against a specific commit)

### keywords

- mode_candidates, aphid, `direct_result`, visibleOutcomes, finalResult, diagnosis-mode-router.js, pest-visual-orchestrator.js, specific-pest-answer-resolver.js, frontend-response-helpers.js, `visimg1`, buildRuntimeId

## Task 2: Repair literal `"null"` user-plant cards with read-layer filtering, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-27T09-39-53-PIRW-diagnosis_routing_and_user_plants_null_record_repair.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/27/rollout-2026-07-27T17-39-53-019fa2f1-f587-7922-b807-44e7b1c35db8.jsonl, updated_at=2026-07-27T12:42:04+00:00, thread_id=019fa2f1-f587-7922-b807-44e7b1c35db8, focused tests, scoped oxlint, LAN runtime evidence, and Completion Gate passed)

### keywords

- user-plants, VITE_DEV_OPENID, local LAN auth, literal-null, plant-knowledge.js, `listUserPlantInstances`, pagination, total, hasMore, `npm run dev:mp-weixin:local-functions:lan`, oxlint

## User preferences

- when `"null"` cards appeared, the user constrained the fix to read-time filtering -> do not delete, update, migrate, or fabricate database records [Task 2]
- preserve the existing LAN startup/process ownership and restart the normal LAN flow only when changed backend code must reload; valid records must be on page one with consistent `total` and `hasMore` [Task 2]

## Reusable knowledge

- `mode_candidates` is routing input, not final UI. Trace raw AI output through normalizer, `visual-mode-route-service.js`, `diagnosis-mode-router.js`, `pest-visual-orchestrator.js`/answer resolver, then frontend response helpers; a single high-confidence visual pest can legitimately become `direct_result` [Task 1]
- `visimg1_<timestamp>_<random>` is generated by `buildRuntimeId('visimg1')` in `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`; it identifies runtime image input and does not prove a Codex review change [Task 1]
- For local/LAN API bases, `resolveHttpFunctionAuth` selects `VITE_DEV_OPENID` before storage. `listUserPlantInstances` must apply the same displayable-identity predicate to list and count and retain a defensive in-memory filter before mapping [Task 2]
- Displayable identity accepts nonempty `plant_id`, `plant_identity_id`, `session_plant_id`, `canonical_name`, `recognized_name`, or `nickname`; literal strings `null` and `undefined` count as missing [Task 2]
- After restarting the normal LAN flow, the verified result was HTTP 200, `total=4`, `hasMore=false`, IDs `[12,9,8,7]`, and four named DevTools cards. Treat those values as historical runtime evidence, not a permanent fixture [Task 2]

## Failures and how to do differently

- Do not infer why an outcome appeared from raw `aiDebug`, a `visimg1` ID, or nearby commits. Compare the exact runtime payload and commit diff, then run the relevant regression case [Task 1]
- If a runtime check still shows old rows after the backend change, the normal worker may not have reloaded. Restart the established LAN flow and re-query; HTTP 200 alone is not proof [Task 2]
- `npm run lint -- --files ...` is incompatible with this installed CLI. Use direct scoped `npx oxlint <files>` for this check [Task 2]

# Task Group: Figma mobile ventilation assessment design for 青花植

scope: use this block when editing the planting Figma file's air-environment/ventilation assessment UI or reviewing whether a mobile mini-program design is understandable to end users.
applies_to: cwd=/Users/jay/Documents/Codex/2026-07-27/figma-plugin-figma-openai-curated-remote; reuse_rule=re-open the live Figma file and neighboring frames before editing; node IDs and icon availability are file/tool-state-specific, while the mobile sizing and plain-language design rules are reusable.

## Task 1: Redesign and place a human-readable 393px ventilation assessment UI, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-27T15-52-11-VHQK-figma_planting_ventilation_component_redesign.md (cwd=/Users/jay/Documents/Codex/2026-07-27/figma-plugin-figma-openai-curated-remote, rollout_path=/Users/jay/.codex/sessions/2026/07/27/rollout-2026-07-27T23-52-11-019fa446-cea9-71b3-ad02-2bf56fcaf38a.jsonl, updated_at=2026-07-28T00:49:17+00:00, thread_id=019fa446-cea9-71b3-ad02-2bf56fcaf38a, final screenshot was visually reviewed; no explicit post-delivery user confirmation)

### keywords

- Figma, 青花植, ventilation, air environment, WateringPage, 393px, 422:989, Supericons, Lucide, airExchange, canopyObstruction, visual review

## User preferences

- when a component is for 青花植, the user corrected: “青花植是移动端小程序” -> inspect neighboring frames and preserve the product's 393px mobile convention before designing [Task 1]
- when the user said the prior design was “完全不适合人类理解” -> do a real screenshot-based self-review of layout, legend clarity, and readability before handoff [Task 1]
- when the user asks why business fields are visible -> never expose internal fields such as `airExchange` or `canopyObstruction`; use plain-language, user-observable scenario descriptions [Task 1]
- when icons are needed, the user requested Supericons instead of hand-drawn windows, arrows, or plants -> use one coherent icon family and inspect individual icon semantics rather than trusting automated recommendations blindly [Task 1]

## Reusable knowledge

- The planting Figma file is `r5afPtZu8fRMRenk8TJVjO`; `WateringPage` is node `237:53`, 393×852 at x=5525, y=15. The final component is node `422:989`, 393×852 at x=5966, y=15 beside the source frame [Task 1]
- The final visible structure is a green header, two step pills, a plain-language legend, four room-air scenario cards, three plant-surrounding-space cards, and an optional paper-strip test panel [Task 1]
- The selected editable icon refs were `lucide:app-window`, `lucide:fan`, `lucide:leaf`, `lucide:arrow-right`, `lucide:arrow-right-left`, `lucide:brick-wall`, and `lucide:clipboard-pen` [Task 1]

## Failures and how to do differently

- Symptom: a 760px desktop component appears next to a mobile product screen. Cause: inferring a presentation area instead of checking page-level neighboring frames. Fix: inspect surrounding frame dimensions before choosing size; the initial node `417:989` was removed [Task 1]
- Symptom: a mobile rewrite exposes model fields or uses weak hand-drawn illustrations. Fix: replace it with human-readable copy and coherent library icons; the earlier node `419:1075` was removed [Task 1]
- A creation rewrite failed atomically with `ReferenceError: 'thirty' is not defined`; correct the script and retry, relying on atomic execution to avoid partial Figma state [Task 1]

# Task Group: planting Qwen3.5-Plus profile isolation, CloudBase diagnosis schema readiness, and visual-model 502 triage

scope: use this block when switching the `planting` diagnosis visual model, repairing a local `diagnosis/start` readiness failure, or separating local schema/service faults from CloudBase AI authorization failures.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the live config, runtime schema, and CloudBase authorization/model-entitlement state before acting; the profile and schema repair were validated, but upstream AI invocation remains blocked.

## Task 1: Isolate `qwen3.5-plus` from the legacy vision profile without changing adapter or SSE behavior, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T01-37-17-QYjf-planting_qwen35_cloudbase_migration_schema_and_ai_502.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T09-37-17-019f8251-f6b6-79c2-8bce-9ca34d607169.jsonl, updated_at=2026-07-21T02:29:08+00:00, thread_id=019f8251-f6b6-79c2-8bce-9ca34d607169, profile isolation and clean-environment verification passed)

### keywords

- qwen3.5-plus, qwen_3_5_plus, qwen_vl_fast_vision, qwen3-vl-plus, cloudbase_qwen_vl, SSE, DEFAULT_MODEL_PROFILE, LLM_QWEN_3_5_PLUS_MODEL, LLM_QWEN_VL_FAST_MODEL

## Task 2: Repair local `diagnosis/start` 503 caused by incomplete `cloud1_dev` schema readiness, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T01-37-17-QYjf-planting_qwen35_cloudbase_migration_schema_and_ai_502.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T09-37-17-019f8251-f6b6-79c2-8bce-9ca34d607169.jsonl, updated_at=2026-07-21T02:29:08+00:00, thread_id=019f8251-f6b6-79c2-8bce-9ca34d607169, seven outcome tables were created in `cloud1_dev` and health became ready)

### keywords

- diagnosis/start, 503, ensureRefactorReady, refactor-readiness, SCHEMA_ENV=development, SQL_DATABASE=cloud1_dev, outcome_route_conditions, $runSQL, InvalidParameter, tcb db execute, information_schema.tables

## Task 3: Triage the remaining visual-model 502 as upstream CloudBase AI authorization/entitlement, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-21T01-37-17-QYjf-planting_qwen35_cloudbase_migration_schema_and_ai_502.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T09-37-17-019f8251-f6b6-79c2-8bce-9ca34d607169.jsonl, updated_at=2026-07-21T02:29:08+00:00, thread_id=019f8251-f6b6-79c2-8bce-9ca34d607169, direct text and image calls returned `403 ACTION_FORBIDDEN`; authorization/model enablement remains required)

### keywords

- 502, 403 ACTION_FORBIDDEN, visual_model_unavailable, CLOUDBASE_AI_API_KEY, LLM_API_KEY, LLM_PROVIDER_NAME, LLM_CLOUDBASE_AI_BASE_URL, cloudbase/chat/completions, anonymous sign-in, function-framework port 9000

## Task 4: Keep TokenHub routing opt-in when deployed `diagnose-http` uses CloudBase AI, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-22T10-06-51-N70F-planting_pest_visual_prompt_insect_body_inspection_and_cache.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T18-06-51-019f894a-d79c-7a72-b377-82614646a7ad.jsonl, updated_at=2026-07-22T13:34:08+00:00, thread_id=019f894a-d79c-7a72-b377-82614646a7ad, focused implementer evidence exists but postflight, deployment, and runtime evidence are absent)

### keywords

- TokenHub, TOKENHUB_API_KEY, CLOUDBASE_AI_API_KEY, qwen3.5-plus, cloudbase-ai-openai-contract.mjs, provider routing, deployed diagnose-http

## User preferences

- when the user called the prior profile pairing “乱搭” and required `qwen_vl_fast_vision` to remain separate -> preserve strict semantic boundaries between profile names, environment variables, and model IDs [Task 1]
- when migrating a model, the user required minimal changes and no request or streaming changes -> retain the existing `cloudbase_qwen_vl` adapter and SSE path unless the task explicitly expands scope [Task 1]

## Reusable knowledge

- Correct profile mapping is `qwen_3_5_plus -> qwen3.5-plus` and `qwen_vl_fast_vision -> qwen3-vl-plus`; both use `cloudbase_qwen_vl`. A clean-environment check passed for the default profile, CloudBase provider, and `sse:true`, and legacy switching remained available through `LLM_MODEL_PROFILE=qwen_vl_fast_vision` [Task 1]
- `diagnosis/start` calls strict `ensureRefactorReady()` before `runStartDiagnosis`; a missing outcome table returns 503 before any model call. The local LAN runtime uses `SCHEMA_ENV=development` and `SQL_DATABASE=cloud1_dev` [Task 2]
- `$runSQL` rejects DDL because it permits only DML. Use `tcb db execute` for the schema-qualified DDL, then query `information_schema.tables` in the exact runtime schema; the repair reached `cloud1_dev`, 27 tables, `ready:true`, and no blocking issues [Task 2]
- After schema repair, generic `视觉模型调用失败，请重试` mapped to direct upstream HTTP `403 ACTION_FORBIDDEN` for both text and image calls. The likely blocker is CloudBase AI API authorization or model entitlement, not SQL, profile mapping, image format, or SSE; CloudBase AI credentials are distinct from management/SQL credentials [Task 3]
- Local TokenHub credentials and deployed CloudBase AI credentials are separate endpoint/credential planes. Evidence showed deployed `diagnose-http` lacked `TOKENHUB_API_KEY` while CloudBase exposed `qwen3.5-plus`; keep explicit TokenHub routing opt-in and never use `CLOUDBASE_AI_API_KEY` as a TokenHub fallback. Focused implementation evidence is not deployment or runtime proof [Task 4]

## Failures and how to do differently

- Symptom: a profile appears mostly correct but the legacy vision profile falls back to `QWEN_3_5_PLUS_MODEL`. Cause: cross-wired profile block. Fix: inspect every full profile block and run exact mismatch checks, not a broad grep [Task 1]
- Symptom: `ensure:cloudbase-sql-schema:verify` passes but `diagnosis/start` still returns 503. Cause: that command checks weather tables, not the complete diagnosis schema. Fix: read readiness health and verify all required tables in `cloud1_dev` after DDL [Task 2]
- Symptom: a generic visual 502 obscures the real fault. Fix: call the CloudBase AI endpoint directly in an isolated debug process and retain the original status/body; do not expose credentials. Reuse the existing gateway or allocate different function ports because a second gateway collided with port 9000 [Task 3]
- Do not mark provider routing complete from an implementer result or focused unit test alone; require diff review, postflight, and runtime/deployment evidence, and redact all credential values as `[REDACTED_SECRET]` [Task 4]

# Task Group: model multimodality research for Tencent Hy3 and Qwen3.5 Plus/Flash

scope: use this block when selecting a model for image understanding or explaining the practical capability/cost tradeoff among Hy3, `qwen3.5-plus`, and `qwen3.5-flash`.
applies_to: cwd=/Users/jay/Documents/Codex/2026-07-21/hy; reuse_rule=capability positioning is reusable, but re-check official current pricing, regional availability, and model snapshots before quoting exact prices or limits.

## Task 1: Determine whether Tencent Hy3 directly understands images, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T00-40-05-3feh-hy3_qwen35_multimodal_model_comparison.md (cwd=/Users/jay/Documents/Codex/2026-07-21/hy, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T08-40-05-019f821d-9946-7e63-87d6-c8564ae8aae9.jsonl, updated_at=2026-07-21T00:43:37+00:00, thread_id=019f821d-9946-7e63-87d6-c8564ae8aae9, official model card/config evidence)

### keywords

- Hy3, HYV3ForCausalLM, 295B MoE, image understanding, vision encoder, HunyuanImage 3.0, Hunyuan3D, 腾讯混元多模态, Tencent HY Vision 1.5 Instruct

## Task 2: Compare `qwen3.5-plus` and `qwen3.5-flash` for visual understanding, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T00-40-05-3feh-hy3_qwen35_multimodal_model_comparison.md (cwd=/Users/jay/Documents/Codex/2026-07-21/hy, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T08-40-05-019f821d-9946-7e63-87d6-c8564ae8aae9.jsonl, updated_at=2026-07-21T00:43:37+00:00, thread_id=019f821d-9946-7e63-87d6-c8564ae8aae9, official visual-input and pricing comparison)

### keywords

- qwen3.5-plus, qwen3.5-flash, image, video, 1M context, 256 images, 64 videos, function calling, structured output, Singapore international pricing, Qwen-Image, Qwen3.5 Omni

## User preferences

- for model comparisons, the user asks for practical, concise Chinese guidance -> lead with the direct tradeoff and recommendation before capability detail [Task 2]

## Reusable knowledge

- Tencent Hy3 is a text-focused `HYV3ForCausalLM` with no exposed vision encoder or image-input path; do not infer image understanding from the “Hy” family name. Use a Tencent multimodal/vision model first, then pass extracted results to Hy3 for reasoning or orchestration if needed [Task 1]
- `qwen3.5-plus` and `qwen3.5-flash` both accept text, images, and video and support 1M context, up to 256 images/64 videos, function calling, built-in tools, and structured output. Plus is the quality/reasoning choice; Flash is lower-latency, higher-throughput, and lower-cost. Use Flash for first-pass screening and Plus for ambiguous or complex visual reasoning [Task 2]
- `qwen3.5-plus` outputs text, not generated/edited images; use a separate image model such as Qwen-Image for image generation/editing, and Qwen3.5 Omni for audio input [Task 2]

## Failures and how to do differently

- “HY3” is ambiguous with HunyuanImage 3.0 and Hunyuan3D; disambiguate the requested model before answering [Task 1]
- Treat Plus-versus-Flash quality/latency as official positioning, not an independently measured benchmark. The cited Singapore prices were time-sensitive and must be refreshed before use [Task 2]

# Task Group: Codex per-subagent Fast mode configuration and custom-agent inheritance

scope: use this block when the user asks to configure Fast mode “在 subagent 中” or needs to distinguish Fast mode from model/reasoning/concurrency settings.
applies_to: cwd=/Users/jay/.codex/.chatgpt-projects/g-p-69fbfea390648191b73ba48881ae9e60; reuse_rule=consult the current local Codex manual and strict config validation before applying because custom-agent `service_tier` acceptance was not validated in this rollout.

## Task 1: Investigate Fast mode per subagent, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-20T23-36-24-LE8W-codex_subagent_fast_mode_config.md (cwd=/Users/jay/.codex/.chatgpt-projects/g-p-69fbfea390648191b73ba48881ae9e60, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T07-36-24-019f81e3-4938-7eb3-b162-3620de9f7612.jsonl, updated_at=2026-07-20T23:38:40+00:00, thread_id=019f81e3-4938-7eb3-b162-3620de9f7612, local manual/CLI investigated; no custom-agent file was validated end to end)

### keywords

- Codex, Fast mode, service_tier, fast_mode, /fast on, /fast off, /fast status, model_reasoning_effort, gpt-5.6-terra, custom agents, config.toml, codex --strict-config

## User preferences

- when the user asks about Fast mode “在 subagent 中” -> prioritize per-subagent inheritance and custom-agent overrides rather than changing the main/global default without being asked [Task 1]

## Reusable knowledge

- Fast mode is `service_tier = "fast"` plus `[features].fast_mode = true`; it is distinct from `model_reasoning_effort` and from selecting `gpt-5.6-terra` as a separate faster/lower-cost model. CLI controls are `/fast on`, `/fast off`, and `/fast status` [Task 1]
- `[agents]` controls orchestration (`max_threads`, `max_depth`, `job_max_runtime_seconds`, `interrupt_message`), not `service_tier`. Custom-agent TOML files belong in `~/.codex/agents/` or project `.codex/agents/`, require `name`, `description`, and `developer_instructions`, and inherit omitted parent settings [Task 1]

## Failures and how to do differently

- Do not claim Fast mode is enabled merely because `codex features list` reports the feature stable. Confirm `[features].fast_mode = true` or `/fast status`; the inspected local config instead showed `service_tier = "priority"` and did not show the feature enabled [Task 1]
- The proposed custom-agent `service_tier = "fast"` was not created or exercised. Validate it with a minimal agent and `codex --strict-config` or an actual spawned run before presenting it as operational [Task 1]

# Task Group: planting specific-pest diagnosis modes, cache-first visual prompts, retake authorization, and Completion Gate

scope: use this block when adding or reviewing `planting` specific-pest visual diagnosis, `full`/`pest` entry profiles, cache-first prompts, insect-body evidence, dynamic question packages, single-candidate routing, or the end-side evidence required to claim the work complete.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the named live diagnosis contracts and test/catalog state before implementation; targeted behavior is validated, but catalog-backed Automator acceptance and a clean fully completed release remain unproven.

## Task 1: Implement specific-pest modes, deterministic visual routing, and cache-first prompt flow, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-20T07-16-33-Vyze-planting_specific_pest_visual_mode_cache_first_prompt_partia.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/20/rollout-2026-07-20T15-16-33-019f7e62-3661-7150-b56d-6e906b630fd8.jsonl, updated_at=2026-07-21T07:32:48+00:00, thread_id=019f7e62-3661-7150-b56d-6e906b630fd8, implemented routing and cache-first Prompt; final release evidence remains blocked)

### keywords

- pest, diagnosis-mode-registry, diagnosis-mode-router, full, pest, visual-prompt-cache-contract, symptom-labeler-prompt, captureRegion, leaf_lower_surface, dynamic-question-package, retake-authorization, skipped_unknown, unknown, surface_glossy_residue

## Task 2: Regress the mini-program flow and assess Completion Gate evidence, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-20T07-16-33-Vyze-planting_specific_pest_visual_mode_cache_first_prompt_partia.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/20/rollout-2026-07-20T15-16-33-019f7e62-3661-7150-b56d-6e906b630fd8.jsonl, updated_at=2026-07-21T07:32:48+00:00, thread_id=019f7e62-3661-7150-b56d-6e906b630fd8, 104 business assertions passed, but required screenshot and other completion evidence are missing)

### keywords

- diagnosis.pest.visual_mode_retake, pest-mode-and-retake.mjs, assertions_total, assertions_passed, App.captureScreenshot, required runtime screenshot captured, Completion Gate, validate-handoff.mjs, validate-result.mjs, check:e2e-catalog, cached_tokens, runtime-qa-evidence

## Task 3: Prevent a single specific-pest candidate from entering meaningless refinement, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T09-55-48-fShw-specific_pest_single_outcome_refinement_guard.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T17-55-49-019f841a-6083-7643-8060-cf9825376e3e.jsonl, updated_at=2026-07-21T13:34:11+00:00, thread_id=019f841a-6083-7643-8060-cf9825376e3e, targeted backend/frontend guard and relevant unit tests passed)

### keywords

- specific_pest, visibleOutcomes, directionChoices, candidateRefinementAvailable, specific-pest-answer-resolver.js, diagnosis-direction-choice-runtime.js, normalizeDiagnosisResult, finalize, direct_result, candidateModes[0]

## Task 4: Make cache-first visual prompts inspect insect bodies and support eight specific pests, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T14-09-24-Zc6P-planting_insect_first_visual_prompt_thrips_route_and_runtime.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl, updated_at=2026-07-22T04:56:12+00:00, thread_id=019f8502-8a6b-78e0-a12d-a7b518a6349f, static insect inspection contract and prompt-cache test passed)

### keywords

- INSECT-BODY-FIRST, visual_discriminators, insect_body_presence, insect_body_shape, insect_body_location, missing_info_for_path, STATIC_INSECT_INSPECTION_RULES, spider_mite, mealybug, scale_insect, whitefly, aphid, thrips, leaf_miner, fungus_gnat, leaf_miner_tunnel

## Task 5: Route clear slender thrips bodies directly in both `full` and `pest` profiles, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T14-09-24-Zc6P-planting_insect_first_visual_prompt_thrips_route_and_runtime.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl, updated_at=2026-07-22T04:56:12+00:00, thread_id=019f8502-8a6b-78e0-a12d-a7b518a6349f, parser regression and targeted checks passed)

### keywords

- diagnosis-parser.js, thrips_visible, thrips=0.95, insect_body_presence=present, insect_body_shape=slender, full, pest, other_local, strong/high/ready

## Task 6: Deduplicate one-outcome advice labels in the diagnosis result view, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-21T14-09-24-Zc6P-planting_insect_first_visual_prompt_thrips_route_and_runtime.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl, updated_at=2026-07-22T04:56:12+00:00, thread_id=019f8502-8a6b-78e0-a12d-a7b518a6349f, result-view and question-package tests passed)

### keywords

- outcome-advice.js, showOutcomeLabel, setup.js, DiagnoseResultStage.vue, action advice, avoid advice, one outcome, multiple conclusions

## Task 7: Exercise a real thrips image request and assess formal Automator acceptance, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-21T14-09-24-Zc6P-planting_insect_first_visual_prompt_thrips_route_and_runtime.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl, updated_at=2026-07-22T04:56:12+00:00, thread_id=019f8502-8a6b-78e0-a12d-a7b518a6349f, real `wx.request` succeeded but formal catalog QA was environment-blocked)

### keywords

- wx.cloud.getTempFileURL, 图片下载失败(403), visual_adapter_failed, diag_1784696061974_5uogkffx, visbatch_1784696061975_xgk5iqyi, diagnosis.pest.visual_mode_retake, qa-run, project_identity_unverified, 9420, finalize, direct_result

## Task 8: Print the complete visual prompt at the actual request boundary, outcome uncertain

### rollout_summary_files

- rollout_summaries/2026-07-21T14-09-24-Zc6P-planting_insect_first_visual_prompt_thrips_route_and_runtime.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T22-09-24-019f8502-8a6b-78e0-a12d-a7b518a6349f.jsonl, updated_at=2026-07-22T04:56:12+00:00, thread_id=019f8502-8a6b-78e0-a12d-a7b518a6349f, no completed implementation or verification)

### keywords

- 完整 prompt, frontend request boundary, symptom-labeler-prompt.js, visual trace, development log switch, request payload

## Task 9: Harden the insect-body-first visual schema and cache-stable prompt prefix, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-22T13-03-37-FEl0-planting_insect_body_prompt_cache_first_frame_cloudbase.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T21-03-37-019f89ec-ac6e-7912-bc62-f36484b3d0ce.jsonl, updated_at=2026-07-23T00:36:16+00:00, thread_id=019f89ec-ac6e-7912-bc62-f36484b3d0ce, focused prompt/schema change passed but the shared dirty worktree prevents isolated acceptance)

### keywords

- INSECT-BODY-FIRST, visual_discriminators, insect_body_presence, insect_body_shape, insect_body_location, missing_info_for_path, leaf_miner_tunnel, buildCacheFirstVisualPrompt, dynamicTaskText, visual-prompt-cache-contract.mjs

## Task 10: Preserve the user-specified per-pest question limits as a separate dirty-worktree follow-up, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-22T13-03-37-FEl0-planting_insect_body_prompt_cache_first_frame_cloudbase.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T21-03-37-019f89ec-ac6e-7912-bc62-f36484b3d0ce.jsonl, updated_at=2026-07-23T00:36:16+00:00, thread_id=019f89ec-ac6e-7912-bc62-f36484b3d0ce, identified but did not alter the overlapping question-limit contract)

### keywords

- diagnosis-mode-registry.js, pest-question-package.js, maxQuestions, thrips=2, spider_mite=1, mealybug=1, scale_insect=1, whitefly=1, aphid=1, leaf_miner=1, fungus_gnat=1

## Task 11: Remove avoidable `diagnosis/start` readiness delay and distinguish it from model first-token latency, outcome success with formal QA blocked

### rollout_summary_files

- rollout_summaries/2026-07-22T13-03-37-FEl0-planting_insect_body_prompt_cache_first_frame_cloudbase.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T21-03-37-019f89ec-ac6e-7912-bc62-f36484b3d0ce.jsonl, updated_at=2026-07-23T00:36:16+00:00, thread_id=019f89ec-ac6e-7912-bc62-f36484b3d0ce, direct probe passed while formal Automator QA was blocked by project identity)

### keywords

- ensureDiagnosisStartRefactorReady, refactor-readiness.js, diagnosis/start, visual_model_started, visual_model_response_started, visual_model_complete, project_identity_unverified, diagnosis.pest.visual_mode_retake

## Task 12: Record CloudBase provider cache and thinking behavior without confusing it with TokenHub, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-22T13-03-37-FEl0-planting_insect_body_prompt_cache_first_frame_cloudbase.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T21-03-37-019f89ec-ac6e-7912-bc62-f36484b3d0ce.jsonl, updated_at=2026-07-23T00:36:16+00:00, thread_id=019f89ec-ac6e-7912-bc62-f36484b3d0ce, provider/cache/thinking facts were recorded and read back in ByteRover)

### keywords

- Anthropic Messages, cache_control: ephemeral, prompt_cache_key, promptCacheHitTokens, cachedTokens, cloudbaseAi.enableThinking, thinking: disabled, cloudbase-ai-openai-contract.js

## Task 13: Preserve a high-confidence concrete pest candidate without fabricating symptom evidence, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-22T08-20-54-csIJ-planting_entity_first_pest_routing_and_aphid_mode_retention.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T16-20-54-019f88e9-d874-7900-a3e9-3a4ec8fc4125.jsonl, updated_at=2026-07-22T09:58:06+00:00, thread_id=019f88e9-d874-7900-a3e9-3a4ec8fc4125, focused tests passed but Completion Gate was blocked by an unauthorized dirty overlap)

### keywords

- mode_candidates, aphid, confidence=0.95, confirmationCandidates, supportingEvidenceForMode, aphids_visible, yellow_speckling, stippling, spider_mite, diagnosis-mode-router, diagnosis-parser, preexisting dirty overlap

## User preferences

- when designing visual prompts, the user required “命中缓存为核心思想，不变量前置，变量后置” -> keep the schema/contract prefix stable and put entry profile, organ/capture region, plant context, previous evidence, and unresolved gaps in the dynamic tail [Task 1]
- when distinguishing “未获知虫害” from “已获知虫害”, do not give both entries the same candidate range: `full` may assess yellowing, wilting, and specific pests, while `pest` retains only specific-pest candidates [Task 1]
- when visual evidence is highly specific, reduce questioning; otherwise ask at most 1–2 questions. Keep risky follow-ups low-cost, low-risk, and as in-app as possible, with an explicit “我不敢/跳过” path that does not become a negative answer [Task 1]
- for C-end wording, prefer common names and visible appearance descriptions; keep academic names auxiliary [Task 1]
- when the user says “不要为了问诊而问诊” -> when one visible candidate already reaches `finalize/direct_result`, return the low-confidence “可能是” result instead of adding a pest refinement package with no discriminative value [Task 3]
- when a routing result crosses backend and UI boundaries, keep the deterministic router and user-visible flow consistent: protect result generation, legacy `direction_choice` handling, normalizer/runtime enrichment, and display computed state together [Task 3]
- when the user says “除了识别植物，还得识别图片的虫体” -> require every visual analysis to inspect and structure insect-body presence, shape, and location; do not infer a pest solely from yellowing, white spots, webbing, or silvering [Task 4]
- when the user says “注意 prompt cache” -> keep schema, insect rules, and the evidence directory in `buildCacheFirstVisualPrompt()`'s static prefix; put only image-specific context in its dynamic tail [Task 4]
- when the user asks “给我前端打印出完整的 prompt” -> first establish which layer actually constructs the prompt; do not log a truncated summary or claim a frontend source that does not exist, and constrain any full logging to a development/explicit log switch [Task 8]
- when the user says the prompt is “不够硬” and asks to identify “图片的虫体” -> force a separate body-first inspection and report presence, shape, and location; symptoms alone are not body evidence [Task 9]
- when the user supplies exact per-pest question limits, retain the contract verbatim and surface any dirty-worktree/authorization boundary rather than silently changing overlapping files [Task 10]
- when the user says `mode_candidates` contains `aphid` at `confidence=0.95` but “到了系统层面就把他丢了” -> preserve the real entity candidate without inventing `aphids_visible` [Task 13]

## Reusable knowledge

- Deterministic routing lives in `cloudfunctions/diagnose-http/domain/diagnosis-mode-registry.js` and `diagnosis-mode-router.js`: the model supplies evidence/candidates but cannot choose the final mode. Specific-pest questions live in `app/pest-question-package.js`; no global fixed-question-count assumption is valid because yellowing is fixed at 4 and wilting at 5, while specific pests use a 0–2 dynamic package [Task 1]
- Keep `full` and `pest` profile contracts distinct. `pest` is an internal/superordinate profile with no generic user question package; a specific mode must be admitted from formal visual evidence. Already accepted visual evidence hides equivalent questions and remains positive; preserve same-image/same-region constraints, synonym dedupe, and multi-result retention [Task 1]
- Cache-first prompt anchors are `utils/symptom-labeler-prompt.js` and `utils/visual-prompt-cache-contract.js`. Maintain static-prefix hash parity for `full`/`pest` and initial/retake calls; do not move variable context into the prefix [Task 1]
- `captureRegion` must survive from automator image input through `/diagnosis/start` `images[]`, normalizer, visual adapter, prompt, and router. The repaired live report saw `captureRegion: "leaf_lower_surface"` in all three final requests [Task 1]
- `DiagnoseFlow.vue` is the shared client core for the plant-card popup and standalone diagnosis tab. Yellowing/wilting no-image shortcuts still use their fixed packages rather than calling the visual model [Task 1]
- `retake-authorization.js` creates one server-side five-minute authorization only after user confirmation. Persist skip as `skipped_unknown`/`unknown`; authorization and skip are idempotent within their own state and cannot reverse each other. A risky retake analyzes only the new image while retaining formal first-batch evidence via `originVisualCallBatchId`, evidence summary, and unresolved groups [Task 1]
- Do not translate `surface_glossy_residue` into “sticky” or honeydew from the image alone: it means only visible glossy/transparent residue; use the honeydew interpretation only after the user explicitly selects stickiness [Task 1]
- All answerable packages use `pages/diagnose/question-package`; first submission is `answer_submit`, and the server session's `questionPackageSnapshot` is authoritative for `questionKey`/`optionKey`, while client package data is presentation/context only [Task 2]
- Build, lint, format, postflight, catalog validation, and 104 business assertions passed. The runtime script is `test/e2e/automator/diagnosis/pest-mode-and-retake.mjs`, catalog id `diagnosis.pest.visual_mode_retake` [Task 2]
- Set `candidateRefinementAvailable=true` and pest `directionChoices` only when `visibleOutcomes.length > 1` and provisional candidates exist. A single completed/finalizing candidate must return `directionChoices=[]`; even a stale client `direction_choice=pest` must receive the final result, not a new `specific_pest_visual` package [Task 3]
- Specific-pest questions rank, lower confidence, or distinguish multiple candidates; `no/no` and `unknown/unknown` fall back to `candidateModes[0]` as a low-confidence “可能是” outcome rather than `uncertain`. Test the nine yes/no/unknown combinations [Task 3]
- `VISUAL_OUTPUT_SCHEMA_TEXT` now requires `visual_discriminators` (`insect_body_presence`, `insect_body_shape`, `insect_body_location`) and `missing_info_for_path`; `STATIC_INSECT_INSPECTION_RULES` applies INSECT-BODY-FIRST. Symptoms must not be presented as an observed insect body; if unclear, use `uncertain`; a `leaf_miner_tunnel` is shape evidence, not a body sighting [Task 4]
- The cache-first static content is `schemaText`, `ruleText`, and `evidenceDirectoryText`; `dynamicTaskText` contains only current image, entry profile, region, context, and unresolved evidence. The static rules carry direct thresholds for `spider_mite`, `mealybug`, `scale_insect`, `whitefly`, `aphid`, `thrips`, `leaf_miner`, and `fungus_gnat` [Task 4]
- `thrips_visible` direct routing accepts `thrips >= 0.95` with high-confidence `insect_body_presence=present` and `insect_body_shape=slender`, in both `full` and `pest`; it must not require `leaf_upper_surface` or high-confidence location [Task 5]
- For result advice, `outcome-advice.js` sets `showOutcomeLabel=false` for one outcome and true for multiple outcomes; `setup.js` passes it through and `DiagnoseResultStage.vue` applies it to both action and avoid advice [Task 6]
- A real mini-program `wx.request` with a refreshed CloudBase temp URL returned 200 and finalized `thrips/蓟马` with no follow-up, but this is parser/backend-chain evidence only. Formal acceptance still requires catalog-backed `qa-run` for `diagnosis.pest.visual_mode_retake`, projectPath `dist/dev/mp-weixin`, port 9420, screenshots, and full product assertions [Task 7]
- `INSECT-BODY-FIRST` belongs in the static cache prefix: every image must return `visual_discriminators` plus `missing_info_for_path`; `present` needs a resolved body/colony/shell/larva, `uncertain` covers blur/occlusion/frame limits, and `leaf_miner_tunnel` is pattern evidence rather than a seen body [Task 9]
- The identified but unimplemented question-limit mismatch is concrete: current `diagnosis-mode-registry.js` and `pest-question-package.js` use `maxQuestions: 2` for every specific pest, while the requested table is `thrips=2` and the other seven modes `=1` [Task 10]
- `ensureDiagnosisStartRefactorReady()` lets unknown/expired usable readiness refresh once in the background while known-not-ready and refresh failure still return 503; direct event timing separates application readiness from provider/model TTFT, but it is not formal Automator acceptance [Task 11]
- CloudBase uses Anthropic Messages with `cache_control: ephemeral` only on the static system prefix; TokenHub instead uses a static-prefix-hash `prompt_cache_key`. Prove a cache hit only with normalized usage fields such as `promptCacheHitTokens`/`cachedTokens`, and treat `thinking: { type: 'disabled' }` as a reasoning-output setting, not proof of faster visual encoding [Task 12]
- A legal, profile/organ-matched specific-pest `mode_candidate` with sufficient confidence may remain a `confirmationCandidate` even without duplicate formal symptom evidence; this preserves the entity source but must not create direct evidence or fabricate `aphids_visible`. Keep low-confidence, invalid-profile, and organ-mismatched candidates filtered. `yellow_speckling`/`stippling` alone must not create `spider_mite`; visible mites or fine web plus stippling in the same image/region retain their own rules [Task 13]

## Failures and how to do differently

- Symptom: `captureRegion` looks present in UI/intermediate objects but disappears from the request. Cause: serialization-layer loss. Fix: verify the final `wx.request`/HTTP `images[]` payload rather than stopping at UI or in-memory objects [Task 1]
- Symptom: deep-contract result fails `changed file outside allowed_paths`. Cause: newly added tests were not included in the handoff. Fix: include the actual test directories an implementer may modify in `allowed_paths` before dispatch [Task 1]
- Do not claim isolated implementation verification from a shared dirty worktree. Postflight could not establish the change boundary because of undeclared/preexisting overlap; rerun from a clean isolated worktree [Task 1][Task 2]
- Do not convert 104 business assertions into a complete E2E/release pass. Both `App.captureScreenshot` and `mp.screenshot()` returned `fail to capture screenshot`, so the required nonempty PNG is absent; real-model black-feces Prompt proof, natural five-minute expiry, and production SQL migration/deployment also remain unresolved. Keep `.tmp/dispatch-task/pest-question-package-submit-route-20260721-01-runtime-qa-evidence.json` `blocked` [Task 2]
- For a complete rerun, first restore screenshot capability and a clean worktree; rerun the catalog leaf and generate new runtime QA evidence, then verify current-provider/cache behavior, real expiry, and SQL deployment if in scope [Task 2]
- Symptom: a single candidate still shows “继续细分虫害方向”. Cause: treating `provisionalModes.length > 0` as sufficient. Fix: jointly check final `visibleOutcomes` count and terminal state at every backend/frontend boundary [Task 3]
- Symptom: a new visual schema makes the prompt-cache contract test fail because it still excludes `visual_discriminators`/`missing_info_for_path`. Cause: stale negative assertions. Fix: update the old assertions to match the deliberately expanded contract, then run `node test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs` [Task 4]
- Symptom: an image test reports `图片下载失败(403)` / `visual_adapter_failed`. Cause: an expired signed temp URL, not necessarily a visual-model miss. Fix: regenerate the URL from the CloudBase fileId through mini-program `wx.cloud.getTempFileURL` before retesting [Task 7]
- `project_identity_unverified` blocks `qa-run` before product assertions, and a fixture timeout without screenshots or request evidence is not a formal Automator pass. Record this as failed environment, not product failure; do not claim completion from the successful raw `wx.request` [Task 7]
- Current runtime wording is `finalize` although the behavior is a direct terminal result; do not conflate the literals in assertions, and unify the route semantics before relying on the name as a contract [Task 7]
- Do not report this rollout as a whole-suite or Completion Gate pass: the focused prompt-cache test and scoped lint passed, but an unrelated `diagnosis-parser.mjs` expectation failed and formal QA stopped at `project_identity_unverified` [Task 9][Task 11]
- Do not add frontend prompt logging until the actual construction layer is confirmed. Here the client primarily sends image/context while the backend owns `formattedPrompt`; use a development-only backend/debug path if full prompt visibility is required [Task 8][Task 9]
- Symptom: a high-confidence concrete mode is missing downstream. Cause: requiring duplicate `supportingEvidenceForMode` even though the model returned a valid entity candidate. Fix: keep qualifying candidates as confirmation candidates only; test `aphid=0.95` without `aphids_visible`, plus `aphid=0.89`, invalid-profile, and organ-mismatch negatives [Task 13]

# Task Group: planting diagnosis-vision visual-specificity contract and ByteRover retrieval

scope: use this block when defining what the `planting` vision stage may conclude from an image, reviewing visual-recognition output boundaries, or answering a terse project concept query from verified project knowledge.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the live diagnosis configuration, identify runtime, and installed ByteRover helper path before relying on exact field limits or script locations; the evidence-vs-diagnosis separation is safe for related work in this checkout.

## Task 1: Define “视觉高特异性” from the project’s visual-recognition contract, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-20T04-49-20-Cyfi-define_visual_specificity_project_contract.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/20/rollout-2026-07-20T12-49-20-019f7ddb-6c93-79b2-b2ef-0311a9a63f0c.jsonl, updated_at=2026-07-20T04:49:57+00:00, thread_id=019f7ddb-6c93-79b2-b2ef-0311a9a63f0c, verified project definition and the currently usable ByteRover query path)

### keywords

- 视觉高特异性, visual_recognition_boundary, symptom_candidates, out_of_pool_symptom_candidates, route_hints, visual_call_batch_id, cloudfunctions/diagnose-http/configs/index.js, identify-runtime.js, ByteRover, MODULE_NOT_FOUND

## User preferences

- when the user asks with a terse project concept such as “视觉高特异性”, retrieve the project’s existing context first and give an executable project-contract definition; distinguish verified facts from inference instead of giving a generic explanation [Task 1]

## Reusable knowledge

- In this project, the visual stage standardizes current-image visible evidence only; it must not directly infer cause, treatment, or a diagnosis. The downstream diagnosis chain interprets and routes that evidence. “高特异性” means a stricter, more verifiable output boundary, not a more forceful disease-name prediction [Task 1]
- `symptom_candidates` has a maximum of 5 and must come from the dynamically narrowed allowed candidate pool. A visible phenomenon outside that pool belongs in `out_of_pool_symptom_candidates` [Task 1]
- `route_hints` is a process hint only, never a diagnosis conclusion. Track visual calls, raw/normalized output, admission records, and plant-identity resolution by `openid`, `session_id`, and `visual_call_batch_id` [Task 1]
- Verified implementation anchors are `cloudfunctions/diagnose-http/configs/index.js` and `cloudfunctions/layer/utils/identify-runtime.js`; the matching ByteRover topic is `architecture/diagnosis/visual_recognition_boundary.html` [Task 1]

## Failures and how to do differently

- Symptom: `node scripts/query.mjs` from the repo root returns `MODULE_NOT_FOUND`. Cause: the helper is not at that assumed root path. Fix: locate/read the installed ByteRover helper first; this checkout successfully used `node .agents/skills/byterover/scripts/query.mjs "<query>" --limit 5` (or `.agents/skills/byterover/query.md`) from the project directory [Task 1]

# Task Group: planting dispatch-hook governance, catalog-governed QA, and completion contracts

scope: use this block when changing or auditing the `planting` dispatch hook chain, catalog-backed automator acceptance, result/postflight/completion validators, or the test-tree migration; distinguish workflow-machine evidence from live mini-program product validation.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the live `.codex/hooks.json`, `.codex/skills/dispatch-task/` scripts, catalog, and validators before relying on exact behavior; the evidence/ownership rules are safe for similar dispatch work in this checkout.

## Task 1: Dispatch hooks, E2E catalog, unit-tree migration, and completion-gate governance, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-17T14-11-55-6BYc-dispatch_hook_governance_and_e2e_catalog_migration.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/17/rollout-2026-07-17T22-11-55-019f706b-6901-7b20-b27f-dab71b6595e8.jsonl, updated_at=2026-07-19T13:14:36+00:00, thread_id=019f706b-6901-7b20-b27f-dab71b6595e8, final validator, catalog, migration, hook, workflow-E2E, and diff checks passed; no live DevTools/automator run)

### keywords

- dispatch-gate, .codex/hooks.json, dispatch-gate-adapter.mjs, SubagentStop, stop_hook_active, PostToolUse, qa-run, e2e catalog, validate-e2e-catalog, validate-e2e-migration, validate-result.mjs, validation_evidence, completion readiness, test/unit/frontend, test/unit/backend, test/e2e/batch, dirty baseline

## Task 2: Verify native lifecycle capability, low-frequency episode monitoring, Automator readiness, and BRV boundaries, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-21T07-34-47-RDXv-dispatch_subagent_automator_brv_efficiency_partial.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T15-34-47-019f8399-4411-7b80-a5df-fe0c9ae4284d.jsonl, updated_at=2026-07-21T14:28:34+00:00, thread_id=019f8399-4411-7b80-a5df-fe0c9ae4284d, CLI fallback and episode controls verified; live Automator identity and Completion Gate blocked)

### keywords

- dispatch-task, episode, cli_fallback, SubagentStart, SubagentStop, PostToolUse, hook-capability, early_check_reason_evidence_required, qa-reconcile, already_reconciled, Automator, 9420, project_identity_unverified, dirty-worktree, Completion Gate

## Task 3: Complete dispatch validator recovery and authorized main takeover, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-26T14-56-34-Ifjt-dispatch_governance_main_takeover_exact_glob_intersection.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/26/rollout-2026-07-26T22-56-34-019f9eed-86cd-7a00-977d-7ef69c84eba3.jsonl, updated_at=2026-07-27T14:32:23+00:00, thread_id=019f9eed-86cd-7a00-977d-7ef69c84eba3, exact intersection regressions and completion-readiness validation passed; aggregate QA retains an unrelated DevTools assertion failure)

### keywords

- dispatch-task, main_takeover, implementation_mode=main_takeover, provider_status=delivered, epsilon-NFA, product-automaton, validate-handoff.mjs, validate-result.mjs, validate-completion-readiness.mjs, p/*a, p/z*

## User preferences

- when an implementer is running, preserve same-thread ownership, the run lock, and low-frequency waiting; do not let main modify code while the implementer may still write [Task 1]
- when accepting workflow work, require actual command/tool evidence—hook telemetry, feature-test commands after the last edit, catalog/hash/execution records, and result-contract validation—not required-skill declarations or self-reported completion [Task 1]
- when the user asks “都执行完毕了？还是你又在耍我？” -> explicitly distinguish contract/code regression, implementer completion, live runtime validation, and Completion Gate status; never let partial evidence imply the whole task completed [Task 2]
- when the user requests a native hook probe and a real subagent status card before more general discussion -> run the real capability/monitoring check first and retain clear downgrade/blocker evidence [Task 2]
- when ZCode was unavailable, the user said “你来完全承接此任务，不在有zcode了” -> take over only when that authority is explicit and scoped; use the dedicated `implementation_mode=main_takeover` contract rather than silently treating provider delivery as completion [Task 3]

## Reusable knowledge

- The active hook chain is `.codex/hooks.json -> .codex/hooks/dispatch-gate-adapter.mjs -> .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs` [Task 1]
- `SubagentStop` emits one `decision: block` continuation for ordinary aggregate omissions and allows the second stop; `stop_hook_active=true` prevents a loop. Keep true blockers separate from ordinary omissions [Task 1]
- `PostToolUse` records terminal/code-edit/Figma/BRV/QA telemetry and may create `.tmp/dispatch-task/<run>/qa-skeleton.json` only after successful postflight [Task 1]
- Credit automator acceptance only through `dispatch-gate cli.mjs qa-run` with catalog id, script hash, and execution id. A direct automator run is troubleshooting evidence, not acceptance evidence [Task 1]
- The unit layout mirrors `src/**` and `cloudfunctions/**` under recursive `test/unit/frontend/**` and `test/unit/backend/**`; cross-boundary tests belong in `test/e2e/batch/**`, and unit filenames must not use a `test-` prefix [Task 1]
- The final workflow checks passed handoff, result, postflight, completion readiness, catalog (8 entries / 8 executable leaves), migration inventory (509 mapped HEAD assets / 19 explicit moves), hook self-test, workflow E2E, and diff check. This establishes governance-machine evidence only; it does not establish live product runtime validation [Task 1]
- A native lifecycle probe produced no attributable `SubagentStart`, `SubagentStop`, or `PostToolUse` telemetry. The supported capability is therefore `cli_fallback`: `.codex/hooks.json` retains only `PreToolUse`/`PostToolUse`, while lifecycle is explicit `episode open/start/status/finish`; do not leave invalid native hooks as a false `native_supported` claim [Task 2]
- Episode monitoring is evidence-gated: first check about 10 minutes after start, later checks at least 5 minutes apart; an early status query must supply reason and reason evidence or return `early_check_reason_evidence_required`. `qa-reconcile` is idempotent and returns `already_reconciled` without appending history [Task 2]
- Before accepting live Automator QA, prove target project identity, 9420 listener/control path, screenshots, and mini-program `wx.request`. `project_identity_unverified` blocks the run; a bare automation attempt is not evidence [Task 2]
- Use the enforced lifecycle `provider delivery -> recovery -> review -> QA -> completion readiness -> completed`; provider `delivered` is only an implementation milestone, and `validate-completion-readiness.mjs` must pass before `episode finish --status=completed` [Task 3]
- Exact allowed/forbidden glob intersection is a finite product search over epsilon-closures: `*` consumes non-`/`, `**` consumes any character including `/`, and literals plus `/` form the finite alphabet. This replaced bounded representative sampling, which missed `p/*a` versus `p/z*` at `p/za` [Task 3]
- `main_takeover` authorization is validated across handoff, result, and completion readiness. Blocked recovery may record forbidden/out-of-scope files as evidence; completed recovery may not [Task 3]

## Failures and how to do differently

- A completed-looking result with `validation_evidence={}` is structurally invalid: run `validate-result.mjs` before treating it as completed, and retain a regression case that proves completion readiness rejects the same invalid contract [Task 1]
- Do not trust a user confirmation that a workspace is ready as the baseline. Verify `git status --short --untracked-files=all` independently; this thread found 562 dirty paths, then 8 untracked paths, before a later clean check [Task 1]
- If an aggregate shell verification fails with `SyntaxError: Invalid or unexpected token`, rerun critical validators separately and retain those individual results as the evidence [Task 1]
- Do not claim live DevTools or mini-program-automator validation from catalog dry-runs, batch governance checks, or the implementer's unit report [Task 1]
- A shared dirty worktree with outside/unsafe preexisting overlap blocks postflight and Completion Gate. Do not restore, roll back, or attribute global `git status` to this task; use baseline/target-file evidence and rerun in a clean worktree [Task 2]
- Do not report overall completion while `project_identity_unverified` prevents the Automator happy path or while screenshot/`wx.request`/LAN evidence, final BRV readback, and Completion Gate remain outstanding [Task 2]
- The aggregate `qa-and-validation.mjs` still stops at a pre-existing DevTools assertion (`devtools_automator_blocker` versus `project_identity_unverified`). Keep this limitation separate: the new contract assertions executed before it and passed [Task 3]

# Task Group: planting user-plant edit form, field persistence, and end-to-end acceptance

scope: use this block when `planting` changes share add/edit plant form UI, add `edit-plant` navigation, or alter persisted user-plant fields and need proof beyond an implementer test report or a raw API probe.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the listed source, API, and dispatch-contract files before reusing implementation details; the acceptance rule is safe for similar business/data/persistence changes.

## Task 1: Extract the shared plant-information form and add the edit-plant flow, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-17T14-11-55-6BYc-dispatch_hook_governance_and_e2e_catalog_migration.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/17/rollout-2026-07-17T22-11-55-019f706b-6901-7b20-b27f-dab71b6595e8.jsonl, updated_at=2026-07-19T13:14:36+00:00, thread_id=019f706b-6901-7b20-b27f-dab71b6595e8, initial shared-form/edit-route dispatch was stopped before implementation because unrelated dirty files overlapped)
- rollout_summaries/2026-07-17T00-26-15-8Fbp-plant_edit_form_dispatch_and_e2e_process_audit.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/17/rollout-2026-07-17T08-26-15-019f6d77-7ff8-7d21-8407-9f9dce3740c7.jsonl, updated_at=2026-07-17T06:17:46+00:00, thread_id=019f6d77-7ff8-7d21-8407-9f9dce3740c7, implementation and field-level API persistence were reported, but the real UI chain stayed blocked in DevTools)

### keywords

- add-plant, edit-plant, PlantInfoStepPanel.vue, PlantForm.vue, plantDate, notes, user-plants, query cache, test-user-plant-edit-contract.mjs, miniprogram-automator, 9420, DevTools timeout, runtime-qa-evidence

## Task 2: Audit dispatch-task business-test coverage and require a reproducible automator E2E script, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-17T00-26-15-8Fbp-plant_edit_form_dispatch_and_e2e_process_audit.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/17/rollout-2026-07-17T08-26-15-019f6d77-7ff8-7d21-8407-9f9dce3740c7.jsonl, updated_at=2026-07-17T06:17:46+00:00, identified that validator status checks did not prove feature coverage and documented the expected script-first E2E sequence)

### keywords

- validate-result-evidence.mjs, validation_evidence.unit_tests.result, e2e_script_required, e2e_script_path, automator_required, Completion Gate, screenshots, wx.request, unit_tests not_applicable

## User preferences

- when the user asks for one component supporting “新增和编辑模式”, keep a shared form with create/edit chosen at the route level instead of duplicating the UI [Task 1]
- when the user says `之前的验收不合格`, do not call a form/data feature done from an implementer report or an API probe; verify the real chain `首页卡片点击 -> 编辑页重新创建 -> 字段回显 -> 保存 -> 再次进入` [Task 1]
- when fields such as `plantDate` and `notes` change, check each one through persistence, query, store/cache refresh, and form initialization rather than inferring UI correctness from a successful PATCH [Task 1]
- when the user asks why unit tests were skipped or whether E2E should be planned first, make the validation contract strict and traceable: scenarios/assumptions first, then a replayable script and script-linked evidence [Task 2]

## Reusable knowledge

- The shared form/edit chain spans `src/pages/add-plant/components/PlantInfoStepPanel.vue`, `PlantForm.vue`, `src/pages/edit-plant/edit-plant.vue`, `src/store/plants.js`, `src/vue-query/plants/queries/user-plants.js`, and `src/vue-query/plants/mutations/user-plants.js`. The reported repair removes `createdAt` as a fake date and adds cache invalidation/refresh for `plantDate` and `notes` [Task 1]
- The report included `test/unit-test/test-user-plant-edit-contract.mjs` in `test:ci`, and 9420 `wx.request` PATCH/GET evidence showed `plantDate` and `notes` could be saved/read back; this is field-level contract evidence, not a substitute for UI E2E [Task 1]
- For `automator_required` work, use the sequence: define user scenarios/assertions -> write and statically check the feature-specific E2E script -> connect DevTools -> execute it -> retain script-produced page state, screenshots, and `wx.request` evidence [Task 2]
- `validate-result-evidence.mjs` checks the status of `validation_evidence.unit_tests.result`, not whether those tests cover the changed business behavior. Handoffs for business/API/persistence changes should name a feature-specific contract test; `unit_tests: not_applicable` alone is insufficient [Task 2]

## Failures and how to do differently

- Do not dispatch an edit-form change or create its baseline while unrelated files overlap. Independently check `git status --short --untracked-files=all`; this task was correctly stopped before implementation until the workspace became clean [Task 1]
- Green `npm run test:ci` can cover unrelated Pinia/Tailwind tests. Inspect the actual test files and require coverage of the changed fields/flow before accepting the result [Task 1][Task 2]
- With the DevTools stack stuck at `pages/index/index -> pages/edit-plant/edit-plant?id=15` and reLaunch, element queries, and screenshots timing out, mark runtime evidence `blocked`; do not promote raw `wx.request` or temporary automator probes to passed E2E [Task 1]
- Do not assemble runtime steps and screenshot paths after the fact. Without an executed, dedicated E2E script whose outputs are traceable, Completion Gate must not claim runtime success [Task 2]

# Task Group: planting dispatch-task Web external-implementer runtime acceptance, wait-policy, and worktree contract

scope: use this block when `planting` workflow-governance work needs Web/TRAE external-implementer runs validated through worktree-scoped mini-program runtime evidence, explicit browser handoff state, or machine-checkable completion-gate rules without thinning away critical runtime proof.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while Web/cloud external-implementer work still routes through `.codex/skills/dispatch-task/` and runtime/completion validation is enforced through the current dispatch validators plus main-owned receipts.

## Task 1: Review a plan to thin dispatch-task gates without dropping machine-checkable runtime evidence, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-13T09-53-29-9abf-dispatch_task_thin_plan_review_with_main_owned_qa_docs.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/13/rollout-2026-07-13T17-53-29-019f5ae5-5e1a-7e42-91ed-ef24c3a77179.jsonl, updated_at=2026-07-14T05:25:07+00:00, thread_id=019f5ae5-5e1a-7e42-91ed-ef24c3a77179, re-evaluated a dispatch-task thinning plan after the user clarified QA/docs are already main-owned and kept focus on preserving machine-checkable runtime evidence)

### keywords

- dispatch-task, plan review, main_qa, qa_review, docs_keeper, runtime-evidence.json, validate-completion-readiness.mjs, miniprogram_automator, runtime_context.projectPath, planned_worktree_path, completion gate

## Task 2: Make mini-program automator QA require explicit worktree-scoped runtime context, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-13T13-50-49-rnkd-dispatch_task_mini_program_runtime_projectpath_contract.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/13/rollout-2026-07-13T21-50-49-019f5bbe-a9ad-7212-b297-537f20f9e8b9.jsonl, updated_at=2026-07-13T14:39:45+00:00, thread_id=019f5bbe-a9ad-7212-b297-537f20f9e8b9, added `validation.miniprogram_automator_required` and enforced worktree-matching `runtime_context.projectPath` through result and completion validators)

### keywords

- miniprogram_automator_required, runtime_context.projectPath, validate-completion-readiness.mjs, validate-worktree-scope.mjs, qa_reviewer.toml, worktree, dist/dev/mp-weixin, devtools_configuration_blocker, external_implementer

## Task 3: Harden Codex Desktop Web/TRAE wait policy and tab retention for real external-provider completion checks, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-14T06-08-26-kJTM-trae_web_external_wait_policy_tab_retention.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T14-08-26-019f5f3d-b1f4-7723-9087-169b9360bf06.jsonl, updated_at=2026-07-14T07:09:50+00:00, thread_id=019f5f3d-b1f4-7723-9087-169b9360bf06, made 5-minute child-run-lock checks and explicit TRAE tab retention part of the Web external send/result contract)
- extensions/ad_hoc/notes/20260714-171244-trae-dispatch-completion-gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/20260714-171244-trae-dispatch-completion-gate.md, updated_at=2026-07-14T17:12:44Z, thread_id=None, authoritative note confirming that TRAE `completed` ends only implementation and main still owns review, runtime, docs/ByteRover, and Completion Gate) [ad-hoc note]

### keywords

- dispatch-task, external_implementer, TRAE, builtin_in_app_browser, tab_retention, external_wait_policy, child_run_lock, browser.tabs.finalize.keep, short_timeout_completion_forbidden, validate-result.mjs, 5-minute checks

## Task 4: Route the watering-advisor navigation bug through the Web/TRAE remote-sync baseline flow without pausing on avoidable manual choices, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-14T07-18-23-5t6u-watering_advisor_trae_remote_sync_baseline_navigation_bug.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T15-18-23-019f5f7d-bac2-7fc1-9583-803baf58384e.jsonl, updated_at=2026-07-14T07:19:44+00:00, thread_id=019f5f7d-bac2-7fc1-9583-803baf58384e, exposed the current `goToMyPlants()` bug and clarified that Web-agent remote-sync should proceed automatically when the dispatch contract already covers the safe path)

### keywords

- watering-advisor, 从我的植物选, my plants, goToMyPlants, uni.navigateBack, uni.navigateTo, dispatch-task, TRAE, remote_sync, baseline commit, dirty workspace, worktree

## Task 5: Separate dispatch QA contracts from automator implementation and business rules, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-14T07-14-23-4YgL-watering_advisor_dispatch_and_runtime_qa_rule_separation.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T15-14-23-019f5f7a-1409-7c43-b234-9e869951afbf.jsonl, updated_at=2026-07-17T00:16:48+00:00, completed the line-by-line ownership split after the watering-advisor dispatch investigation)

### keywords

- mini-program-runtime-qa.md, miniprogram-automator-runtime/SKILL.md, runtime_acceptance_mode, status, failures, not_verified, channel, projectPath, pagePath, evidence_paths, feature-action-button-{entityId}, quick_validate.py, ModuleNotFoundError: No module named 'yaml'

## User preferences

- when the user clarifies `qa-reviewer` and `docs-keeper` are already back on main, recalculate the review against that current baseline instead of judging the plan against older role-routing assumptions [Task 1]
- when the user is reviewing dispatch-task thinning, separate redundant role receipts from the runtime evidence that still must stay machine-checkable [Task 1]
- when the user moves from `先做定点验证` to `两个一起做掉` around runtime QA, finish the contract change and the validator/example proof chain together instead of stopping at docs or one validator layer [Task 2]
- when the user repeatedly focuses on `projectPath` for `miniprogram-automator`, treat exact runtime evidence source as part of the acceptance contract, not a detail to infer later [Task 2]
- when the user says `如果没有设计，就按 main 进程保持每5分钟低频检查内置浏览器 web agent状态`, treat 60s or 90s waits as probe-only and default formal Web-agent completion checks to 5-minute low-frequency polling [Task 3]
- when the user says `将这点纳入规则，然后用新的规则再次打开内置浏览器，发送给trae`, make browser/tab retention an explicit receipt contract instead of relying on default Browser Use cleanup behavior [Task 3]
- when the user says the Web-agent mode should auto-handle git/push baseline flow and responds to a choice prompt with just `2`, do not stop for manual confirmation if the dispatch contract already defines a safe automated path; keep unrelated dirty changes safe through baseline/worktree separation instead [Task 4]
- when the user says `正确行为是点击后出现我的植物列表而不是返回`, treat the watering-advisor entry bug as a forward-navigation issue, not a back-navigation flow [Task 4]
- when the user says `继续深度，逐行分析。规则里还有很多业务`, perform a literal ownership audit of every rule: dispatch contract/evidence, runtime procedure, or domain policy; do not stop after moving obvious examples [Task 5]
- when the user says `那你来改吧`, make the source-of-truth edits and validate them rather than returning only a split proposal [Task 5]

## Reusable knowledge

- `validate-completion-readiness.mjs` still requires `main-qa-receipt.json` when `qa_required=true` and still checks `runtime_context.channel=miniprogram_automator`, `projectPath`, `pagePath`, and automator port/wsEndpoint [Task 1]
- `mini-program-runtime-qa.md` still ties Web/cloud external-implementer runtime QA to `external_contract.remote_sync.planned_worktree_path/dist/dev/mp-weixin`, so any thinning plan has to preserve the ability to prove the worktree-specific runtime path [Task 1][Task 2]
- deleting deprecated `qa-reviewer.toml` / `docs-keeper.toml` files is only safe after their remaining behavior rules are migrated into active `SKILL.md` / references / validators [Task 1]
- the lower-risk simplification target is to collapse redundant postflight role receipts while keeping compact but machine-checkable runtime QA fields such as `status`, `failures`, `not_verified`, `runtime_context.projectPath`, `pagePath`, and `evidence_paths` [Task 1]
- `validation.miniprogram_automator_required` is now the stable switch for mini-program runtime QA. When true, `validate-handoff.mjs`, `validate-result.mjs`, `validate-completion-readiness.mjs`, and `qa-reviewer.toml` all expect explicit runtime context rather than keyword inference [Task 2]
- For Web/云端 external-implementer runs, the accepted runtime path must come from the current worktree, typically `<planned_worktree_path>/dist/dev/mp-weixin`; mixing main-workspace artifacts with worktree artifacts should be treated as `devtools_configuration_blocker` [Task 2]
- The positive/negative proof pair is now explicit: validator chains passed with worktree-scoped `runtime_context.projectPath=/tmp/.../dist/dev/mp-weixin` and blocked when the path fell back to `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` [Task 2]
- The example chain for this contract lives under `.codex/skills/dispatch-task/examples/` and includes handoff, external result, QA result, worktree-scope report, no-new-deps report, and style-stack report fixtures for Web mini-program runtime flows [Task 2]
- Codex Desktop Web external send receipts now need both `tab_retention` and `external_wait_policy`. The durable values here are `tab_retention.status=handoff`, `tab_retention.method=browser.tabs.finalize.keep`, `external_wait_policy.mode=child_run_lock`, `initial_check_min_minutes>=5`, `poll_interval_min_minutes>=5`, and `short_timeout_completion_forbidden=true` [Task 3]
- Short waits are only for immediate send/UI probes or one-off identity checks. Formal completion monitoring for Web external implementers is now a separate contract from the send probe itself [Task 3]
- `completed` from TRAE only means the implementer phase ended. Main still owns isolated worktree cleanup, diff-first review, required LAN or mini-program runtime acceptance, docs/ByteRover impact handling, and the final Completion Gate before reporting the task done [Task 3][ad-hoc note]
- For the current watering-advisor bug family, `src/pages/watering-advisor/watering-advisor.vue` is the file that currently contains `goToMyPlants()` and still calls `uni.navigateBack()`, while `src/pages/index/index.vue` launches the page through `goWateringAdvisor()` to `/pages/watering-advisor/watering-advisor` [Task 4]
- Canonical split: `.codex/skills/dispatch-task/references/mini-program-runtime-qa.md` defines when/what evidence/gates apply; `.codex/skills/miniprogram-automator-runtime/SKILL.md` defines DevTools/9420 connection, interaction, scrolling, selector resolution, screenshots, and runtime blocker classification. Keep domain policy out of both generic surfaces [Task 5]
- Keep runtime evidence machine-checkable: `status`, `failures`, `not_verified`, `runtime_acceptance_mode`, `channel`, `projectPath`, `pagePath`, automator endpoint, and `evidence_paths`. Local gateway/LAN troubleshooting is referenced through `references/local-smoke-test-and-lan-direct-connection-policy.md` rather than duplicated [Task 5]

## Failures and how to do differently

- do not approve a thinning plan that reduces runtime QA to a path-only `runtime-evidence.json`; preserve status, failure, and `not_verified` semantics plus the runtime context that proves the right worktree path was used [Task 1]
- do not delete deprecated QA/docs agent files just because the roles are now main-owned; first migrate any remaining behavior rules into the active dispatch-task contract surfaces [Task 1]
- Do not stop after adding one validator rule for mini-program runtime QA. The July 13 hardening only became reliable after handoff schema, result validation, QA output contract, examples, and completion gate all enforced the same `projectPath` rule [Task 2]
- Do not mix main-workspace runtime evidence into a Web/worktree run. If `runtime_context.projectPath` points back to `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` during a worktree-backed task, block completion rather than accepting a generic QA pass [Task 2]
- Do not run negative-path tests out of order. The failed `ENOENT` check came from validating before the bad fixture file existed; write the fixture first, then validate sequentially so blocker tests exercise the intended rule [Task 2]
- Do not treat a 60-second wait as the formal completion window for a Web external implementer. If the task is about true completion/failure judgment, switch to the 5-minute child-run-lock cadence and preserve the provider tab as a visible handoff artifact [Task 3]
- Do not let Browser Use close the provider tab implicitly when the user cares about whether the TRAE session survived. Record explicit tab retention and the session URL in the send receipt [Task 3]
- Do not stop to ask the user how to handle dirty changes when the repo's Web-agent contract already defines the safe automated remote-sync path. Keep moving with baseline/worktree separation unless the remaining choice is genuinely unsafe or unsupported [Task 4]
- Do not report a TRAE run complete just because the provider returns `completed`; main still needs review, cleanup, runtime acceptance, docs/BRV handling, and Completion Gate closure before the user-facing completion claim [Task 3][ad-hoc note]
- The first cleanup left substantial runtime/business detail in the dispatch reference. Classify every line before editing; keep only contract/evidence there and use generic runtime examples such as `feature-action-button-{entityId}` / `feature-panel` in the runtime skill [Task 5]
- `quick_validate.py` was not executed because available interpreters lacked PyYAML (`ModuleNotFoundError: No module named 'yaml'`). A dependency-free frontmatter check plus `git diff --check` passed, but do not represent that as official-validator success [Task 5]

# Task Group: planting dispatch-task main-owned QA/docs/BRV receipts and runtime acceptance modes

scope: use this block when `planting` workflow-governance work touches who owns QA, docs, or ByteRover/BRV receipts, or when runtime-heavy tasks need the main-owned `runtime_acceptance_mode` contract instead of older `qa_reviewer` / `docs_keeper` routing.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while `.codex/skills/dispatch-task/` remains the active workflow contract and new handoffs/results continue to use `main_qa`, `main-docs`, and `main-brv` receipt shapes rather than active subagent-owned QA/docs routing.

## Task 1: Rehome QA/docs/BRV ownership into main-owned receipts and update dispatch gates, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T05-58-44-ifqn-dispatch_task_main_owned_qa_docs_brv_receipts.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T13-58-44-019f54e8-1623-7042-8d52-7f9ac2058acf.jsonl, updated_at=2026-07-14T03:43:59+00:00, thread_id=019f54e8-1623-7042-8d52-7f9ac2058acf, replaced the older transpiration-design memory for this thread with the current main-owned QA/docs/BRV governance overhaul and validator proof chain)

### keywords

- dispatch-task, main_qa, runtime_acceptance_mode, automator_required, batch_only, batch_substitute_allowed, validate-handoff.mjs, validate-result.mjs, validate-completion-readiness.mjs, prepare-runtime-worktree-env.mjs, check-miniprogram-qa-env.mjs, Figma baseline, BRV, docs governance

## User preferences

- when the user corrects the workflow contract rather than one script, update the whole rule chain end-to-end instead of patching only a single validator or note [Task 1]
- when the rollout converges on `main-owned QA/docs/BRV`, keep QA and document governance in main-owned receipts rather than routing new work through separate `qa_reviewer` / `docs_keeper` execution roles [Task 1]

## Reusable knowledge

- `validate-handoff.mjs` now blocks `spawn_contract.qa_agent_type` for new handoffs and expects main-owned QA routing rather than new `qa_reviewer` assignment [Task 1]
- `validate-result.mjs` now validates `main_qa` receipts and expects Figma baseline evidence to say `acquired_by: "main"` [Task 1]
- `validate-completion-readiness.mjs` now accepts `main-qa-receipt.json`, `main-docs-receipt.json`, and `main-brv-receipt.json` as the active completion-gate surfaces [Task 1]
- `runtime_acceptance_mode` is now the runtime-heavy switch for dispatch tasks. The durable modes here are `automator_required`, `batch_only`, and `batch_substitute_allowed`, with `batch_substitute_allowed` requiring a user approval ref [Task 1]
- `prepare-runtime-worktree-env.mjs` copies `.env.local` into the planned worktree while redacting values, and `check-miniprogram-qa-env.mjs` verifies `projectPath`, `project.config.json`, DevTools CLI presence, `.env.local`, and `9420` listening when `automator_required` is active [Task 1]
- The proof chain for this contract is concrete: `validate-handoff.mjs`, `validate-result.mjs main_qa`, and `validate-completion-readiness.mjs` all passed on the updated examples, while `qa_agent_type:"qa_reviewer"`, `acquired_by:"qa_reviewer"`, automator-required batch-only evidence, and missing batch-substitute approval all blocked as intended [Task 1]
- Deprecated `qa_reviewer` / `docs_keeper` TOML files still exist as compatibility stubs, but active routing no longer uses them for new dispatch-task QA/docs governance [Task 1]

## Failures and how to do differently

- Do not let `runtime_acceptance_mode` leak into ordinary Figma QA. The first version overreached; runtime-mode rules should only activate when the task explicitly declares runtime validation [Task 1]
- Do not treat large validator-file cleanup as part of every governance pass. `validate-result.mjs`, `validate-handoff.mjs`, and `SKILL.md` grew large here; if line-count cleanup matters, split it into a separate refactor instead of mixing it into contract surgery [Task 1]
- Do not keep writing new memory or workflow guidance as if `qa_reviewer` / `docs_keeper` remain active dispatch targets. Preserve old evidence, but route new contract work to the current main-owned receipt model [Task 1]

# Task Group: planting dispatch-task external-implementer prompt contract unification

scope: use this block when `planting` workflow-governance work touches `.codex/skills/dispatch-task` prompt contracts, shared external-implementer templates, validators, or example packets and the user wants one canonical schema across providers.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while external-implementer prompt generation still lives under `.codex/skills/dispatch-task/` with shared templates/validators and provider-specific adapters layered underneath.

## Task 1: Close the external-implementer prompt-schema gap so ZCode and TRAE share one canonical contract, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T14-00-40-t9Wl-dispatch_task_external_prompt_unification.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T22-00-40-019f56a1-4fc3-77f0-8fce-eb29ac287f8d.jsonl, updated_at=2026-07-13T00:01:07+00:00, thread_id=019f56a1-4fc3-77f0-8fce-eb29ac287f8d, closed the validator/template mismatch behind the claimed shared external-implementer prompt schema)

### keywords

- dispatch-task, external_implementer, zcode_external, external-implementer-routing.md, validate-external-prompt.mjs, validate-zcode-prompt.mjs, validate-zcode-send-receipt.mjs, EXTERNAL_IMPLEMENTER_HANDOFF, EXTERNAL_IMPLEMENTER_RESULT, prompt schema

## Task 2: Remove the duplicate zcode prompt template and keep one authoritative template path, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T14-00-40-t9Wl-dispatch_task_external_prompt_unification.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T22-00-40-019f56a1-4fc3-77f0-8fce-eb29ac287f8d.jsonl, updated_at=2026-07-13T00:01:07+00:00, thread_id=019f56a1-4fc3-77f0-8fce-eb29ac287f8d, deleted the duplicate `assets/zcode-prompt-template.md` after confirming byte identity with the canonical template)

### keywords

- zcode-prompt-template.md, assets/templates/zcode-prompt-template.md, assets/zcode-prompt-template.md, cmp -s, duplicate template, canonical path, dispatch-task

## Task 3: Migrate legacy `zcode_external` examples to the unified `external_implementer` contract and re-run the validator chain, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T14-00-40-t9Wl-dispatch_task_external_prompt_unification.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T22-00-40-019f56a1-4fc3-77f0-8fce-eb29ac287f8d.jsonl, updated_at=2026-07-13T00:01:07+00:00, thread_id=019f56a1-4fc3-77f0-8fce-eb29ac287f8d, migrated example handoff/result packets and trigger docs to the shared external contract and validated them)

### keywords

- examples/zcode-external-ui-handoff.json, examples/simple-zcode-trigger.md, examples/zcode-external-result.json, implementation_mode=external_implementer, external_contract.provider=zcode, validate-handoff.mjs, validate-result.mjs external

## User preferences

- when the user says `这点两者必须相同,甚至是所有的external implementer都必须一样,这是硬规定`, treat prompt generation as a globally shared external-implementer contract unless the user explicitly approves provider-specific divergence [Task 1]
- when the user says `review下刚才的 prompt 结构统一的收口是否有隐患或问题` and then `你来闭环`, review contract changes by looking for holes in validators/templates/examples and close the loop instead of defending the first pass [Task 1][Task 3]
- when the user says `开始啊,为什么总说不做?`, stop narrating and start the requested edit/migration immediately [Task 1][Task 3]
- when the user points at `.codex/skills/dispatch-task/assets/templates/zcode-prompt-template.md 这个模板有2个,我理解应该只保留其中一份即可`, delete duplicate template aliases and keep one authoritative path [Task 2]

## Reusable knowledge

- The canonical shared external prompt now lives in `.codex/skills/dispatch-task/assets/templates/external-implementer-prompt-template.md`, and the shared validator is `.codex/skills/dispatch-task/scripts/validate-external-prompt.mjs` [Task 1]
- The unified sentinel pair is `<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START|END>>>` and `<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:START|END>>>`; provider adapters should vary transport behavior, not prompt section set, order, or sentinel [Task 1]
- `validate-zcode-prompt.mjs` and `validate-zcode-send-receipt.mjs` had to expand from `implementation_mode=zcode_external` to the shared `external_implementer` contract while still recognizing `external_contract.provider=zcode` [Task 1]
- Duplicate template cleanup was evidence-backed: `cmp -s` confirmed `assets/templates/zcode-prompt-template.md` and `assets/zcode-prompt-template.md` were byte-identical before deletion, so the durable path is `assets/templates/zcode-prompt-template.md` [Task 2]
- Example migration is part of contract closure, not optional polish. The useful smoke-test set here was `validate-handoff.mjs`, `validate-external-prompt.mjs`, `validate-zcode-prompt.mjs`, `validate-zcode-send-receipt.mjs`, and `validate-result.mjs external` against the updated example files [Task 3]

## Failures and how to do differently

- Do not stop at documentation-only unification. If the validator or template still enforces `zcode_external`, the contract is not actually unified and runtime mismatch is still live [Task 1]
- Do not summarize duplicate-path findings without deleting the extra file when the user has already asked for one canonical template. Treat it as a cleanup action, not a discussion point [Task 2]
- Do not leave examples on the legacy contract after validators/docs move forward. Run the example migration and validator chain immediately so half-updated fields surface before the task closes [Task 3]

# Task Group: browser automation controlled-page opening and target URL disambiguation

scope: use this block when the user asks to open a site or profile in a Chrome-controlled browser session rather than just describe it, especially when multiple candidate entrypoints or domains exist.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe for this Codex/browser environment when the user explicitly wants a Chrome-controlled page flow; if the target route is ambiguous, confirm the exact page or resolve it by opening the smallest candidate set.

## Task 1: Open TRAE controlled pages in Chrome and resolve the likely target, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T14-46-34-jfAq-open_trae_controlled_pages_in_chrome.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T22-46-34-019f56cb-56c4-7d63-b83d-f4c9db93ca06.jsonl, updated_at=2026-07-12T14:48:25+00:00, thread_id=019f56cb-56c4-7d63-b83d-f4c9db93ca06, used Chrome DevTools controlled browsing to open several TRAE entrypoints and settled on `https://www.trae.cn/`)

### keywords

- TRAE, Chrome DevTools, controlled page, profile, work.trae.cn, solo.trae.cn, www.trae.cn, www.trae.ai/work?showJoin=1, external-implementer-routing.md, browser automation

## User preferences

- when the user says `trae的profile,用chrome 插件打开受控的trae页面`, handle the request through an actual controlled browser flow rather than only a textual answer [Task 1]
- when the user names a page like `profile`, treat the exact subpage/route as part of the task and clarify or resolve it instead of assuming the homepage [Task 1]

## Reusable knowledge

- For TRAE Web work in this repo, the routing reference worth checking first is `.codex/skills/dispatch-task/references/external-implementer-routing.md`, which documents Web TRAE / Chrome controlled-page expectations [Task 1]
- The successful controlled-page run opened `https://work.trae.cn/`, `https://work.trae.cn/profile`, `https://solo.trae.cn/`, `https://www.trae.ai/work?showJoin=1`, and `https://www.trae.cn/`, then kept `https://www.trae.cn/` as the selected page [Task 1]

## Failures and how to do differently

- Do not assume one TRAE domain when the request only says `profile`; the live ambiguity here was across `work.trae.cn`, `solo.trae.cn`, and `www.trae.cn` [Task 1]
- If the exact target page matters and the domain/route is not obvious, ask for the URL or page name up front; otherwise open the smallest practical candidate set in the controlled browser and report which one you settled on [Task 1]

# Task Group: planting context-pack maintenance, TRAE Web external-implementer Code mode, and local ByteRover health checks

scope: use this block when `planting` work needs `.codex/context-packs.yml` refreshed against the live tree, TRAE Web must be driven as an external implementer in controlled Chrome, or the user wants the real local ByteRover desktop state checked instead of trusting a sandbox/provider claim.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while context packs still live in `.codex/context-packs.yml`, TRAE Web provider rules still route through `.codex/skills/dispatch-task/references/external-implementer-routing.md`, and local ByteRover state is exposed through `.brvspace` plus the installed ByteRover skill scripts.

## Task 1: Refresh `.codex/context-packs.yml` against the live repo tree and add watering-planner coverage, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T06-41-41-KA2M-context_packs_trae_code_mode_byterover_health.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/archived_sessions/rollout-2026-07-12T14-41-41-019f550f-6ad9-7522-b84f-c3150cfdf6ac.jsonl, updated_at=2026-07-12T13:57:12+00:00, thread_id=019f550f-6ad9-7522-b84f-c3150cfdf6ac, replaced stale context-pack paths with live repo entrypoints and added the missing watering-planner/advisor surfaces)

### keywords

- .codex/context-packs.yml, current repo tree, watering-planner, watering-advisor, .brvspace, .brv/config.json, glob semantics, external_implementer, dispatch-task

## Task 2: Switch TRAE Web to Code mode, verify send readiness, and wait for the final provider response, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T06-41-41-KA2M-context_packs_trae_code_mode_byterover_health.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/archived_sessions/rollout-2026-07-12T14-41-41-019f550f-6ad9-7522-b84f-c3150cfdf6ac.jsonl, updated_at=2026-07-12T13:57:12+00:00, thread_id=019f550f-6ad9-7522-b84f-c3150cfdf6ac, verified Code-tab state, contenteditable input, enabled send button, and the final TRAE reply)

### keywords

- TRAE, Code mode, aria-selected, tabActive-, .chat-input-v2-input-box-editable, .chat-input-v2-send-button, contenteditable, send button, final response, 浇水算法

## Task 3: Deduplicate TRAE Web provider rules into one dispatch-task reference source, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T06-41-41-KA2M-context_packs_trae_code_mode_byterover_health.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/archived_sessions/rollout-2026-07-12T14-41-41-019f550f-6ad9-7522-b84f-c3150cfdf6ac.jsonl, updated_at=2026-07-12T13:57:12+00:00, thread_id=019f550f-6ad9-7522-b84f-c3150cfdf6ac, moved detailed TRAE Web mechanics into `external-implementer-routing.md` and reduced `SKILL.md` to an index pointer)

### keywords

- external-implementer-routing.md, SKILL.md, TRAE Web, duplicate rules, single source of truth, dispatch-task, provider DOM mechanics

## Task 4: Check whether local ByteRover desktop/sync is actually disconnected, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-12T06-41-41-KA2M-context_packs_trae_code_mode_byterover_health.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/archived_sessions/rollout-2026-07-12T14-41-41-019f550f-6ad9-7522-b84f-c3150cfdf6ac.jsonl, updated_at=2026-07-12T13:57:12+00:00, thread_id=019f550f-6ad9-7522-b84f-c3150cfdf6ac, verified local `.brvspace`, `space.mjs`, auth, sync, and query health and separated that from the sandbox TRAE result)

### keywords

- ByteRover, .brvspace, space.mjs current, space.mjs list, auth.mjs whoami, sync.mjs status, query.mjs, daemon-device-session, healthy, no-default, sandbox

## User preferences

- when the user says `.codex/context-packs.yml 重新按当前最新目录/文件更新` and then `再全量的扫一次,确保它和当前运行时一致`, refresh context packs by enumerating the live tree instead of editing from memory [Task 1]
- when the user points out `似乎少了关于watering planner 相关的入口`, proactively check for missing high-signal planner/advisor entrypoints instead of only fixing stale filenames [Task 1]
- when the user says Web TRAE under controlled Chrome `几乎都需要 code 模式作为 external implementer`, default provider-side Web runs to Code mode unless the page is already verified there [Task 2]
- when the user gives the exact Code-tab rule `role="tablist"` + `button text code` + `aria-selected=true` + `class contains tabActive-`, verify all of those state signals before sending [Task 2]
- when the user says `你没有点击发送按钮` or asks to `等待它的最终回复`, do not stop at input-entry evidence; confirm the send control becomes enabled, click it, and wait for the final provider response [Task 2]
- when the user asks `这两个是否留一个即可?重复申明了`, collapse overlapping provider rules into one source of truth instead of maintaining duplicate docs [Task 3]
- when the user says `突然发现 brv 桌面端断开了,测试下的确如此吗`, test the real local ByteRover state first and do not trust a sandbox/provider-side `no-default` result as evidence of a local outage [Task 4]

## Reusable knowledge

- `.codex/context-packs.yml` is the repo’s AI-read selector and should stay aligned with the live tree. In this rollout, the missing watering surfaces were `cloudfunctions/plant-user-http/*`, `cloudfunctions/layer/utils/watering-planner.js`, `src/pages/watering-advisor/*`, and `src/pages/index/components/watering-reminder-options.js` [Task 1]
- `.brvspace` and `.brv/config.json` are the current ByteRover-related repo handles for context-pack maintenance; `.brv/context-tree` is not the default current-memory path for this checkout [Task 1]
- For TRAE Web in this environment, the working provider selectors were `.chat-input-v2-input-box-editable` for the real contenteditable input and `.chat-input-v2-send-button` for send. Code mode should be verified through both `aria-selected="true"` and a `tabActive-` class on the `Code` tab [Task 2]
- A broad query like `浇水算法` can be answered by TRAE as generic algorithm knowledge unless the prompt explicitly constrains it to project/BRV facts. The provider page may also retain earlier output, so unique markers or baseline comparison help distinguish the new response [Task 2]
- The detailed TRAE/Web DOM mechanics now belong in `.codex/skills/dispatch-task/references/external-implementer-routing.md`; `SKILL.md` should keep only the pointer so the provider contract has one authoritative home [Task 3]
- The most reliable quick local ByteRover health checks in this checkout were `.brvspace`, `node /Users/jay/.codex/skills/byterover/scripts/space.mjs current`, `space.mjs list`, `auth.mjs whoami`, `sync.mjs status`, and a small `query.mjs` query. In this rollout, those checks confirmed the local `planting` space was healthy even though the TRAE sandbox reported `no-default` / `spaces: []` [Task 4]

## Failures and how to do differently

- Do not treat glob entries in `.codex/context-packs.yml` as literal broken paths during a consistency sweep. The first pass over-flagged valid globs; future checks should evaluate them with glob semantics [Task 1]
- Do not click a disabled TRAE send button and assume the message went out. Use the actual contenteditable node, wait for frontend state to update, verify `disabled=false`, and only then send [Task 2]
- Do not trust provider-page output as proof of local ByteRover desktop state. The TRAE sandbox’s BRV result was a different environment; local health needs local CLI/state checks [Task 2][Task 4]
- Do not duplicate provider-specific operating rules across `SKILL.md` and the routing reference. Keep the DOM-level mechanics in one doc so later edits do not drift [Task 3]

# Task Group: planting dispatch-task reference validation and minimal-fix example checks

scope: use this block when the user asks to validate `dispatch-task` references, example packets, validator scripts, or skill path integrity in `planting` without redesigning the workflow itself.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while dispatch-task still lives under `.codex/skills/dispatch-task/` and the repo continues to use the same validator script family.

## Task 1: Validate stale refs, `$skill` handles, `.mjs` syntax, and example validators with minimal fixes only, outcome partial

### rollout_summary_files

- rollout_summaries/2026-07-04T06-00-32-kJj5-dispatch_task_reference_and_validator_validation.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/04/rollout-2026-07-04T14-00-32-019f2bb6-dece-7e23-a6a6-8081f6e6b533.jsonl, updated_at=2026-07-04T06:10:32+00:00, thread_id=019f2bb6-dece-7e23-a6a6-8081f6e6b533, validation-only pass over stale refs, path checks, `.mjs` syntax, and dispatch-task example packets)

### keywords

- dispatch-task, 只做验证，不做架构重写, 最小修复, $skill, references/assets/scripts, node --check, validate-handoff.mjs, validate-zcode-prompt.mjs, validate-zcode-send-receipt.mjs, validate-result.mjs, validate-completion-readiness.mjs, deep_contract, simple_patch, external_zcode

## User preferences

- when the user says `只做验证，不做架构重写`, keep the work validation-first and do not widen it into workflow redesign [Task 1]
- when the user says `发现问题只报告和最小修复，不允许重新设计 skill 边界`, make the smallest fix that clears the broken reference or example and leave the surrounding architecture alone [Task 1]
- when the user enumerates checks like `旧引用`, `$skill`, `references/assets/scripts`, `.mjs`, and validator examples, treat that list as the exact execution checklist rather than asking for scope clarification [Task 1]

## Reusable knowledge

- For dispatch-task reference audits, a constrained Node scan is safer than a shell grep for `$skill` patterns because shell expansion and code-sample false positives can distort the result set [Task 1]
- The useful repo-owned `.mjs` syntax sweep excluded `node_modules`, `.venv`, `dist`, and `unpackage`; under that filter, `node --check` passed for 122 files [Task 1]
- The validator coverage that mattered here was: `validate-handoff.mjs` for `deep_contract` and `external_zcode`, plus `validate-zcode-prompt.mjs`, `validate-zcode-send-receipt.mjs`, `validate-result.mjs`, and `validate-completion-readiness.mjs` on the example packets [Task 1]
- `simple_patch` is intentionally outside the full handoff-validator path, so its example should document that boundary instead of being forced through `validate-handoff.mjs` [Task 1]
- Repo-wide `npm run lint` and `npm run fmt` are too broad for this validation task: `lint` exposed large pre-existing baseline noise, and `fmt` reformatted many unrelated tracked files before the spillover was reverted [Task 1]

## Failures and how to do differently

- Do not treat repo-wide lint churn as proof the minimal dispatch-task fix is wrong; separate baseline oxlint noise from the narrow validation target [Task 1]
- Do not run broad formatter commands and walk away. For minimal-fix tasks, check `git status` immediately and revert unrelated formatting spillover before finishing [Task 1]
- Do not leave misleading bare relative path strings in `SKILL.md` if the path scanner interprets them as unresolved references; reword the mention so it still points to the right reference without looking like a broken path token [Task 1]

# Task Group: cross-workflow Miro board editing and ER-diagram output style preferences

scope: use this block when the user asks for direct Miro board edits or wants future ER/entity-relationship diagram outputs to follow a previously approved Miro-style visual baseline.
applies_to: cwd=multi-cwd visual-diagramming workflow; reuse_rule=safe when the task is to edit a Miro board or produce/refine an ER diagram and the user has not given a different style direction for that deliverable.

## Task 1: Capture the default Miro ER-diagram visual baseline for future outputs, outcome success

### rollout_summary_files

- extensions/ad_hoc/notes/20260701-02-miro-er-diagram-best-practice.md (cwd=multi-cwd visual-diagramming workflow, rollout_path=extensions/ad_hoc/notes/20260701-02-miro-er-diagram-best-practice.md, updated_at=2026-07-01T23:29:06+0800, thread_id=None, authoritative visual-preference note for future ER-diagram output defaults) [ad-hoc note]

### keywords

- Miro, ER 图, ER diagram, 实体关系图, front-facing, 走线清晰, 布局美观, 结构简洁明了, 最佳实践基准, memories

## User preferences

- when the user says `这个模板是正面典型，走线清晰、实体区块布局美观，整体结构简洁明了。你记住，今后画任何实体关系图，以此图为最佳实践。`, treat that template as the default ER-diagram baseline until the user asks for a different visual language [Task 1][ad-hoc note]
- when the user says `要记录到你的 memories`, actually persist the preference instead of only acknowledging it in chat [Task 1]

## Reusable knowledge

- The approved ER-diagram baseline is cross-workflow, not repo-specific: `front-facing`, clear connector routing, aesthetically arranged entity blocks, and a simple overall structure [Task 1][ad-hoc note]
- The durable memory location for that baseline is `extensions/ad_hoc/notes/20260701-02-miro-er-diagram-best-practice.md`, so future agents can grep that exact file or the phrases `Miro`, `ER 图`, and `front-facing` first [Task 1][ad-hoc note]

## Failures and how to do differently

- Do not improvise a different ER-diagram art direction when the user has already confirmed a `最佳实践基准` [Task 1][ad-hoc note]

# Task Group: planting BRV business-fact curation for watering reminder v2.1 and pot-profile logic

scope: use this block when the user wants new `planting` business logic written into ByteRover and explicitly wants durable domain facts rather than dispatch/ZCode workflow narration.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while watering reminder v2.1 and pot-profile logic still live in the current planner/schema/mapping files, but re-open code before treating any curated fact as still current.

## Task 1: Curate watering v2.1 and pot-profile business facts into ByteRover, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-30T15-46-16-MVli-watering_v2_1_and_pot_profile_brv_curation.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/30/rollout-2026-06-30T23-46-16-019f1935-aea0-71a1-8228-66cf1a3c855c.jsonl, updated_at=2026-07-01T12:51:16+00:00, thread_id=019f1935-aea0-71a1-8228-66cf1a3c855c, user explicitly restricted BRV to business facts, then curated the new watering v2.1 and pot-profile facts in Chinese)

### keywords

- brv curate, brv query, brv status, 浇水提醒 算法 盆型, watering reminder v2.1, pot-profile, watering_way_quantization_json, effectiveHydrationLoad, wetPressureLoad, rootZoneMoistureIndex, potGeometryDryDownFactor, plant-knowledge, user_plant_instances

## User preferences

- when the user says `不要让 brv 记录dispatch 相关的知识,它只应该知道业务事实`, keep BRV curation limited to business facts and exclude dispatch / bridge / 流程约束 unless they explicitly ask otherwise [Task 1]
- when the user says `把浇水新的算法,盆型信息等新逻辑让brv记录`, prioritize durable schema/algorithm/integration facts for the new watering flow rather than process recap [Task 1]
- when BRV content is being added for this repo and the user is writing in Chinese, default the curated business facts to Chinese-first wording [Task 1]

## Reusable knowledge

- The curated watering reminder v2.1 facts were not just UI notes. The durable contract surfaces named in the rollout were `watering_way_quantization_json`, `watering_strategy_version`, `watering_strategy_review_status`, and the direct pot-profile columns on `user_plant_instances` [Task 1]
- `user_plant_care_extensions` is deprecated for this logic family; pot geometry/profile data now lives on `user_plant_instances`, and the mapping layer exposes frontend `potProfile` from those DB rows [Task 1]
- The planner’s new core decision signals were curated as `effectiveHydrationLoad`, `wetPressureLoad`, `lastEffectiveRootWateredDaysAgo`, and `rootZoneMoistureIndex`, replacing `wateringCount10d` as the main reasoning surface [Task 1]
- The curated business-rule corrections worth reusing are: `mist` does not count as root-zone watering, `unknown` should not be treated as zero, and `pot-geometry.js` contributes values like `potGeometryDryDownFactor`, `drainageRiskFactor`, and `potVolumeMl` to planner gates and amount suggestions [Task 1]
- The concrete BRV artifacts created were `.brv/context-tree/architecture/backend/watering_reminder_v2_1_schema.md`, `.brv/context-tree/architecture/watering_planner/watering_planner_v2_1_logic.md`, and `.brv/context-tree/architecture/system_logic/plant_knowledge_integration.md`; these are the first files to grep when the user asks what BRV already knows about watering v2.1 or pot profile [Task 1]

## Failures and how to do differently

- If `brv curate` returns `Your authentication token has been invalidated. Please try signing in again.`, treat it as an auth blocker, not as evidence that the memory content is wrong [Task 1]
- Do not stop at the first successful curate if it produces the wrong narrative style. In this run, the first successful result still needed a Chinese-first rewrite to match the user’s business-facts-only expectation [Task 1]
- Do not assume related older BRV topics cover a new combined theme like `浇水提醒 算法 盆型`; the confirming `brv query` miss justified creating fresh facts rather than hand-waving reuse [Task 1]

# Task Group: planting watering-reminder planner semantics, home-sheet implementation review, and dispatch-task QA/docs gates

scope: use this block when `planting` work touches watering reminder planning, `watering_events_10d` semantics, the home-page watering sheet flow, or dispatch-task completion where docs and runtime QA must close the feature rather than code review alone.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while watering reminder logic still spans `cloudfunctions/layer/utils/watering-planner.js`, `plant-user-http`, `care-behavior-timeline`, `docs/ACTIVE_CONTRACTS.md`, and the mini-program home page flow under `src/pages/index/`.

## Task 1: Inspect whether a watering-date algorithm already existed and distinguish planner layers, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-25T14-37-34-eOJY-watering_reminder_dispatch_task_qa_docs_gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/25/rollout-2026-06-25T22-37-34-019eff36-ff80-7910-8a23-f96d12b4bcca.jsonl, updated_at=2026-06-25T16:51:08+00:00, thread_id=019eff36-ff80-7910-8a23-f96d12b4bcca, repo-first inspection showed both the simple front-end `nextWater` formula and the richer 10-day planner inputs already existed)

### keywords

- watering planner, nextWater, completeWatering, buildWateringPlanner, wateringCount10d, lastWateredDaysAgo, environment-context-v7.js, fixed reminder timing, weather-aware watering schedule

## Task 2: Refine the watering reminder design around 10-day multi-date input and two Figma states, outcome partial

### rollout_summary_files

- rollout_summaries/2026-06-25T14-37-34-eOJY-watering_reminder_dispatch_task_qa_docs_gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/25/rollout-2026-06-25T22-37-34-019eff36-ff80-7910-8a23-f96d12b4bcca.jsonl, updated_at=2026-06-25T16:51:08+00:00, thread_id=019eff36-ff80-7910-8a23-f96d12b4bcca, aligned the product plan to multi-date watering events plus two distinct bottom-sheet/modal acceptance states)

### keywords

- watering_events_10d, selected_watering_events_10d, care-behavior-timeline, Figma 263:53, Figma 282:331, Home｜点击水滴后的底部ActionSheet, Home｜点击上次浇水后唤醒浇水组件, plant.lastWatered, add-to-calendar

## Task 3: Review the ZCode watering-reminder implementation, preserve backward-compatible writes, and keep docs as an active contract surface, outcome partial

### rollout_summary_files

- rollout_summaries/2026-06-25T14-37-34-eOJY-watering_reminder_dispatch_task_qa_docs_gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/25/rollout-2026-06-25T22-37-34-019eff36-ff80-7910-8a23-f96d12b4bcca.jsonl, updated_at=2026-06-25T16:51:08+00:00, thread_id=019eff36-ff80-7910-8a23-f96d12b4bcca, reviewed the shared planner, endpoint, persistence change, UI sheet flow, and docs correction after initial ZCode issues surfaced)

### keywords

- cloudfunctions/layer/utils/watering-planner.js, plant-user-http, POST /user-plants/watering-planner, watering_events_json, last_watered, next_water, WateringReminderSheet.vue, nested popup, weatherDays, docs/ACTIVE_CONTRACTS.md, source-of-truth path

## Task 4: Enter dispatch-task QA/docs gates and stop at QA timeout instead of claiming closure, outcome partial

### rollout_summary_files

- rollout_summaries/2026-06-25T14-37-34-eOJY-watering_reminder_dispatch_task_qa_docs_gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/25/rollout-2026-06-25T22-37-34-019eff36-ff80-7910-8a23-f96d12b4bcca.jsonl, updated_at=2026-06-25T16:51:08+00:00, thread_id=019eff36-ff80-7910-8a23-f96d12b4bcca, spawned `docs_keeper` and `qa_reviewer`, got docs synced/corrected, but left runtime QA blocked after the wait window expired)

### keywords

- dispatch-task, qa_reviewer, docs_keeper, docs/ACTIVE_CONTRACTS.md, projectPath=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin, automator_port=9420, page=pages/index/index, dev:mp-weixin:local-functions:lan, local-functions LAN acceptance, close_agent, blocked QA

## Task 5: Sync active docs and BRV wording after the care-behavior timeline became selectable through today, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-05T13-42-12-SNa4-watering_timeline_docs_and_brv_sync.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/05/rollout-2026-07-05T21-42-12-019f3283-e3b2-78a1-aec3-f49ee78822e4.jsonl, updated_at=2026-07-06T15:52:42+00:00, thread_id=019f3283-e3b2-78a1-aec3-f49ee78822e4, synced docs-keeper wording for today-selectable watering timeline semantics and then added the same durable fact set to BRV/ad-hoc notes)

### keywords

- docs_keeper, BRV, CareBehaviorTimeline, DEFAULT_SELECTABLE_END_OFFSET = 0, selectable today, d0, wateringEvents, normalizeCareBehaviorTimeline, docs/ACTIVE_CONTRACTS.md, 03_诊断运行时主链路_逐步执行逻辑.md, planting_ai_diagnosis_all_in_one.md, ad_hoc note

## User preferences

- when the user asks whether there is already a watering-date algorithm, start by checking the existing repo logic before proposing a new design [Task 1]
- when the user corrects the planner semantics to `最近10天的浇水频次/事件` rather than a single last-watered date, default to the 10-day event-set model and keep single-date fields secondary [Task 1][Task 2][Task 3]
- when the user provides multiple Figma links for the same feature flow and explains they are different states, treat them as distinct acceptance states instead of redundant references [Task 2]
- when the user says `plant.lastWatered` starts empty and is updated only after add-to-calendar succeeds, do not prefill or infer a single date before confirmation [Task 2]
- when the user allows entry into `dispatch-task` QA and `docs-keeper` gates, continue through the named QA/docs roles instead of stopping at implementation review [Task 3][Task 4]
- when cloud deploy is unavailable and the user accepts local verification, prefer `npm run dev:mp-weixin:local-functions:lan` for end-side QA in this repo [Task 3][Task 4]
- when the user says `按docs-keeper的角色,做下知识卫生工作`, mirror the implemented contract change into the repo’s active docs instead of leaving it code-only [Task 5]
- when the user follows with `把 brv 的也更新掉`, update BRV/ad-hoc memory for the same durable business fact instead of stopping after docs sync [Task 5]

## Reusable knowledge

- The watering reminder logic in this repo already had two layers before the feature work: front-end `completeWatering()` in `src/store/plants.js` uses `watering.freq` to set `nextWater`, while `cloudfunctions/diagnose-http/utils/environment-context-v7.js` already had `buildWateringPlanner` with wet/dry/baseline reasoning over 10-day watering history plus weather [Task 1]
- `care-behavior-timeline` is the right contract source for the new input shape because it emits `selected_watering_events_10d` / `watering_events_10d`; future planner work should anchor on that event-set data rather than inventing a new single-date-only contract [Task 2]
- The two Figma acceptance states were concrete: node `263:53` is the icon-opened bottom action sheet and node `282:331` is the date-selection modal that reuses the watering component [Task 2]
- The shared planner implementation surface for this feature family is `cloudfunctions/layer/utils/watering-planner.js`, consumed by both `diagnose-http` and `plant-user-http` through `POST /user-plants/watering-planner` [Task 3]
- The safe persistence pattern is: update core plant fields (`last_watered`, `next_water`) in the main SQL write, then do `watering_events_json` in a separate try/catch update so missing schema does not block the primary state change [Task 3]
- `docs/ACTIVE_CONTRACTS.md` was the live docs surface for the watering-planner contract, and `docs_keeper` was expected to keep its source-of-truth paths aligned with the actual repo files [Task 3][Task 4]
- The dispatch QA contract for this feature used `projectPath=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`, `automator_port=9420`, `page=pages/index/index`, and the local-functions LAN acceptance route when cloud deploy was skipped [Task 4]
- The July 6 docs/BRV hygiene pass identified the exact contract surfaces for selectable-today wording: `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md`, `docs/ACTIVE_CONTRACTS.md`, and `docs/new-rules/planting_ai_diagnosis_all_in_one.md` [Task 5]
- The durable fact that was synced across docs and BRV was precise: `CareBehaviorTimeline` now allows today (`d0`) as the selectable upper bound, the display window remains separate, and backend truncation keeps the latest 10-event window so today is not dropped when the window is full [Task 5]
- The BRV-style artifact used for this contract was `/Users/jay/.codex/memories/extensions/ad_hoc/notes/2026-07-06T00-00-00Z-caring-timeline-selectable-today-brv-note.md`, which records `DEFAULT_SELECTABLE_START_OFFSET = -10`, `DEFAULT_SELECTABLE_END_OFFSET = 0`, and the synced `wateringEvents` wording [Task 5][ad-hoc note]

## Failures and how to do differently

- Do not overclaim that a new `lastWateredAt` field is required when the repo already has 10-day event-derived signals like `wateringCount10d` and `lastWateredDaysAgo` [Task 1]
- Do not pretend screenshot/context-backed Figma evidence exists when `get_design_context` timed out; keep any design read explicitly scoped to metadata-backed structure [Task 2]
- Do not mix optional `watering_events_json` writes into the main update path when schema drift can block `last_watered` / `next_water`; isolate the optional event-column write [Task 3]
- Do not trust the first docs pass blindly. In this rollout, `docs_keeper` initially introduced an invalid path and needed a correction before the docs gate was truly complete [Task 3][Task 4]
- Do not call the feature done while the named QA role is still unresolved. If `qa_reviewer` times out and is closed, keep the completion state partial/blocked instead of substituting main-thread confidence for runtime proof [Task 4]
- Do not patch docs by guessed wording. In the July 6 sync, the first patch missed the exact text; search the current line first, then patch the precise wording that exists on disk [Task 5]

# Task Group: planting standalone watering-advisor abstraction, ad-hoc planner entry, and shared pot-editor reuse

scope: use this block when `planting` work is about extracting watering-advice logic into a standalone or ad-hoc flow, especially when the user wants no-watering-history behavior, `potProfile` overrides, or the same pot-editor UX without coupling the planner to bound plants.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while the relevant planner surfaces still include `buildWateringPlanner`, `PotProfileEditor.vue`, `watering-reminder-options.js`, `plant-user-http`, and the same `potProfile` / catalog-vs-plant split; re-open the live files before treating any planning-only detail as implemented.

## Task 3: Reuse `PotProfileEditor` / `PotCanvas` in the independent watering-advisor flow instead of keeping a parallel pot form, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-09T07-27-03-7JXC-watering_advisor_reuses_potprofileeditor_canvas.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/09/rollout-2026-07-09T15-27-03-019f45c5-dd61-7890-ba8c-b5adff86290c.jsonl, updated_at=2026-07-09T07:40:53+00:00, thread_id=019f45c5-dd61-7890-ba8c-b5adff86290c, implemented the shared canvas editor reuse and updated the BRV contract)

### keywords

- watering-advisor, PotProfileEditor, PotCanvas, canvas 控件, plant: null, callComponentMethod, watering-advisor-edit-pot-profile, substrateComposition, bottom-sheet, .brv/context-tree/architecture/watering_planner/watering_advisor_entry_contract.md, npm run build:mp-weixin:ci, npm run check:brv-context-lifecycle, historical-v3-evidence

## User preferences

- when the user says `独立浇水的盆型输入控件未采取与原绑定用户植物浇水建议流程中相同的 canvas 控件，这点需要统一。`, default to reusing the same bound-plant `PotProfileEditor` / `PotCanvas` stack rather than shipping a second pot-form UI for the ad-hoc path [Task 3]

## Reusable knowledge

- The implemented reuse path is now concrete: `src/pages/watering-advisor/watering-advisor.vue` can open `src/pages/index/components/PotProfileEditor.vue` via component ref / `callComponentMethod`, consume its `saved` payload, and stay detached from bound-plant persistence when `plantId` is absent [Task 3]
- `src/components/PotCanvas.vue` is the shared canvas visualization behind `PotProfileEditor`; if future watering-entry UI needs the same pot editor look/feel, reuse this stack instead of re-creating top diameter / bottom diameter / height / drainage / substrate controls in-page [Task 3]
- The BRV contract file for this flow is `.brv/context-tree/architecture/watering_planner/watering_advisor_entry_contract.md`; it now records that the independent watering-advice flow must reuse `PotProfileEditor` / `PotCanvas` and must not add parallel input controls [Task 3]
- Validation evidence for the implemented reuse exists and is worth grepping before reopening the rollout: `npm run lint -- src/pages/watering-advisor/watering-advisor.vue` -> `0 warnings, 0 errors`; `npm run build:mp-weixin:ci` -> build complete; Historical V3 evidence (pre-2026-07-10): `npm run check:brv-context-lifecycle` -> passed [Task 3]

## Failures and how to do differently

- Do not keep a hand-written independent pot form once the shared canvas editor already exists. The fixed path deleted duplicated pot-dimension / drainage / substrate controls and reused the editor payload, including `substrateComposition`, instead of repeating the same math in `src/pages/watering-advisor/watering-advisor.vue` [Task 3]
- Do not broaden cleanup in a dirty workspace during this flow. The safe approach was to touch only the related watering-advisor / BRV files and avoid unrelated baseline cleanup [Task 3]

# Task Group: planting add-plant ZCode bridge recovery, first-screen request triage, and dispatch validator closure

scope: use this block when `planting` work touches the add-plant page, first-screen request timing, Figma-faithful mini-program UI polish, or ZCode/dispatch external-implementer recovery that must be validated against real diff/build/test evidence.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while the add-plant flow still lives under `src/pages/add-plant/`, dispatch recovery still uses `.tmp/dispatch-task/*` plus `.codex/skills/dispatch-task/scripts/validate-*.mjs`, and mini-program UI assets continue to use the repo's SVG + Tailwind conventions.

## Task 1: Triage add-plant first-screen requests and move nonessential calls off the ordinary create path, outcome success

### rollout_summary_files


### keywords

- add-plant, loadPlants, user-plants, weather-hot-cities, weather-hot-cities/resolve, auth-user-http/auth/user, ensureLogin, refreshUserInfo, PlantForm, useDefaultPlants, onMounted, activeStep === 1

## Task 2: Replace mismatched add-plant icons and fix disabled button border breakage to match Figma, outcome success

### rollout_summary_files


### keywords

- Figma, 164:4790, ai-identify.svg, search.svg, PlantSelectionStep.vue, add-plant-next-button, add-plant-ai-identify-button, after:border-0, hover-class=\"none\", disabled border breakage, Tailwind, mini-program button ::after

## Task 3: Recover ZCode external implementation through dispatch validators and stop at QA-thread timeout instead of claiming full closure, outcome partial

### rollout_summary_files


### keywords

- dispatch-task, zcode_external_implementer, validate-handoff.mjs, validate-zcode-send-receipt.mjs, validate-result.mjs, screenshot_policy_skip, qa_reviewer, wait timeout, close_agent, git diff --stat, npm run lint, npm run test:ci, npm run build:mp-weixin:ci, oxlint

## User preferences

- when the user breaks a page bug into concrete questions like `这些接口必要吗？什么作用`, do request-by-request call-chain attribution first and only then decide what to defer or delete [Task 1]
- when the user points to a Figma link and names exact visual defects like `icon都不对` or `disabled状态下的边框...断裂`, treat the design file and those visible defects as hard acceptance targets rather than approximating with default icons or styles [Task 1][Task 2]
- when the task returns from ZCode and the user says `我们继续回到刚刚block的 dispatch-task`, do not trust the external implementer’s self-report; recover the real diff and run the repo validators/build/test gates yourself [Task 3]
- when validator or scope friction appears in a dispatch recovery, surface the concrete options and let the user arbitrate the contract boundary rather than silently forcing a fake pass [Task 2][Task 3]

## Reusable knowledge

- For ordinary add-plant creation, the first-screen boundary is: keep the catalog list request, defer `weather-hot-cities` and GPS resolve until the information step, and load `user-plants` only for edit-mode prefill [Task 1]
- `auth-user-http/auth/user` is not evidence that the add-plant page itself needs extra first-screen data; in this flow it came from the user-store refresh/login chain side effect [Task 1]
- In this repo, Figma-faithful custom icons are better implemented as imported local SVG assets rendered through `<image :src>` than as emoji or approximate icon-library substitutes [Task 2]
- On mini-program buttons, disabled rounded-border tearing can be fixed with `after:border-0` plus `hover-class=\"none\"`; that is now a proven repo-local repair for the default button `::after` artifact [Task 2]
- The durable dispatch recovery gates for external implementer handoff are `.codex/skills/dispatch-task/scripts/validate-handoff.mjs`, `validate-zcode-send-receipt.mjs`, and `validate-result.mjs`; aligning their expected fields and policy branches early prevents repeated false negatives [Task 3]
- `npm run lint` can exit 0 with many historical warnings in this repo, so handoff recovery should key on error count / exit code, with `npx oxlint --format json` as the fast way to separate new errors from background warnings [Task 3]
- `npm run build:mp-weixin:ci` is the practical add-plant mini-program compile gate here, while `npm run test:ci` only covers a narrow test surface and cannot stand in for independent QA [Task 1][Task 3]

## Failures and how to do differently

- Do not delete first-screen requests blindly just because the user reports “too many requests.” Trace each call to whether it is create-flow critical, edit-only, step-2-only, or a login side effect before changing timing [Task 1]
- Do not hand-wave Figma tasks with default icons or button behavior. In this run the real fix was precise SVG substitution plus mini-program button pseudo-element suppression, not a generic styling cleanup [Task 2]
- Do not pretend screenshot evidence exists when the actual GLM/Figma rules prohibit taking it. If validator policy conflicts with repo rules, add an explicit `screenshot_policy_skip` path instead of fabricating evidence [Task 2][Task 3]
- Do not wait forever on an independent QA subagent. If `qa_reviewer` keeps timing out, close it as a blocker and keep the completion gate at partial rather than overstating final verification [Task 3]

# Task Group: planting active mini-program QA default uses automator, not WeChat MCP

scope: use this block when a `planting` task mentions WeChat mini-program runtime QA, terminal E2E, page interaction evidence, `9420`, `miniprogram-automator`, `@dcloudio/uni-automator`, or older WeChat DevTools MCP recovery notes.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=active until the project explicitly re-onboards WeChat DevTools MCP as the default QA transport.

## Task 1: Standardize automator as the active end-side QA default and supersede MCP-first recovery, outcome success

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-21-automator-default-over-wechat-mcp.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-21-automator-default-over-wechat-mcp.md, updated_at=2026-06-22T18:22:54+0800, thread_id=None, authoritative active-override note stating ordinary WeChat mini-program QA now defaults to automator and treats MCP/swarm misses as suppressed noise) [ad-hoc note]
- rollout_summaries/2026-06-13T15-21-14-Q3mr-standardize_automator_qa.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/13/rollout-2026-06-13T23-21-14-019ec192-a7cd-7c93-8cab-7ed7b8d051eb.jsonl, updated_at=2026-06-13T17:58:32+00:00, thread_id=019ec192-a7cd-7c93-8cab-7ed7b8d051eb, repo governance sweep that made `dist/dev/mp-weixin -> 9420 -> miniprogram-automator -> wx.request` the active runtime QA path)
- extensions/ad_hoc/notes/20260607T135957Z-wechat-miniprogram-automator-evidence.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/20260607T135957Z-wechat-miniprogram-automator-evidence.md, updated_at=2026-06-07T13:59:57Z, thread_id=None, authoritative note requiring direct automator runtime `wx.request` evidence with projectPath, endpoint, response, and assertions when MCP transport cannot provide it) [ad-hoc note]

### keywords

- miniprogram-automator, @dcloudio/uni-automator, 9420, dist/dev/mp-weixin, wx.request, page_stack, page_data, WeChat DevTools MCP, transport closed, swarm config missing, QA noise suppression, active override

## User preferences

- when the workflow goal is to `连根拔出错误的方式` and support `不同的 端上 自动化测试`, remove stale MCP-priority recovery paths instead of layering new fallbacks on top of them [Task 1]
- when the user is doing ordinary mini-program product/UI/QA work, default to the active automator path and do not turn missing WeChat MCP or ByteRover swarm config into product blockers [Task 1]
- when subagents are used for end-side QA, give them the automator QA contract and BRV recall packet only; do not ask them to summarize MCP recovery noise unless the task explicitly targets MCP debugging [Task 1]

## Reusable knowledge

- Default end-side QA route is `dist/dev/mp-weixin -> 9420 -> miniprogram-automator / @dcloudio/uni-automator -> page_stack/page_data/evaluate(wx.request)` [Task 1]
- WeChat DevTools MCP is legacy/optional for ordinary product and code QA. Older MCP-first recovery memories remain useful only for explicit MCP debugging; they are superseded for ordinary mini-program runtime validation [Task 1][ad-hoc note]
- The repo’s active QA contract fixes `projectPath=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`; `dist/build/mp-weixin` is not the runtime automation target [Task 1]
- Treat `status`, `9222`/CDP, screenshots, or backend curl as tool-state checks only. End-side acceptance still requires mini-program runtime evidence such as `wx.request` from the automator path [Task 1]

## Failures and how to do differently

- Do not let `brv swarm query` or WeChat MCP config checks appear in normal subagent progress summaries. Ordinary dispatch should report only the BRV recall packet and automator QA route [Task 1][ad-hoc note]
- Do not mark product QA failed because MCP is unavailable when `miniprogram-automator` / `@dcloudio/uni-automator` can provide the required end-side evidence [Task 1][ad-hoc note]
- Do not keep stale MCP-priority recovery text in active docs, BRV records, or QA contracts after the automator standardization sweep; delete or downgrade it to explicit MCP-debug memory only [Task 1]

# Task Group: planting weather diagnosis runtime degradation, D0 day-file state machine, recent-weather cache boundaries, and weather-cache verification

scope: use this block when diagnosis weather reads are stalling, the user asks how `/weather/current` or `recent-10d` behaves on the critical path, or weather storage must preserve the D0-vs-D-10..D-1 semantic boundary without forecast pollution.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while diagnosis weather still runs through `cloudfunctions/weather-http/`, `/weather/environment-context` remains the critical path, and the repo continues to use the self-owned weather cache plus local-functions LAN verification flow.

## Task 1: Consolidate D0 now sampling into a single `days/{date}.json` state machine and keep `/weather/current` evidence-based, outcome captured from ad-hoc note

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-20-weather-d0-now-samples-latest-sample.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-20-weather-d0-now-samples-latest-sample.md, updated_at=2026-06-20T16:44:29+0800, thread_id=None, authoritative ad-hoc note tightening D0 `samples[]` field retention and `latestSample` derivation from the final sample set)
- extensions/ad_hoc/notes/20260620132105-weather-now-day-file-state-machine.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/20260620132105-weather-now-day-file-state-machine.md, updated_at=2026-06-20T13:21:14+0800, thread_id=None, authoritative ad-hoc note for the new D0 `days/{date}.json` lifecycle and `/weather/current` fallback contract)

### keywords

- days/{date}.json, working/{date}.json, daily/{date}.json, samples[], latestSample, /v7/weather/now, sampling time, key observation fields, dailyRollup, state=working, state=finalized, finalizedAt, sourceKind=observed_now_rollup, /weather/current, weatherEvidenceInsufficient, weather-d0-now-morning-0920, weather-d0-now-finalize-2130

## Reusable knowledge

- D0 weather archiving no longer uses separate `working/{date}.json` plus `daily/{date}.json`; the lifecycle is one `days/{date}.json` file that accumulates `/v7/weather/now` samples in `samples[]`, keeps `latestSample` while `state=working`, then writes nested `dailyRollup` and flips to `state=finalized` with `finalizedAt` and `sourceKind=observed_now_rollup` [Task 1]
- D0 `samples[]` should retain the full key observation fields from QWeather `/v7/weather/now`, not just a compressed subset, so later diagnosis, replay, and troubleshooting can use the original observed-now evidence [Task 1]
- `latestSample` must be generated from the final `samples[]` by sample timestamp; do not carry forward a stale pre-write value when the array contents change during append/finalize flows [Task 1]
- `/weather/current` should read the current day's `latestSample` first and only fall back to the most recent finalized day rollup; it must not synchronously call QWeather realtime on the route, and missing evidence should yield an empty state or `weatherEvidenceInsufficient` instead of a 500 [Task 1]
- `recent-10d.json` now aggregates only finalized `days/{date}.json` files for D-1 through D-10; D0 must stay out of recent, and recent reconstruction must not come from the old `dailyArchives` shape [Task 1]
- The active D0 sampling/finalize timer names are `weather-d0-now-morning-0920`, `weather-d0-now-forenoon-1220`, `weather-d0-now-noon-1420`, `weather-d0-now-afternoon-1820`, and `weather-d0-now-finalize-2130`; legacy `weather-d0-24h-*` names are compatibility-only inputs [Task 1]
- A strong regression surface for this family is `test-now-sample-day-file.mjs` and `test-weather-d0-24h-timers.mjs` [Task 1]

## Failures and how to do differently

- Do not reintroduce the old split `working/{date}.json` + `daily/{date}.json` lifecycle or rebuild recent history from legacy `dailyArchives`; the current contract is a single D0 `days/{date}.json` state machine, and D0 stays out of `recent-10d.json` [Task 1]
- Do not compress D0 `samples[]` down to a lossy subset or reuse an old `latestSample` snapshot after the final `samples[]` is known; both mistakes break replay/debug value and can make `/weather/current` serve stale same-day evidence [Task 1]
- Do not make `/weather/current` block on a live QWeather realtime fetch or throw a 500 when there is no same-day evidence; use the evidence-first fallback chain and return empty / `weatherEvidenceInsufficient` when the cache does not support a stronger answer [Task 1]

# Task Group: planting WeChat DevTools automation recovery, mini-program runtime evidence, and diagnosis E2E smoke

scope: use this block when the user wants `planting` validated in the real WeChat mini-program runtime, asks to recover `wechat-devtools-mcp`, or needs end-side diagnosis/package evidence instead of code-only reasoning.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while the runtime target is still `dist/dev/mp-weixin`, the local skill remains `.agents/skills/wechat-devtools-mcp/SKILL.md`, and the user is testing through WeChat DevTools or `miniprogram-automator`; always re-check the live CLI path, port state, and project path before assuming the same startup sequence still works.

## Task 1: Re-verify real WeChat MCP JSON-RPC connectivity and correct yellowing entry selection, outcome success

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-12-wechat-mcp-json-rpc-connection-notes.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-12-wechat-mcp-json-rpc-connection-notes.md, updated_at=2026-06-12T18:00:27+08:00, thread_id=None, ad-hoc evidence for real `wechat_devtools_mcp v0.9.8` JSON-RPC validation, `python3` probe entry, and correcting the on-device yellowing path)

### keywords

- wechat_devtools_mcp v0.9.8, JSON-RPC, python3, wechat_ide/status, wechat_ide/is_login, 9420, pages/diagnose/question-package, draftKey, yellowing path, wilting_droop misclick

## Task 2: Replay yellowing diagnose automation three times and isolate the blocker to missing plant-id / missing diagnose entry, outcome failure with clear cause

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-12T12-10-00Z-yellowing-dispatch-task-stability-note.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-12T12-10-00Z-yellowing-dispatch-task-stability-note.md, updated_at=2026-06-12T20:13:32+08:00, thread_id=None, ad-hoc evidence from a 3-run yellowing stability replay showing `answerCount=0`, `open-method=ref-fallback`, and the blocking toast `缺少植物ID，无法开始问诊`)

### keywords

- .tmp-diagnose-yellowing-fixed.mjs, diagnose-entry-button, ref-fallback, open-method=ref-fallback, 缺少植物ID，无法开始问诊, answerCount=0, qa-artifacts, docs/ai-runs/2026-06-12-dispatch-task-yellowing-stability.md

## Task 3: Enforce diagnosis automation id policy before WeChat MCP execution, outcome rule captured

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-12T12-17-00Z-dispatch-task-wechat-devtools-idpolicy-note.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-12T12-17-00Z-dispatch-task-wechat-devtools-idpolicy-note.md, updated_at=2026-06-12T21:09:48+08:00, thread_id=None, ad-hoc rule note requiring `docs/ai-rules/frontend-automation-id-policy.md` before diagnosis automation and pointing to `AGENTS.md` hard-rule sync)

### keywords

- frontend-automation-id-policy.md, 第三点 诊断流 id 映射, diagnose-entry-button-{plant.id}, AGENTS.md 第 13 条, wechat-devtools MCP, 诊断入口 id 映射

## Task 4: Standardize the active end-side QA default on `miniprogram-automator` and remove wrong recovery paths, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-13T15-21-14-Q3mr-standardize_automator_qa.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/13/rollout-2026-06-13T23-21-14-019ec192-a7cd-7c93-8cab-7ed7b8d051eb.jsonl, updated_at=2026-06-13T17:58:32+00:00, thread_id=019ec192-a7cd-7c93-8cab-7ed7b8d051eb, replaced MCP-priority QA with one `dist/dev/mp-weixin -> 9420 -> miniprogram-automator -> wx.request` default, deleted the old transport-recovery skill, and synced docs/BRV/contracts)

### keywords

- miniprogram-automator, 9420, wx.request, projectPath=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin, dispatch-task, qa_reviewer, BRV, transport-recovery, wechat-devtools, e152065

## Task 5: Record that `open(cdp_enabled=true)` can restart DevTools and trigger reauth, outcome rule captured

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-13T23-17-27-wechat-cdp-open-auth-risk.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-13T23-17-27-wechat-cdp-open-auth-risk.md, updated_at=2026-06-13T23:17:27+08:00, thread_id=None, ad-hoc note that `wechat_ide(open, cdp_enabled=true)` on `wechat-devtools-mcp v0.9.8` kills the current DevTools process, relaunches with `--remote-debugging-port=9222`, and may force login/project/automation reauthorization)

### keywords

- open(cdp_enabled=true), reauth, 9222, 9420, wechat-devtools-mcp v0.9.8, status -> is_login -> page_stack/page_data/evaluate(wx.request), DevTools side effect

## Task 6: Add timeout, retry, and fallback around automator screenshots so diagnose QA cannot hang indefinitely, outcome captured from ad-hoc note

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-23T00-00-00Z-miniprogram-automator-screenshot-hang-fix.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-23T00-00-00Z-miniprogram-automator-screenshot-hang-fix.md, updated_at=2026-06-23T00:00:00Z, thread_id=None, ad-hoc note documenting `miniProgram.screenshot` RPC hangs and the timeout/retry/fallback repair in `test/e2e/terminal-e2e/run-diagnose-yellowing-mcp.mjs`) [ad-hoc note]

### keywords

- miniProgram.screenshot, App.captureScreenshot, withTimeout, MP_SCREENSHOT_TIMEOUT_MS, MP_SCREENSHOT_RETRIES, DEFAULT_SCREENSHOT_TIMEOUT_MS, DEFAULT_SCREENSHOT_RETRIES, base64 fallback, run-diagnose-yellowing-mcp.mjs, screenshot hang, finally branch

## User preferences

- when doing diagnosis automation through WeChat MCP, read `docs/ai-rules/frontend-automation-id-policy.md` first and use the documented stable ids such as `diagnose-entry-button-{plant.id}` to decide whether the entry and question-page transition really succeeded [Task 3]
- when the user asks to run home -> diagnosis -> `黄叶模式` -> watering any 3 days -> all other answers `不知道`, repeated 3 times, avoid reset/cache-clear/re-auth style recovery unless the user explicitly permits it [Task 2]
- when the user explicitly corrects the automation path and asks to `hard-code` it, treat `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` as the fixed runtime `projectPath` and block `dist/build/mp-weixin` for automation work [Task 4]
- when the workflow goal is to `连根拔出错误的方式` and support `不同的 端上 自动化测试`, delete stale MCP-priority recovery paths instead of layering more fallbacks on top of them [Task 4]
- when the user complains that QA clears cache and forces a rescan, preserve login/auth state by default and prefer the non-destructive order `status -> is_login -> 检查/复用 9420 -> wechat_automator start/page_stack/page_data/evaluate(wx.request)` before any restart path [Task 1][Task 5]

## Reusable knowledge

- The 2026-06-12 real-connection note validated a working `wechat_devtools_mcp v0.9.8` JSON-RPC chain and narrowed two practical shields: use `python3` for the probe path, and treat `wechat_ide/status` plus `is_login` as the base health check before automator navigation. That note ended with a successful visible transition into `pages/diagnose/question-package` and a confirmed `draftKey` after correcting the yellowing entry path [Task 1]
- The 3-run stability replay showed a specific diagnostic split: `open-method=ref-fallback` plus toast `缺少植物ID，无法开始问诊` and `answerCount=0` means the blocker is missing plant-id / missing diagnose-entry preconditions, not answer-scoring jitter or click randomness [Task 2]
- For diagnosis automation, `docs/ai-rules/frontend-automation-id-policy.md` section `第三点 诊断流 id 映射` is the required entrypoint for selectors and assertions. The stable success criteria include ids like `diagnose-entry-button-{plant.id}`, not ad-hoc text matching or ref-only fallbacks [Task 3]
- The active end-side QA default after the 2026-06-13 governance sweep is `dist/dev/mp-weixin -> 9420 -> miniprogram-automator -> page_stack/page_data/evaluate(wx.request)`; `status`, `9222`/CDP, screenshots, and backend `curl` are only tool-state checks and do not prove runtime QA completion [Task 4][Task 5]
- `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` is the fixed runtime automation `projectPath`; `dist/build/mp-weixin` is for build/CI/upload flows only and should be treated as a blocker if it appears in runtime QA contracts [Task 4]
- `cache_clean(clean_type='all')` is high-risk in this workflow because it can wipe login/auth state, and `open(cdp_enabled=true)` on `wechat-devtools-mcp v0.9.8` can kill the current DevTools process and relaunch it with `--remote-debugging-port=9222`, which may force QR login, project authorization, or automation-debug authorization again [Task 5]
- When 9420 is missing, first try `wechat_automator start` or direct `miniprogram-automator` connect/launch fallback while preserving raw errors; only escalate to a DevTools restart when the user explicitly accepts the reauth/restart risk or when there is no reusable IDE/automator session left [Task 4][Task 5]
- The screenshot hardening note anchors the current yellowing harness path at `test/e2e/terminal-e2e/run-diagnose-yellowing-mcp.mjs`, where `miniProgram.screenshot` is wrapped with timeout, retry, base64 fallback, and `null`-on-failure behavior so cleanup paths cannot hang indefinitely [Task 6][ad-hoc note]

## Failures and how to do differently

- Do not confuse a missing `python` binary with MCP transport failure; fix the interpreter to `python3` first, then continue with `status/is_login` and automator checks [Task 1]
- Do not treat a wrong symptom-mode click as a transport regression. The 2026-06-12 successful connection note still needed a corrected yellowing click path to avoid drifting into the `枯萎/发蔫` branch [Task 1]
- Do not interpret `answerCount=0` plus `ref-fallback` and `缺少植物ID，无法开始问诊` as flaky automation. That signature points to missing plant-id / diagnose-entry preconditions, so fix entry identification before tuning click timing or scoring logic [Task 2]
- Do not start diagnosis automation from generic selectors before reading the repo's id policy. Skipping `frontend-automation-id-policy.md` makes it too easy to misjudge whether the entry was hit or the question page was reached [Task 3]
- Do not treat `wechat_ide status` success, `9222` CDP availability, backend `curl 200`, or screenshots as proof that runtime QA passed; acceptance still requires real mini-program runtime `wx.request` evidence on the intended page/session [Task 4]
- Do not keep stale MCP-priority recovery text in active docs, BRV records, or QA contracts after the 2026-06-13 standardization sweep. The deleted transport-recovery route and similar fallback wording should be removed rather than left as secondary advice [Task 4]
- Do not default to `cache_clean(clean_type='all')` or `open(cdp_enabled=true)` when protecting the existing DevTools login/auth session. If that restart path triggers rescanning or authorization prompts, classify it as a DevTools/automation-session side effect, not as a product-interface pass/fail signal [Task 5]
- Do not let screenshot capture sit unbounded inside diagnose QA. If `miniProgram.screenshot` is hanging, timeout and downgrade the artifact instead of blocking the whole run, especially from `finally` cleanup paths [Task 6][ad-hoc note]

# Task Group: planting diagnosis question-package routing, fixed-package contract, and runtime-proof gate

scope: use this block when `planting` work changes the fixed question-package flow in `cloudfunctions/diagnose-http`, or when diagnosis-package work must stay blocked until real mini-program `wx.request` evidence exists.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while diagnosis package routing still centers on `cloudfunctions/diagnose-http/app/question-package-response.js`, related queue planners/registries, and the repo’s runtime-proof QA contract, but always re-open the live runtime files before assuming a specific package shape is still current.

## Task 1: Simplify diagnosis question-package engine, sync docs/BRV contract, and harden workflow gates, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-07T01-15-18-irur-diagnose_question_package_docs_sync_dispatch_gate_hardening.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/07/rollout-2026-06-07T09-15-18-019e9fa6-0489-7282-94eb-dda0674ef18b.jsonl, updated_at=2026-06-07T02:41:43+00:00, thread_id=019e9fa6-0489-7282-94eb-dda0674ef18b, converted diagnosis flow to `mode -> fixed question package`, synced docs/BRV, and added hard gates for docs_keeper plus >500-line touched files)

### keywords

- getQuestionPackageByMode, question-package-response.js, mode -> fixed question package, outcomePolicy, question-queue-planner, docs_keeper, clickup-task-facts.json, line_count_gate, over_500_touched_files, completion-gate, phase-gates.md

## User preferences

- when the user says `任务事实在此,不读mcp`, treat local task-facts as the primary contract and avoid ClickUp MCP unless they re-allow it [Task 1]
- when the user says `你又没分配docs-keeper?不需要吗?`, do not treat contract-changing diagnosis work as complete until the docs/BRV sync path is explicitly covered [Task 1]

## Reusable knowledge

- `getQuestionPackageByMode(mode)` in `cloudfunctions/diagnose-http/app/question-package-response.js` is the explicit fixed-package entrypoint. The package-first contract here is `mode -> fixed question package`, while `question-queue-planner` keeps all package questions and non-package behavior stays single-question [Task 1]
- The docs/BRV surfaces that carried this contract change were `docs/code-logics/INDEX.md`, `docs/new-rules/planting_ai_diagnosis_all_in_one.md`, and `docs/new-rules/planting_ai_diagnosis_source_index.json`; in that rollout cycle, the post-sync BRV evidence was historical V3 lifecycle validation rather than a current V4 topic-content check [Task 1]
- For this diagnosis-flow family, `npm run test:ci` is not sufficient by itself. The repeatedly relevant local regression commands are `node test/unit-test/test-question-package.mjs`, `node test/unit-test/test-route-planning.mjs`, and `git diff --check`, with focused schema/runtime tests such as `node test/unit-test/test-question-repository-schema.mjs` added when repository contract changes land [Task 1]

## Failures and how to do differently

- Do not finalize diagnosis contract work before checking whether docs_keeper/docs sync and workflow gates are part of the requested outcome; this repo repeatedly treated them as real completion criteria, not optional cleanup [Task 1]

# Task Group: planting care-behavior timeline selectable-today and recent-event contract

scope: use this block for `CareBehaviorTimeline` selection bounds or the diagnosis/reminder `watering_events_10d` contract; it does not preserve the deleted loading, CSS, or diagnosis-mode rollout evidence.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=re-open the named live files before implementation; this is an authoritative ad-hoc contract note, not a visual-loading runbook.

## Task 1: Sync the care-behavior timeline and planner contract so today is selectable and recent 10-day events can include d0, outcome captured from ad-hoc note

### rollout_summary_files

- extensions/ad_hoc/notes/2026-07-06T00-00-00Z-caring-timeline-selectable-today-brv-note.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-07-06T00-00-00Z-caring-timeline-selectable-today-brv-note.md, updated_at=2026-07-06T00:00:00Z, thread_id=None, authoritative note aligning timeline selectable range, recent-event truncation, and `watering-planner`/`environment-context-v7` contracts around including today) [ad-hoc note]

### keywords

- CareBehaviorTimeline, DEFAULT_SELECTABLE_START_OFFSET, DEFAULT_SELECTABLE_END_OFFSET, display-window.js, buildCareBehaviorTimelineFromDateEvents, watering_events_10d, fertilizing_events_10d, light_change_events_10d, normalizeCareBehaviorTimeline, environment-context-v7, /user-plants/watering-planner, 含当日可回传

## Reusable knowledge

- The July 6 contract update changed the timeline selection boundary from `d-1` to `d0`: `display-window.js` now keeps `DEFAULT_SELECTABLE_START_OFFSET = -10` and `DEFAULT_SELECTABLE_END_OFFSET = 0`, so the user can click today's watering cell while the display window stays independent at `d-16 ~ d+4` [Task 1][ad-hoc note]
- `buildCareBehaviorTimelineFromDateEvents` no longer filters out today, which means `watering_events_10d`, `fertilizing_events_10d`, and `light_change_events_10d` may legitimately include d0 in the payload returned to diagnosis/reminder flows [Task 1][ad-hoc note]
- The recent-event truncation logic is now aligned across both `cloudfunctions/layer/utils/watering-planner.js` and `cloudfunctions/diagnose-http/utils/environment-context-v7.js`: dedupe by date first, then keep the most recent 10-day window so full windows do not drop today's event [Task 1][ad-hoc note]
- The outward-facing planner contract moved with that change: `/user-plants/watering-planner` `wateringEvents` should be treated as “最近 10 天（含当日可回传）”, not a yesterday-capped list [Task 1][ad-hoc note]

## Failures and how to do differently

- Do not keep old “up to yesterday only” assumptions in timeline docs, planner reviews, or diagnosis answers once the current contract has moved to selectable-today and recent-10d-including-d0 semantics [Task 1][ad-hoc note]

# Task Group: planting BRV context-tree maintenance, code-vs-memory verification, and source-verified fact hygiene

scope: use this block for historical pre-2026-07-10 `.brv/context-tree` fact-hygiene work or when older memories still cite the retired BRV lifecycle validator; for current repo governance, prefer the newer ByteRover V4 boundary block.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=historical-only for legacy `.brv/context-tree` validation runs before the ByteRover V4 boundary retirement; always re-open live code and current repo governance before reusing any claimed fact.

## Task 1: Strictly verify BRV facts against current code and correct mismatches in place, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-06T03-39-20-kWzL-brv_code_source_verification_and_fact_correction.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/06/rollout-2026-06-06T11-39-20-019e9b03-886d-7142-89f0-93a72fdb7e51.jsonl, updated_at=2026-06-06T03:47:48+00:00, thread_id=019e9b03-886d-7142-89f0-93a72fdb7e51, corrected stale BRV facts, fixed source metadata, and re-ran BRV validation successfully)

### keywords

- brv, source verification, code as truth, validate-brv-context-lifecycle (V3-history), source_kind, source.lines, routeSelection, canOpenNextFollowUpRound, visibleOutcomes, storage-http, resolveHttpUserInfo, diagnose-follow-up-payload

## Task 2: Review and repair the latest backend BRV fact refactor, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-08T00-18-53-khhW-brv_backend_fact_review_and_repair.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/08/rollout-2026-06-08T08-18-53-019ea498-babb-71b0-9b3b-25c6eef7d7ec.jsonl, updated_at=2026-06-08T01:36:31+00:00, thread_id=019ea498-babb-71b0-9b3b-25c6eef7d7ec, re-reviewed the newest backend BRV files, repaired source evidence and Chinese-first wording, and re-scored after validation)

### keywords

- source_verified_backend_facts, source_verified_backend_facts.overview.md, unsupported_question_package_mode, 379-384, skipAuth, leaf_yellowing_diagnosis_logic.md, yellowing_mode, metrics.questionStartPath, MANUAL_SYMPTOM_MODE_OPTIONS, chinese-first docs, .gitignore

## User preferences

- when the user says “严格校验 `brv` 记录的记忆与当前代码逻辑的事实是否相符?如遇到记忆与文档,代码逻辑不符,以代码逻辑为事实源矫正.”, treat live code as the authority over `.brv` memory or docs and correct the artifacts themselves rather than defending the old wording [Task 1]
- when the user says `针对最新的修改再次做出review` and then `由你来改在自己打分`, re-read the edited `.brv` files, fix them directly, and re-score after the repair instead of stopping at findings [Task 2]

## Reusable knowledge

- Before the 2026-07-10 ByteRover V4 transition, `scripts/validate-brv-context-lifecycle.mjs` was the gate for BRV fact hygiene here: `type: fact` entries needed `status: verified`, `source_kind`, `source.file`, and `source.lines`, and later runs also relied on `owner` metadata plus direct file inspection because `.brv/` was ignored by git [Task 1][Task 2]
- The current diagnosis routing source of truth is still the live code, not old wording: `cloudfunctions/diagnose-http/constants/scoring.js` sets `routeSelection.maxQuestionsPerRound: 1`, `maxRounds: 4`, and `maxFollowUpRounds: 0`, while `canOpenNextFollowUpRound()` in `cloudfunctions/diagnose-http/domain/diagnosis-engine.js` currently returns `true` [Task 1]
- The backend static question-start path evidence that needed repair was in `cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js`; the unsupported-mode `501` branch sits at `379-384`, so verified facts about fallback/non-fallback behavior should cite that exact range [Task 2]
- The corrected frontend source pointer worth reusing is `src/utils/diagnose-follow-up-payload.js` for `buildFollowUpPayload`; the older `src/pages/diagnose/follow-up/payload.js` reference was stale [Task 1]

## Failures and how to do differently

- Do not add or keep BRV facts without `source_kind` and `source.lines`; the validator will fail and the cleanup cost is higher when metadata is omitted up front [Task 1][Task 2]
- Do not trust copied or hand-waved line ranges like `1-0`, `n/a`, or ranges beyond file length. Use `nl -ba` or equivalent to confirm exact bounds before writing verified fact metadata [Task 1][Task 2]
- Do not leave stale condensation metadata or English-only prose after hand-editing BRV summaries. Refresh or remove generated hash/token fields and keep the narrative Chinese-first while preserving code identifiers verbatim [Task 2]

# Task Group: planting workflow governance, dispatch-task packaging, and agent-role boundaries

scope: use this block when the user is refining local Codex workflow docs/skills in `planting`, especially `.codex/skills/dispatch-task`, `.codex/agents/*.toml`, and the role/packet boundaries that affect how work is dispatched.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe for this repo's local workflow-governance work while the same `.codex/skills/`, `.codex/agents/`, and dispatch-task layout exists, but re-open the live files before assuming a requested redesign was actually adopted.

## Task 1: Add enforceable docs_keeper and >500-line decomposition gates to `dispatch-task`, outcome success

### rollout_summary_files

- rollout_summaries/2026-06-07T01-15-18-irur-diagnose_question_package_docs_sync_dispatch_gate_hardening.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/06/07/rollout-2026-06-07T09-15-18-019e9fa6-0489-7282-94eb-dda0674ef18b.jsonl, updated_at=2026-06-07T02:41:43+00:00, thread_id=019e9fa6-0489-7282-94eb-dda0674ef18b, added hard-gate fields and reference updates so docs sync and large-file splitting become enforceable rather than advisory)

### keywords

- docs_keeper_required, line_count_gate, over_500_touched_files, agent-assignment-gate.md, implementation-test-contract.md, completion-gate.md, main-agent-quality-gates.md, phase-gates.md

## User preferences

- when the user says `你又没分配docs-keeper?不需要吗?` and then points out the missing `超500行需要拆分解耦` hard indicator, treat docs sync and large-file decomposition as enforceable workflow gates, not just style advice [Task 1]

## Reusable knowledge

- The enforceable gate surfaces for this repo now live in `.codex/skills/dispatch-task/references/agent-assignment-gate.md`, `role-context-packets.md`, `implementation-test-contract.md`, `main-agent-quality-gates.md`, `completion-gate.md`, and `.codex/skills/dispatch-task/assets/templates/phase-gates.md`; that is where `docs_keeper_required`, `docs_sync_completed`, `line_count_gate_passed`, and `over_500_touched_files` belong [Task 1]

## Failures and how to do differently

- Do not leave workflow principles as prose-only guidance when the user asked for hard indicators. Put them into assignment, implementation, review, and completion gates so the task cannot “pass” without those receipts [Task 1]

# Task Group: planting CloudBase SQL dispatch gating and DDL escalation

scope: use this block when `planting` CloudBase SQL work is blocked before implementation by dispatch Phase 0 rules, or when a false DDL blocker at `$runSQLRaw` / `models.$runSQL` must be escalated to CLI and management-plane paths.
applies_to: cwd=/Users/jay/WebstormProjects/planting and /Users/jay/.hermes/kanban/boards/jayflow/workspaces/*; reuse_rule=safe while the same `test/e2e/terminal-e2e/*`, CloudBase env/schema surfaces, and dispatch-task gates remain active; re-check live task body, env id, and tool availability before reusing exact commands.

## Task 1: Do not stop CloudBase MySQL DDL analysis at `$runSQLRaw` `InvalidParameter`; use CLI instance lookup and `tcb db execute`, outcome durable rule captured

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-19T15-39-48+0800-cloudbase-mysql-ddl-cli-path.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-19T15-39-48+0800-cloudbase-mysql-ddl-cli-path.md, updated_at=2026-06-19T15:39:48+08:00, thread_id=None, ad-hoc note capturing the corrected CloudBase MySQL DDL path for ClickUp `86exzqc3c` after a false blocker at `$runSQLRaw`)

### keywords

- 86exzqc3c, CloudBase MySQL, DDL, models.$runSQL, $runSQLRaw, InvalidParameter, tcb db instance list, tcb db execute, cynosdbmysql-ins-nq6qok1d, run-with-cloudbase-env.mjs, ensure:cloudbase-sql-schema:verify

## Reusable knowledge

- `test/e2e/terminal-e2e/run-with-cloudbase-env.mjs` is the reusable env wrapper for injecting `CLOUDBASE_ENV_ID`, `TCB_ENV`, `APP_ENV`, `SCHEMA_ENV`, and `SQL_DATABASE` before CloudBase CLI or SQL work; older evidence may still mention the pre-move `scripts/terminal-e2e/...` path [Task 1]
- `$runSQL` / `$runSQLRaw` rejecting DDL with `InvalidParameter` only proves that API path is limited to `select/insert/update/delete/replace`; it does not prove CloudBase MySQL DDL is impossible in the environment [Task 1]
- The corrected DDL path for this repo was: `npx -y -p @cloudbase/cli tcb db instance list -e cloud1-2grufevs395a9d5e --json`, target instance `cynosdbmysql-ins-nq6qok1d`, then `tcb db execute` against the intended instance/schema, followed by `npm run ensure:cloudbase-sql-schema:verify` expecting `weather_locations=ok, plant_care_locations=ok, diagnosis_weather_evidence=ok` [Task 1]

## Failures and how to do differently

- CloudBase MySQL DDL blockers must not stop at `$runSQLRaw` `InvalidParameter`. Continue through official CLI, MCP, data-model, or other management-plane paths and only report a true DDL blocker after those routes are actually tested and fail [Task 1]

# Task Group: planting local CloudBase functions gateway, PR-only verification workflow, and environment-switching boundaries

scope: use this block when the user is debugging local mini-program CloudBase functions, separating PR verification from deploy/upload, or asking for environment-switching guidance grounded in the current repo rather than a bare ClickUp URL.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe while the same `package.json`, `scripts/dev/*`, `cloudfunctions/*/package.json`, `docs/cautions/`, `.env.local.example`, `dist/dev/mp-weixin/api/env.js`, and `.github/workflows/` surfaces remain active.

## Task 2: Treat full LAN local-functions startup as a hard gate before end-side acceptance, outcome rule captured

### rollout_summary_files

- extensions/ad_hoc/notes/2026-06-15T08-56-08-local-functions-lan-qa-gate.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-06-15T08-56-08-local-functions-lan-qa-gate.md, updated_at=2026-06-15T08:56:08+00:00, thread_id=None, ad-hoc note that end-side acceptance must first pass the full `npm run dev:mp-weixin:local-functions:lan` flow and that scoped gateway checks can produce false greens)

### keywords

- dev:mp-weixin:local-functions:lan, LAN flow, 3010, 3013, weather-http, 9006, LOCAL_FUNCTION_PROXY_FAILED, connect ECONNREFUSED 127.0.0.1:9006, scoped gateway, full gateway readiness

## Task 3: Recover `npm run dev:mp-weixin:local-functions:lan` when `plant-user-http` dies behind a healthy `3010` gateway, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-09T06-40-18-2yEh-stale_local_cloudbase_gateway_recovery.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/09/rollout-2026-07-09T14-40-18-019f459b-1317-7fd3-9ea3-2f22907a3879.jsonl, updated_at=2026-07-09T06:54:13+00:00, thread_id=019f459b-1317-7fd3-9ea3-2f22907a3879, fixed stale repo-owned gateway recovery plus SIGINT/SIGTERM shutdown handling in the local gateway scripts)

### keywords

- npm run dev:mp-weixin:local-functions:lan, plant-user-http: 502, LOCAL_FUNCTION_PROXY_FAILED, connect ECONNREFUSED 127.0.0.1:9002, run-local-api-env.mjs, local-functions-gateway.mjs, stale gateway, repo-owned gateway, /__local_functions__/health, worker liveness, SIGINT, SIGTERM, validate-completion-readiness

## Task 4: Diagnose transient `$runSQL` retry noise during LAN local-functions startup and confirm the local environment is actually healthy, outcome uncertain but environment verified

### rollout_summary_files

- rollout_summaries/2026-07-14T13-21-09-AM4f-planting_local_cloudbase_lan_sql_retry_diagnosis.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/14/rollout-2026-07-14T21-21-09-019f60c9-dbb9-7c73-9a1e-8137e1fdcca7.jsonl, updated_at=2026-07-14T13:23:06+00:00, thread_id=019f60c9-dbb9-7c73-9a1e-8137e1fdcca7, checked the local SQL env path, health endpoints, and business route after a transient `$runSQL` retry log and found the LAN environment healthy)

### keywords

- cloudbase.models.$runSQL, transient failure, retrying, Database connection failed, plant-user-http, SQL_OK, SELECT 1 AS ok, cloud1_dev, __local_functions__/health, user-plants?page=1&pageSize=1&skipAuth=true, cloudbaserc.json

## User preferences

- when the user says future local QA should solve the problem instead of only saying how to solve it, treat full `npm run dev:mp-weixin:local-functions:lan` readiness as work to complete before claiming end-side acceptance or handing back instructions only [Task 2]
- when the user reports `npm run dev:mp-weixin:local-functions:lan` timing out with `plant-user-http: 502` and asks only `修复`, treat it as a runtime-path fix request and debug the local gateway/worker path before touching frontend code [Task 3]
- when the user reports an exact transient local runtime error like `[cloudbase.models.$runSQL] transient failure, retrying`, diagnose the actual local env/gateway/function path first instead of answering with a generic CloudBase explanation [Task 4]

## Reusable knowledge

- For `planting` end-side acceptance where this round's code is not deployed to cloud, `npm run dev:mp-weixin:local-functions:lan` is now the hard gate: the full LAN flow must finish local CloudBase gateway readiness, function health-route readiness, key business probes, and `dist/dev/mp-weixin` watch/ready before `9420` / `miniprogram-automator` / mini-program `wx.request` can count as acceptance evidence [Task 2]
- Scoped gateway checks are only troubleshooting evidence. The 2026-06-15 `weather-cache` counterexample matters: old `3010` health still listed `weather-http`, but port `9006` was absent and the real function path returned `502 LOCAL_FUNCTION_PROXY_FAILED / connect ECONNREFUSED 127.0.0.1:9006`; a passing scoped `3013` gateway only proved one function path, not the full LAN flow [Task 2]
- `scripts/dev/run-local-api-env.mjs` is now the decisive stale-gateway recovery entrypoint for the LAN flow: if root health is green but a required route returns `LOCAL_FUNCTION_PROXY_FAILED` / `ECONNREFUSED`, it can identify a repo-owned stale `3010` listener, kill that pid, and restart the full local gateway automatically [Task 3]
- `scripts/dev/local-functions-gateway.mjs` now exposes gateway identity plus per-function liveness in `/__local_functions__/health`, and it exits when a worker exits so the gateway cannot remain falsely green after a child process dies [Task 3]
- The worker port map in this gateway family is `diagnose-http=9000`, `plant-catalog-http=9001`, `plant-user-http=9002`, `identify-http=9003`, `diagnosis-history-http=9004`, `auth-user-http=9005`, `weather-http=9006`, `storage-http=9007`; `plant-user-http` on `9002` was the concrete stale-worker failure in the July 9 rollout [Task 3]
- The verified LAN readiness probe for this repaired path is `node scripts/dev/run-local-api-env.mjs --mode=lan -- node -e "console.log('lan-ready')"`; the stale-gateway branch was separately verified against a mock `3010` gateway that still returned healthy root status while `plant-user-http` returned `502 LOCAL_FUNCTION_PROXY_FAILED` [Task 3]
- for the `$runSQL` retry symptom, the fastest truth chain is: confirm `APP_ENV=development` / `SQL_DATABASE=cloud1_dev`, check whether any SQL DB-link env var is actually set, run a direct `models.$runSQL('SELECT 1 AS ok')` probe through the same local-init path, query `GET /__local_functions__/health`, and hit a small business route such as `plant-user-http/user-plants?...&skipAuth=true` before assuming the database config is broken [Task 4]
- in this repo, `cloudfunctions/layer/utils/cloudbase.js` only adds `dbLinkName` when one of `CLOUDBASE_SQL_DBLINK_NAME`, `CLOUDBASE_SQL_DB_LINK_NAME`, `SQL_DBLINK_NAME`, or `SQL_DB_LINK_NAME` is set; otherwise `$runSQL` runs with `sqlConfig={}` and can still succeed [Task 4]
- a transient `[cloudbase.models.$runSQL] ... retrying` log does not by itself prove a broken local environment. In the July 14 diagnosis, direct `SELECT 1`, LAN readiness, gateway health, and `plant-user-http` business probe all passed after the reported log [Task 4]
- `cloudbaserc.json` was observed as an untracked local file with plaintext CloudBase credential fields during this diagnosis; keep secrets in `.env.local`-style storage and do not promote them into tracked config [Task 4]

## Failures and how to do differently

- Do not count `9420`, backend `curl`, `__local_functions__/health`, or one function's health route as end-side acceptance before the full `dev:mp-weixin:local-functions:lan` flow is actually up and watching `dist/dev/mp-weixin` [Task 2]
- Do not treat scoped gateway success as proof that the shared LAN worker set is healthy; verify the real worker port and business route because stale `3010`/`3013` health can mask `LOCAL_FUNCTION_PROXY_FAILED` on the target function [Task 2]
- Do not trust a healthy root `3010` response when a required function route still returns `plant-user-http: 502` / `connect ECONNREFUSED 127.0.0.1:9002`; in this repo that symptom means “stale worker behind a live gateway” until the repo-owned listener and worker liveness are checked [Task 3]
- Do not use direct `process.on('SIGINT', shutdown)` / `process.on('SIGTERM', shutdown)` patterns in this gateway script family without normalizing the exit code; Node passes the signal string to the handler, so this rollout had to wrap the calls as `shutdown(0)` closures [Task 3]
- Do not let dispatch validator packets invent statuses like `not_run` or `passed_with_warnings`; completion-readiness gates in this repo expect the validator's accepted enum set from the start [Task 3]
- Do not assume `Database connection failed, please check the corresponding database connection configuration` means `.env.local` is missing. In this repo it can also be transient retry noise or a stale earlier process, so verify the direct SQL probe and the real LAN endpoints before changing config [Task 4]
- Do not stop at the retry log alone when the process has not actually failed. First distinguish transient log noise from a final failure by checking whether `dev:mp-weixin:local-functions:lan` exits and whether the target business route still returns HTTP 200 [Task 4]

# Task Group: planting ByteRover V4 boundary retirement and light-health contract realignment

scope: use this block when current `planting` ByteRover governance may still assume the retired V3 `.brv/context-tree` validator path, or when a ByteRover topic about light-health / light-environment needs to be rebuilt from live source code.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe for current repo governance and ByteRover topic maintenance while `.brvspace`, `check:brv-v4-boundary`, and the same light-health source chain remain in place.

## Task 1: Retire the legacy ByteRover V3 lifecycle gate and replace it with the repo V4 boundary check, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-10T09-35-07-AHBK-byterover_v4_boundary_retirement_and_light_health_contract_a.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T17-35-07-019f4b61-7bac-7221-a5a7-995f7bd32270.jsonl, updated_at=2026-07-10T15:25:54+00:00, thread_id=019f4b61-7bac-7221-a5a7-995f7bd32270, retired `validate-brv-context-lifecycle`, added `check:brv-v4-boundary`, and rewired docs/package/CI to the current `.brvspace`-bound ByteRover model)

### keywords

- .brvspace, check:brv-v4-boundary, scripts/check-brv-v4-boundary.mjs, validate-brv-context-lifecycle (retired), README.md, docs/KNOWLEDGE_GOVERNANCE.md, docs/_sync-map.yml, knowledge_hygiene_check.py, pr-check.yml

## Task 2: Rebuild the ByteRover light-health topic from live source files and anchor it to the exact implementation contract, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-10T09-35-07-AHBK-byterover_v4_boundary_retirement_and_light_health_contract_a.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T17-35-07-019f4b61-7bac-7221-a5a7-995f7bd32270.jsonl, updated_at=2026-07-10T15:25:54+00:00, thread_id=019f4b61-7bac-7221-a5a7-995f7bd32270, rewrote ByteRover memory for the indoor light-health algorithm using the current source chain and a versioned topic name)

### keywords

- light_health_estimator_v1, indoor_light_health_assessment_contract.html, weatherLightFactor10d, light-environment.js, light-env-constants.js, light-health-factors.js, light-health-normalize.js, light-health-estimator.js, weather-light-factor.js

## Task 3: Canonicalize ByteRover governance wording and replace stale topic clusters with one mode-specific diagnosis contract, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-11T09-52-23-KIXs-byterover_memory_cleanup_and_topic_consolidation.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/11/rollout-2026-07-11T17-52-23-019f5097-a422-7f11-92f8-148552928976.jsonl, updated_at=2026-07-12T04:07:14+00:00, thread_id=019f5097-a422-7f11-92f8-148552928976, cleaned up stale ByteRover governance wording, replaced terminal-state topic clutter, and verified the mode-specific question-package contract)
- extensions/ad_hoc/notes/2026-07-12T00-20-00Z-byterover-governance-canonical-rule-block.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-07-12T00-20-00Z-byterover-governance-canonical-rule-block.md, updated_at=2026-07-12T00:20:00Z, thread_id=None, authoritative canonical-rule note for current V4 governance versus dated V3 evidence) [ad-hoc note]
- extensions/ad_hoc/notes/2026-07-12T00-15-00Z-byterover-memory-review-corrections.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-07-12T00-15-00Z-byterover-memory-review-corrections.md, updated_at=2026-07-12T00:15:00Z, thread_id=None, authoritative correction that `check:brv-v4-boundary` is not topic-content or retrieval validation) [ad-hoc note]
- extensions/ad_hoc/notes/2026-07-12T00-00-00Z-byterover-memory-cleanup-consolidation.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-07-12T00-00-00Z-byterover-memory-cleanup-consolidation.md, updated_at=2026-07-12T00:00:00Z, thread_id=None, superseded cleanup proposal retained as dated evidence; current interpretation follows the 00:15 correction) [ad-hoc note]
- extensions/ad_hoc/notes/2026-07-12T00-30-00Z-byterover-consolidation-execution-plan.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=extensions/ad_hoc/notes/2026-07-12T00-30-00Z-byterover-consolidation-execution-plan.md, updated_at=2026-07-12T00:30:00Z, thread_id=None, authoritative execution note for the replacement mode-specific diagnosis-package topic and the stale-topic prune set) [ad-hoc note]

### keywords

- ByteRover, MEMORY.md, canonical rule block, check:brv-v4-boundary, .brvspace, validate-brv-context-lifecycle, historical-v3-evidence, mode_specific_question_package_contract.html, yellow_leaf, wilting_droop, cloud-capability-expired, prune

## User preferences

- when ByteRover-related policy changes in this repo, the accepted change shape is not memory-only; update the active docs, scripts, and CI guardrails together with the binding/memory layer [Task 1]
- when the user says the recalled light algorithm is inconsistent with code, rewrite the ByteRover topic from the live implementation files instead of defending or paraphrasing the old memory [Task 2]
- when the user asks to `Review ByteRover memory for cleanup and consolidation opportunities.` and then steers toward the `清理后的最终版 Memory 规则段落`, prefer one canonical reusable rule block over scattered memory notes and carry the cleanup through end-to-end after they choose the direction [Task 3][ad-hoc note]

## Reusable knowledge

- The current repo-level ByteRover guard is `npm run check:brv-v4-boundary`, backed by `scripts/check-brv-v4-boundary.mjs`; it enforces that active README/docs/package/CI references no longer point at the retired V3 validator path [Task 1]
- `npm run check:brv-v4-boundary` is a read-only governance scan for retired V3 references in active repo surfaces; it is not a ByteRover topic-content, retrieval, or source-verification validator [Task 1][Task 3][ad-hoc note]
- The effective governance surface for this V4 transition was `README.md`, `docs/CURRENT.md`, `docs/ARCHIVE_INDEX.md`, `docs/KNOWLEDGE_GOVERNANCE.md`, `docs/_sync-map.yml`, `scripts/knowledge_hygiene_check.py`, `package.json`, and `.github/workflows/pr-check.yml` [Task 1]
- For current ByteRover binding verification in this repo, `.brvspace` plus the currently installed ByteRover skill's `space.mjs current` flow is the clearest local truth source; in this checkout the proven path was `node .codex/skills/byterover/scripts/space.mjs current`, and the rollout also verified `space.mjs list` as the durable folder-binding check [Task 1][Task 3]
- When older commands must stay in memory for auditability, label them explicitly as `Historical V3 evidence (pre-2026-07-10): <command> -> <dated result>` rather than turning them into a current operating instruction [Task 3][ad-hoc note]
- The repaired light-health memory is a contract chain, not one coefficient table: `src/utils/light-environment.js` handles answer-key mapping and optional normalization; `src/components/light-env-constants.js` defines UI distance bands/factors; `cloudfunctions/diagnose-http/utils/light-health-normalize.js`, `light-health-factors.js`, and `light-health-estimator.js` compute diagnosis-side scoring/evidence; `cloudfunctions/weather-http/services/weather-light-factor.js` plus the scheduler twin compute daily/recent weather factors [Task 2]
- The durable implementation anchors worth grepping are exact and versioned: `light_health_estimator_v1`, `weatherLightFactor10d`, `computeSampleLightFactor`, `estimateLightHealth`, and the ByteRover topic `architecture/diagnosis/indoor_light_health_assessment_contract.html` [Task 2]
- The validated source facts preserved by the rewrite were: `weatherLightFactor10d` stays neutral at `1.0` when evidence is insufficient, sample-priority order is `cloud` then `icon` then `text`, distance factor declines from `<=1m -> 1.0` toward a floor of `0.42`, and score thresholds are `40` / `65` [Task 2]
- The July 12 cleanup established a second durable ByteRover topic-maintenance rule: store stable product/architecture contracts, not workflow or QA policy, and replace duplicate topic clusters with one narrow canonical topic when source verification shows the old cluster was overgrown [Task 3][ad-hoc note]
- The concrete replacement topic verified in that cleanup is `architecture/diagnosis/mode_specific_question_package_contract.html`: `yellow_leaf` is a 4-question fixed package, `wilting_droop` is a separate 5-question fixed package, and there is no global fixed-4-question assumption for all diagnosis modes [Task 3]

## Failures and how to do differently

- Do not keep using `scripts/validate-brv-context-lifecycle.mjs` or `check:brv-context-lifecycle` as if they were the current repo contract; after the July 10 retirement they became stale references that the new boundary check is meant to catch [Task 1]
- Do not use `npm run check:brv-v4-boundary` to claim that a ByteRover topic was updated, retrieved, or source-verified correctly. That was the specific governance overreach corrected in the July 12 cleanup [Task 3][ad-hoc note]
- Do not make ByteRover policy changes only inside memory text. In this repo, the accepted update path was docs + package scripts + CI + guard script, with business code left untouched unless the contract itself changed [Task 1]
- Do not anchor ByteRover topic names to broad phrases like `光照算法` when the real issue is source drift. The successful rewrite used a narrow, implementation-anchored topic name tied to the current formula/version instead [Task 2]
- Do not treat early broad ByteRover recall misses as proof that the business fact is absent; search the live source chain first, then rewrite the topic so future recalls return the exact contract [Task 2]
- Do not keep stale terminal-state or workflow-policy topics alive in ByteRover once a narrower product contract has been verified from code. Replace the cluster with one validated contract topic and prune the duplicates after cloud capability is restored [Task 3][ad-hoc note]

# Task Group: planting ByteRover binding, onboarding, and active-space lookup

scope: use this block when the user asks which ByteRover space the `planting` checkout is using, wants the repo onboarded/rebound, or needs authoritative local state across `.brvspace`, `space.mjs current`, `brv status`, and the deprecated/partial V4 CLI surfaces.
applies_to: cwd=/Users/jay/WebstormProjects/planting; reuse_rule=safe for this checkout while ByteRover state is still exposed through `.brvspace`, `node .codex/skills/byterover/scripts/space.mjs`, `brv status`, and desktop BRV metadata under `~/Library/Application Support/brv/`.

## Task 1: Verify the project’s current ByteRover space from local truth sources, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-10T09-23-48-hiqZ-byterover_onboarding_planting_space_check.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T17-23-48-019f4b57-1f87-7483-bdfd-23ff7806afc9.jsonl, updated_at=2026-07-10T09:34:52+00:00, thread_id=019f4b57-1f87-7483-bdfd-23ff7806afc9, confirmed the active marker-bound space as `f5bd0774-82bc-47e6-a86b-9fefdceb5a49` and documented the exact local truth sources)
- rollout_summaries/2026-07-10T08-54-06-JTlv-byterover_space_binding_attempt_planting.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T16-54-06-019f4b3b-ef17-7c73-a2b3-ff9f36608079.jsonl, updated_at=2026-07-10T09:23:06+00:00, thread_id=019f4b3b-ef17-7c73-a2b3-ff9f36608079, earlier on the same day verified that `brv status` and desktop binding records could disagree about live remote state)

### keywords

- .brvspace, space.mjs current, source: marker, f5bd0774-82bc-47e6-a86b-9fefdceb5a49, space_name=planting, team_id=019ea1d6-bb3a-7cc6-b69a-41f75467c320, topicCount:22, current ByteRover space

## Task 2: Onboard or rebind the repo to the correct `planting` space despite duplicate names, outcome partial-to-success

### rollout_summary_files

- rollout_summaries/2026-07-10T09-23-48-hiqZ-byterover_onboarding_planting_space_check.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T17-23-48-019f4b57-1f87-7483-bdfd-23ff7806afc9.jsonl, updated_at=2026-07-10T09:34:52+00:00, thread_id=019f4b57-1f87-7483-bdfd-23ff7806afc9, restored the richer deleted `planting` space and re-established the repo marker on the intended space id)
- rollout_summaries/2026-07-10T08-54-06-JTlv-byterover_space_binding_attempt_planting.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T16-54-06-019f4b3b-ef17-7c73-a2b3-ff9f36608079.jsonl, updated_at=2026-07-10T09:23:06+00:00, thread_id=019f4b3b-ef17-7c73-a2b3-ff9f36608079, established the deprecated `brv space` dead ends and the slug-based `brv vc` remote path that still failed without the exact team/space slug pair)

### keywords

- onboarding, space.mjs bind, space.mjs restore, duplicate-space-name, planting, c6a4ed45-4bcb-46bc-b93a-595d46bac36a, f5bd0774-82bc-47e6-a86b-9fefdceb5a49, cloud-not-ready, brv vc remote add, no remote configured

## Task 3: Diagnose missing live `.brv` / `Space: Not connected` states and separate them from backup or desktop records, outcome success

### rollout_summary_files

- rollout_summaries/2026-07-10T08-46-57-xQf5-byterover_space_check_not_connected.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T16-46-57-019f4b35-62e8-7463-a0ab-8ba3300a65cf.jsonl, updated_at=2026-07-10T08:48:44+00:00, thread_id=019f4b35-62e8-7463-a0ab-8ba3300a65cf, established the earlier same-day state where the checkout had no live `.brv/` tree and `brv status` reported `Space: Not connected`)
- rollout_summaries/2026-07-10T08-54-06-JTlv-byterover_space_binding_attempt_planting.md (cwd=/Users/jay/WebstormProjects/planting, rollout_path=/Users/jay/.codex/sessions/2026/07/10/rollout-2026-07-10T16-54-06-019f4b3b-ef17-7c73-a2b3-ff9f36608079.jsonl, updated_at=2026-07-10T09:23:06+00:00, thread_id=019f4b3b-ef17-7c73-a2b3-ff9f36608079, showed that desktop binding records and `contextTreeStatus: git_vc` still did not guarantee a configured project remote)

### keywords

- brv status, Space: Not connected, Context Tree: Not initialized, .brv-backup, bindings.json, desktop-spaces.json, git_vc, brv vc remote, No remote configured, find .. -maxdepth 2 -name .brv -type d

## User preferences

- when the user asks `Check which ByteRover space this project is using.`, answer from live repo/tool state and include the exact space id/name plus the source of truth rather than a generic BRV explanation [Task 1][Task 3]
- when the user says `Bind this project to the "planting" ByteRover space.` or points to the bind docs and asks to `绑定一次`, follow the current operational bind flow directly instead of stopping at conceptual guidance [Task 2]
- when the user says `onboard with ByteRover`, treat it as full workspace setup and binding recovery, not a narrow file-inspection task [Task 2]

## Reusable knowledge

- The freshest local truth source for the active `planting` binding is `.brvspace` plus `node .codex/skills/byterover/scripts/space.mjs current`; on July 10 that resolved `{"space_id":"f5bd0774-82bc-47e6-a86b-9fefdceb5a49","space_name":"planting"}` from `source: marker` [Task 1]
- In this repo, ByteRover helper scripts are under `.codex/skills/byterover/scripts/`, and the global CLI is `/Users/jay/.brv-cli/bin/brv`; repo-root paths like `scripts/auth.mjs` or `scripts/space.mjs` are dead ends here [Task 1][Task 2]
- `node .codex/skills/byterover/scripts/space.mjs list` is the practical way to distinguish duplicate display names; the useful `planting` space had `space_id: f5bd0774-82bc-47e6-a86b-9fefdceb5a49`, `team_id: 019ea1d6-bb3a-7cc6-b69a-41f75467c320`, and `topicCount: 22`, while another `planting` space (`c6a4ed45-4bcb-46bc-b93a-595d46bac36a`) was the wrong target for this repo [Task 1][Task 2]
- `node .codex/skills/byterover/scripts/space.mjs restore <space_id>` can recover a soft-deleted space; after restore, cloud recall/search can temporarily return `cloud-not-ready`, so verify the local marker first and retry after a short wait [Task 2]
- `brv status` remains the decisive check when `.brvspace` is absent or the repo appears disconnected; the earlier same-day state was `Project: /Users/jay/WebstormProjects/planting`, `Space: Not connected`, `Context Tree: Not initialized` [Task 3]
- `.brv-backup/config.json`, `.brv-backup/context-tree/_manifest.json`, and desktop BRV files under `~/Library/Application Support/brv/` (`bindings.json`, `desktop-spaces.json`, `desktop-teams.json`) are useful context, but they do not by themselves prove the repo's active project binding or remote configuration [Task 2][Task 3]
- The supported V4 remote path is `brv vc`, but discovery is brittle: `brv vc remote add` resolves exact team/space slugs, `brv space list` / `brv space switch` are deprecated, and `brv vc remote` can still say `No remote configured` even when desktop binding records exist [Task 2][Task 3]
- `python` was unavailable in this shell during the onboarding runs; for JSON filtering around `space.mjs list`, use `node -e` instead [Task 1][Task 2]

## Failures and how to do differently

- Do not assume backup artifacts or desktop binding records mean the current checkout is already live-bound. The July 10 chronology started with `Space: Not connected` and only later moved to a marker-bound state [Task 1][Task 3]
- Do not use repo-root `scripts/auth.mjs` / `scripts/space.mjs` paths here; the real tooling lives under `.codex/skills/byterover/scripts/`, and the wrong path only yields `MODULE_NOT_FOUND` noise [Task 2]
- Do not bind by display name alone when duplicate `planting` spaces exist; verify by `space_id`, `topicCount`, and the resulting `.brvspace` marker before treating the bind as correct [Task 2]
- Do not guess `brv vc` remote URLs from human-readable names or UUIDs. The supported parser expects exact `https://byterover.dev/<team>/<space>.git` slugs, and wrong guesses fail even when local desktop metadata shows a related space [Task 2]
- Do not treat desktop app binding state as equivalent to a configured project remote. `contextTreeStatus: git_vc` plus local bindings still left `brv vc remote` at `No remote configured` in the failed-bind run [Task 2][Task 3]
