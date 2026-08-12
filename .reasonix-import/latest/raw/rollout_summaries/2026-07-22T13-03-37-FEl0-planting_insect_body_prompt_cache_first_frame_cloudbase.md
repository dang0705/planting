thread_id: 019f89ec-ac6e-7912-bc62-f36484b3d0ce
updated_at: 2026-07-23T00:36:16+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T21-03-37-019f89ec-ac6e-7912-bc62-f36484b3d0ce.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Planting visual-diagnosis prompt hardening, first-frame optimization, and cache/provider documentation

Rollout context: Work occurred in `/Users/jay/WebstormProjects/planting` with a heavily dirty shared worktree. The user requested eight specific pest modes, then clarified that the model must actively identify insect bodies rather than only plant symptoms, requested complete frontend prompt visibility, and asked to record the latency/cache/thinking findings in ByteRover.

## Task 1: Add eight specific pest modes to visual prompting

Outcome: partial

Preference signals:
- The user supplied exact modes, Chinese labels, visual direct-judgment thresholds, and per-mode question limits -> future changes should preserve these names and thresholds exactly rather than merely adding broad “pest” wording.
- The user later said the prompt was “不够硬” and wanted the model to identify “图片的虫体” -> pest prompting must explicitly require insect-body inspection, not just symptom/candidate recognition.

Reusable knowledge:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js` already contained the eight mode keys and labels: `spider_mite`, `mealybug`, `scale_insect`, `whitefly`, `aphid`, `thrips`, `leaf_miner`, and `fungus_gnat`.
- The prompt’s direct thresholds were present and covered mite colony/webbing plus speckling, wax-covered mealybug colony, fixed scale shells, whitefly adults plus nymphs, pear-shaped aphid colony, thrips body or silver scarring plus black dots, continuous internal leaf tunnels, and multiple soil flies.
- The registry and question package still configured all specific pests with `maxQuestions: 2`; this conflicts with the user’s table requiring `thrips=2` and all other listed pests `=1`. No change was made because the related files were already dirty and authorization to alter that contract was not given.

Failures and how to do differently:
- Do not treat presence of mode names in a prompt as sufficient acceptance. Verify both visual evidence thresholds and question-package limits.
- Do not overwrite a shared dirty implementation; isolate the requested diff or ask before touching overlapping files.

References:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js:96-107, 500+`
- `cloudfunctions/diagnose-http/domain/diagnosis-mode-registry.js:100-110`
- `cloudfunctions/diagnose-http/app/pest-question-package.js:272-329`

## Task 2: Make insect-body recognition an explicit structured contract

Outcome: success for the implemented prompt/schema change; broader runtime acceptance remained unverified

Preference signals:
- The user explicitly warned “注意 prompt cache” -> static schema/rules must remain in the cacheable prefix, never in `dynamicTaskText`.
- The user wanted the model to inspect “虫体” separately from plant symptoms -> future visual prompts should require body presence, body shape, and body location fields and distinguish uncertainty from absence.

Key steps:
- Added `visual_discriminators` and `missing_info_for_path` to `VISUAL_OUTPUT_SCHEMA_TEXT` in `cloudfunctions/diagnose-http/utils/visual-contract.js`.
- Added static schema requirements in `symptom-labeler-prompt.js` requiring `insect_body_presence`, `insect_body_shape`, and `insect_body_location` on every image.
- Added `STATIC_INSECT_INSPECTION_RULES` inside `buildCacheFirstVisualPrompt(...).ruleText`, preserving `[Static Schema]` / `[Static Rules]` placement and leaving the dynamic tail for image/session context.
- Explicitly separated `leaf_miner_tunnel` from actual visible insect bodies: a tunnel is evidence of a miner pattern, not proof that the insect itself was seen.
- Updated the prompt-cache contract test to expect the two new schema fields.

Reusable knowledge:
- Direct pest mode candidates still require the corresponding body or explicitly listed compound threshold in the same image region; yellowing, wilting, generic holes, dots, webbing, residue, or silver streaks alone must not be converted into an insect body.
- When visibility is insufficient, use `uncertain` with an explanation in `visible_basis_cn` or `missing_info_for_path`; do not use symptom patterns as body evidence.
- `node test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs` passed after updating the stale assertion.
- Scoped `oxlint` and `oxfmt` completed with zero lint errors; existing no-magic-number warnings remained.

Failures and how to do differently:
- The first patch attempt failed due to malformed patch hunk syntax and wrote nothing. Retry with smaller, valid hunks and verify the diff immediately.
- An existing `diagnosis-parser.mjs` test still failed on an unrelated `direct_result` versus `question_package` expectation; do not report the whole suite as passing.

