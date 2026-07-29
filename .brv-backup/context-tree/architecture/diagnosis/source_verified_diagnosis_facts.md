---
title: Source Verified Diagnosis Facts
summary: 当前诊断事实按 route + mode question package 维护；既有动态问诊 / 每轮一题 / 动态下一题 helper 不作为 active fact。
updatedAt: '2026-06-07'
related: [architecture/diagnosis/question_package_answer_submission/question_package_answer_submission.md, architecture/diagnosis/leaf_yellowing_diagnosis_logic.md, architecture/backend/source_verified_backend_facts/source_verified_backend_facts.md]
---

## Facts

- id: diagnosis_route_package_mode
  type: fact
  source_kind: code
  statement: 当前诊断主链是 route 模式，问诊按 mode question package 工作；固定题包由 getQuestionPackageByMode(mode) 进入，前端一次性拿完整题包并本地推进。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    lines: 5-17
  confidence: high
  status: verified

- id: diagnosis_dynamic_extension_not_active
  type: fact
  source_kind: code
  statement: 当前主链不再采用动态追加问题模型；历史推进命名仅作为实现细节或待清理对象理解。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    lines: 40-50,73-93
  confidence: high
  status: verified

- id: diagnosis_yellow_leaf_four_question_package
  type: fact
  source_kind: code
  statement: 黄叶模式必须返回 4 个问答项，采用 package 展示和 package 提交；有效 yellow_leaf package 的 4 个问题按同一当前轮次持久化并参与 answer ownership，`questionPackage.questionCount` 决定题包上限，非题包路径不得反向约束固定题包。
  source:
    - file: cloudfunctions/diagnose-http/domain/runtime-artifacts.js
      lines: 56-74,109-177
    - file: cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js
      lines: 79-87
    - file: cloudfunctions/diagnose-http/services/session-question-service.js
      lines: 344-365
  confidence: high
  status: verified

- id: diagnosis_stop_output_package_basis
  type: fact
  source_kind: code
  statement: 停止与输出资格按题包提交、answers 被后端接受、route 最终公开响应和 stop/output condition 表达，不按既有动态问诊、既有主动问题队列或每轮一题表达。
  source:
    file: docs/code-logics/03_诊断运行时主链路_逐步执行逻辑.md
    lines: 95-121
  confidence: high
  status: verified

- id: diagnosis_yellowing_package_visible_outcome_contract
  type: fact
  source_kind: code
  statement: 黄叶题包整包提交时，`CareBehaviorTimeline.vue` 的虚拟答案 `care_behavior_timeline` 必须作为合法 package option 被接受，并在 route 运行前按环境养护上下文转成浇水 route option；过浇行为、施浓肥/近期换盆、直晒/光照突然增强三个强阳性样本必须分别输出 `overwatering_root_pressure`、`fertilizer_repot_stress`、`sunburn`，不得落入 uncertain。
  source:
    - file: cloudfunctions/diagnose-http/app/package-answer-ownership-runtime.js
      lines: 54-115
    - file: cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js
      lines: 347-382
    - file: src/vue-query/diagnose/mutations/shared.js
      lines: 211-273
    - file: test/unit-test/test-yellowing-package-outcome-contract.mjs
      lines: 172-258
  verified: 2026-06-07
  owner: architecture
  confidence: high
  status: verified

- id: diagnosis_answer_slim_frontend_response_contract
  type: fact
  source_kind: code
  statement: `/diagnosis/answer` 终态响应使用 `buildFrontendAnswerResponse`，只返回结果页必要字段；有 `visibleOutcomes` 时，前端建议从 outcome 的 `actionAdviceItems` / `avoidAdviceItems` 展示，响应不再返回顶层 trace、output eligibility、route decision cause、summaryCard、actionAdvice、nextSteps、whatToAvoid、treatmentText、preventionText 等非必要大字段。
  source:
    - file: cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js
      lines: 118-150
    - file: cloudfunctions/diagnose-http/app/frontend-response.js
      lines: 491-564
    - file: test/unit-test/test-route-planning.mjs
      lines: 2014-2048
  verified: 2026-06-07
  owner: architecture
  confidence: high
  status: verified

- id: diagnosis_answer_500ms_hot_path_evidence
  type: fact
  source_kind: code
  statement: 本地 diagnose-http 热路径与 WeChat mini-program runtime `wx.request` 验证显示，黄叶题包 `/diagnosis/answer` 的施浓肥与直晒场景稳定低于 500ms；端上第二轮 10 笔最大 339ms、平均 288.8ms，响应体约 1147-1251 字符。刚重载后的第一笔本地/DevTools 冷启动仍可高于 500ms，不作为热路径达标证据。
  source:
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 24-35,327-337
    - file: cloudfunctions/diagnose-http/repositories/outcome-route-repository.js
      lines: 67-82,667-681,793-805,916-935,964-972
    - file: cloudfunctions/diagnose-http/app/diagnosis-answer-runner.js
      lines: 423-451
  verified: 2026-06-07
  owner: architecture
  confidence: high
  status: verified

## Deprecated

- Historical score/ordering-based questioning authority is not current.
- Historical round-extension question flow is not current.
- Legacy snapshot-based completion control is not current package stop logic.
