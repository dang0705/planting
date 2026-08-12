thread_id: 019f45c5-dd61-7890-ba8c-b5adff86290c
updated_at: 2026-07-09T07:40:53+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/09/rollout-2026-07-09T15-27-03-019f45c5-dd61-7890-ba8c-b5adff86290c.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Unified the independent watering-advice flow to reuse the same pot-profile canvas editor as the bound-plant watering flow.

Rollout context: The user asked (in Chinese) that the independent watering-entry pot-profile input control should be unified with the canvas control used by the original bound-plant watering recommendation flow. The work happened in `/Users/jay/WebstormProjects/planting`. The repo already had a substantial dirty baseline, so the change had to be layered on top without overwriting existing work.

## Task 1: Reuse the shared pot-profile canvas editor in the independent watering-advisor flow
Outcome: success

Preference signals:
- The user said: `独立浇水的盆型输入控件未采取与原绑定用户植物浇水建议流程中相同的 canvas 控件，这点需要统一。` -> in similar UI consistency cases, the user wants the independent/ad-hoc path to match the existing bound-plant control rather than introduce a parallel input design.
- The user’s wording specifically singled out the `canvas 控件` -> the reusable default should be to look for and reuse the existing canvas-based editor component, not recreate equivalent inputs in a new page.

Key steps:
- Confirmed via BRV search and source reading that the bound-plant path already uses `PotProfileEditor.vue`, which itself embeds `PotCanvas.vue`.
- Confirmed `src/pages/watering-advisor/watering-advisor.vue` had a hand-written step-2 form for top diameter / bottom diameter / height / drainage hole / substrate.
- Replaced that step with a `PotProfileEditor` instance in `plant: null` mode, so the independent flow opens the same bottom-sheet/canvas editor and only consumes its emitted payload.
- Kept independent advice storage detached: the editor emits saved data without writing to the bound-plant persistence path when `plantId` is absent.
- Updated the BRV contract for the independent watering-advice entry so the durable fact now states that the independent flow must also reuse `PotProfileEditor`/`PotCanvas` and must not add a parallel form.

Failures and how to do differently:
- The first attempt exposed that the independent page had duplicated substrate-ratio math and hard-coded step constants; those were simplified by reusing the editor’s returned `substrateComposition` and introducing step constants.
- The workspace was already dirty, so the safe approach was to modify only the existing untracked/related files and avoid broad cleanup of unrelated baseline changes.

Reusable knowledge:
- `src/pages/index/components/PotProfileEditor.vue` is the shared pot-profile editor for both bound and independent watering flows; it already contains the canvas-based pot visualization and can operate without a `plantId`.
- `src/components/PotCanvas.vue` is the underlying canvas control; if a future UI asks for the same pot editor look/feel, reuse this stack rather than building a second form.
- The independent watering-advice page is `src/pages/watering-advisor/watering-advisor.vue`; its pot-profile step can open `PotProfileEditor` via component ref and `callComponentMethod`.
- `PotProfileEditor`’s no-plant behavior is useful for ad-hoc flows: it emits a payload and does not hit the bound-plant save path.
- The BRV contract file for this flow is `.brv/context-tree/architecture/watering_planner/watering_advisor_entry_contract.md`, which now records the reuse rule.

References:
- [1] `src/pages/watering-advisor/watering-advisor.vue`: replaced manual pot inputs with a `PotProfileEditor` callout (`watering-advisor-edit-pot-profile`) and handled `saved` / `summary` payloads.
- [2] `src/pages/index/components/PotProfileEditor.vue`: shared bottom-sheet editor containing `PotCanvas` and no-plant emit-only save path.
- [3] `src/components/PotCanvas.vue`: shared canvas-based pot visualization.
- [4] `.brv/context-tree/architecture/watering_planner/watering_advisor_entry_contract.md`: added the rule that the independent flow must reuse `PotProfileEditor`/`PotCanvas` and must not add a parallel form.
- [5] Validation evidence: `npm run lint -- src/pages/watering-advisor/watering-advisor.vue` -> 0 warnings / 0 errors; `npm run build:mp-weixin:ci` -> `DONE Build complete`; `npm run check:brv-context-lifecycle` -> `PASSED (20 files, 31 entries, 20 facts)`.