References:
- `cloudfunctions/diagnose-http/utils/visual-contract.js:44-88`
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js:84-115, 500-505`
- `test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs:394-410`
- Exact static rule anchor: `HARD REQUIREMENT — INSECT-BODY-FIRST INSPECTION`

## Task 3: Expose complete frontend prompt / runtime diagnosis evidence

Outcome: uncertain/partial

Preference signals:
- The user asked “给我前端打印出完整的 prompt” -> when debugging visual requests, provide the complete prompt at the actual request boundary, not a truncated summary, while avoiding production logging by default.

Reusable knowledge:
- Frontend requests flow through `src/http-functions/core/httpRequest.js`; it currently logs request URLs, while the backend diagnosis handler logs `executed.aiDebug[].formattedPrompt` and raw model data.
- The user’s request was investigated, but the rollout does not show a completed frontend code change that prints the complete prompt. Do not claim this task was implemented.

Failures and how to do differently:
- Before adding frontend logging, confirm whether the prompt is actually present in the frontend payload. In this architecture prompt construction is primarily backend-side, so frontend logging may need to expose returned debug data or add a development-only backend response/log path rather than assume the client owns the prompt.

References:
- `src/http-functions/core/httpRequest.js`
- `src/http-functions/diagnose/client.js`
- `cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` logs `diagnosis/start ai[<imageIndex>] formatted prompt`

## Task 4: Optimize diagnosis first-frame readiness without changing prompt/provider protocol

Outcome: success for implementation and direct probe; formal Automator acceptance blocked

Key steps:
- `cloudfunctions/diagnose-http/app/refactor-readiness.js` gained a dedicated `ensureDiagnosisStartRefactorReady()` path: unknown/expired-but-not-known-bad readiness triggers one background refresh without blocking; known not-ready or refresh failure still raises 503; strict consumers retain blocking semantics.
- `cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js` switched `diagnosis/start` to the new fast path.
- Added focused unit coverage in `test/unit/backend/diagnose-http/app/refactor-readiness.mjs` for cold refresh deduplication, failure, not-ready state, and strict behavior.
- A direct non-acceptance runtime probe completed with status 200: `visual_model_started` at 673 ms, `visual_model_response_started` at 2888 ms, full stream completion at 7687 ms. This separated application-side readiness delay from provider/model first-token latency.

Failures and how to do differently:
- Formal `qa-run` was blocked before leaf execution because the active 9420 DevTools listener could not prove it loaded `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin`; error was `project_identity_unverified`. Do not restart or guess the project path. Reload the target project explicitly, then rerun catalog-gated QA.
- Completion Gate correctly remained blocked because the Automator execution was not passed; the direct probe must not be promoted to formal evidence.

Reusable knowledge:
- Required formal flow is catalog validation -> dry-run gate -> full LAN local-functions flow -> verified DevTools project identity -> 9420/page/screenshot/wx.request preflight -> live leaf execution.
- Catalog leaf: `diagnosis.pest.visual_mode_retake`; script: `test/e2e/automator/diagnosis/pest-mode-and-retake.mjs`.
- Formal QA requires `channel=miniprogram_automator`, a passed execution record, passed preflight, and frozen script hash proof.

References:
- `node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs validate-e2e-catalog`
- `node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs qa-run --catalog-id=diagnosis.pest.visual_mode_retake --execution-id=<id> --project-path=/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin --wx-request-url=<url> --allow-live`
- Failure: `project_identity_unverified`
- Runtime probe event names: `visual_preparing`, `visual_model_started`, `visual_model_response_started`, `visual_model_complete`, `visual_decision_ready`, `done`

## Task 5: Record CloudBase provider/cache/thinking knowledge in ByteRover

Outcome: success

Key steps:
- Queried existing ByteRover context before recording.
- Created and read back `architecture/diagnosis/cloudbase_visual_latency_cache_and_thinking.html`, linked to the existing pest/prompt-cache topic.

Reusable knowledge:
- CloudBase uses Anthropic Messages with a static system prefix containing `cache_control: ephemeral`; dynamic task and images remain in user content. It must not receive TokenHub-specific `prompt_cache_key`.
- TokenHub uses a provider/model/static-prefix-hash-derived `prompt_cache_key` and strips `cache_control`.
- Cache hits are evidenced only by normalized usage fields such as `promptCacheHitTokens`/`cachedTokens`; latency, cache-creation tokens, and repeated requests are not proof of a hit.
- CloudBase sends `thinking: { type: 'disabled' }` unless `cloudbaseAi.enableThinking === true`; disabling thinking controls reasoning output and is not a guarantee of faster visual encoding or first token.

References:
- BRV topic: `architecture/diagnosis/cloudbase_visual_latency_cache_and_thinking`
- Related BRV topic: `architecture/diagnosis/cache_stable_dynamic_pest_mapping`
- `cloudfunctions/diagnose-http/configs/index.js:292-296`
- `cloudfunctions/diagnose-http/configs/provider-registry.js`
- `cloudfunctions/diagnose-http/utils/cloudbase-ai-openai-contract.js:98-136`


