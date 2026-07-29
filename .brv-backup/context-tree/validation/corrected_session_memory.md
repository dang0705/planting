# Downgraded / Corrected Session Memory

Status: active  
Owner: architecture  
Verified: 2026-06-06  
Review after: 90d

## Superseded session facts

- id: L-FRONTEND-NOT-FOUND
  type: observation
  old_type: fact
  new_type: observation
  status: superseded
  confidence: high
  superseded_by:
    - F-FRONTEND-PRESENCE-001
  reason: Source package contains `src/main.js`, `src/pages.json`, `src/manifest.json`, and frontend page/module code. The earlier claim “No frontend source code found” was an archive-scope observation, not a project fact.

- id: L-DIAG-MAX-TWO-ROUNDS
  type: observation
  old_type: fact
  new_type: observation
  status: superseded
  confidence: high
  superseded_by:
    - F-DIAG-QUESTION-BUDGET-004
    - F-DIAG-FOLLOWUP-CONDITION-005
  reason: Current source has `maxQuestionsPerRound: 1`, `maxRounds: 4`, `maxFollowUpRounds: 0`, and `canOpenNextFollowUpRound()` returning `true`; “maximum two rounds globally” is not source-verified.

- id: L-STORAGE-DONT-TRUST-SUFFIX
  type: observation
  old_type: fact
  new_type: corrected_fact
  status: superseded
  confidence: high
  superseded_by:
    - F-BACKEND-STORAGE-SUFFIX-006
  reason: Current code validates supplied suffix against an allowlist and infers suffix from MIME when needed. The safer fact is validation/allowlist, not “never trust frontend suffix”.

- id: L-WEATHER-FORECAST-7D
  type: observation
  old_type: fact
  new_type: observation
  status: superseded
  confidence: high
  superseded_by:
    - F-WEATHER-WINDOW-005
  reason: Current source uses 10 historical days from D-10 and 15 forecast days from D0.

- id: L-TEST-CI-VITEST
  type: observation
  old_type: fact
  new_type: observation
  status: superseded
  confidence: high
  superseded_by:
    - F-PACKAGE-ROOT-TEST-SCRIPTS-003
    - F-PACKAGE-ROOT-QUALITY-SCRIPTS-004
    - F-SCRIPTS-BRV-LIFECYCLE-009
  reason: Root `package.json` and root `scripts/` are now available in the current review context. Previous `needs_source` testing claims have been replaced by source-verified package/script facts.

## Downgraded to rules or observations

- id: L-DOCS-ROADMAP-FACTS
  type: observation
  old_type: fact
  new_type: observation
  status: observation
  confidence: high
  reason: Documentation gaps, roadmap, sprint review, and maintenance routines are not runtime facts. They belong in rules, decisions, or observations with docs/ClickUp provenance.

- id: L-PLANT-RECOGNITION-HOST-CONTEXT
  type: decision
  old_type: fact
  new_type: decision
  status: candidate
  confidence: medium
  reason: “Plant recognition should be used for host context rather than direct disease diagnosis” is a product/architecture decision unless directly enforced by source. Keep it out of Facts until a code-enforced boundary is identified.

- id: L-READING-SEQUENCE
  type: rule
  old_type: fact
  new_type: rule
  status: verified
  confidence: high
  reason: Reading sequence and doc update mappings are workflow rules, not code facts.
