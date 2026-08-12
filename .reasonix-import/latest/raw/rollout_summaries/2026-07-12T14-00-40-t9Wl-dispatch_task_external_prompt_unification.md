thread_id: 019f56a1-4fc3-77f0-8fce-eb29ac287f8d
updated_at: 2026-07-13T00:01:07+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/12/rollout-2026-07-12T22-00-40-019f56a1-4fc3-77f0-8fce-eb29ac287f8d.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Unified external-implementer prompt schema was closed and the examples were migrated to the new contract format.

Rollout context: The user started by reviewing and tightening the dispatch-task / external-implementer handoff rules. The original issue was that ZCode and Trae had drifted into separate prompt-generation shapes; the user explicitly pushed for the prompt-generation line to be unified across all external implementers, not just equivalent at the transport/adapter layer. Later, the user noticed there were two `zcode-prompt-template.md` files and wanted only one canonical template path kept. Finally, the user wanted the old `zcode_external` examples migrated to the unified `external_implementer` contract, and was annoyed when the assistant kept talking instead of acting.

## Task 1: Review and close the prompt-schema-unification gap

Outcome: success

Preference signals:
- The user said the prompt-generation line should be the same for ZCode, Trae, and all external implementers: “这点两者必须相同,甚至是所有的external implementer都必须一样,这是硬规定” -> future work should treat prompt schema as globally shared unless the user explicitly allows provider-specific divergence.
- The user asked to “review下刚才的 prompt 结构统一的收口是否有隐患或问题” and then said “你来闭环” -> when the user asks for a review, they want the agent to identify holes, not defend the current design.
- The user objected to the assistant’s hesitation with “开始啊,为什么总说不做?” -> when the user says to start, they want immediate execution rather than more narration.

Key steps:
- Compared `external-implementer-routing.md`, `zcode-routing.md`, `handoff-and-spawn-gates.md`, the templates, and the validators.
- Identified that the original “unified prompt” claim was only documentary: `validate-zcode-prompt.mjs` and `validate-zcode-send-receipt.mjs` still hard-coded `zcode_external`, and there was no generic external prompt validator.
- Added a shared template and a shared validator, and updated the ZCode-specific validator/send-receipt validator to accept `external_implementer` + `external_contract.provider=zcode`.
- Kept provider-specific differences in adapter behavior rather than prompt structure.

Failures and how to do differently:
- The first pass only changed prose and left the actual validator/template path split; that would have caused immediate runtime mismatch.
- The assistant initially talked too much after the user asked to continue; in similar cases, act first and narrate after the validation passes.
- The rollout showed that “documentation-only unification” is insufficient when an existing validator still enforces the old mode string.

Reusable knowledge:
- `validate-zcode-prompt.mjs` originally required `implementation_mode=zcode_external`; that had to be widened to accept `external_implementer` for the new contract.
- The new shared contract is anchored by `assets/templates/external-implementer-prompt-template.md` and `scripts/validate-external-prompt.mjs`.
- The new sentinel pair is `<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START|END>>>` and `<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:START|END>>>`.
- For unified external prompts, sections are now treated as mandatory structure, not provider-specific optional prose.

References:
- [1] `external-implementer-routing.md`: declared the shared schema and section order; added the rule that provider differences cannot change prompt section set, order, or sentinel.
- [2] `assets/templates/external-implementer-prompt-template.md`: new canonical prompt template.
- [3] `scripts/validate-external-prompt.mjs`: new shared validator; it requires the unified sentinels and the full section set.
- [4] `scripts/validate-zcode-prompt.mjs` and `scripts/validate-zcode-send-receipt.mjs`: updated to accept `external_implementer` while still recognizing provider `zcode`.

## Task 2: Deduplicate the zcode prompt template path

Outcome: success

Preference signals:
- The user said “.codex/skills/dispatch-task/assets/templates/zcode-prompt-template.md 这个模板有2个,我理解应该只保留其中一份即可” -> future maintenance should treat duplicate identical templates as a bug and collapse them to a single authoritative path.
- The user’s follow-up “好的” was about the assistant’s offer to proceed; later the user clarified they meant the offer itself and then said “开始啊” -> do not assume silence means not to act; when the user confirms, proceed.

Key steps:
- Verified that `assets/templates/zcode-prompt-template.md` and `assets/zcode-prompt-template.md` were byte-for-byte identical.
- Deleted the unreferenced duplicate file, keeping the single authoritative template in `assets/templates/zcode-prompt-template.md`.
- Updated the references so the remaining path became the canonical one.

