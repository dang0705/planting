---
title: Source Verified Frontend Facts
summary: 前端诊断问诊按 mode question package 展示、推进和提交。
updatedAt: '2026-06-07'
---

## Facts

- id: frontend_question_package_contract
  type: fact
  source_kind: code
  statement: 前端接入当前问诊时，以 questionPackage 为主契约；历史字段名仅用于历史实现，不定义新契约。
  source:
    file: docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
    lines: 5-39
  confidence: high
  status: verified

- id: frontend_local_package_flow
  type: fact
  source_kind: code
  statement: 前端用 questions/currentIndex/answers/isPackageComplete 管理题包流程，本地上一题/下一题/修改答案，并一次性提交 package answers。
  source:
    file: docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
    lines: 41-64
  confidence: high
  status: verified

- id: frontend_no_local_result_inference
  type: fact
  source_kind: code
  statement: 前端不得根据题数完成或缺少下一题锚点自行展示最终诊断结果，必须以最终响应为准。
  source:
    file: docs/code-logics/07_结果格式化_公开响应_前端接入契约.md
    lines: 91-97
  confidence: high
  status: verified
