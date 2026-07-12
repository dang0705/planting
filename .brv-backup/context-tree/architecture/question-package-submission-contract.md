---
confidence: 0.95
sources: [architecture/_index.md, project_management/_index.md, docs/_index.md]
synthesized_at: '2026-06-15T01:37:49.377Z'
type: synthesis
title: Question Package Submission Contract
summary: The question-package submission contract acts as a unified public boundary for frontend-backend interaction, ensuring consistent state and outcome delivery.
tags: [package, contract, frontend, backend]
related: []
keywords: [package, question, submission, yellowing, contract, route]
createdAt: '2026-06-15T01:37:49.377Z'
updatedAt: '2026-06-15T01:37:49.377Z'
---

# Question Package Submission Contract

The 'question package' (specifically the 4-question yellowing model) is not just a backend data structure but a cross-domain contract defining frontend local progression, backend ownership validation, and terminal route-planning.

## Evidence

- **architecture**: 黄叶题包整包提交时，CareBehaviorTimeline.vue 的虚拟答案必须作为合法 package option 被接受，并在 route 运行前按环境养护上下文转成浇水 route option。
- **project_management**: Diagnosis lifecycle logic requires `isQuestionPackageAnswerSubmitPayload` to enforce a 4-question minimum for valid submission.
- **docs**: The system operates on a route mode pattern using a question package chain, explicitly abandoning session follow-up patterns.
