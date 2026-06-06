---
doc_id: ticket-86exv6fnx-diagnose-question-package
status: current
doc_type: requirement-pointer
owner: docs-keeper
sync_policy: active-for-diagnose-question-package
last_verified_date: 2026-06-06
last_verified_commit: unknown-from-upload
source_of_truth:
  - user update on 2026-06-06
  - ClickUp task 90182453517/86exv6fnx
stale_if_changed:
  - cloudfunctions/diagnose-http/app/question-package-response.js
  - cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js
  - cloudfunctions/diagnose-http/app/http-router.js
  - cloudfunctions/diagnose-http/app/frontend-response.js
  - src/pages/diagnose/follow-up/**
  - src/http-functions/diagnose/client.js
  - src/utils/diagnose-follow-up-payload.js
  - src/utils/diagnose-result-normalizer.js
---

# Ticket 86exv6fnx: Diagnose Question Package

本文是一个极简需求指针，不是完整产品文档。它只用于阻止旧“追问/每轮 1 题”口径继续污染 AI 上下文。

## Current product direction

- 当前不存在“追问”。
- 当前口径不再是“每轮最多 1 题”。
- 问诊题包是当前任务口径。
- 旧代码路径、函数名或 UI 文件名中的 `follow-up` / `question start` / `answer` 只能视为兼容命名或实现路径，不能反推当前产品口径仍是追问。
- 任何旧文档或 BRV 事实声称“常规 route 追问每轮 1 题”，均应标记为 `superseded`。

## AI usage rule

Only read this file when the task touches:

```text
diagnose-question-package
questionPackage
questions
诊断题包
追问/每轮 1 题旧口径清理
src/pages/diagnose/follow-up/**
cloudfunctions/diagnose-http/app/question-package-response.js
```

Do not load archived route-planning docs to answer this topic unless the task explicitly asks for historical comparison.

## Contract impact

- Active docs should describe the current interaction as question-package driven.
- `maxQuestionsPerRound: 1`, if still present in code/config/history, is not a UX/product contract.
- Frontend can retain legacy names while presenting package-first behavior.
- Backend implementation must not assume first-question-only ownership/queue/persistence semantics without source verification.

## Verification status

The ClickUp task body was not embedded in the uploaded files. This brief is based on the user-provided update and should be replaced with source-verified ticket details if an authenticated ClickUp export is added later.
