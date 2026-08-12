# Canonical ByteRover governance rule block for planting

Date: 2026-07-12

Use this block as the single reusable governance entry in `MEMORY.md`. Place
it in the existing `planting ByteRover V4 boundary retirement and light-health
contract realignment` group, before implementation-specific light-health
facts. It replaces scattered current-governance wording, but does not erase
dated rollout evidence.

```text
# Canonical Rule: planting ByteRover V4 governance and V3 historical evidence

scope: current ByteRover governance, space binding, and interpretation of old
V3 lifecycle references in the planting checkout.
reuse_rule: safe for current governance only after verifying current repository
facts; V3 commands and `.brv/context-tree` lifecycle details are historical
evidence, never an active operating instruction.

## Active contract

- The active repository governance command is `npm run check:brv-v4-boundary`.
- Its scope is limited to read-only detection of retired V3 validator
  references in active README, docs, package, CI, and scripts. It is not a
  ByteRover topic-content, retrieval, or source-verification validator.
- Resolve the active ByteRover space from `.brvspace` using the currently
  installed ByteRover skill. Do not assume a project-local helper-script path
  exists without checking it.
- For current implementation facts, source code, tests, schema, configuration,
  package scripts, and active docs remain authoritative over recalled memory.

## Historical V3 evidence template

When a rollout must retain an old command for auditability, write it as:
`Historical V3 evidence (pre-2026-07-10): <command> -> <dated result>.`

Allowed historical aliases:
- `scripts/validate-brv-context-lifecycle.mjs`
- `node scripts/validate-brv-context-lifecycle.mjs`
- `npm run check:brv-context-lifecycle`
- legacy `.brv/context-tree/**` lifecycle workflow

## Do not infer

- Do not present a V3 command as current validation.
- Do not use `check:brv-v4-boundary` to prove a ByteRover topic was updated,
  retrieved, or source-verified correctly.
- Do not convert a historical rollout command into a reusable QA, docs_keeper,
  runtime, or implementation instruction.
- Do not record dispatch rules, validator mechanics, or other workflow policy
  as ByteRover project knowledge; preserve them only in the repository rules
  and skills that define them.

### keywords

ByteRover V4, BRV V4, .brvspace, check:brv-v4-boundary,
scripts/check-brv-v4-boundary.mjs, V3 historical evidence,
validate-brv-context-lifecycle, check:brv-context-lifecycle,
.brv/context-tree, governance boundary, source of truth
```

Consolidation instructions:

1. Keep old rollout facts in their original task groups, but replace ad-hoc
   parenthetical labels such as `(V3 context)`, `(legacy V3 term)`, and
   `(historical V3 reference)` with the historical-evidence template above.
2. Remove only duplicate *current* governance guidance once this canonical
   block exists. Do not delete dated command/output evidence from rollout
   records.
3. The current `MEMORY.md` statement that says `brv search` plus
   `npm run check:brv-v4-boundary` confirms legacy `.brv` content must be
   reconciled using the prior correction note; it is outside this template's
   permitted inference.

Evidence:

- `package.json` exposes `check:brv-v4-boundary` as the current command.
- The 2026-07-10 V4 transition record defines its scope as active-reference
  scanning rather than topic-content validation.
