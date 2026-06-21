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
- verification_owner_rule: unit => implementer only; e2e / UI / Figma / runtime / mini_program => QA
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

## checklist-writeback-policy-01

Source: `references/checklist-writeback-policy.md`  
Context: 定位

```text
../assets/templates/clickup-writeback.md
```

## checklist-writeback-policy-02

Source: `references/checklist-writeback-policy.md`  
Context: Markdown checklist 回写

```markdown
- [x] 用户在 `D-10 ~ D-1` 中选择多天浇水后，前端能生成正确的最近 10 天浇水行为数据。
```

## checklist-writeback-policy-03

Source: `references/checklist-writeback-policy.md`  
Context: Markdown checklist 顺序号

```text
checklist_ref = md-checklist:<source_ticket_id>:NO<checklist_order_no>
```

## checklist-writeback-policy-04

Source: `references/checklist-writeback-policy.md`  
Context: 验收标准 fallback

```text
Acceptance Checklist Matrix
Test Case Base
Test Contract
```

## checklist-writeback-policy-05

Source: `references/checklist-writeback-policy.md`  
Context: 验收标准 fallback

```text
Acceptance Verification Comment
```
