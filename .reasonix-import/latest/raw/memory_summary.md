v1

## User Profile

The user primarily develops `/Users/jay/WebstormProjects/planting`, a UniApp/Vue WeChat mini-program with CloudBase functions, diagnosis/weather/watering flows, DevTools automation, dispatch governance, and mobile Figma work. They value live source/runtime/contract truth, clear scope boundaries, concrete evidence, and candid partial or blocked status. They often ask concise Chinese technical comparisons and prefer the recommendation before detail.

## User preferences

- Before a new feature or redesign, “先仔细分析并比对两者是否有 gap” and “先不改代码”: compare design, prior product logic, live code, and data contract before implementation.
- Give concrete file/runtime/validator evidence; distinguish implementation delivery, runtime validation, and Completion Gate—never present partial evidence as fully complete.
- For reusable UI, follow “更通用的card”: keep containers business-agnostic, use slots/configuration for content, and let content determine height rather than hard-coding it.
- For visual changes, inspect the exact Figma node and both selected/unselected states before editing.
- Keep `$dispatch-task` ownership with main; implementers execute their handoff only and must not recursively dispatch, create an episode/handoff, or spawn agents.
- For recurring Automator QA, provide an “绝对安全的测试环境”: isolate state, use leases and deadlines, classify terminal failures, and avoid repeated manual retries.
- Preserve scoped product boundaries: standalone air exchange excludes local airflow/fan/AC/outlet fields and must not be folded into yellow-leaf diagnosis without explicit approval.
- For data defects such as literal `"null"` cards, prefer read-layer filtering; do not delete, update, migrate, or fabricate records unless authorized.

## General Tips

- Formal mini-program QA is catalog-backed `qa-run`: validate target `projectpath`, DevTools PID/control port, 9420/WS, page data, PNGs, and runtime `wx.request`. A reachable port or HTTP 200 does not prove project identity.
- Pass `projectpath` directly to `URLSearchParams`; pre-encoding yields `%252F` and can open the wrong DevTools project despite HTTP 200.
- Keep the current LAN chain intact when possible: `dev:mp-weixin:local-functions:lan -> dist/dev/mp-weixin -> 3010 -> tcb-ff -w -> cloud1_dev`; restart it to reload backend changes before trusting runtime output.
- For formal ZCode delivery, use the visible clipboard contract: validate, read back/hash, focus the current input, verify exact paste, send, and record current-chat state. No headless fallback or direct injection.
- `npm run check:brv-v4-boundary` only scans active references to retired V3 validation; it is not a ByteRover topic-content or source-verification check. [ad-hoc note]

## What's in Memory

### /Users/jay/WebstormProjects/planting

#### 2026-08-02

- Air-exchange generic SelectableCard and Figma state: `SelectableCard.vue`, `AirExchangeAssessment.vue`, `450:1537`, `h-[108px]`, `bg-[#e8f5e9]`, `Unknown word var`
  - desc: Search first for standalone air-exchange UI, generic option-card extraction, or a build result after its focused contract tests pass.
  - learnings: `SelectableCard` owns only state/interaction/slot; Figma requires white unselected and green selected cards; full build is still blocked by CSS/Tailwind `Unknown word var`.

#### 2026-07-30

- ZCode visible clipboard delivery and Completion Gate: `zcode-clipboard-bridge.mjs`, `clipboard_paste`, `NSPasteboard`, `current_open_chat`, `validate-zcode-send-receipt.mjs`, `AGENTS.md`
  - desc: Auditable external-implementer send receipts and main-versus-implementer ownership.
  - learnings: Real visible delivery passed, but Completion Gate remained separate and was blocked by concurrent `AGENTS.md` overlap.

#### 2026-07-28

- Figma mobile ventilation assessment redesign: `青花植`, `393px`, `422:989`, `Supericons`, `airExchange`
  - desc: Mobile air-environment UI and screenshot-based readability review in the Figma workspace.
  - learnings: Preserve 393×852 framing, plain-language scenarios, coherent icons, and a real visual review.

### Older Memory Topics

#### /Users/jay/WebstormProjects/planting

- Automator runtime hardening and shared local data: `miniprogram-automator`, `projectpath`, `runtime lease`, `qa-run`, `cloud1_dev`
  - desc: Formal DevTools/9420 identity, bounded screenshots, catalog QA, and isolated DevTools state while retaining current LAN data.
- Diagnosis routing and local `user-plants` repair: `mode_candidates`, `visimg1`, `direct_result`, `VITE_DEV_OPENID`, `literal-null`, `listUserPlantInstances`
  - desc: Trace a visual candidate to UI outcome or filter invalid user-plant records without mutating CloudBase data.
- Specific-pest visual diagnosis and cache-first prompts: `INSECT-BODY-FIRST`, `visibleOutcomes`, `retake-authorization`, `cache_control: ephemeral`
  - desc: Pest routing, direct single-candidate outcomes, prompt cache, and formal acceptance boundaries.
- D0 weather day-file state machine: `days/{date}.json`, `latestSample`, `dailyRollup`, `weatherEvidenceInsufficient`, `weather-d0-now-finalize-2130`
  - desc: Current observed-now archival lifecycle and evidence-first `/weather/current` fallback. [ad-hoc note]
- Dispatch, ByteRover, and runtime governance: `dispatch-gate`, `check:brv-v4-boundary`, `.brvspace`, `miniprogram-automator`, `Completion Gate`
  - desc: Main-owned dispatch/QA closure, active ByteRover boundary, and end-side runtime evidence. [ad-hoc note]

#### /Users/jay/Documents/Codex/2026-07-27/figma-plugin-figma-openai-curated-remote

- Figma mobile ventilation assessment redesign: `青花植`, `393px`, `422:989`, `Supericons`, `airExchange`
  - desc: Design-specific companion to the planting product topic; re-open the live file before editing.

#### Other workspaces

- Hy3 and Qwen3.5 multimodality: `HYV3ForCausalLM`, `qwen3.5-plus`, `qwen3.5-flash`, `256 images`
  - desc: Image-understanding model selection and Plus-vs-Flash tradeoffs; cwd=/Users/jay/Documents/Codex/2026-07-21/hy.
- Codex subagent Fast mode: `service_tier`, `fast_mode`, `/fast status`, `codex --strict-config`
  - desc: Per-subagent Fast-mode configuration and unvalidated custom-agent inheritance; cwd=/Users/jay/.codex/.chatgpt-projects/g-p-69fbfea390648191b73ba48881ae9e60.
