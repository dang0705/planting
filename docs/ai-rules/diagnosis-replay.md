# CloudBase Replay and Zero-Model Diagnose Rules / CloudBase 回放与零模型诊断规则

## CloudBase Replay / Zero-Model Diagnose Scripts

- Do NOT describe local replay failure as "shell 缺 CloudBase secret" unless you have already verified the project wrapper path is being used.
- For `diagnose-http` zero-model replay, DB-backed replay, or other local scripts that need CloudBase credentials plus SQL schema alignment, do NOT run scripts bare.
- Always use the project wrapper or the npm alias:
  - `npm run replay:diagnosis-sessions -- --session-ids=<diag_id> ...`
  - `npm run run:with-cloudbase-env -- --function=diagnose-http -- node <script> ...`
- The canonical wrapper is `scripts/terminal-e2e/run-with-cloudbase-env.mjs`.
- That wrapper is responsible for injecting:
  - `CLOUDBASE_ENV_ID / TCB_ENV / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY`
  - `TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY`
  - `APP_ENV / SCHEMA_ENV / SQL_DATABASE_*`
- Default local replay target must stay aligned to `development -> cloud1_dev`.
- When debugging a historical diagnosis decision point, default replay semantics are not enough:
  - default replay means "replay next action from current session state"
  - if you need to inspect "why that round made that decision", explicitly pass `--replay-round` and `--replay-stage`
- When replaying from `--session-id-file` for visual-diagnosis analysis, do not trust the filename. If the task requires formal visual evidence, the source file itself must carry verified `visualFinalEvidence`, and the replay command must pass `--require-visual-final-evidence=true`; otherwise the script should refuse to run.
- Every diagnosis replay batch must emit a canonical batch artifact under `scripts/terminal-e2e/batch/` and a paired conclusion artifact under `scripts/terminal-e2e/conclusion/`.
  - File naming uses local completion time `YYYYMMDD-HHmmss` as the base name.
  - The conclusion file uses the same base name plus `-conclusion`.
  - One canonical batch file may contain at most `100` results. If a replay/materialize run exceeds `100`, it must split into multiple files using the same base name plus `-part01`, `-part02`, etc., and each part must have its own paired conclusion file.
  - Canonical batch results must stay trimmed to the replay audit core fields:
    - `sessionId` for traceability
    - `visualFinalEvidence`
    - `symptomClassReplay`
    - `round1`
    - `round2`
    - `outcome`
    - `calculationProcess`
  - Do not put `openid`, `visualEvidenceMeta`, `symptomClass`, `symptomClassSource`, or other low-value bulk fields into the canonical batch artifact unless the user explicitly asks for them.
