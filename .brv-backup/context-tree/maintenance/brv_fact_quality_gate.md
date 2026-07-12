# BRV Fact Quality Condition

Status: active  
Owner: architecture  
Verified: 2026-06-06  
Review after: 90d

## Rules

- id: R-BRV-FACT-SOURCE-001
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 203-244
      symbol: fact validation
  statement: Every `type: fact` must include `status: verified`, `source_kind`, `source.file`, `source.lines`, and a statement that is directly supported by that source.

- id: R-BRV-FACT-KINDS-002
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 35-36
      symbol: FACT_SOURCE_KINDS
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 203-244
      symbol: fact source enforcement
  statement: Valid source kinds for Facts are `code`, `config`, and `package`. Docs-only, ClickUp-only, conversation-only, or previous-BRV-only claims must be `rule`, `decision`, or `observation`.

- id: R-BRV-RUNTIME-AUTHORITY-003
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: .brv/context-tree/_index.md
      lines: 7-13
      symbol: Hard policy
  statement: Runtime behavior facts must be verified against `.js/.vue/.json` project files. `package.json` may verify scripts/dependencies/entry points but not business runtime behavior.

- id: R-BRV-SUPERSEDED-004
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 37-45
      symbol: 召回过滤
    - file: .brv/context-tree/_index.md
      lines: 7-13
      symbol: Hard policy
  statement: A superseded or corrected session memory must name the replacement fact id and must not be injected into implementation context.

- id: R-BRV-DOCS-ROUTING-005
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 73-82
      symbol: 与 docs condition 的关系
  statement: BRV may route to docs and summarize historical intent, but the implementation contract should still use docs as authority for design boundaries and code as authority for runtime facts.

- id: R-BRV-MANIFEST-ACTIVE-CONTEXT-006
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 79-96
      symbol: listManifestContextFiles / listContextFiles
    - file: .codex/skills/dispatch-task/references/brv-recall-condition.md
      lines: 26-35
      symbol: 读取范围
  statement: Default BRV validation and recall should be manifest-scoped. Session context files outside `_manifest.json.active_context` are not default recall sources.

- id: R-BRV-LIFECYCLE-VALIDATOR-007
  type: rule
  status: verified
  confidence: high
  source_kind: policy
  source:
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 13-36
      symbol: allowed statuses / owners / fact source kinds
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 127-192
      symbol: lifecycle required fields
    - file: scripts/validate-brv-context-lifecycle.mjs
      lines: 280-302
      symbol: validation main
  statement: The BRV lifecycle validator enforces controlled statuses/owners, required verified/review_after/owner/status metadata, valid review windows, and manifest-scoped validation by default.
