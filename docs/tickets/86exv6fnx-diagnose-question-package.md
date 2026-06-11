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
  - cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js
  - cloudfunctions/diagnose-http/services/session-follow-up-service.js
  - src/pages/diagnose/follow-up/**
  - src/http-functions/diagnose/client.js
  - src/utils/diagnose-follow-up-payload.js
  - src/utils/diagnose-result-normalizer.js
---

# Ticket 86exv6fnx: Diagnose Question Package

本文是一个极简需求指针，不是完整产品文档。它只用于阻止既有“追问/每轮 1 题”口径继续污染 AI 上下文。

## Current product direction

- 当前不存在“追问”。
- 当前口径不再是“每轮最多 1 题”。
- 问诊题包是当前任务口径。
- 固定题包答案提交完成后必须进入 final/result 路径，不得再返回下一题或追问。
- 既有代码路径、函数名或 UI 文件名中的 `follow-up` / `question start` / `answer` 只能视为适配命名或实现路径，不能反推当前产品口径仍是追问。
- 任何既有文档或 BRV 事实声称“常规 route 追问每轮 1 题”，均应标记为 `superseded`。

## AI usage rule

Only read this file when the task touches:

```text
diagnose-question-package
questionPackage
questions
诊断题包
追问/每轮 1 题既有口径清理
src/pages/diagnose/follow-up/**
cloudfunctions/diagnose-http/app/question-package-response.js
```

Do not load archived route-planning docs to answer this topic unless the task explicitly asks for historical comparison.

## Contract impact

- Active docs should describe the current interaction as question-package driven.
- `maxQuestionsPerRound: 1`, if still present in code/config/history, is not a UX/product contract.
- Frontend can retain session names while presenting package-first behavior, and answer payloads should preserve `questionPackage` / `uiHints` package metadata for backend terminal-state detection.
- Backend implementation must treat complete fixed-package `answer_submit` as terminal questioning state and suppress any next-question/follow-up planning.
- Backend implementation must persist and validate valid `yellow_leaf` package answers as a package in the same current round; session `questionPackageSnapshot` remains an internal suitabilityibility/selection artifact and must not reject package sibling questions. Non-package paths keep the old pendingList-anchor single-question behavior.

## Verification status

The ClickUp task body was not embedded in the uploaded files. This brief is based on the user-provided update and should be replaced with source-verified ticket details if an authenticated ClickUp export is added later.
