<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-weather-cache-slots-20260624:START>>>

You are the ZCode external implementer for dispatch run `zcode-weather-cache-slots-20260624`.

Do not ask Codex main for more context unless blocked. Modify code only inside the allowed paths below. Codex main will independently recover `git diff`, run tests, review the implementation, and decide completion. Your chat completion claim is not authoritative.

Clipboard/paste audit note: this prompt is being delivered by Codex main through a single clipboard paste into the current ZCode chat. Preserve the sentinel strings in any result you return so Codex can audit the bridge.

## Implementation Contract

Objective:

Fix the D0 weather-cache now-sample/timer/timezone contract. The live CloudBase object `weather-cache/v1/locations/city:shanghai/days/2026-06-24.json` currently shows duplicate `morning` samples, caused by timer/slot behavior. `sunrise` entering `morning` is invalid. `sunset` being modeled as `finalize` is also invalid because it is an instantaneous weather observation, not a rollup/finalize action.

Required behavior:

1. Fixed D0 now timers must map exactly to their semantic slot names:
   - `weather-d0-now-morning-0720` -> `morning`, cron `0 20 7 * * * *`
   - `weather-d0-now-forenoon-1120` -> `forenoon`, cron `0 20 11 * * * *`
   - `weather-d0-now-noon-1420` -> `noon`, cron `0 20 14 * * * *`
   - `weather-d0-now-afternoon-1620` -> `afternoon`, cron `0 20 16 * * * *`

2. Remove the dynamic sunrise/sunset now-sample behavior:
   - A trigger name with `weather-d0-now-sunrise__*` must not resolve to `morning`.
   - A trigger name with `weather-d0-now-sunset__*` must not resolve to `finalize`.
   - Such dynamic triggers must not write samples into `days/{date}.json`.
   - If season-trigger sync currently creates sunrise/sunset dynamic weather triggers, change that behavior so it no longer creates now-sample triggers for D0. Keep any non-weather season audit/state behavior only if still needed.

3. Finalize must be rollup-only:
   - Finalize is not a `samples[]` slot.
   - `days/{date}.json.samples[]` must not contain `slotName: "finalize"`.
   - `dailyRollup` is produced from existing `samples[]` only.
   - If an explicit finalize route/flag remains, it must not fetch QWeather `/v7/weather/now`.

4. Weather-cache time fields must be local-time ISO strings:
   - QWeather `obsTime` is already local to the weather location; normalize it as a local ISO string for `location.timezone` where possible.
   - `sampledAt`, `generatedAt`, `updatedAt`, `finalizedAt`, audit/manifest times exposed in weather-cache JSON should be local-time ISO strings under `location.timezone` or server default `Asia/Shanghai`, not raw UTC `toISOString()`, unless a field is intentionally internal-only and not persisted in weather-cache JSON.
   - Update direct consumers in backend/frontend to use the local-time contract directly. Do not add adapter compatibility layers.

5. Keep D0 state machine:
   - One file only: `weather-cache/v1/locations/{locationKey}/days/{date}.json`.
   - Accumulate `samples[]`, derive `latestSample` from non-missing samples by sample timestamp, and write nested `dailyRollup` on finalize.
   - Do not restore `working/` or D0 `daily/`.

6. Keep both copies aligned:
   - `cloudfunctions/weather-ingestion-scheduler/**`
   - `cloudfunctions/weather-http/**`
   These currently duplicate now-sample/slot/cache logic. Fix both or extract a safe local shared pattern only if it stays within allowed paths and does not add dependencies.

## Allowed / Forbidden Paths

Allowed paths:

- `cloudfunctions/weather-ingestion-scheduler/**`
- `cloudfunctions/weather-http/**`
- `test/unit-test/test-weather-*.mjs`
- `test/unit-test/test-now-sample-*.mjs`
- `test/unit-test/test-daylight-and-d0-weather-cache.mjs`
- `test/unit-test/test-season-trigger-sync.mjs`
- `docs/code-logics/INDEX.md`
- `docs/code-logics/weather-cache*.md`

Forbidden paths:

- `src/pages/**`
- `src/assets/**`
- `package.json`
- `package-lock.json`
- `cloudbaserc.json`
- `.env*`
- `AGENTS.md`
- `.codex/**`
- `.agents/**`

Stop and output `status: "blocked"` if you need a forbidden path.

