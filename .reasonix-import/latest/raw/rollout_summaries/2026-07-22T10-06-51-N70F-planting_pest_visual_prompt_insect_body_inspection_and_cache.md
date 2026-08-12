thread_id: 019f894a-d79c-7a72-b377-82614646a7ad
updated_at: 2026-07-22T13:34:08+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/22/rollout-2026-07-22T18-06-51-019f894a-d79c-7a72-b377-82614646a7ad.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Hardened plant-image pest recognition and began prompt debugging

Rollout context: In `/Users/jay/WebstormProjects/planting`, the user wanted eight pest modes added to the visual prompt, then clarified that the model must inspect actual insect bodies—not merely plant symptoms—and later asked the frontend to print the complete prompt. The workspace already contained extensive unrelated dirty changes.

## Task 1: Add eight pest recognition rules

Outcome: partial

Preference signals:
- The user supplied explicit direct-judgment thresholds and later emphasized: “我认为这个提示词不够硬，我要的是让模型除了识别植物，还得识别图片的虫体。” Similar visual prompts should require explicit insect-body inspection, not just symptom-based pest candidates.
- The user specifically warned: “注意 prompt cache” -> stable inspection rules and schema belong in the static cache prefix, while per-image context remains dynamic.

Key steps:
- Confirmed the eight modes and Chinese labels were already present in `symptom-labeler-prompt.js` and `diagnosis-mode-registry.js` as existing dirty changes.
- Added/retained hard static rules requiring every image to inspect arthropod bodies, colonies, shells, larvae, flying insects, and leaf-miner tracks.
- Extended the static output schema with `visual_discriminators` and `missing_info_for_path`, requiring `insect_body_presence`, `insect_body_shape`, and `insect_body_location`.
- Explicitly separated a leaf-miner tunnel from a visible insect body.
- Updated the prompt-cache contract test to accept the new schema fields.

Failures and how to do differently:
- The first patch attempt failed due to malformed patch syntax; a smaller follow-up patch succeeded.
- `visual-prompt-cache-contract.mjs` initially failed because an old assertion explicitly forbade the new schema fields; update contract tests when deliberately expanding the model output schema.
- `diagnosis-parser.mjs` still failed on an unrelated existing `direct_result` versus `question_package` expectation. Do not claim the whole test suite passes from the prompt-cache test alone.
- Pest question limits remained unresolved: all specific pests were still configured for up to 2 questions, conflicting with the user’s table requiring 1 for seven modes and 2 for thrips. No change was made because the relevant files were already dirty and user authorization was not received.

Reusable knowledge:
- Static cache construction is via `buildCacheFirstVisualPrompt()`; rules/schema must be passed through `ruleText`/`schemaText`, not `dynamicTaskText`.
- Prompt rules should distinguish actual bodies from indirect signs: webs, dots, residue, holes, and silver streaks alone are not insect bodies; uncertain/occluded/too-small evidence must remain uncertain.
- Existing parser support already normalizes `visual_discriminators` and `missing_info_for_path`.

References:
- `cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js:84-115, 500-505`
- `cloudfunctions/diagnose-http/utils/visual-contract.js:44-89`
- `test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs:409-410`
- Passing command: `node test/unit/backend/diagnose-http/utils/visual-prompt-cache-contract.mjs`
- Scoped lint/fmt exited 0, with existing no-magic-numbers warnings.

## Task 2: Print the complete prompt in the frontend

Outcome: uncertain

Preference signals:
- The user asked: “给我前端打印出完整的 prompt” -> when debugging visual requests, print the full prompt at the actual request boundary, not a truncated summary, while avoiding production leakage and duplicate logs.

Key steps:
- Began inspecting Vue guidance and diagnosis client/request paths to locate the real visual-request boundary.
- No completed code change or verification was shown before the rollout was interrupted.

Failures and how to do differently:
- Do not infer completion from the initial investigation; the task ended without a deliverable.

## Task 3: Provider-routing investigation

Outcome: partial

Reusable knowledge:
- Local evidence showed `TOKENHUB_API_KEY` worked against TokenHub `/v1/models`, while deployed `diagnose-http` lacked that variable and had CloudBase AI configuration instead. These are separate credential/endpoint planes and must not be conflated.
- CloudBase’s built-in group was observed to expose `qwen3.5-plus`; explicit TokenHub routing should remain opt-in.
- An implementer completed a targeted provider-routing change and focused test according to its result JSON, but the rollout was interrupted before final postflight/completion verification. Treat deployment/runtime availability as unverified.

References:
- `.tmp/dispatch-task/tokenhub-provider-routing-20260722-handoff.json`
- `.tmp/dispatch-task/tokenhub-provider-routing-20260722-implementer-result.json`
- Focused command: `node test/unit/backend/diagnose-http/utils/cloudbase-ai-openai-contract.mjs`
- Important caution: never store or print API keys; the rollout contained exposed credential material that must remain redacted.
