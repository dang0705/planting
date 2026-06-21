# QA Evidence Template

```text
QA Result:
- status: pass / fail / blocked / partial
- summary:
- coverage:
  - required:
  - passed:
  - failed:
  - blocked:
  - not_verified:
- checks:
  - implementer_unit_evidence_ref:
  - e2e:
  - mini_program_runtime:
  - ui_figma:
  - runtime_api_flow:
  - manual_if_needed:
- evidence:
  - commands:
  - screenshots:
  - logs:
  - tool_refs:
- checklist_evidence:
  - checklist_ref / acceptance_ref:
  - result:
  - evidence_ref:
  - can_writeback:
- failures:
  - blocking:
  - non_blocking:
  - attribution:
- gaps:
  - test_gap:
  - doc_gap:
  - dirty_workspace_impact:
- completion:
  - blocks_completion: yes / no
  - reason:
- test_ownership:
  - unit_tests_run_by_qa: no
  - upstream_unit_evidence_missing: yes / no
  - contract_blocker: test_ownership_violation / none
- next_action:
```

## qa-evidence-policy-01

Source: `references/qa-evidence-policy.md`  
Context: 定位

```text
../assets/templates/qa-evidence.md
```

## qa-evidence-policy-02

Source: `references/qa-evidence-policy.md`  
Context: Mini Program Automator

```text
/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
```

## qa-evidence-policy-03

Source: `references/qa-evidence-policy.md`  
Context: 登录态 / 授权态保护补充

```text
成功跑通 npm run dev:mp-weixin:local-functions:lan
校验 Test Contract projectPath 为 /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
检查或复用 9420 automator 会话，确认原始 WebSocket 可握手
miniprogram-automator currentPage / page_stack / page_data / evaluate(wx.request)
真实交互 / 运行时接口断言
```
