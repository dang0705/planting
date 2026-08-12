thread_id: 019f8251-f6b6-79c2-8bce-9ca34d607169
updated_at: 2026-07-21T02:29:08+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T09-37-17-019f8251-f6b6-79c2-8bce-9ca34d607169.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# CloudBase Qwen3.5-Plus migration and local diagnosis failures were investigated

Rollout context: Work occurred in `/Users/jay/WebstormProjects/planting`, using the local LAN functions flow and `cloud1_dev` schema.

## Task 1: Isolate the Qwen model profile

Outcome: success

Preference signals:
- The user explicitly objected that `qwen_vl_fast_vision` must not be paired with `qwen3.5-plus`, saying it was “乱搭” -> future changes must preserve semantic isolation between profile IDs, environment variable names, adapters, and model IDs.
- The user required minimal changes without changing request style, adapter routing, or SSE streaming -> preserve those interfaces when switching models.

Reusable knowledge:
- `cloudfunctions/diagnose-http/configs/index.js` now defines `qwen_3_5_plus` separately from `qwen_vl_fast_vision`.
- Correct mappings: `qwen_3_5_plus -> qwen3.5-plus`; `qwen_vl_fast_vision -> qwen3-vl-plus`; both use internal service `cloudbase_qwen_vl`.
- Default resolution was verified in a clean environment: profile `qwen_3_5_plus`, model `qwen3.5-plus`, service `cloudbase_qwen_vl`, CloudBase provider `cloudbase`, SSE `true`.
- The legacy profile was verified to remain switchable via `LLM_MODEL_PROFILE=qwen_vl_fast_vision`.

Failures and how to do differently:
- An earlier implementation incorrectly put `QWEN_3_5_PLUS_MODEL` inside `QWEN_VL_FAST_VISION_PROFILE`; the user caught this. Always inspect the complete profile block and run an exact cross-mapping check, not just a broad grep.

References:
- `cloudfunctions/diagnose-http/configs/index.js`
- Verification output: `{"default":{"profile":"qwen_3_5_plus","model":"qwen3.5-plus","service":"cloudbase_qwen_vl","provider":"cloudbase","sse":true},"legacy":{"profile":"qwen_vl_fast_vision","model":"qwen3-vl-plus"}}`

## Task 2: Diagnose and repair the local `diagnosis/start` 503

Outcome: success

Reusable knowledge:
- `diagnosis/start` calls strict `ensureRefactorReady()` before `runStartDiagnosis`; readiness failure returns 503 before any model call.
- The local LAN flow injects `APP_ENV=development`, `SCHEMA_ENV=development`, and `SQL_DATABASE=cloud1_dev`.
- Health initially reported `missing_tables:outcome_route_conditions` with 26/27 required tables. The weather schema verification command was insufficient because it only checks three weather tables.
- `$runSQL` rejected DDL with `InvalidParameter` because that API path supports only DML. The durable DDL path is CloudBase CLI `tcb db execute`, with schema-qualified SQL.
- An initial unqualified CLI execution created tables in the environment-named schema rather than `cloud1_dev`. Explicitly qualifying statements as ``CREATE TABLE IF NOT EXISTS `cloud1_dev`.table`` fixed the issue.
- All seven outcome tables were then created in `cloud1_dev`; health returned `ready:true`, no blocking issues, and 27 tables.
- A subsequent invalid-plant request returned a business-layer 500 (“植物不存在或无权限访问”), proving the request had passed the prior schema 503 gate.

Failures and how to do differently:
- Do not treat `npm run ensure:cloudbase-sql-schema:verify` as full diagnosis-schema verification; it only checks weather tables.
- Do not use unqualified DDL when the runtime schema is `cloud1_dev`; qualify the schema explicitly or verify the target schema immediately afterward.

References:
- `cloudfunctions/diagnose-http/app/refactor-readiness.js:96-101`
- `cloudfunctions/diagnose-http/services/bootstrap-report.js`
- `scripts/sql/ensure-outcome-route-tables.sql`
- Health after repair: `{"schema":"cloud1_dev","tableCount":27,"ready":true,"blockingIssues":[]}`

## Task 3: Diagnose the subsequent visual-model 502

Outcome: partial

Reusable knowledge:
- After schema repair, the failure changed to `502 视觉模型调用失败，请重试`, meaning execution reached the visual model stage.
- Direct CloudBase AI testing showed anonymous sign-in succeeded with HTTP 200, but both text and image calls to `/v1/ai/cloudbase/chat/completions` returned HTTP 403 `ACTION_FORBIDDEN`.
- The likely blocker is missing/unauthorized CloudBase AI API key or model entitlement, not profile mapping, SQL, image format, or SSE parsing. The code falls back to anonymous authorization when no API key is configured, and that token cannot invoke the model.
- The intended endpoint is `https://<env-id>.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions`; the model is `qwen3.5-plus`.
- CloudBase AI API credentials are distinct from CloudBase management/SQL credentials. Never copy or expose credential values from repository configuration; rotate any credentials that were exposed during the rollout.

Failures and how to do differently:
- The 502 was initially only surfaced as a generic visual failure because upstream details were compressed. Capture the original HTTP status/body in an isolated debug process.
- A debug gateway attempt on port 3011 failed because function-framework port 9000 was already occupied by the existing gateway; use separate function ports or the existing gateway rather than starting a conflicting instance.

References:
- Exact upstream error: `403 ACTION_FORBIDDEN`
- `cloudfunctions/diagnose-http/utils/llm.js` functions `buildCloudBaseAiEndpoint`, `buildCloudBaseAiAuthorization`, `requestCloudBaseAiOpenAi`
- `cloudfunctions/diagnose-http/configs/index.js` CloudBase AI settings (`CLOUDBASE_AI_API_KEY` / `LLM_API_KEY`, provider `cloudbase`)
- Final state: schema gate fixed, but model invocation remained unresolved pending valid CloudBase AI API authorization/model enablement.