## Project Constraints

- Framework: UniApp 3.0 / Vue 3 / CloudBase Cloud Functions / Node.js.
- Language: JavaScript.
- Styling system: Tailwind CSS 3. This is not a UI task; do not add SCSS.
- Component library: uni-ui. This is not a UI task.
- Dependency policy: no new dependencies.
- Do not enable CloudBase paid features such as provisioned concurrency.
- Chinese is first-class for comments/docs/domain terms.
- Do not bypass lint/test failures.
- Do not keep obsolete code via fallback/adapter when the upstream data structure changed; update consumers directly.

Important existing entry points:

- `cloudfunctions/weather-ingestion-scheduler/services/now-sample-slots.js`
- `cloudfunctions/weather-http/services/now-sample-slots.js`
- `cloudfunctions/weather-ingestion-scheduler/services/d0-now-sample-service.js`
- `cloudfunctions/weather-http/services/d0-now-sample-service.js`
- `cloudfunctions/weather-ingestion-scheduler/routes/recent-weather-routes.js`
- `cloudfunctions/weather-ingestion-scheduler/services/season-trigger-sync.js`
- `cloudfunctions/weather-ingestion-scheduler/config.json`
- `cloudfunctions/weather-http/services/recent-weather-current.js`
- `cloudfunctions/weather-ingestion-scheduler/services/recent-weather-current.js`
- `src/vue-query/weather/queries/current-weather.js`
- `src/vue-query/weather/queries/environment-weather.js`
- `src/utils/care-behavior-weather-window.js`

Note: frontend path changes are forbidden in this dispatch unless absolutely required. If frontend code must change to satisfy the local-time contract, output `blocked` and explain the exact required path/change instead of editing forbidden paths.

## Architecture Direction

Use strict contract changes, not compatibility adapters.

The target model is fixed semantic slots. Suncalc sunrise/sunset should be used for daylight windows and rollup/light features, not to create extra D0 now-sample trigger slots. A fixed timer invocation decides the slot name. QWeather `obsTime` can be used as observation evidence, but it must not remap the sample into a different slot.

For local-time formatting, prefer an existing helper or a small shared helper near the weather-cache services. Preserve parseability with ISO-like strings and explicit offset. Tests should prove that persisted fields are not raw `Z` UTC strings when location timezone is known.

## Validation Commands

Run at minimum:

```bash
node test/unit-test/test-now-sample-slots.mjs
node test/unit-test/test-daylight-and-d0-weather-cache.mjs
node test/unit-test/test-weather-d0-24h-timers.mjs
node test/unit-test/test-now-sample-retry-fallback.mjs
node test/unit-test/test-weather-cache-routes-and-evidence.mjs
node test/unit-test/test-season-trigger-sync.mjs
npm run lint -- --fix=false
```

If one command is not applicable because the repo script/tooling rejects the flag, run the closest repo-native equivalent and report the exact command and output.

## Required Regression Coverage

Add/update tests so they fail before the fix and pass after:

1. `weather-d0-now-morning-0720` resolves to `morning`; old `weather-d0-now-morning-0920` should not be the active configured timer.
2. `weather-d0-now-forenoon-1120` resolves to `forenoon`; `weather-d0-now-afternoon-1620` resolves to `afternoon`.
3. Dynamic sunrise/sunset trigger names do not produce D0 samples or finalize manifests.
4. Repeated invocations cannot produce two valid samples with the same `slotName`.
5. Persisted weather-cache day file time fields use local ISO strings for the location timezone.
6. `/weather/current` and environment/weather consumers still read `latestSample` and do not call live QWeather synchronously.

## Result JSON Contract

When done, output exactly this wrapped JSON in the ZCode chat:

<<<ZCODE_IMPLEMENTER_RESULT:zcode-weather-cache-slots-20260624:START>>>
{
  "status": "completed",
  "changed_files_claimed": [],
  "summary": "",
  "validation_claims": {
    "commands_run": [],
    "commands_failed": []
  },
  "notes_on_weather_http_and_scheduler_sync": "",
  "duplicate_slot_regression_evidence": "",
  "local_time_contract_evidence": "",
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:zcode-weather-cache-slots-20260624:END>>>

If blocked, use `"status": "blocked"` and put exact reasons in `blockers`.

<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-weather-cache-slots-20260624:END>>>