Failures and how to do differently:
- There was a brief mismatch between the user’s “好” and what they were approving; the assistant should have checked whether they meant “go ahead” vs “good” on the prior sentence. In future, explicitly tie confirmations to the exact preceding claim.

Reusable knowledge:
- `cmp -s` showed the two template files were identical before deletion.
- The active references now point to `assets/templates/zcode-prompt-template.md`; the duplicate `assets/zcode-prompt-template.md` was removed.

References:
- [1] `cmp -s .codex/skills/dispatch-task/assets/templates/zcode-prompt-template.md .codex/skills/dispatch-task/assets/zcode-prompt-template.md` returned `0` before deletion, confirming duplication.
- [2] Deleted file: `.codex/skills/dispatch-task/assets/zcode-prompt-template.md`.
- [3] Remaining canonical file: `.codex/skills/dispatch-task/assets/templates/zcode-prompt-template.md`.

## Task 3: Migrate examples from old zcode_external contract to unified external_implementer contract

Outcome: success

Preference signals:
- The user explicitly corrected the assistant’s phrasing and then said “开始啊,为什么总说不做?” -> when the user asks to start, they want immediate implementation and don’t want repeated preambles.
- The user wanted the examples updated, not just the validators and docs: “我下一步可以顺手把 examples 里的旧 zcode_external 合同也迁成统一的新写法。我说的好的是针对你这句话” -> examples should be kept aligned with the current contract, not left as legacy snippets.

Key steps:
- Found the example files still using old `zcode_external` fields:
  - `examples/zcode-external-ui-handoff.json`
  - `examples/simple-zcode-trigger.md`
  - `examples/zcode-external-result.json`
- Migrated the example handoff JSON to `implementation_mode=external_implementer`, `dispatch_tier=external_implementer`, `target_role=external_implementer`, and `external_contract.provider=zcode`.
- Updated the simple trigger example text to emit the unified field names.
- Updated the example result metadata to use `external_implementer` naming.
- Ran the validation chain successfully:
  - `validate-handoff.mjs`
  - `validate-external-prompt.mjs`
  - `validate-zcode-prompt.mjs`
  - `validate-zcode-send-receipt.mjs`
  - `validate-result.mjs external`

Failures and how to do differently:
- The assistant initially over-explained instead of doing the edit; this was corrected once the user explicitly pressed “开始啊”.
- There was a transient risk of leaving examples half-migrated; the fix was to run the validators after the edits and then inspect any lingering old-mode references.

Reusable knowledge:
- Example contract migration needs to include both the mode and the provider-specific contract object.
- The external result validator already recognizes `role=external` and can validate the migrated example result path.
- The example handoff/result files are a useful smoke test for whether the docs + validators + template are actually coherent.

References:
- [1] `examples/zcode-external-ui-handoff.json` now uses `implementation_mode: external_implementer`, `dispatch_tier: external_implementer`, `target_role: external_implementer`, and `external_contract.provider: zcode`.
- [2] `examples/simple-zcode-trigger.md` now maps old zcode trigger output to the unified external contract fields.
- [3] `examples/zcode-external-result.json` now uses `acquired_by: external_implementer`.
- [4] Validation outputs all passed, including `validate-result.mjs external`.

## Task 4: Remove the second template file and keep a single canonical prompt template

Outcome: success

Preference signals:
- The user pointed directly at the duplicate file path and said only one should remain -> they want canonical-path cleanliness, not alias clutter.

Key steps:
- Confirmed the two template files were identical.
- Deleted the duplicate `assets/zcode-prompt-template.md` file and kept the canonical `assets/templates/zcode-prompt-template.md`.
- Verified that the repository references already pointed at the canonical `assets/templates/...` path.

Failures and how to do differently:
- The assistant initially described the result before deleting the duplicate; the user’s correction showed they wanted action, not a status report.

Reusable knowledge:
- When there are duplicate template files with identical contents, keep one canonical file and update references rather than preserving both as aliases.
- The `assets/templates/` path is the canonical prompt-template location.

References:
- [1] Deleted: `.codex/skills/dispatch-task/assets/zcode-prompt-template.md`
- [2] Kept: `.codex/skills/dispatch-task/assets/templates/zcode-prompt-template.md`
- [3] The repo-wide `rg` after cleanup showed only the canonical path remained referenced, plus the deleted file’s historical mentions in this rollout.
