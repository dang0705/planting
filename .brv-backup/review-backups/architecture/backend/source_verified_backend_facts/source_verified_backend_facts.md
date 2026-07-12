---
title: Source Verified Backend Facts
summary: diagnose-http 问诊初始化静态快路径与性能控制的源码验证事实。
tags: []
related: [architecture/diagnosis/source_verified_diagnosis_facts.md]
keywords: []
createdAt: '2026-06-07T03:02:40.447Z'
updatedAt: '2026-06-08T00:00:00.000Z'
---

## Facts

- id: backend_question_start_entrypoint
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js
      lines: 71-92
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 292-377
  statement: `handleDiagnosisQuestionStart` 经过鉴权、请求上下文解析和配额保护后，调用 `runQuestionStartDiagnosis` 作为手动症状问诊初始化入口。

- id: backend_question_start_static_modes
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 328-340,379-384
    - file: cloudfunctions/diagnose-http/app/static-question-package-start.js
      lines: 113-116
  statement: `runQuestionStartDiagnosis` 只有黄叶和枯萎静态包模式会进入静态题包路径；非静态模式不回退到 `diagnosis-engine`，而是以 `unsupported_question_package_mode` 路径返回 501。

- id: backend_question_start_class_key
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/static-question-package-start.js
      lines: 22-25
  statement: 静态黄叶入口通过 `YELLOWING_CLASS_KEY` 匹配，其源码值固定为 `'yellowing_mode'`。

- id: backend_static_yellowing_question_generation
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/static-question-package-start.js
      lines: 88-109
  statement: `buildYellowingStaticQuestions` 通过 `buildObservedProbePackageQuestions` 生成黄叶题包问题，再经过 `filterDisabledYellowingFlowQuestions` 和 `questionKey` 去重后输出。

- id: backend_static_package_count_and_guard
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/question-package-response.js
      lines: 10-13
    - file: cloudfunctions/diagnose-http/app/static-question-package-start.js
      lines: 176-183
  statement: 黄叶静态题包数量由 `YELLOWING_PACKAGE_QUESTION_COUNT` 固定为 4；`buildStaticQuestionPackageStartRoundResult` 会校验运行时题包数量，不匹配时抛错。

- id: backend_static_question_package_run_output
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/static-question-package-start.js
      lines: 163-237
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 288-289,343-360
  statement: 静态初始化响应设置 `questionStartPath='static_question_package'`、`stage='question_package'`、`stopReason='await_package_answers'`，并以 `questionPackageSnapshotOnly` 方式持久化。

- id: backend_manual_symptom_modes
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 58-237
    - file: cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js
      lines: 243-262
  statement: 手动症状模式解析基于 `MANUAL_SYMPTOM_MODE_OPTIONS` 和 `MANUAL_SYMPTOM_MODE_BY_CLASS`；`resolveManualSymptomMode` 校验 `classKey` / `symptomKey` 后返回对应模式配置。

- id: backend_perf_test_static_fast_path
  type: fact
  status: verified
  confidence: high
  owner: architecture
  source_kind: code
  source:
    - file: test/unit-test/test-question-start-performance.mjs
      lines: 24-25,35-56,169-181
  statement: `test-question-start-performance.mjs` 通过桩化 `Module._load` 阻断 plant context 和 `diagnosis-engine` 加载，并断言热路径 `maxWarmMs <= 500`。
