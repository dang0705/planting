# ClickUp Checklist / Acceptance Writeback Template

```text
Acceptance Checklist Matrix:
- source_ticket_id:
- source_type: markdown_checklist / acceptance_criteria / request_changes / comment / subtask / relationship / native_checklist_unavailable
- checklist_ref:
- acceptance_ref:
- checklist_order_no:
- line_number:
- original_line:
- original_text:
- checklist_text:
- acceptance_text:
- current_checked:
- required: true / false
- mapped_test_case_id:
- verification_type: unit / smoke / e2e / UI / Figma / API / DB / runtime / manual
- owner: implementer / QA / main agent / docs
- status: pending / covered / blocked / not_applicable
- evidence_required:
- writeback_strategy: markdown_description_update / acceptance_comment / blocker
- writeback_status: not_started / checked / commented / failed / skipped
```

```text
ClickUp Markdown Checklist Writeback:
- source_ticket_id:
- markdown_description_updated: yes / no
- checked_items:
  - checklist_ref:
  - checklist_order_no:
  - original_line:
  - updated_line:
  - verification_evidence:
  - writeback_method: ClickUp MCP markdown_description update
  - verify_after_update: success / failed
- unchecked_items:
  - checklist_ref:
  - checklist_order_no:
  - original_line:
  - reason:
- skipped_items:
- writeback_blockers:
- forbidden_substitution_used: false
```

```text
Acceptance Verification Comment:
- source_ticket_id:
- source_type:
- native_checklist_mcp_unavailable: true / false
- verified_items:
- failed_items:
- blocked_items:
- not_verified_items:
- evidence_refs:
- comment_writeback_status: success / failed / skipped
```
