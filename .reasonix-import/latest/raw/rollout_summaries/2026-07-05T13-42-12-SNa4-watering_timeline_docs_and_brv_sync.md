thread_id: 019f3283-e3b2-78a1-aec3-f49ee78822e4
updated_at: 2026-07-06T15:52:42+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/05/rollout-2026-07-05T21-42-12-019f3283-e3b2-78a1-aec3-f49ee78822e4.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Synced watering-timeline and watering-planner contract wording to reflect that today (D0) is now selectable, and added a BRV note for the same durable fact set.

Rollout context: in `/Users/jay/WebstormProjects/planting`, the user first asked for docs-keeper hygiene after a watering-timeline behavior change, then asked to "把 brv 的也更新掉". The relevant behavior change was that the care-behavior timeline’s selectable upper bound was widened from d-1 to d0 (today is selectable), while the display window stayed separate. The rollout also confirmed the backend planner/diagnosis path now preserves the latest 10 events rather than blindly dropping today when the window is full.

## Task 1: docs-keeper knowledge hygiene for watering timeline / planner wording
Outcome: success

Preference signals:
- the user explicitly asked "按docs-keeper的角色,做下知识卫生工作" -> future similar implementation changes should be mirrored into active docs / rules, not left as code-only changes.
- the user later asked to update BRV too (`"把 brv 的也更新掉"`) -> when a code/contract change is meant to be durable, sync both active docs and BRV memory.

Key steps:
- Located the contract surfaces that mention watering timeline and watering planner semantics: `docs/ACTIVE_CONTRACTS.md`, `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md`, and `docs/new-rules/planting_ai_diagnosis_all_in_one.md`.
- Updated wording so Q0 / watering timeline is described as the “recent 10 days” flow with today as the selectable upper bound, instead of implying a strict past-only window.
- Updated `wateringEvents` contract text in `docs/ACTIVE_CONTRACTS.md` to say the input is the last 10 days, with today allowed in the returned/replayed set.

Failures and how to do differently:
- The first attempt to patch the docs used one expected string that did not match the file verbatim; the fix was to search the exact line first, then patch the precise wording.

Reusable knowledge:
- `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md` is the right place to keep Q0 / `care_behavior_timeline` wording aligned with current runtime behavior.
- `docs/ACTIVE_CONTRACTS.md` is the contract surface for `/user-plants/watering-planner` input wording.
- `docs/new-rules/planting_ai_diagnosis_all_in_one.md` should be kept in sync with current package semantics when the user-facing behavior changes.

References:
- [1] `docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md:76` — Q0 wording updated to “最近 10 天浇水行为（含当日上界）”.
- [2] `docs/ACTIVE_CONTRACTS.md:441` — `wateringEvents` wording updated to “最近 10 天（含当日可回传）”.
- [3] `docs/new-rules/planting_ai_diagnosis_all_in_one.md:160` — Q0 wording updated to include today as the selectable upper bound.

## Task 2: BRV update for selectable-today watering timeline
Outcome: success

Preference signals:
- after the docs-keeper pass, the user explicitly requested "把 brv 的也更新掉" -> maintain BRV memory alongside docs when a change is meant to survive beyond the current session.

Key steps:
- Inspected existing BRV/ad-hoc note naming patterns under `/Users/jay/.codex/memories/extensions/ad_hoc/notes` to match the local convention.
- Wrote a new BRV ad-hoc note capturing the durable fact set: today is selectable in the care-behavior timeline, the display window stays separate from the selectable window, and the backend planner/environment-context paths preserve the latest 10-day window so d0 is not dropped when the window is full.
- Verified the new note file exists in the ad-hoc notes directory.

Reusable knowledge:
- For this repo, BRV should store the durable business fact, not the implementation trace: “today selectable + recent 10-day window preserved + contract wording synced”.
- A concise ad-hoc note in `/Users/jay/.codex/memories/extensions/ad_hoc/notes/` is the current visible BRV-style artifact for this kind of fact.

References:
- [1] new BRV note: `/Users/jay/.codex/memories/extensions/ad_hoc/notes/2026-07-06T00-00-00Z-caring-timeline-selectable-today-brv-note.md`
- [2] note content captures: `DEFAULT_SELECTABLE_START_OFFSET = -10`, `DEFAULT_SELECTABLE_END_OFFSET = 0`, recent-10-day retention, and the `wateringEvents` contract wording.

